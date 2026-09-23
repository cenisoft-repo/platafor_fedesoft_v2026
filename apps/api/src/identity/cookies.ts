import type { CookieOptions, Response } from "express";
import type { SessionTokens } from "./domain/session.service.js";

/**
 * Las dos cookies de la sesión.
 *
 * El prefijo `__Host-` es una garantía que da el navegador: solo acepta la
 * cookie si viaja por HTTPS, sin `Domain` y con `Path=/`, de modo que un
 * subdominio comprometido no puede fijarla. Solo puede usarse cuando hay
 * HTTPS, así que en desarrollo el nombre cae al equivalente sin prefijo — y
 * esa es la única diferencia entre los dos entornos.
 */
export function cookieNames(secure: boolean): { session: string; csrf: string; authTx: string } {
  const prefijo = secure ? "__Host-" : "";
  return {
    session: `${prefijo}fdsft_sid`,
    csrf: `${prefijo}fdsft_csrf`,
    authTx: `${prefijo}fdsft_authtx`,
  };
}

export const CSRF_HEADER = "x-csrf-token";

export function setSessionCookies(res: Response, tokens: SessionTokens, secure: boolean): void {
  const nombres = cookieNames(secure);
  const base: CookieOptions = {
    secure,
    sameSite: "lax",
    path: "/",
    expires: tokens.session.expiresAt,
  };
  /* La de sesión no la lee JavaScript: si un XSS no puede leerla, tampoco
     puede llevársela. */
  res.cookie(nombres.session, tokens.token, { ...base, httpOnly: true });
  /* La anti-CSRF sí, porque el cliente tiene que devolverla en la cabecera.
     No es un secreto de sesión: sirve para probar que quien envía el formulario
     es la aplicación, no un sitio de terceros. */
  res.cookie(nombres.csrf, tokens.csrfToken, { ...base, httpOnly: false });
}

/**
 * Marca el navegador que inicia un login y se retira al terminarlo.
 *
 * Vive poco a propósito: es la prueba de que quien vuelve del proveedor es
 * quien se fue, no un tercero que reparte su propio `code` por ahí.
 */
export function setAuthTransactionCookie(res: Response, binding: string, secure: boolean): void {
  res.cookie(cookieNames(secure).authTx, binding, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60_000,
  });
}

export function clearAuthTransactionCookie(res: Response, secure: boolean): void {
  res.clearCookie(cookieNames(secure).authTx, { httpOnly: true, secure, sameSite: "lax", path: "/" });
}

export function clearSessionCookies(res: Response, secure: boolean): void {
  const nombres = cookieNames(secure);
  const base: CookieOptions = { secure, sameSite: "lax", path: "/" };
  res.clearCookie(nombres.session, { ...base, httpOnly: true });
  res.clearCookie(nombres.csrf, { ...base, httpOnly: false });
}
