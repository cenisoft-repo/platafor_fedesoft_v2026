import { SetMetadata } from "@nestjs/common";

export const PERMISSION_KEY = "fedesoft:permission";

/**
 * Declara el permiso que exige un endpoint. Sin este decorador el guard
 * deniega: no hay forma de exponer una ruta por olvido.
 */
export const RequirePermission = (permission: string) =>
  SetMetadata(PERMISSION_KEY, permission);

/** Marca explícita para lo que de verdad es público. Se lee en la revisión. */
export const PUBLIC_KEY = "fedesoft:public";
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** `billing:*` cubre `billing:read`; `*` cubre todo. */
export function grants(held: readonly string[], required: string): boolean {
  if (held.includes("*") || held.includes(required)) return true;
  const [dominio, accion] = required.split(":");
  if (!dominio || !accion) return false;
  return held.includes(`${dominio}:*`) || held.includes(`*:${accion}`);
}
