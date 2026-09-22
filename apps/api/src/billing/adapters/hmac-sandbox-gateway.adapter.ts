import { Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type {
  CheckoutRequest,
  CheckoutSession,
  GatewayEvent,
  PaymentGatewayPort,
  WebhookVerification,
} from "../ports/payment-gateway.port.js";

/**
 * Pasarela de pruebas con firma HMAC-SHA256 real.
 *
 * No es un simulacro de conveniencia: firma y verifica de verdad, porque el
 * control que hay que ejercitar es la verificación, no el cobro. Wompi y
 * ePayco firman así (cadena concatenada + secreto compartido), de modo que el
 * adaptador definitivo cambia el orden de los campos y el nombre de las
 * cabeceras, no la forma del control.
 */

/** Ventana de aceptación. Un evento más viejo que esto es un reenvío. */
export const VENTANA_REPLAY_MS = 5 * 60 * 1000;

export interface SandboxGatewayOptions {
  secret: string;
  /** Inyectable para poder probar el borde de la ventana sin esperar. */
  now?: () => Date;
}

@Injectable()
export class HmacSandboxGateway implements PaymentGatewayPort {
  readonly name = "sandbox";

  constructor(private readonly options: SandboxGatewayOptions) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    return Promise.resolve({
      redirectUrl: `https://sandbox.pasarela.local/checkout/${request.reference}`,
      providerReference: `SBX-${randomUUID().slice(0, 12)}`,
    });
  }

  /**
   * Firma que produciría el proveedor. Existe para las pruebas y para el
   * entorno de desarrollo; en producción la produce el proveedor, no nosotros.
   */
  sign(rawBody: Buffer, timestamp: string): string {
    return createHmac("sha256", this.options.secret)
      .update(timestamp)
      .update(".")
      .update(rawBody)
      .digest("hex");
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): WebhookVerification {
    const firma = headers["x-signature"];
    const timestamp = headers["x-timestamp"];
    if (!firma || !timestamp) return { ok: false, reason: "firma-ausente" };

    const esperada = Buffer.from(this.sign(rawBody, timestamp), "utf8");
    const recibida = Buffer.from(firma, "utf8");

    /* Longitudes distintas: timingSafeEqual lanzaría, y comparar longitudes
       antes no filtra nada que el atacante no sepa ya. */
    if (esperada.length !== recibida.length) return { ok: false, reason: "firma-invalida" };
    /* Comparación de tiempo constante: `===` filtra el prefijo correcto byte
       a byte y permite reconstruir la firma con suficientes intentos. */
    if (!timingSafeEqual(esperada, recibida)) return { ok: false, reason: "firma-invalida" };

    /* La ventana se valida DESPUÉS de la firma. Al revés, un atacante mide el
       tiempo de respuesta y aprende si su marca temporal era aceptable. */
    const enviado = new Date(Number(timestamp));
    if (Number.isNaN(enviado.getTime())) return { ok: false, reason: "fuera-de-ventana" };
    const ahora = (this.options.now ?? (() => new Date()))();
    const desfase = Math.abs(ahora.getTime() - enviado.getTime());
    if (desfase > VENTANA_REPLAY_MS) return { ok: false, reason: "fuera-de-ventana" };

    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return { ok: false, reason: "cuerpo-ilegible" };
    }

    const evento = leerEvento(cuerpo, enviado);
    if (!evento) return { ok: false, reason: "evento-incompleto" };
    return { ok: true, event: evento };
  }
}

function leerEvento(cuerpo: unknown, sentAt: Date): GatewayEvent | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;
  const c = cuerpo as Record<string, unknown>;
  const datos = (c.data ?? {}) as Record<string, unknown>;

  const eventId = texto(c.id);
  const providerReference = texto(datos.transaction_id);
  const reference = texto(datos.reference);
  const amount = texto(datos.amount);
  const currency = texto(datos.currency);
  const estado = texto(datos.status);

  if (!eventId || !providerReference || !reference || !amount || !currency) return null;

  const status =
    estado === "APPROVED" ? "APROBADO" : estado === "DECLINED" ? "RECHAZADO" : "PENDIENTE";

  return {
    eventId,
    providerReference,
    reference,
    amount,
    currency,
    status,
    sentAt,
    ...(texto(datos.failure_reason) ? { failureReason: texto(datos.failure_reason) } : {}),
  };
}

function texto(valor: unknown): string {
  return typeof valor === "string" && valor.trim() !== "" ? valor : "";
}
