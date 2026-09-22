import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
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
  /** Opaca y generada por el servidor. Es la que viaja a la pasarela. */
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

    /* La clave de idempotencia es del cliente y única por empresa: la
       búsqueda va acotada a la organización en sesión. Si fuera global,
       adivinar la clave de otra empresa devolvería su pago. */
    const existente = await this.prisma.payment.findUnique({
      where: {
        organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: clave },
      },
    });
    if (existente) {
      const sesion = await this.gateway.createCheckout({
        paymentId: existente.id,
        amount: existente.amount.toString(),
        currency: existente.currency,
        reference: existente.reference,
        returnUrl: input.returnUrl,
      });
      return {
        paymentId: existente.id,
        reference: existente.reference,
        amount: existente.amount.toString(),
        redirectUrl: sesion.redirectUrl,
        reused: true,
      };
    }

    /* Referencia opaca: 32 hex sin relación con el NIT, el cargo ni ningún
       consecutivo. Va a la pasarela y vuelve en el webhook, así que no puede
       revelar nada ni ser adivinable. */
    const referencia = `pay_${randomBytes(16).toString("hex")}`;

    const pago = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.payment.create({
        data: {
          organizationId: input.organizationId,
          amount: total,
          currency: moneda,
          provider: this.gateway.name,
          status: "INICIADO",
          idempotencyKey: clave,
          reference: referencia,
        },
      });

      /* Las filas puente se crean aparte, no anidadas: `organizationId` forma
         parte de la relación compuesta, así que tiene que escribirse de forma
         explícita. Es la columna que ata pago y cargo a la misma empresa, y
         si el cargo fuera de otra, la clave foránea rechazaría el INSERT. */
      await tx.paymentCharge.createMany({
        data: cargos.map((c) => ({
          paymentId: creado.id,
          chargeId: c.id,
          organizationId: input.organizationId,
          amount: c.amount,
        })),
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
      reference: referencia,
      returnUrl: input.returnUrl,
    });

    /* La referencia del proveedor se guarda al crear, no al confirmar: así
       el webhook puede contrastarla en vez de aceptar la que llegue. */
    if (sesion.providerReference) {
      await this.prisma.payment.update({
        where: { id: pago.id },
        data: { providerReference: sesion.providerReference },
      });
    }

    return {
      paymentId: pago.id,
      reference: referencia,
      amount: total.toString(),
      redirectUrl: sesion.redirectUrl,
      reused: false,
    };
  }
}
