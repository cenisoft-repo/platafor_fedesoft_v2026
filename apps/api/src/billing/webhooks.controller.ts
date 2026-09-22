import { Controller, Headers, HttpCode, Post, Req, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../common/permissions.js";
import { ConfirmPaymentUseCase } from "./domain/confirm-payment.use-case.js";

/**
 * Entrada de webhooks de la pasarela.
 *
 * Público por necesidad —lo llama el proveedor, no una sesión—, pero no sin
 * autenticar: la firma HMAC sobre el cuerpo crudo **es** la autenticación.
 * Por eso lleva `@Public` explícito y no una excepción escondida en el guard.
 */
@ApiExcludeController()
@Controller({ path: "webhooks", version: VERSION_NEUTRAL })
export class WebhooksController {
  constructor(private readonly confirmar: ConfirmPaymentUseCase) {}

  @Post("payments")
  @Public()
  @HttpCode(200)
  async payments(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | undefined>,
  ): Promise<{ received: true }> {
    const raw = req.rawBody;
    if (!raw) {
      /* Sin cuerpo crudo no hay firma verificable. Se responde igual que en
         cualquier otro fallo. */
      return { received: true };
    }

    await this.confirmar.execute(raw, headers, {
      ip: req.ip ?? null,
      correlationId: (req as Request & { correlationId?: string }).correlationId ?? null,
    });

    /**
     * Siempre 200 y siempre el mismo cuerpo.
     *
     * Distinguir "firma inválida" de "referencia desconocida" en la respuesta
     * convertiría este endpoint en un oráculo: un atacante probaría firmas y
     * referencias hasta dar con una válida. El detalle va al log y a la
     * auditoría, que es donde lo necesita el equipo.
     *
     * Y nunca 500 ante un mensaje malo: el proveedor lo reintentaría durante
     * horas contra un error que no se va a arreglar solo.
     */
    return { received: true };
  }
}
