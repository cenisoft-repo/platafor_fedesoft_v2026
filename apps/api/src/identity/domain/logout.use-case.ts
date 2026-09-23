import { Inject, Injectable } from "@nestjs/common";
import type { Session } from "@fedesoft/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuditService } from "../../common/audit.service.js";
import { IDENTITY_PROVIDER, type IdentityProviderPort } from "../ports/identity-provider.port.js";
import { SessionService } from "./session.service.js";

export interface LogoutInput {
  session: Session;
  ipAddress?: string | null;
  correlationId?: string | null;
}

/**
 * Cierra la sesión.
 *
 * Borrar la cookie no es cerrar sesión: si la fila sigue activa, quien tenga
 * el identificador sigue dentro. Aquí se revoca la fila, y la cookie se borra
 * además. Se devuelve la URL de cierre del proveedor para que el navegador
 * también termine allí; que el proveedor la ofrezca o no, no cambia que esta
 * sesión ya está muerta.
 */
@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    @Inject(IDENTITY_PROVIDER) private readonly provider: IdentityProviderPort,
  ) {}

  async execute(input: LogoutInput): Promise<{ endSessionUrl: string | null }> {
    await this.prisma.$transaction(async (tx) => {
      await this.sessions.revoke(tx, input.session.id, "cierre_de_sesion");
      await this.audit.record(tx, {
        actor: `usuario:${input.session.userId}`,
        actorUserId: input.session.userId,
        organizationId: input.session.activeOrganizationId,
        action: "auth.logout",
        objectType: "session",
        objectId: input.session.id,
        ipAddress: input.ipAddress ?? null,
        correlationId: input.correlationId ?? null,
      });
    });
    return { endSessionUrl: await this.provider.endSessionUrl() };
  }
}
