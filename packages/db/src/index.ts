import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

/**
 * Cliente único del monorepo. Las aplicaciones lo importan de aquí y nunca
 * instancian el suyo: un pool por proceso, no uno por módulo.
 */
let cliente: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  cliente ??= new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["warn", "error"] : ["warn", "error"],
  });
  return cliente;
}

/**
 * Frontera de seguridad. Toda consulta que cuelgue de una empresa pasa por
 * aquí: si el identificador no está, la consulta no se arma. No es una
 * comodidad de tipos —es la diferencia entre filtrar y no filtrar—.
 */
export function scopeToOrganization(organizationId: string | undefined | null): {
  organizationId: string;
} {
  if (!organizationId) {
    throw new Error(
      "Consulta sin organizationId: toda lectura de datos de una empresa debe declarar cuál.",
    );
  }
  return { organizationId };
}
