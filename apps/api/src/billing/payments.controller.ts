import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, IsUrl, ArrayNotEmpty, IsUUID, MaxLength } from "class-validator";
import type { Request } from "express";
import { RequirePermission } from "../common/permissions.js";
import type { ActorContext } from "../common/deny-by-default.guard.js";
import { StartPaymentUseCase } from "./domain/start-payment.use-case.js";

class StartPaymentDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  chargeIds!: string[];

  @IsUrl({ require_tld: false })
  returnUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}

@ApiTags("facturación")
@Controller({ path: "payments", version: "1" })
export class PaymentsController {
  constructor(private readonly iniciar: StartPaymentUseCase) {}

  @Post()
  @RequirePermission("billing:pay")
  @ApiOperation({
    summary: "Inicia un pago sobre uno o más cargos de la empresa en sesión.",
  })
  async start(@Body() dto: StartPaymentDto, @Req() req: Request & { actor: ActorContext }) {
    const actor = req.actor;
    /* La empresa sale de la sesión, nunca del cuerpo de la petición: si
       viniera del cliente, cualquiera pagaría —o saldaría— cargos ajenos. */
    return this.iniciar.execute({
      organizationId: actor.organizationId ?? "",
      chargeIds: dto.chargeIds,
      returnUrl: dto.returnUrl,
      ...(dto.idempotencyKey ? { idempotencyKey: dto.idempotencyKey } : {}),
      actor: { userId: actor.userId, label: `usuario:${actor.userId}` },
      correlationId: (req as Request & { correlationId?: string }).correlationId ?? null,
      ip: req.ip ?? null,
    });
  }
}
