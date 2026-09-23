import { Injectable } from "@nestjs/common";
import type { Prisma, Session } from "@fedesoft/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { hashToken, newToken } from "../../common/tokens.js";

export interface SessionTokens {
  /** Va en la cookie de sesión. Solo existe en tránsito. */
  token: string;
  /** Va en una cookie legible y se exige de vuelta en cabecera. */
  csrfToken: string;
  session: Session;
}

export interface CreateSessionInput {
  userId: string;
  organizationId: string | null;
  mfaSatisfied: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SessionTtl {
  /** Vida máxima de la sesión, pase lo que pase. */
  absoluteMinutes: number;
  /** Inactividad tras la cual la sesión deja de servir. */
  idleMinutes: number;
}

/**
 * Ciclo de vida de la sesión.
 *
 * De la sesión solo se guarda el hash de su identificador: una copia de esta
 * tabla no permite suplantar a nadie. Y toda escritura acepta el cliente de la
 * transacción en curso, porque revocar sesiones tiene que confirmarse junto
 * con el cambio que las revoca —desactivar a una persona y dejarle la sesión
 * viva es no haberla desactivado—.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ttl: SessionTtl,
  ) {}

  async create(tx: Prisma.TransactionClient, input: CreateSessionInput): Promise<SessionTokens> {
    const token = newToken();
    const csrfToken = newToken();
    const session = await tx.session.create({
      data: {
        userId: input.userId,
        tokenHash: hashToken(token),
        csrfTokenHash: hashToken(csrfToken),
        activeOrganizationId: input.organizationId,
        mfaSatisfiedAt: input.mfaSatisfied ? new Date() : null,
        expiresAt: new Date(Date.now() + this.ttl.absoluteMinutes * 60_000),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
      },
    });
    return { token, csrfToken, session };
  }

  /**
   * Cierra la sesión actual y abre otra con el mismo contexto.
   *
   * Se rota al autenticar y al cambiar de empresa. Sin rotación, un
   * identificador fijado antes del login sigue siendo válido después, que es
   * como se roba una sesión sin robar nada.
   */
  async rotate(
    tx: Prisma.TransactionClient,
    session: Session,
    cambios: { organizationId?: string | null },
  ): Promise<SessionTokens> {
    await this.revoke(tx, session.id, "rotacion");
    const token = newToken();
    const csrfToken = newToken();
    const nueva = await tx.session.create({
      data: {
        userId: session.userId,
        tokenHash: hashToken(token),
        csrfTokenHash: hashToken(csrfToken),
        activeOrganizationId:
          cambios.organizationId === undefined ? session.activeOrganizationId : cambios.organizationId,
        mfaSatisfiedAt: session.mfaSatisfiedAt,
        /* La rotación no regala vida: la sesión nueva caduca cuando iba a
           caducar la anterior. */
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      },
    });
    return { token, csrfToken, session: nueva };
  }

  async revoke(tx: Prisma.TransactionClient, sessionId: string, reason: string): Promise<void> {
    await tx.session.updateMany({
      where: { id: sessionId, status: "ACTIVA" },
      data: { status: "REVOCADA", revokedAt: new Date(), revokedReason: reason.slice(0, 120) },
    });
  }

  /** Todas las sesiones de una persona, de una vez y en la misma transacción. */
  async revokeAllForUser(tx: Prisma.TransactionClient, userId: string, reason: string): Promise<number> {
    const { count } = await tx.session.updateMany({
      where: { userId, status: "ACTIVA" },
      data: { status: "REVOCADA", revokedAt: new Date(), revokedReason: reason.slice(0, 120) },
    });
    return count;
  }

  /**
   * Busca la sesión de un token. Devuelve `null` si no existe, si fue
   * revocada, si caducó o si lleva demasiado tiempo inactiva.
   *
   * Una sesión caducada se marca `EXPIRADA` al detectarla: así el estado de la
   * tabla dice la verdad y no hace falta un barrido para saberlo.
   */
  async resolve(token: string): Promise<Session | null> {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!session || session.status !== "ACTIVA") return null;

    const ahora = Date.now();
    const inactivaDesde = ahora - session.lastSeenAt.getTime();
    if (session.expiresAt.getTime() <= ahora || inactivaDesde > this.ttl.idleMinutes * 60_000) {
      await this.prisma.session.updateMany({
        where: { id: session.id, status: "ACTIVA" },
        data: { status: "EXPIRADA" },
      });
      return null;
    }

    await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(ahora) } });
    return session;
  }
}
