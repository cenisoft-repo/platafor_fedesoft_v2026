import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Session } from "@fedesoft/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuditService } from "../../common/audit.service.js";
import { SessionService, type SessionTokens } from "./session.service.js";

export interface SwitchOrganizationInput {
  session: Session;
  organizationId: string;
  ipAddress?: string | null;
  correlationId?: string | null;
}

/**
 * Cambia la empresa sobre la que opera la sesión (RF-IDE-003).
 *
 * Es el **único** camino por el que la empresa activa cambia. No existe una
 * cabecera, ni un campo del cuerpo, ni una query que lo haga: si existiera,
 * cualquiera operaría sobre la empresa que escribiera ahí.
 *
 * Cambiar de empresa rota el identificador de sesión, igual que autenticarse.
 */
@Injectable()
export class SwitchOrganizationUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async execute(input: SwitchOrganizationInput): Promise<SessionTokens> {
    const vinculo = await this.prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: { organizationId: input.organizationId, userId: input.session.userId },
      },
    });
    /* Mismo mensaje pertenezca o no la empresa a alguien más: la respuesta no
       revela qué identificadores existen. */
    if (!vinculo) throw new ForbiddenException("No opera sobre esa empresa.");

    return this.prisma.$transaction(async (tx) => {
      const tokens = await this.sessions.rotate(tx, input.session, {
        organizationId: input.organizationId,
      });
      await this.audit.record(tx, {
        actor: `usuario:${input.session.userId}`,
        actorUserId: input.session.userId,
        organizationId: input.organizationId,
        action: "auth.organization.switched",
        objectType: "session",
        objectId: tokens.session.id,
        metadata: { desde: input.session.activeOrganizationId ?? null },
        ipAddress: input.ipAddress ?? null,
        correlationId: input.correlationId ?? null,
      });
      return tokens;
    });
  }
}
