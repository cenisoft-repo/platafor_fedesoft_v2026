import { Injectable } from "@nestjs/common";
import type { Prisma } from "@fedesoft/db";

export interface AuditEntry {
  actor: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  correlationId?: string | null;
}

/**
 * Registro de acciones sensibles.
 *
 * Recibe siempre el cliente de la transacción en curso: la auditoría se
 * confirma con el hecho que describe. Si el pago se guarda y la auditoría no,
 * queda un movimiento de dinero sin rastro.
 *
 * La tabla es append-only por trigger, así que aquí solo hay `create`.
 */
@Injectable()
export class AuditService {
  async record(tx: Prisma.TransactionClient, entrada: AuditEntry): Promise<void> {
    await tx.auditEvent.create({
      data: {
        actor: entrada.actor,
        actorUserId: entrada.actorUserId ?? null,
        organizationId: entrada.organizationId ?? null,
        action: entrada.action,
        objectType: entrada.objectType,
        objectId: entrada.objectId ?? null,
        metadata: entrada.metadata ?? {},
        ipAddress: entrada.ipAddress ?? null,
        correlationId: entrada.correlationId ?? null,
      },
    });
  }
}
