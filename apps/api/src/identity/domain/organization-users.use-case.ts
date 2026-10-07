import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@fedesoft/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuditService } from "../../common/audit.service.js";
import { OutboxService } from "../../outbox/outbox.service.js";
import { grants } from "../../common/permissions.js";
import { IdentityParameters } from "./identity-parameters.js";
import { SessionService, type RequestContext } from "./session.service.js";

/** Quien tiene esto administra usuarios: la empresa nunca debe quedarse sin él. */
const PERMISO_ADMINISTRAR = "user:manage";

export interface OrgActor {
  userId: string;
  /** Sale de la sesión, nunca del cuerpo de la petición. */
  organizationId: string;
  /** Permisos del actor en esa empresa: techo de lo que puede otorgar. */
  permissions: readonly string[];
}

/** Lo mínimo para responder a una invitación propia. */
export interface InviteeActor {
  userId: string;
  sessionId?: string | null | undefined;
  organizationId: string | null;
}

/**
 * Sin nombre a propósito: el gerente no fija cómo se llama una persona que
 * aún no ha aceptado nada. El nombre lo trae el proveedor en el primer login.
 */
export interface InviteInput {
  email: string;
  roleKey: string;
}

/**
 * El gerente administra los usuarios de SU empresa (RF-IDE-006, RF-AFI-005).
 *
 * Toda lectura y escritura va acotada por `actor.organizationId`. Un
 * identificador de usuario de otra empresa se comporta exactamente igual que
 * uno inexistente: 404, sin confirmar que existe.
 *
 * Las mutaciones toman un bloqueo sobre la fila de la empresa: dos gerentes
 * desactivándose a la vez no pueden dejarla sin administrador.
 *
 * Una invitación no da acceso por sí sola: la persona la acepta de forma
 * explícita después de entrar (hallazgo A5 M1). Hasta entonces no se crea su
 * contacto en la empresa ni ve sus datos.
 */
@Injectable()
export class OrganizationUsersUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly params: IdentityParameters,
    private readonly sessions: SessionService,
  ) {}

  async list(organizationId: string) {
    const ahora = new Date();
    const filas = await this.prisma.organizationUser.findMany({
      where: { organizationId },
      select: {
        userId: true,
        status: true,
        inviteExpiresAt: true,
        createdAt: true,
        user: { select: { email: true, name: true, lastLoginAt: true } },
        role: { select: { key: true, name: true } },
        contact: { select: { name: true, jobTitle: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    /* El estado global del usuario (bloqueado por Fedesoft, vínculos con
       otras empresas) no se expone: es dato de otra frontera. */
    return filas.map((f) => ({
      userId: f.userId,
      email: f.user.email,
      name: f.contact?.name ?? f.user.name,
      jobTitle: f.contact?.jobTitle ?? null,
      role: f.role,
      status: f.status,
      invitationExpired: f.status === "INVITADO" && (f.inviteExpiresAt ?? ahora) <= ahora,
      inviteExpiresAt: f.inviteExpiresAt?.toISOString() ?? null,
      lastLoginAt: f.user.lastLoginAt?.toISOString() ?? null,
    }));
  }

  /** Invitar o reenviar una invitación pendiente. */
  async invite(actor: OrgActor, input: InviteInput, ctx: RequestContext) {
    const email = input.email.trim().toLowerCase();
    const ahora = new Date();
    const horas = await this.params.invitationHours(ahora);
    const expira = new Date(ahora.getTime() + horas * 3_600_000);

    return this.prisma.$transaction(async (tx) => {
      await this.bloquearEmpresa(tx, actor.organizationId);
      const rol = await this.rolDeEmpresa(tx, input.roleKey);
      this.exigirTecho(actor, rol);

      const usuario = await tx.user.upsert({
        where: { email },
        update: {},
        create: { email, status: "INVITADO" },
      });

      const actual = await tx.organizationUser.findUnique({
        where: { organizationId_userId: { organizationId: actor.organizationId, userId: usuario.id } },
      });
      if (actual?.status === "ACTIVO") {
        throw new ConflictException("Esa persona ya tiene acceso activo a la empresa.");
      }
      if (actual?.status === "DESACTIVADO") {
        /* Reinvitar no es un atajo para reactivar: reactivar exige user:manage. */
        throw new ConflictException("Esa persona tiene el acceso desactivado: reactívalo en lugar de invitarla.");
      }

      /* Solo se enlaza un contacto que la empresa YA tenía. Crear uno con el
         nombre que escriba el gerente para un correo ajeno sería tratar datos
         de alguien que aún no ha aceptado nada. */
      const contacto = await tx.contact.findUnique({
        where: { organizationId_email: { organizationId: actor.organizationId, email } },
        select: { id: true },
      });

      const vinculo = await tx.organizationUser.upsert({
        where: { organizationId_userId: { organizationId: actor.organizationId, userId: usuario.id } },
        update: { roleId: rol.id, contactId: contacto?.id ?? null, inviteExpiresAt: expira, invitedByUserId: actor.userId },
        create: {
          organizationId: actor.organizationId,
          userId: usuario.id,
          contactId: contacto?.id ?? null,
          roleId: rol.id,
          status: "INVITADO",
          inviteExpiresAt: expira,
          invitedByUserId: actor.userId,
        },
      });

      await this.outbox.append(tx, {
        eventType: "identity.user.invited",
        aggregateType: "OrganizationUser",
        aggregateId: vinculo.id,
        payload: {
          organizationId: actor.organizationId,
          userId: usuario.id,
          email,
          role: rol.key,
          expiresAt: expira.toISOString(),
          resent: actual !== null,
        },
        correlationId: ctx.correlationId ?? null,
      });
      await this.registrar(tx, actor, ctx, actual ? "identity.invitation.resent" : "identity.invitation.created", vinculo.id, {
        email,
        role: rol.key,
        expiresAt: expira.toISOString(),
      });

      return { userId: usuario.id, status: vinculo.status, inviteExpiresAt: expira.toISOString() };
    });
  }

  /**
   * La persona acepta una invitación propia. Solo ahora se enlaza o crea su
   * contacto en la empresa. Si la sesión aún no tenía empresa activa, pasa a
   * ser esta.
   */
  async acceptInvitation(actor: InviteeActor, organizationId: string, ctx: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      await this.bloquearEmpresa(tx, organizationId);
      const ahora = new Date();
      const vinculo = await tx.organizationUser.findUnique({
        where: { organizationId_userId: { organizationId, userId: actor.userId } },
        include: { user: { select: { email: true, name: true } } },
      });
      if (!vinculo || vinculo.status !== "INVITADO" || (vinculo.inviteExpiresAt ?? ahora) <= ahora) {
        /* Mismo mensaje para "no existe", "ya respondida" y "vencida". */
        throw new NotFoundException("No tienes una invitación vigente de esa empresa.");
      }

      const contacto =
        vinculo.contactId ??
        (
          await tx.contact.upsert({
            where: { organizationId_email: { organizationId, email: vinculo.user.email } },
            update: {},
            create: {
              organizationId,
              email: vinculo.user.email,
              name: vinculo.user.name ?? vinculo.user.email.split("@")[0] ?? vinculo.user.email,
            },
            select: { id: true },
          })
        ).id;

      await tx.organizationUser.update({
        where: { id: vinculo.id },
        data: { status: "ACTIVO", inviteExpiresAt: null, contactId: contacto },
      });
      if (actor.sessionId && !actor.organizationId) {
        await tx.session.update({ where: { id: actor.sessionId }, data: { organizationId } });
      }
      await this.audit.record(tx, {
        actor: `usuario:${actor.userId}`,
        actorUserId: actor.userId,
        organizationId,
        action: "identity.invitation.accepted",
        objectType: "OrganizationUser",
        objectId: vinculo.id,
        ipAddress: ctx.ip ?? null,
        correlationId: ctx.correlationId ?? null,
      });
      return { organizationId, status: "ACTIVO" as const };
    });
  }

  /** Rechazar borra el vínculo pendiente; la auditoría conserva la historia. */
  async declineInvitation(actor: InviteeActor, organizationId: string, ctx: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      const borrado = await tx.organizationUser.deleteMany({
        where: { organizationId, userId: actor.userId, status: "INVITADO" },
      });
      if (borrado.count === 0) throw new NotFoundException("No tienes una invitación vigente de esa empresa.");
      await this.audit.record(tx, {
        actor: `usuario:${actor.userId}`,
        actorUserId: actor.userId,
        organizationId,
        action: "identity.invitation.declined",
        objectType: "OrganizationUser",
        ipAddress: ctx.ip ?? null,
        correlationId: ctx.correlationId ?? null,
      });
      return { organizationId, declined: true };
    });
  }

  /** El desactivado pierde el acceso de inmediato: sus sesiones en esta empresa se revocan. */
  async deactivate(actor: OrgActor, userId: string, ctx: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      await this.bloquearEmpresa(tx, actor.organizationId);
      const vinculo = await this.vinculo(tx, actor.organizationId, userId);
      if (userId === actor.userId) {
        throw new ConflictException("No puedes desactivar tu propio acceso.");
      }
      if (vinculo.status === "DESACTIVADO") return { userId, status: vinculo.status };

      if (vinculo.status === "INVITADO") {
        /* Retirar una invitación la borra. Si quedara DESACTIVADA, "reactivar"
           daría acceso a alguien que nunca aceptó. */
        await tx.organizationUser.delete({ where: { id: vinculo.id } });
        await this.registrar(tx, actor, ctx, "identity.invitation.revoked", vinculo.id, { userId });
        return { userId, status: "REVOCADA" as const };
      }

      if (vinculo.status === "ACTIVO" && grants(vinculo.role.permissions, PERMISO_ADMINISTRAR)) {
        await this.exigirOtroAdministrador(tx, actor.organizationId, userId);
      }

      await tx.organizationUser.update({
        where: { id: vinculo.id },
        data: { status: "DESACTIVADO", inviteExpiresAt: null },
      });
      const revocadas = await this.sessions.revoke(
        { userId, organizationId: actor.organizationId },
        "acceso-desactivado",
        new Date(),
        tx,
      );
      await this.registrar(tx, actor, ctx, "identity.user.deactivated", vinculo.id, {
        userId,
        previousStatus: vinculo.status,
        sessionsRevoked: revocadas,
      });
      return { userId, status: "DESACTIVADO" as const };
    });
  }

  async reactivate(actor: OrgActor, userId: string, ctx: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      await this.bloquearEmpresa(tx, actor.organizationId);
      const vinculo = await this.vinculo(tx, actor.organizationId, userId);
      if (vinculo.status !== "DESACTIVADO") {
        throw new ConflictException("Solo se reactiva un acceso desactivado.");
      }
      await tx.organizationUser.update({ where: { id: vinculo.id }, data: { status: "ACTIVO" } });
      await this.registrar(tx, actor, ctx, "identity.user.reactivated", vinculo.id, { userId });
      return { userId, status: "ACTIVO" as const };
    });
  }

  /** Cambiar el rol invalida las sesiones del afectado en esta empresa (RF-IDE-008). */
  async changeRole(actor: OrgActor, userId: string, roleKey: string, ctx: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      await this.bloquearEmpresa(tx, actor.organizationId);
      const vinculo = await this.vinculo(tx, actor.organizationId, userId);
      if (userId === actor.userId) {
        throw new ConflictException("No puedes cambiar tu propio rol.");
      }
      const rol = await this.rolDeEmpresa(tx, roleKey);
      this.exigirTecho(actor, rol);
      if (rol.id === vinculo.roleId) return { userId, role: rol.key };

      const pierdeAdministracion =
        vinculo.status === "ACTIVO" &&
        grants(vinculo.role.permissions, PERMISO_ADMINISTRAR) &&
        !grants(rol.permissions, PERMISO_ADMINISTRAR);
      if (pierdeAdministracion) await this.exigirOtroAdministrador(tx, actor.organizationId, userId);

      await tx.organizationUser.update({ where: { id: vinculo.id }, data: { roleId: rol.id } });
      const revocadas = await this.sessions.revoke(
        { userId, organizationId: actor.organizationId },
        "privilegios-cambiados",
        new Date(),
        tx,
      );
      await this.registrar(tx, actor, ctx, "identity.user.role_changed", vinculo.id, {
        userId,
        from: vinculo.role.key,
        to: rol.key,
        sessionsRevoked: revocadas,
      });
      return { userId, role: rol.key };
    });
  }

  /** Roles que el gerente puede asignar: los de empresa, nunca los internos. */
  async assignableRoles() {
    return this.prisma.role.findMany({
      where: { internal: false },
      select: { key: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Un rol que invita o administra usuarios solo lo otorga quien administra
   * usuarios: con `user:invite` a secas no se fabrica un gerente (hallazgo A5 M2).
   */
  private exigirTecho(actor: OrgActor, rol: { permissions: string[] }) {
    const administra = grants(rol.permissions, "user:invite") || grants(rol.permissions, PERMISO_ADMINISTRAR);
    if (administra && !grants(actor.permissions, PERMISO_ADMINISTRAR)) {
      throw new ForbiddenException("Solo quien administra usuarios puede otorgar un rol que administra usuarios.");
    }
  }

  private async bloquearEmpresa(tx: Prisma.TransactionClient, organizationId: string) {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
    if (filas.length === 0) throw new NotFoundException("Empresa no encontrada.");
  }

  private async vinculo(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
    const v = await tx.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { role: { select: { key: true, permissions: true } } },
    });
    if (!v) throw new NotFoundException("Usuario no encontrado en tu empresa.");
    return v;
  }

  private async rolDeEmpresa(tx: Prisma.TransactionClient, roleKey: string) {
    const rol = await tx.role.findUnique({ where: { key: roleKey } });
    /* La base también lo impide (clave compuesta + CHECK); aquí se responde
       con un mensaje útil en lugar de un error de restricción. */
    if (!rol || rol.internal) throw new BadRequestException("Rol no asignable en una empresa.");
    return rol;
  }

  private async exigirOtroAdministrador(tx: Prisma.TransactionClient, organizationId: string, excepto: string) {
    const otros = await tx.organizationUser.findMany({
      where: { organizationId, status: "ACTIVO", userId: { not: excepto } },
      select: { role: { select: { permissions: true } } },
    });
    if (!otros.some((o) => grants(o.role.permissions, PERMISO_ADMINISTRAR))) {
      throw new ConflictException("La empresa debe conservar al menos un usuario activo que administre usuarios.");
    }
  }

  private registrar(
    tx: Prisma.TransactionClient,
    actor: OrgActor,
    ctx: RequestContext,
    action: string,
    objectId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return this.audit.record(tx, {
      actor: `usuario:${actor.userId}`,
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      action,
      objectType: "OrganizationUser",
      objectId,
      metadata,
      ipAddress: ctx.ip ?? null,
      correlationId: ctx.correlationId ?? null,
    });
  }
}
