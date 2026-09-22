import { Injectable } from "@nestjs/common";
import type { Prisma } from "@fedesoft/db";

export type DomainEvent =
  | "payment.succeeded"
  | "payment.failed"
  | "invoice.issued"
  | "invoice.rejected"
  | "certificate.generated"
  | "membership.status_changed"
  | "organization.updated";

export interface EventToPublish {
  eventType: DomainEvent;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
  correlationId?: string | null;
}

/**
 * Patrón outbox.
 *
 * El evento se escribe en la misma transacción que el cambio que lo origina.
 * Si el proceso muere antes de publicarlo, el evento sigue en la tabla y el
 * despachador lo recoge. La alternativa —publicar después de confirmar— pierde
 * eventos exactamente en el momento en que más caro es perderlos.
 */
@Injectable()
export class OutboxService {
  async append(tx: Prisma.TransactionClient, evento: EventToPublish): Promise<void> {
    await tx.outboxMessage.create({
      data: {
        eventType: evento.eventType,
        aggregateType: evento.aggregateType,
        aggregateId: evento.aggregateId,
        payload: evento.payload,
        correlationId: evento.correlationId ?? null,
      },
    });
  }
}
