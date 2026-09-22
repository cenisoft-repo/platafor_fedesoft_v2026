import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@fedesoft/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuditService } from "../../common/audit.service.js";
import { OutboxService } from "../../outbox/outbox.service.js";
import { PAYMENT_GATEWAY, type PaymentGatewayPort } from "../ports/payment-gateway.port.js";

/**
 * Confirmación de un pago desde el webhook del proveedor.
 *
 * Este es el único camino por el que un pago llega a APROBADO. El navegador
 * del usuario no confirma nada: puede mentir, puede no volver nunca, y puede
 * volver dos veces. Lo único que cuenta es esta llamada servidor a servidor,
 * firmada.
 */

export type ConfirmResult =
  | { outcome: "aplicado"; paymentId: string }
  | { outcome: "duplicado"; paymentId: string | null }
  | { outcome: "ignorado"; reason: string }
  | { outcome: "rechazado"; reason: string };

@Injectable()
export class ConfirmPaymentUseCase {
  private readonly log = new Logger(ConfirmPaymentUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
  ) {}

  async execute(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
    contexto: { ip?: string | null; correlationId?: string | null },
  ): Promise<ConfirmResult> {
    /* 1 · Firma antes que nada. Un cuerpo sin verificar no se parsea para
       tomar decisiones, no se registra como entrega válida y no se contesta
       con detalle: sería un oráculo para afinar el ataque. */
    const verificacion = this.gateway.verifyWebhook(rawBody, headers);
    if (!verificacion.ok) {
      this.log.warn(
        `Webhook rechazado (${this.gateway.name}): ${verificacion.reason}`,
      );
      return { outcome: "rechazado", reason: verificacion.reason };
    }

    const evento = verificacion.event;

    /* 2 · Idempotencia. El registro de la entrega es la barrera: la unicidad
       de (provider, event_id) la garantiza la base, no una consulta previa
       —que dejaría una ventana entre el SELECT y el INSERT—. */
    try {
      await this.prisma.webhookDelivery.create({
        data: {
          provider: this.gateway.name,
          eventId: evento.eventId,
          signature: (headers["x-signature"] ?? "").slice(0, 400),
          sentAt: evento.sentAt,
          payload: JSON.parse(rawBody.toString("utf8")) as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        /* Reenvío del mismo evento. Se responde 200: el proveedor ya hizo su
           trabajo y reintentar no arregla nada. */
        return { outcome: "duplicado", paymentId: null };
      }
      throw e;
    }

    if (evento.status === "PENDIENTE") {
      await this.marcarProcesado(evento.eventId, null);
      return { outcome: "ignorado", reason: "evento en estado pendiente" };
    }

    /* 3 · El pago se busca por NUESTRA referencia opaca, no por la del
       proveedor —que la controla el otro lado— ni por la clave de
       idempotencia, que la propone el cliente. */
    const pago = await this.prisma.payment.findUnique({
      where: { reference: evento.reference },
      include: { charges: true },
    });

    if (!pago) {
      await this.marcarProcesado(evento.eventId, "referencia desconocida");
      this.log.warn(`Webhook con referencia desconocida: ${evento.reference}`);
      return { outcome: "ignorado", reason: "referencia desconocida" };
    }

    /* 4 · El monto lo decide nuestro registro, no el mensaje entrante. Si no
       coinciden, no se aplica: un pago por menos no salda el cargo. */
    const esperado = new Prisma.Decimal(pago.amount);
    const reportado = new Prisma.Decimal(evento.amount);
    if (!esperado.equals(reportado) || pago.currency !== evento.currency) {
      await this.marcarProcesado(evento.eventId, "monto o moneda no coinciden");
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          actor: `pasarela:${this.gateway.name}`,
          organizationId: pago.organizationId,
          action: "payment.amount_mismatch",
          objectType: "Payment",
          objectId: pago.id,
          metadata: {
            esperado: esperado.toString(),
            reportado: reportado.toString(),
            monedaEsperada: pago.currency,
            monedaReportada: evento.currency,
          },
          ipAddress: contexto.ip ?? null,
          correlationId: contexto.correlationId ?? null,
        }),
      );
      return { outcome: "rechazado", reason: "monto no coincide" };
    }

    const aprobado = evento.status === "APROBADO";

    /* 5 · Todo lo que sigue va en una transacción: el pago, los cargos, el
       evento de dominio y la auditoría se confirman juntos o no se confirma
       nada. Un pago aplicado sin evento deja una factura que nunca se emite. */
    const resultado = await this.prisma.$transaction(async (tx) => {
      /* La guarda de estado dentro del WHERE hace atómica la transición: si
         dos webhooks distintos del mismo pago entran a la vez, solo uno ve
         count = 1. Sin esto, los dos leerían INICIADO y los dos aplicarían. */
      const transicion = await tx.payment.updateMany({
        where: { id: pago.id, status: { in: ["INICIADO", "EN_PROCESO"] } },
        data: aprobado
          ? {
              status: "APROBADO",
              providerReference: evento.providerReference,
              confirmedAt: evento.sentAt,
            }
          : {
              status: "RECHAZADO",
              providerReference: evento.providerReference,
              failureReason: evento.failureReason?.slice(0, 300) ?? "Rechazado por la pasarela",
            },
      });

      if (transicion.count === 0) {
        return { aplicado: false as const };
      }

      if (aprobado) {
        await tx.charge.updateMany({
          where: {
            id: { in: pago.charges.map((c) => c.chargeId) },
            /* Acotado también aquí: el filtro por empresa no se delega a que
               las filas puente estén bien, aunque la clave compuesta ya lo
               garantice. Denegar dos veces cuesta poco. */
            organizationId: pago.organizationId,
          },
          data: { status: "PAGADO" },
        });

        /* La factura nace aquí, en EN_PROCESO, dentro de la misma
           transacción. Así la unicidad de `invoices.payment_id` —y no la
           disciplina del despachador— es lo que impide emitir dos documentos
           fiscales por un mismo pago. Una factura duplicada ante la DIAN se
           deshace con nota crédito, no con un DELETE. */
        await tx.invoice.upsert({
          where: { paymentId: pago.id },
          create: { organizationId: pago.organizationId, paymentId: pago.id, status: "EN_PROCESO" },
          update: {},
        });
      }

      await this.outbox.append(tx, {
        eventType: aprobado ? "payment.succeeded" : "payment.failed",
        aggregateType: "Payment",
        aggregateId: pago.id,
        payload: {
          paymentId: pago.id,
          organizationId: pago.organizationId,
          amount: esperado.toString(),
          currency: pago.currency,
          provider: this.gateway.name,
          providerReference: evento.providerReference,
        },
        correlationId: contexto.correlationId ?? null,
      });

      await this.audit.record(tx, {
        actor: `pasarela:${this.gateway.name}`,
        organizationId: pago.organizationId,
        action: aprobado ? "payment.approved" : "payment.declined",
        objectType: "Payment",
        objectId: pago.id,
        metadata: {
          providerReference: evento.providerReference,
          eventId: evento.eventId,
          amount: esperado.toString(),
        },
        ipAddress: contexto.ip ?? null,
        correlationId: contexto.correlationId ?? null,
      });

      return { aplicado: true as const };
    });

    await this.marcarProcesado(evento.eventId, null);

    return resultado.aplicado
      ? { outcome: "aplicado", paymentId: pago.id }
      : { outcome: "duplicado", paymentId: pago.id };
  }

  /** Cierra el registro de la entrega. Fuera de la transacción a propósito:
      que falle al marcar no debe deshacer un pago ya aplicado. */
  private async marcarProcesado(eventId: string, error: string | null): Promise<void> {
    await this.prisma.webhookDelivery.updateMany({
      where: { provider: this.gateway.name, eventId },
      data: { processedAt: new Date(), error },
    });
  }
}
