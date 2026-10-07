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
  /**
   * Saltos de proxy delante del API (balanceador, CDN). Con 0, `req.ip` es la
   * conexión directa. Debe ser el número exacto: de más, cualquiera falsifica
   * su IP con X-Forwarded-For y elude el límite de peticiones.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
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
  /* `hwk`/`swk` (RFC 8176) son posesión de una clave, no necesariamente dos
     factores: no cuentan salvo que se añadan a conciencia. */
  OIDC_MFA_VALUES: z.string().default("otp,mfa"),
  /** `acr_values` que se piden al proveedor al entrar a la consola. Opcional. */
  OIDC_MFA_ACR_REQUEST: z.string().optional(),
  /** Antigüedad máxima (s) de la autenticación al entrar a la consola. */
  OIDC_CONSOLE_MAX_AGE_SEC: z.coerce.number().int().min(60).max(3600).default(900),
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
    /* Con credenciales, cada origen listado puede leer respuestas con la
       sesión del usuario: solo orígenes https exactos, sin comodines ni rutas. */
    for (const origen of env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)) {
      if (!esOrigenHttps(origen)) {
        throw new Error(`CORS_ORIGINS: "${origen}" no es un origen https exacto (https://host[:puerto]).`);
      }
    }
    /* La credencial de migraciones es dueña del esquema: puede desactivar los
       disparadores de la auditoría. Si llega al proceso del API, quien lo
       comprometa la hereda. Las migraciones corren en un trabajo aparte. */
    if (source.MIGRATION_DATABASE_URL !== undefined) {
      throw new Error(
        "MIGRATION_DATABASE_URL no debe estar en el entorno del API: las migraciones corren como trabajo aparte.",
      );
    }
    /* Las cookies de sesión son Secure y el login viaja por estas URL: en
       claro, un intermediario se lleva el código o la sesión. */
    for (const clave of ["API_PUBLIC_URL", "PORTAL_URL", "CONSOLE_URL", "OIDC_ISSUER_URL"] as const) {
      if (!env[clave].startsWith("https://")) {
        throw new Error(`${clave} debe usar https en producción.`);
      }
    }
    /* Un valor de ejemplo copiado del .env.example no es un secreto. */
    for (const clave of ["OIDC_CLIENT_SECRET", "PAYMENT_WEBHOOK_SECRET"] as const) {
      if (/cambiar/i.test(env[clave])) {
        throw new Error(`${clave} conserva el valor de ejemplo: usa el del gestor de secretos.`);
      }
    }
  }
  return env;
}

function esOrigenHttps(valor: string): boolean {
  /* El parser de URL acepta "*" en el host ("https://*.dominio"): un comodín
     se reconoce aquí, no allí. */
  if (valor.includes("*")) return false;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && url.origin === valor;
  } catch {
    return false;
  }
}
