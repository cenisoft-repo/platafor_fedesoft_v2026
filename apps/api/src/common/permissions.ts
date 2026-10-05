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

/**
 * Exige sesión válida pero ningún permiso de negocio: ver la propia sesión,
 * elegir empresa, cerrar sesión. Es la tercera marca explícita (ADR-008); un
 * endpoint sin ninguna de las tres sigue denegado.
 */
export const AUTHENTICATED_KEY = "fedesoft:authenticated";
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);

/** Las rutas de la consola interna viven bajo este prefijo (ADR-005). */
export function isConsoleRoute(url: string | undefined): boolean {
  const ruta = (url ?? "").split("?")[0] ?? "";
  return ruta === "/admin" || ruta.startsWith("/admin/");
}

/**
 * Permisos que ningún comodín satisface.
 *
 * Un rol con `billing:*` no debe heredar la capacidad de reembolsar el día
 * que alguien añada `billing:refund`. Estas acciones mueven dinero, otorgan
 * privilegios o retractan documentos, y se conceden una por una.
 */
export const SENSITIVE_PERMISSIONS: ReadonlySet<string> = new Set([
  "billing:refund",
  "billing:write-off",
  "billing:manual-payment",
  "certificate:revoke",
  "parameter:approve",
  "role:assign",
  "user:impersonate",
  "organization:delete",
]);

/** Exactamente dos segmentos no vacíos, en minúsculas. */
const FORMATO = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

/**
 * ¿El conjunto de permisos cubre el exigido?
 *
 * `billing:*` cubre `billing:read`; `*:read` cubre `billing:read`; `*` cubre
 * lo no sensible. Un permiso sensible solo se cubre si está literalmente en
 * el conjunto.
 *
 * El formato se valida antes de nada: sin esto, `billing:payment:refund` se
 * partía en dominio `billing` y lo concedía cualquier `billing:*`, que es
 * escalada por una cadena mal formada.
 */
export function grants(held: readonly string[], required: string): boolean {
  if (!FORMATO.test(required)) return false;

  if (held.includes(required)) return true;
  /* Un permiso sensible no se hereda: ni por `*`, ni por `dominio:*`. */
  if (SENSITIVE_PERMISSIONS.has(required)) return false;

  if (held.includes("*")) return true;

  const [dominio, accion] = required.split(":");
  return held.includes(`${dominio}:*`) || held.includes(`*:${accion}`);
}
