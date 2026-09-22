import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../common/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { OutboxDispatcher } from "../outbox/outbox.dispatcher.js";
import { IssueCertificateUseCase } from "../certificates/issue-certificate.use-case.js";
import { MembershipPolicy } from "../certificates/membership.policy.js";
import { PAYMENT_GATEWAY } from "./ports/payment-gateway.port.js";
import { ELECTRONIC_INVOICER } from "./ports/electronic-invoicer.port.js";
import { HmacSandboxGateway } from "./adapters/hmac-sandbox-gateway.adapter.js";
import { SandboxInvoicer } from "./adapters/sandbox-invoicer.adapter.js";
import { StartPaymentUseCase } from "./domain/start-payment.use-case.js";
import { ConfirmPaymentUseCase } from "./domain/confirm-payment.use-case.js";
import { IssueInvoiceUseCase } from "./domain/issue-invoice.use-case.js";
import { PaymentsController } from "./payments.controller.js";
import { WebhooksController } from "./webhooks.controller.js";

/**
 * Aquí y solo aquí se elige el proveedor.
 *
 * Cuando Fedesoft decida pasarela y facturador, se cambian estas dos líneas
 * `useFactory` por el adaptador correspondiente. Ningún caso de uso, ninguna
 * entidad y ninguna prueba de dominio se entera.
 */
@Module({
  controllers: [PaymentsController, WebhooksController],
  providers: [
    PrismaService,
    AuditService,
    OutboxService,
    OutboxDispatcher,
    MembershipPolicy,
    StartPaymentUseCase,
    ConfirmPaymentUseCase,
    IssueInvoiceUseCase,
    IssueCertificateUseCase,
    {
      provide: PAYMENT_GATEWAY,
      useFactory: () => {
        const secret = process.env.PAYMENT_WEBHOOK_SECRET;
        if (!secret) {
          throw new Error(
            "PAYMENT_WEBHOOK_SECRET no está definido: sin secreto no se puede verificar ninguna firma.",
          );
        }
        return new HmacSandboxGateway({ secret });
      },
    },
    { provide: ELECTRONIC_INVOICER, useClass: SandboxInvoicer },
  ],
  exports: [OutboxDispatcher],
})
export class BillingModule {}
