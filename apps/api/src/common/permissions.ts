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

/**
 * ¿La URL apunta a la consola? Solo para elegir QUÉ cookie leer antes de que
 * exista ruta resuelta. Sin distinguir mayúsculas, porque Express tampoco las
 * distingue al enrutar. NO es el control de acceso: ese lo decide el guard con
 * `isConsoleController`, sobre la ruta que de verdad se va a ejecutar.
 */
export function isConsoleRoute(url: string | undefined): boolean {
  const ruta = ((url ?? "").split("?")[0] ?? "").toLowerCase();
  return ruta === "/admin" || ruta.startsWith("/admin/");
}

/**
 * ¿El controlador pertenece a la consola (ADR-005)? Se lee del path declarado
 * en `@Controller`, que es lo que Express acaba ejecutando. Comparar el texto
 * de la URL de la petición no sirve: `/ADMIN/...` o una URL absoluta en la
 * línea de petición llegan al mismo controlador con otro texto.
 */
export function isConsoleController(path: unknown): boolean {
  const rutas = Array.isArray(path) ? path : [path];
  return rutas.some((r) => {
    const limpia = String(r ?? "").replace(/^\/+/, "").toLowerCase();
    return limpia === "admin" || limpia.startsWith("admin/");
  });
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

/**
 * ¿Quien tiene `held` puede otorgar el permiso o patrón `pattern`? Sirve de
 * techo al asignar roles: nadie reparte más de lo que tiene (hallazgo A5 M2).
 *
 * A diferencia de `grants`, acepta patrones (`*`, `billing:*`, `*:read`): un
 * comodín solo lo otorga quien tiene ese comodín o uno más amplio, y un
 * permiso sensible solo quien lo tiene literalmente.
 */
export function canDelegate(held: readonly string[], pattern: string): boolean {
  if (held.includes(pattern)) return true;
  if (SENSITIVE_PERMISSIONS.has(pattern)) return false;
  if (held.includes("*")) return true;
  if (pattern === "*") return false;
  const [dominio, accion] = pattern.split(":");
  if (dominio === "*") return held.includes(`*:${accion}`);
  if (accion === "*") return held.includes(`${dominio}:*`);
  return grants(held, pattern);
}
