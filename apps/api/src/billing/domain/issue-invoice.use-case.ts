import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuditService } from "../../common/audit.service.js";
import { OutboxService } from "../../outbox/outbox.service.js";
import {
  ELECTRONIC_INVOICER,
  type ElectronicInvoicerPort,
} from "../ports/electronic-invoicer.port.js";

/**
 * Emisión de la factura electrónica, disparada por `payment.succeeded`.
 *
 * Va después del pago y por su propio camino porque la DIAN puede tardar o
 * rechazar, y eso no puede deshacer un cobro que ya ocurrió. Una factura
 * rechazada es un problema que se gestiona; un pago perdido, uno que no.
 */
@Injectable()
export class IssueInvoiceUseCase {
  private readonly log = new Logger(IssueInvoiceUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    @Inject(ELECTRONIC_INVOICER) private readonly invoicer: ElectronicInvoicerPort,
  ) {}

  async execute(paymentId: string, correlationId?: string | null): Promise<void> {
    const pago = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { organization: true, charges: { include: { charge: true } }, invoice: true },
    });

    if (!pago || pago.status !== "APROBADO") {
      this.log.warn(`No se factura ${paymentId}: el pago no está aprobado.`);
      return;
    }

    /* Un pago tiene a lo sumo una factura (unicidad en la base). Si ya existe
       y quedó emitida, el reintento no vuelve a llamar a la DIAN. */
    if (pago.invoice?.status === "EMITIDA") return;

    const factura =
      pago.invoice ??
      (await this.prisma.invoice.create({
        data: {
          organizationId: pago.organizationId,
          paymentId: pago.id,
          status: "EN_PROCESO",
        },
      }));

    const resultado = await this.invoicer.issue({
      /* La misma clave que el pago: reintentar no emite dos facturas ni
         siquiera si el proveedor recibe la petición dos veces. */
      idempotencyKey: pago.idempotencyKey,
      organization: {
        nit: pago.organization.nit,
        nitDv: pago.organization.nitDv,
        legalName: pago.organization.legalName,
        city: pago.organization.city,
      },
      lines: pago.charges.map((pc) => ({
        concept: pc.charge.concept,
        amount: pc.amount.toString(),
        quantity: 1,
      })),
      total: pago.amount.toString(),
      currency: pago.currency,
      paymentReference: pago.providerReference ?? pago.idempotencyKey,
    });

    await this.prisma.$transaction(async (tx) => {
      if (resultado.status === "EMITIDA") {
        await tx.invoice.update({
          where: { id: factura.id },
          data: {
            status: "EMITIDA",
            cufe: resultado.cufe,
            number: resultado.number,
            issuedAt: resultado.issuedAt,
            providerPayload: resultado.raw as object,
          },
        });

        await this.outbox.append(tx, {
          eventType: "invoice.issued",
          aggregateType: "Invoice",
          aggregateId: factura.id,
          payload: {
            invoiceId: factura.id,
            organizationId: pago.organizationId,
            cufe: resultado.cufe,
            number: resultado.number,
          },
          correlationId: correlationId ?? null,
        });

        await this.audit.record(tx, {
          actor: `facturador:${this.invoicer.name}`,
          organizationId: pago.organizationId,
          action: "invoice.issued",
          objectType: "Invoice",
          objectId: factura.id,
          metadata: { cufe: resultado.cufe, number: resultado.number },
          correlationId: correlationId ?? null,
        });
        return;
      }

      await tx.invoice.update({
        where: { id: factura.id },
        data: {
          status: "RECHAZADA",
          rejectionReason: resultado.reason.slice(0, 500),
          providerPayload: resultado.raw as object,
        },
      });

      await this.outbox.append(tx, {
        eventType: "invoice.rejected",
        aggregateType: "Invoice",
        aggregateId: factura.id,
        payload: { invoiceId: factura.id, organizationId: pago.organizationId, reason: resultado.reason },
        correlationId: correlationId ?? null,
      });

      await this.audit.record(tx, {
        actor: `facturador:${this.invoicer.name}`,
        organizationId: pago.organizationId,
        action: "invoice.rejected",
        objectType: "Invoice",
        objectId: factura.id,
        metadata: { reason: resultado.reason },
        correlationId: correlationId ?? null,
      });
    });
  }
}
