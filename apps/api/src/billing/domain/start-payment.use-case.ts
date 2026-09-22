import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@fedesoft/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuditService } from "../../common/audit.service.js";
import { PAYMENT_GATEWAY, type PaymentGatewayPort } from "../ports/payment-gateway.port.js";

export interface StartPaymentInput {
  organizationId: string;
  chargeIds: string[];
  returnUrl: string;
  /** Si el cliente la repite, no se crea un segundo pago. */
  idempotencyKey?: string;
  actor: { userId: string; label: string };
  correlationId?: string | null;
  ip?: string | null;
}

export interface StartPaymentOutput {
  paymentId: string;
  reference: string;
  amount: string;
  redirectUrl: string;
  reused: boolean;
}

@Injectable()
export class StartPaymentUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
  ) {}

  async execute(input: StartPaymentInput): Promise<StartPaymentOutput> {
    if (input.chargeIds.length === 0) {
      throw new BadRequestException("Un pago necesita al menos un cargo.");
    }

    /* Los cargos se leen SIEMPRE acotados por la empresa del actor. Sin este
       filtro, enviar el identificador de un cargo ajeno dejaría pagar —o
       peor, saldar— la cuota de otra empresa. */
    const cargos = await this.prisma.charge.findMany({
      where: {
        id: { in: input.chargeIds },
        organizationId: input.organizationId,
        status: { in: ["PENDIENTE", "VENCIDO"] },
      },
    });

    if (cargos.length !== input.chargeIds.length) {
      throw new NotFoundException(
        "Alguno de los cargos no existe, no pertenece a la empresa o ya no es pagable.",
      );
    }

    const total = cargos.reduce((suma, c) => suma.add(c.amount), new Prisma.Decimal(0));
    const moneda = cargos[0]?.currency ?? "COP";
    if (cargos.some((c) => c.currency !== moneda)) {
      throw new BadRequestException("No se pueden pagar juntos cargos en monedas distintas.");
    }

    const clave = input.idempotencyKey ?? `PAY-${randomUUID()}`;

    const existente = await this.prisma.payment.findUnique({ where: { idempotencyKey: clave } });
    if (existente) {
      if (existente.organizationId !== input.organizationId) {
        /* La clave la propone el cliente: no puede servir para alcanzar el
           pago de otra empresa. */
        throw new BadRequestException("Clave de idempotencia en uso.");
      }
      const sesion = await this.gateway.createCheckout({
        paymentId: existente.id,
        amount: existente.amount.toString(),
        currency: existente.currency,
        reference: clave,
        returnUrl: input.returnUrl,
      });
      return {
        paymentId: existente.id,
        reference: clave,
        amount: existente.amount.toString(),
        redirectUrl: sesion.redirectUrl,
        reused: true,
      };
    }

    const pago = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.payment.create({
        data: {
          organizationId: input.organizationId,
          amount: total,
          currency: moneda,
          provider: this.gateway.name,
          status: "INICIADO",
          idempotencyKey: clave,
          charges: {
            create: cargos.map((c) => ({ chargeId: c.id, amount: c.amount })),
          },
        },
      });

      await this.audit.record(tx, {
        actor: input.actor.label,
        actorUserId: input.actor.userId,
        organizationId: input.organizationId,
        action: "payment.started",
        objectType: "Payment",
        objectId: creado.id,
        metadata: { amount: total.toString(), charges: cargos.map((c) => c.id) },
        ipAddress: input.ip ?? null,
        correlationId: input.correlationId ?? null,
      });

      return creado;
    });

    const sesion = await this.gateway.createCheckout({
      paymentId: pago.id,
      amount: total.toString(),
      currency: moneda,
      reference: clave,
      returnUrl: input.returnUrl,
    });

    return {
      paymentId: pago.id,
      reference: clave,
      amount: total.toString(),
      redirectUrl: sesion.redirectUrl,
      reused: false,
    };
  }
}
