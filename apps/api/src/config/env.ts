import { z } from "zod";

/**
 * Esquema del entorno. La aplicación no arranca si falta algo: es preferible
 * que falle en el despliegue a que falle en producción con un valor vacío.
 * Ningún secreto tiene valor por defecto.
 */
const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  /** Orígenes permitidos, separados por coma. Sin comodín en producción. */
  CORS_ORIGINS: z.string().default(""),
  /** Secreto compartido con la pasarela. Sin él no se verifica ninguna firma. */
  PAYMENT_WEBHOOK_SECRET: z.string().min(32, "Debe tener al menos 32 caracteres."),

  /* ─────────────────────────── Identidad (ADR-008) ────────────────────── */

  /**
   * Sin valor por defecto a propósito: el proveedor de desarrollo entrega una
   * sesión sin credencial, así que nunca puede ser lo que ocurre por omisión.
   * Quien quiera `stub` tiene que escribirlo.
   */
  IDENTITY_PROVIDER: z.enum(["oidc", "stub"]),
  OIDC_ISSUER_URL: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_REDIRECT_URI: z.string().url().default("http://localhost:3000/v1/auth/callback"),
  OIDC_SCOPE: z.string().default("openid profile email"),
  /** Valor de `acr` con el que el proveedor declara el segundo factor. */
  OIDC_MFA_ACR: z.string().default("mfa"),

  /**
   * Destinos a los que se permite volver tras autenticar, separados por coma.
   * Sin lista no hay login: un destino libre sería un redirector abierto.
   */
  APP_RETURN_URLS: z.string().default("http://localhost:3001/"),

  /** Vida máxima de la sesión y tiempo de inactividad que la cierra. */
  SESSION_ABSOLUTE_MINUTES: z.coerce.number().int().positive().default(480),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
  /**
   * Saltos de confianza hasta el balanceador. Sin esto, Express no lee
   * `X-Forwarded-For` y detrás de un ingress todas las peticiones comparten
   * IP: el límite de tasa pasa a ser un cupo global y la auditoría registra
   * siempre la misma dirección. Ponerlo en un número mayor del real es el
   * error opuesto —permite falsificar la IP—, así que se declara explícito.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  /** Solo se baja a `false` en desarrollo local, que no tiene HTTPS. */
  SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof esquema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const resultado = esquema.safeParse(source);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuración de entorno inválida:\n${detalle}`);
  }
  const env = resultado.data;

  if (env.NODE_ENV === "production" && env.CORS_ORIGINS.trim() === "") {
    throw new Error("CORS_ORIGINS es obligatorio en producción: no se sirve con origen abierto.");
  }

  /* El proveedor de desarrollo no pide credenciales: una sesión de cualquier
     rol sale de un parámetro de la query. Dos cercos, no uno, porque un
     preproductivo con `NODE_ENV=development` y HTTPS también está expuesto a
     internet: si hay producción o hay TLS, no hay stub. */
  if (env.IDENTITY_PROVIDER === "stub") {
    if (env.NODE_ENV === "production") {
      throw new Error("IDENTITY_PROVIDER debe ser 'oidc' en producción.");
    }
    if (env.SESSION_COOKIE_SECURE) {
      throw new Error(
        "IDENTITY_PROVIDER='stub' solo sirve en desarrollo local sin TLS. " +
          "Con SESSION_COOKIE_SECURE=true hay HTTPS, y ahí se exige un proveedor real.",
      );
    }
  }

  if (env.NODE_ENV === "production" && !env.SESSION_COOKIE_SECURE) {
    throw new Error("SESSION_COOKIE_SECURE no puede ser false en producción.");
  }

  if (env.IDENTITY_PROVIDER === "oidc") {
    const faltantes = (["OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET"] as const).filter(
      (clave) => !env[clave],
    );
    if (faltantes.length > 0) {
      throw new Error(`Con IDENTITY_PROVIDER=oidc faltan: ${faltantes.join(", ")}.`);
    }
    if (env.NODE_ENV === "production" && !env.OIDC_ISSUER_URL?.startsWith("https://")) {
      throw new Error("OIDC_ISSUER_URL debe ser https en producción: el descubrimiento no viaja en claro.");
    }
  }

  if (returnUrls(env).length === 0) {
    throw new Error("APP_RETURN_URLS es obligatorio: sin lista de destinos, el login redirige a cualquier parte.");
  }

  return env;
}

/** Destinos de vuelta permitidos, ya limpios. */
export function returnUrls(env: Env): string[] {
  return env.APP_RETURN_URLS.split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}
