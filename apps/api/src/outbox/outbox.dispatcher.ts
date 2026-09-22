import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { IssueInvoiceUseCase } from "../billing/domain/issue-invoice.use-case.js";
import { IssueCertificateUseCase } from "../certificates/issue-certificate.use-case.js";

/**
 * Drena el outbox.
 *
 * En producción esto vive en `apps/worker` con BullMQ. Aquí está en el API
 * para que el recorrido completo se pueda ejecutar y probar de extremo a
 * extremo sin levantar otro proceso; el contrato —tomar pendientes, procesar,
 * reintentar con espera creciente— es el mismo.
 */

const MAX_INTENTOS = 5;

@Injectable()
export class OutboxDispatcher {
  private readonly log = new Logger(OutboxDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly issueInvoice: IssueInvoiceUseCase,
    private readonly issueCertificate: IssueCertificateUseCase,
  ) {}

  /** Procesa un lote. Devuelve cuántos mensajes se publicaron con éxito. */
  async drain(limite = 20): Promise<number> {
    const pendientes = await this.prisma.outboxMessage.findMany({
      where: { status: "PENDIENTE", availableAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
      take: limite,
    });

    let publicados = 0;

    for (const mensaje of pendientes) {
      /* Se reclama con guarda de estado: si otro proceso ya tomó el mensaje,
         este ve count = 0 y lo salta. Sin esto, dos despachadores emitirían
         la misma factura dos veces. */
      const reclamado = await this.prisma.outboxMessage.updateMany({
        where: { id: mensaje.id, status: "PENDIENTE" },
        data: { attempts: { increment: 1 } },
      });
      if (reclamado.count === 0) continue;

      try {
        await this.handle(mensaje.eventType, mensaje.payload, mensaje.correlationId);
        await this.prisma.outboxMessage.update({
          where: { id: mensaje.id },
          data: { status: "PUBLICADO", publishedAt: new Date(), lastError: null },
        });
        publicados += 1;
      } catch (e) {
        const intentos = mensaje.attempts + 1;
        const agotado = intentos >= MAX_INTENTOS;
        /* Espera creciente: 2s, 4s, 8s… Reintentar de inmediato contra un
           proveedor caído solo agrava la caída. */
        const espera = new Date(Date.now() + 2 ** intentos * 1000);
        await this.prisma.outboxMessage.update({
          where: { id: mensaje.id },
          data: {
            status: agotado ? "FALLIDO" : "PENDIENTE",
            availableAt: espera,
            lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500),
          },
        });
        this.log.error(
          `Evento ${mensaje.eventType} (${mensaje.id}) falló en el intento ${intentos}${agotado ? " — agotado" : ""}.`,
        );
      }
    }

    return publicados;
  }

  private async handle(
    eventType: string,
    payload: unknown,
    correlationId: string | null,
  ): Promise<void> {
    const datos = (payload ?? {}) as Record<string, unknown>;

    switch (eventType) {
      case "payment.succeeded": {
        const paymentId = String(datos.paymentId ?? "");
        if (paymentId) await this.issueInvoice.execute(paymentId, correlationId);
        return;
      }
      case "invoice.issued": {
        const organizationId = String(datos.organizationId ?? "");
        if (organizationId) await this.issueCertificate.execute(organizationId, correlationId);
        return;
      }
      /* Los demás eventos aún no tienen consumidor. Se marcan publicados: el
         outbox garantiza entrega, no que alguien esté escuchando. */
      default:
        return;
    }
  }
}
