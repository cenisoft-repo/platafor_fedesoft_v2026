import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@fedesoft/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuditService } from "../../common/audit.service.js";
import { canDelegate } from "../../common/permissions.js";
import { SessionService, type RequestContext } from "./session.service.js";

/**
 * Clave del rol de emergencia. Es una invariante de identidad, no una regla de
 * negocio parametrizable: de ella depende que el sistema siga administrable.
 */
export const SUPER_ADMIN_ROLE = "super-admin";
/** RA-ACC-008: siempre existen al menos dos cuentas Super Admin. */
export const MIN_SUPER_ADMINS = 2;

export interface ConsoleActor {
  userId: string;
  /** Techo de lo que puede otorgar. */
  permissions: readonly string[];
}

/**
 * Gestión de usuarios desde la consola (docs/01-consola-administracion.md,
 * dominio Identity): buscar, ver, dar de alta usuarios internos, asignar y
 * quitar roles internos, bloquear y forzar cierre de sesiones.
 *
 * Pendiente (fase 2, RA-ACC-005/006): doble control y reautenticación antes
 * de cambiar roles. Hoy queda auditado y protegido por las guardas de abajo.
 */
@Injectable()
export class InternalUsersUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  async search(q: string | undefined, take: number, skip: number) {
    const where: Prisma.UserWhereInput = q ? { email: { contains: q.trim().toLowerCase() } } : {};
    const [total, filas] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          lastLoginAt: true,
          internalRoles: { select: { role: { select: { key: true } } } },
          _count: { select: { organizationUsers: true } },
        },
        orderBy: { email: "asc" },
        take,
        skip,
      }),
    ]);
    return {
      total,
      items: filas.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.status,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        internalRoles: u.internalRoles.map((r) => r.role.key),
        organizations: u._count.organizationUsers,
      })),
    };
  }

  async detail(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        authSubject: true,
        internalRoles: { select: { createdAt: true, role: { select: { key: true, name: true } } } },
        organizationUsers: {
          select: {
            status: true,
            inviteExpiresAt: true,
            role: { select: { key: true, name: true } },
            organization: { select: { id: true, legalName: true, nit: true } },
          },
        },
        sessions: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true, channel: true, createdAt: true, lastSeenAt: true, ipAddress: true, userAgent: true },
          orderBy: { lastSeenAt: "desc" },
        },
      },
    });
    if (!u) throw new NotFoundException("Usuario no encontrado.");
    const { authSubject, ...resto } = u;
    /* El sujeto del proveedor no se expone; basta saber si ya está vinculado. */
    return { ...resto, linked: authSubject !== null };
  }

  /** Alta de usuario interno con su primer rol. Entra al vincular su correo verificado. */
  async provision(actor: ConsoleActor, input: { email: string; name: string; roleKey: string }, ctx: RequestContext) {
    const email = input.email.trim().toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      const rol = await this.rolInterno(tx, input.roleKey);
      const usuario = await tx.user.upsert({
        where: { email },
        update: {},
        create: { email, name: input.name, status: "INVITADO" },
      });
      if (usuario.status === "BLOQUEADO") {
        throw new ConflictException("El usuario está bloqueado: desbloquéalo antes de asignarle un rol.");
      }
      await this.asignar(tx, actor, usuario.id, rol, ctx);
      return { userId: usuario.id, role: rol.key };
    });
  }

  async grantRole(actor: ConsoleActor, userId: string, roleKey: string, ctx: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      const rol = await this.rolInterno(tx, roleKey);
      const usuario = await tx.user.findUnique({ where: { id: userId } });
      if (!usuario) throw new NotFoundException("Usuario no encontrado.");
      if (usuario.status === "BLOQUEADO") {
        throw new ConflictException("El usuario está bloqueado: desbloquéalo antes de asignarle un rol.");
      }
      await this.asignar(tx, actor, userId, rol, ctx);
      return { userId, role: rol.key };
    });
  }

  async revokeRole(actor: ConsoleActor, userId: string, roleKey: string, ctx: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      const rol = await this.rolInterno(tx, roleKey);
      if (rol.key === SUPER_ADMIN_ROLE) {
        if (userId === actor.userId) {
          throw new ConflictException("Un Super Admin no puede quitarse su propio rol.");
        }
        await this.exigirSuperAdmins(tx, userId);
      }
      const borrado = await tx.userInternalRole.deleteMany({ where: { userId, roleId: rol.id } });
      if (borrado.count === 0) throw new NotFoundException("El usuario no tiene ese rol.");

      const revocadas = await this.sessions.revoke({ userId, channel: "CONSOLA" }, "privilegios-cambiados", new Date(), tx);
      await this.registrar(tx, actor, ctx, "identity.internal_role.revoked", userId, {
        role: rol.key,
        sessionsRevoked: revocadas,
      });
      return { userId, role: rol.key, revoked: true };
    });
  }

  /** Bloqueo global: la persona pierde el acceso al portal y a la consola. */
  async block(actor: ConsoleActor, userId: string, reason: string, ctx: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      if (userId === actor.userId) throw new ConflictException("No puedes bloquear tu propia cuenta.");
      const usuario = await tx.user.findUnique({
        where: { id: userId },
        include: { internalRoles: { select: { role: { select: { key: true } } } } },
      });
      if (!usuario) throw new NotFoundException("Usuario no encontrado.");
      if (usuario.status === "BLOQUEADO") return { userId, status: usuario.status };

      if (usuario.internalRoles.some((r) => r.role.key === SUPER_ADMIN_ROLE)) {
        await this.exigirSuperAdmins(tx, userId);
      }

      await tx.user.update({ where: { id: userId }, data: { status: "BLOQUEADO" } });
      const revocadas = await this.sessions.revoke({ userId }, "usuario-bloqueado", new Date(), tx);
      await this.registrar(tx, actor, ctx, "identity.user.blocked", userId, { reason, sessionsRevoked: revocadas });
      return { userId, status: "BLOQUEADO" as const };
    });
  }

  async unblock(actor: ConsoleActor, userId: string, reason: string, ctx: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.user.findUnique({ where: { id: userId } });
      if (!usuario) throw new NotFoundException("Usuario no encontrado.");
      if (usuario.status !== "BLOQUEADO") throw new ConflictException("El usuario no está bloqueado.");
      /* Quien nunca vinculó su identidad vuelve a "invitado", no a "activo". */
      const status = usuario.authSubject ? "ACTIVO" : "INVITADO";
      await tx.user.update({ where: { id: userId }, data: { status } });
      await this.registrar(tx, actor, ctx, "identity.user.unblocked", userId, { reason });
      return { userId, status };
    });
  }

  /** Cierre forzado de todas las sesiones (RA-ACC-007). */
  async revokeSessions(actor: ConsoleActor, userId: string, ctx: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      const existe = await tx.user.count({ where: { id: userId } });
      if (existe === 0) throw new NotFoundException("Usuario no encontrado.");
      const revocadas = await this.sessions.revoke({ userId }, "cierre-forzado", new Date(), tx);
      await this.registrar(tx, actor, ctx, "identity.sessions.revoked", userId, { sessionsRevoked: revocadas });
      return { userId, sessionsRevoked: revocadas };
    });
  }

  async internalRoles() {
    return this.prisma.role.findMany({
      where: { internal: true },
      select: { key: true, name: true, permissions: true },
      orderBy: { name: "asc" },
    });
  }

  private async asignar(
    tx: Prisma.TransactionClient,
    actor: ConsoleActor,
    userId: string,
    rol: { id: string; key: string; permissions: string[] },
    ctx: RequestContext,
  ) {
    if (userId === actor.userId) {
      throw new ForbiddenException("Nadie se asigna roles a sí mismo.");
    }
    /* Techo: nadie reparte permisos que no tiene. Hoy solo super-admin tiene
       role:assign; esto evita que un rol nuevo con role:assign se convierta
       en una puerta a super-admin. */
    const excede = rol.permissions.filter((p) => !canDelegate(actor.permissions, p));
    if (excede.length > 0) {
      throw new ForbiddenException(`No puedes otorgar permisos que no tienes: ${excede.join(", ")}.`);
    }
    try {
      await tx.userInternalRole.create({ data: { userId, roleId: rol.id, grantedByUserId: actor.userId } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("El usuario ya tiene ese rol.");
      }
      throw e;
    }
    /* También al ampliar privilegios: la regla es que todo cambio de
       privilegio obliga a iniciar sesión de nuevo (RF-IDE-008). */
    const revocadas = await this.sessions.revoke({ userId, channel: "CONSOLA" }, "privilegios-cambiados", new Date(), tx);
    await this.registrar(tx, actor, ctx, "identity.internal_role.granted", userId, {
      role: rol.key,
      sessionsRevoked: revocadas,
    });
  }

  private async rolInterno(tx: Prisma.TransactionClient, roleKey: string) {
    const rol = await tx.role.findUnique({ where: { key: roleKey } });
    if (!rol || !rol.internal) throw new BadRequestException("Rol interno desconocido.");
    return rol;
  }

  /**
   * Quitarle a `userId` el rol Super Admin (o bloquearlo) no puede dejar
   * menos de dos. El bloqueo consultivo serializa estas operaciones: sin él,
   * dos Super Admin revocándose mutuamente a la vez verían ambos "quedan 3".
   */
  private async exigirSuperAdmins(tx: Prisma.TransactionClient, userId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('identity.super-admin'))`;
    const restantes = await tx.userInternalRole.count({
      where: {
        role: { key: SUPER_ADMIN_ROLE },
        userId: { not: userId },
        /* Solo cuentan los que pueden operar de verdad: activos y con su
           identidad ya vinculada (hallazgo A5 B9). */
        user: { status: "ACTIVO", authSubject: { not: null } },
      },
    });
    if (restantes < MIN_SUPER_ADMINS) {
      throw new ConflictException(`Deben existir al menos ${MIN_SUPER_ADMINS} Super Admin activos.`);
    }
  }

  private registrar(
    tx: Prisma.TransactionClient,
    actor: ConsoleActor,
    ctx: RequestContext,
    action: string,
    userId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return this.audit.record(tx, {
      actor: `usuario:${actor.userId}`,
      actorUserId: actor.userId,
      action,
      objectType: "User",
      objectId: userId,
      metadata,
      ipAddress: ctx.ip ?? null,
      correlationId: ctx.correlationId ?? null,
    });
  }
}
