import type { CookieOptions, Response } from "express";
import type { SessionChannel } from "@fedesoft/db";

/**
 * Prefijo `__Host-`: el navegador solo acepta la cookie si es Secure, sin
 * Domain y con Path=/. Ningún subdominio puede fijarla ni sobrescribirla, que
 * es justo el ataque que importa cuando portal, consola y API comparten
 * dominio institucional (regla de dominio único).
 */
export const SESSION_COOKIE: Record<SessionChannel, string> = {
  PORTAL: "__Host-fs_portal",
  CONSOLA: "__Host-fs_console",
};

export const FLOW_COOKIE: Record<SessionChannel, string> = {
  PORTAL: "__Host-fs_flow_portal",
  CONSOLA: "__Host-fs_flow_console",
};

const BASE: CookieOptions = { httpOnly: true, secure: true, path: "/" };

/**
 * Sesión: SameSite=Strict. El API no se navega, se consume desde el portal y
 * la consola, que comparten sitio; así un formulario de otro sitio nunca viaja
 * con la sesión (primera barrera CSRF; la segunda es el token).
 */
export function setSessionCookie(res: Response, channel: SessionChannel, token: string, maxAgeMs: number): void {
  res.cookie(SESSION_COOKIE[channel], token, { ...BASE, sameSite: "strict", maxAge: maxAgeMs });
}

export function clearSessionCookie(res: Response, channel: SessionChannel): void {
  res.clearCookie(SESSION_COOKIE[channel], { ...BASE, sameSite: "strict" });
}

/**
 * Flujo de login: SameSite=Lax, porque el regreso desde el proveedor es una
 * navegación de nivel superior desde otro sitio y la cookie debe viajar en él.
 */
export function setFlowCookie(res: Response, channel: SessionChannel, state: string, maxAgeMs: number): void {
  res.cookie(FLOW_COOKIE[channel], state, { ...BASE, sameSite: "lax", maxAge: maxAgeMs });
}

export function clearFlowCookie(res: Response, channel: SessionChannel): void {
  res.clearCookie(FLOW_COOKIE[channel], { ...BASE, sameSite: "lax" });
}

/** Lectura mínima de la cabecera Cookie. Ante duplicados gana la primera. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const salida: Record<string, string> = {};
  if (!header) return salida;
  for (const parte of header.split(";")) {
    const i = parte.indexOf("=");
    if (i <= 0) continue;
    const nombre = parte.slice(0, i).trim();
    if (nombre in salida) continue;
    try {
      salida[nombre] = decodeURIComponent(parte.slice(i + 1).trim());
    } catch {
      /* Valor mal codificado: se ignora en lugar de tumbar la petición. */
    }
  }
  return salida;
}
