import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@fedesoft/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuditService } from "../../common/audit.service.js";
import { canDelegate, grants } from "../../common/permissions.js";
import { SessionService, type RequestContext } from "./session.service.js";

/**
 * Clave del rol de emergencia. Es una invariante de identidad, no una regla de
 * negocio parametrizable: de ella depende que el sistema siga administrable.
 */
export const SUPER_ADMIN_ROLE = "super-admin";
/** RA-ACC-008: siempre existen al menos dos cuentas Super Admin. */
export const MIN_SUPER_ADMINS = 2;

/**
 * Quién ve qué en /admin/v1/users (ADR-009, decisión 5). `user:read` basta para
 * buscar y ver usuarios del equipo interno; las personas afiliadas y el detalle
 * de sus sesiones piden un permiso literal propio, porque son datos personales
 * de terceros y `*:read` (Dirección, Auditor) los abriría sin quererlo.
 */
export const PERMISO_VER_AFILIADOS = "user:read-affiliates";
export const PERMISO_INSPECCIONAR_SESIONES = "session:inspect";

/**
 * Roles internos que aún no pueden asignarse por la consola porque su alcance
 * depende de una restricción que el servidor todavía no aplica. Sin ella, el
 * rol daría acceso a todo lo que su lista alcanza y no solo a lo asignado
 * (ADR-009, «Qué se deja fuera», b). La semilla de desarrollo sí lo crea.
 * Se levanta cuando exista el modelo de cuentas asignadas (RA-ACC-004).
 */
export const ROLES_SIN_ALCANCE_APLICADO: ReadonlyMap<string, string> = new Map([
  [
    "kam",
    "El rol Gestor de cuenta aún no puede asignarse: su alcance por cuentas asignadas no está implementado y le daría acceso a todas las empresas (RA-ACC-004, ADR-009).",
  ],
]);

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

  async search(actor: ConsoleActor, q: string | undefined, take: number, skip: number) {
    const verAfiliados = grants(actor.permissions, PERMISO_VER_AFILIADOS);
    const filtros: Prisma.UserWhereInput[] = [];
    if (q) filtros.push({ email: { contains: q.trim().toLowerCase() } });
    /* Sin `user:read-affiliates` solo existen para quien busca los usuarios
       con rol interno: el resto ni aparece ni suma al total. */
    if (!verAfiliados) filtros.push({ internalRoles: { some: {} } });
    const where: Prisma.UserWhereInput = filtros.length > 0 ? { AND: filtros } : {};
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
      /* La pantalla explica qué se le ocultó; decidirlo sigue siendo del servidor. */
      visibility: { affiliates: verAfiliados },
      items: filas.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.status,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        internalRoles: u.internalRoles.map((r) => r.role.key),
        /* Con empresa o sin ella también es información sobre una persona afiliada. */
        organizations: verAfiliados ? u._count.organizationUsers : null,
      })),
    };
  }

  async detail(actor: ConsoleActor, userId: string) {
    const verAfiliados = grants(actor.permissions, PERMISO_VER_AFILIADOS);
    const verSesiones = grants(actor.permissions, PERMISO_INSPECCIONAR_SESIONES);
    /* Quien no puede ver afiliados recibe el mismo 404 que un id inexistente:
       no se confirma que una persona afiliada exista. */
    const u = await this.prisma.user.findFirst({
      where: { id: userId, ...(verAfiliados ? {} : { internalRoles: { some: {} } }) },
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
    const { authSubject, organizationUsers, sessions, ...resto } = u;
    /* El sujeto del proveedor no se expone; basta saber si ya está vinculado. */
    return {
      ...resto,
      linked: authSubject !== null,
      visibility: { affiliates: verAfiliados, sessionDetails: verSesiones },
      organizationUsers: verAfiliados ? organizationUsers : null,
      /* Saber que hay sesiones abiertas basta para cerrarlas; desde dónde y con
         qué navegador es dato personal y exige `session:inspect`. */
      sessions: sessions.map((s) => ({
        id: s.id,
        channel: s.channel,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        ipAddress: verSesiones ? s.ipAddress : null,
        userAgent: verSesiones ? s.userAgent : null,
      })),
    };
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
    const motivo = ROLES_SIN_ALCANCE_APLICADO.get(rol.key);
    if (motivo) throw new UnprocessableEntityException(motivo);
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
