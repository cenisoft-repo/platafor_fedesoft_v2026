/**
 * Puerto de pasarela de pago.
 *
 * El dominio no sabe si cobra Wompi o ePayco. Esta interfaz es todo lo que
 * conoce, y cada proveedor la implementa en su adaptador de infraestructura.
 * Cambiar de pasarela debe ser escribir un archivo nuevo, no tocar el dominio.
 */

export interface CheckoutRequest {
  paymentId: string;
  amount: string;
  currency: string;
  reference: string;
  /** A dónde vuelve el navegador. No decide nada: solo es cortesía visual. */
  returnUrl: string;
}

export interface CheckoutSession {
  /** URL a la que se envía al usuario. */
  redirectUrl: string;
  /** Referencia del proveedor, si la entrega al crear la sesión. */
  providerReference?: string;
}

/** Resultado de verificar un webhook. Nunca lanza: el fallo es un valor. */
export type WebhookVerification =
  | { ok: true; event: GatewayEvent }
  | { ok: false; reason: WebhookRejection };

export type WebhookRejection =
  | "firma-invalida"
  | "firma-ausente"
  | "fuera-de-ventana"
  | "cuerpo-ilegible"
  | "evento-incompleto";

export interface GatewayEvent {
  /** Identificador del evento en el proveedor. Ancla de idempotencia. */
  eventId: string;
  /** Referencia de la transacción en el proveedor. */
  providerReference: string;
  /** La referencia que enviamos nosotros: así se ata al Payment. */
  reference: string;
  status: "APROBADO" | "RECHAZADO" | "PENDIENTE";
  /** Monto reportado por el proveedor, para contrastarlo con el esperado. */
  amount: string;
  currency: string;
  sentAt: Date;
  failureReason?: string;
}

export interface PaymentGatewayPort {
  readonly name: string;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /**
   * Verifica sobre el **cuerpo crudo**, no sobre el JSON reserializado: dos
   * serializaciones del mismo objeto dan bytes distintos y la firma falla.
   */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): WebhookVerification;
}

export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY");

/**
 * Allowlist cerrada de proveedores.
 *
 * `provider` es texto libre en la base, y `Wompi`, `wompi ` y `WOMPI` serían
 * tres filas distintas: tres reenvíos del mismo evento que la unicidad
 * `(provider, event_id)` no frenaría. Se normaliza y se coteja contra esta
 * lista antes de tocar nada.
 *
 * Sandbox y producción del mismo proveedor son cadenas DISTINTAS a propósito:
 * los proveedores reutilizan identificadores de evento entre entornos.
 */
export const PROVEEDORES = ["sandbox", "wompi", "wompi_sandbox", "epayco", "epayco_sandbox"] as const;
export type Proveedor = (typeof PROVEEDORES)[number];

export function normalizarProveedor(valor: string): Proveedor | null {
  const limpio = valor.trim().toLowerCase();
  return (PROVEEDORES as readonly string[]).includes(limpio) ? (limpio as Proveedor) : null;
}
