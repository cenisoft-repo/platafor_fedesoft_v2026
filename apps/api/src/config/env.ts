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

  /* ── Identidad (ADR-008) ── */
  /** URL pública del API: de aquí salen las redirect_uri registradas en el proveedor. */
  API_PUBLIC_URL: z.string().url(),
  /** Adónde vuelve el usuario tras iniciar sesión en el portal y en la consola. */
  PORTAL_URL: z.string().url(),
  CONSOLE_URL: z.string().url(),
  OIDC_ISSUER_URL: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  /** Cliente confidencial: el intercambio del código se autentica con este secreto. */
  OIDC_CLIENT_SECRET: z.string().min(16, "Debe tener al menos 16 caracteres."),
  /** Valores de `amr`/`acr` que el proveedor usa para decir "hubo segundo factor". */
  OIDC_MFA_VALUES: z.string().default("mfa,otp,totp,hwk,swk"),
  /** `acr_values` que se piden al proveedor al entrar a la consola. Opcional. */
  OIDC_MFA_ACR_REQUEST: z.string().optional(),
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
  if (env.NODE_ENV === "production") {
    if (env.CORS_ORIGINS.trim() === "") {
      throw new Error("CORS_ORIGINS es obligatorio en producción: no se sirve con origen abierto.");
    }
    /* Las cookies de sesión son Secure y el login viaja por estas URL: en
       claro, un intermediario se lleva el código o la sesión. */
    for (const clave of ["API_PUBLIC_URL", "PORTAL_URL", "CONSOLE_URL", "OIDC_ISSUER_URL"] as const) {
      if (!env[clave].startsWith("https://")) {
        throw new Error(`${clave} debe usar https en producción.`);
      }
    }
  }
  return env;
}
