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
  if (resultado.data.NODE_ENV === "production" && resultado.data.CORS_ORIGINS.trim() === "") {
    throw new Error("CORS_ORIGINS es obligatorio en producción: no se sirve con origen abierto.");
  }
  return resultado.data;
}
