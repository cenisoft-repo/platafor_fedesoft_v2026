import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Prisma, SessionChannel } from "@fedesoft/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuditService } from "../../common/audit.service.js";
import type { ActorContext } from "../../common/deny-by-default.guard.js";
import { TOKEN_FORMAT, sha256Hex } from "./tokens.js";

export interface ResolvedSession {
  actor: ActorContext;
  session: { id: string; channel: SessionChannel; mfa: boolean; expiresAt: Date };
}

export interface RequestContext {
  correlationId?: string | null;
  ip?: string | null;
}

/** Escribir `last_seen_at` en cada petición sería una escritura por clic. */
const TOQUE_MINIMO_MS = 60_000;

/**
 * Resolución y revocación de sesiones.
 *
 * Los permisos se leen de la base en cada petición, no se congelan en la
 * sesión: quitar un rol surte efecto en la siguiente petición (RF-IDE-008)
 * aunque además se revoquen las sesiones afectadas.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async authenticate(token: string, channel: SessionChannel, ahora = new Date()): Promise<ResolvedSession | null> {
    if (!TOKEN_FORMAT.test(token)) return null;

    const s = await this.prisma.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: {
        user: {
          select: {
            status: true,
            internalRoles: { select: { role: { select: { permissions: true } } } },
          },
        },
        organizationUser: { select: { status: true, role: { select: { permissions: true } } } },
      },
    });

    /* Una cookie del portal presentada en la consola (o al revés) no es una
       sesión de esta superficie, aunque el token sea auténtico. */
    if (!s || s.channel !== channel || s.revokedAt) return null;

    const motivo =
      s.expiresAt <= ahora
        ? "expirada"
        : s.lastSeenAt.getTime() + s.idleTimeoutSec * 1000 <= ahora.getTime()
          ? "inactividad"
          : s.user.status !== "ACTIVO"
            ? "usuario-no-activo"
            : null;
    if (motivo) {
      await this.revoke({ id: s.id }, motivo, ahora);
      return null;
    }

    let permissions: string[] = [];
    if (channel === "CONSOLA") {
      permissions = [...new Set(s.user.internalRoles.flatMap((r) => r.role.permissions))];
      if (permissions.length === 0) {
        await this.revoke({ id: s.id }, "sin-rol-interno", ahora);
        return null;
      }
    } else if (s.organizationId) {
      if (s.organizationUser?.status !== "ACTIVO") {
        await this.revoke({ id: s.id }, "acceso-retirado", ahora);
        return null;
      }
      permissions = s.organizationUser.role.permissions;
    }
    /* Portal sin empresa elegida: sesión válida, sin permisos de negocio.
       Solo alcanza los endpoints @Authenticated (ver sesión, elegir empresa). */

    if (ahora.getTime() - s.lastSeenAt.getTime() > TOQUE_MINIMO_MS) {
      await this.prisma.session.updateMany({
        where: { id: s.id, revokedAt: null },
        data: { lastSeenAt: ahora },
      });
    }

    return {
      actor: {
        userId: s.userId,
        organizationId: channel === "PORTAL" ? s.organizationId : null,
        permissions,
        internal: channel === "CONSOLA",
        sessionId: s.id,
      },
      session: { id: s.id, channel: s.channel, mfa: s.mfa, expiresAt: s.expiresAt },
    };
  }

  /** Revoca las sesiones vigentes que cumplan el filtro. Devuelve cuántas. */
  async revoke(
    where: Prisma.SessionWhereInput,
    reason: string,
    ahora = new Date(),
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const r = await tx.session.updateMany({
      where: { ...where, revokedAt: null },
      data: { revokedAt: ahora, revokedReason: reason.slice(0, 60) },
    });
    return r.count;
  }

  /** Revoca la sesión de un token presentado (p. ej. la anterior al volver a entrar). */
  async revokeToken(token: string | undefined, reason: string): Promise<void> {
    if (!token || !TOKEN_FORMAT.test(token)) return;
    await this.revoke({ tokenHash: sha256Hex(token) }, reason);
  }

  /**
   * Cambia la empresa activa (RF-IDE-003). Es el único punto donde un
   * identificador de empresa llega del cliente, y por eso se verifica contra
   * los vínculos activos del usuario; además, la clave compuesta de `sessions`
   * lo impide en la base.
   */
  async selectOrganization(actor: ActorContext, organizationId: string, ctx: RequestContext): Promise<void> {
    if (!actor.sessionId) throw new ForbiddenException("Sin sesión.");
    const sessionId = actor.sessionId;
    const vinculo = await this.prisma.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId, userId: actor.userId } },
      select: { status: true },
    });
    /* Mismo mensaje exista o no la empresa: no se confirma a quién no
       pertenece qué identificador corresponde a una empresa real. */
    if (vinculo?.status !== "ACTIVO") {
      throw new ForbiddenException("No tienes acceso activo a esa empresa.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({ where: { id: sessionId }, data: { organizationId } });
      await this.audit.record(tx, {
        actor: `usuario:${actor.userId}`,
        actorUserId: actor.userId,
        organizationId,
        action: "identity.session.organization_selected",
        objectType: "Session",
        objectId: sessionId,
        correlationId: ctx.correlationId ?? null,
        ipAddress: ctx.ip ?? null,
      });
    });
  }

  async logout(actor: ActorContext, ctx: RequestContext): Promise<void> {
    if (!actor.sessionId) return;
    const sessionId = actor.sessionId;
    await this.prisma.$transaction(async (tx) => {
      await this.revoke({ id: sessionId }, "logout", new Date(), tx);
      await this.audit.record(tx, {
        actor: `usuario:${actor.userId}`,
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        action: "identity.logout",
        objectType: "Session",
        objectId: sessionId,
        correlationId: ctx.correlationId ?? null,
        ipAddress: ctx.ip ?? null,
      });
    });
  }

  /** Lo que el cliente necesita para pintar la experiencia según rol y segmento (RF-IDE-004). */
  async view(actor: ActorContext, session: ResolvedSession["session"]) {
    const usuario = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { id: true, email: true, name: true },
    });

    const organizations =
      session.channel === "PORTAL"
        ? (
            await this.prisma.organizationUser.findMany({
              where: { userId: actor.userId, status: "ACTIVO" },
              select: {
                role: { select: { key: true, name: true } },
                organization: { select: { id: true, legalName: true, tradeName: true, segment: true } },
              },
              orderBy: { organization: { legalName: "asc" } },
            })
          ).map((v) => ({ ...v.organization, role: v.role }))
        : [];

    /* Invitaciones vigentes: la persona decide si las acepta (hallazgo A5 M1). */
    const pendingInvitations =
      session.channel === "PORTAL"
        ? (
            await this.prisma.organizationUser.findMany({
              where: { userId: actor.userId, status: "INVITADO", inviteExpiresAt: { gt: new Date() } },
              select: {
                inviteExpiresAt: true,
                role: { select: { key: true, name: true } },
                organization: { select: { id: true, legalName: true, tradeName: true } },
              },
              orderBy: { createdAt: "asc" },
            })
          ).map((v) => ({ ...v.organization, role: v.role, expiresAt: v.inviteExpiresAt?.toISOString() ?? null }))
        : [];

    /* Roles internos de quien opera la consola: la interfaz los muestra y
       explica qué acciones no le corresponden. Decidir sigue siendo del servidor. */
    const internalRoles =
      session.channel === "CONSOLA"
        ? (
            await this.prisma.userInternalRole.findMany({
              where: { userId: actor.userId },
              select: { role: { select: { key: true, name: true } } },
              orderBy: { role: { name: "asc" } },
            })
          ).map((r) => r.role)
        : [];

    return {
      user: usuario,
      channel: session.channel,
      mfa: session.mfa,
      expiresAt: session.expiresAt.toISOString(),
      activeOrganization: organizations.find((o) => o.id === actor.organizationId) ?? null,
      organizations,
      pendingInvitations,
      internalRoles,
      permissions: actor.permissions,
    };
  }
}
