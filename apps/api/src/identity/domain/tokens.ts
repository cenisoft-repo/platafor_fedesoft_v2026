import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 bits de azar en base64url (43 caracteres). */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Formato exacto de `randomToken`. Lo demás ni se busca en la base. */
export const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function sha256Hex(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

/** code_challenge S256 de PKCE (RFC 7636 §4.2). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Token anti-CSRF derivado del token de sesión.
 *
 * Quien no tiene la cookie no puede calcularlo, y la cookie no es legible
 * desde JavaScript (HttpOnly). El cliente lo obtiene de `GET /auth/session`,
 * una respuesta que el navegador solo entrega a los orígenes permitidos por
 * CORS. No hay que guardarlo: se recalcula.
 */
export function csrfTokenFor(sessionToken: string): string {
  return createHash("sha256").update(`csrf:${sessionToken}`).digest("base64url");
}

/** Comparación en tiempo constante, también para longitudes distintas. */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/**
 * Ruta de regreso tras el login. Solo rutas relativas de la propia
 * aplicación: `//evil.com`, `/\\evil.com` o `https://…` serían una redirección
 * abierta con la reputación de nuestro dominio.
 */
export function safeReturnTo(valor: unknown): string {
  if (typeof valor !== "string" || valor.length === 0 || valor.length > 300) return "/";
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) return "/";
  /* Caracteres de control o barra invertida: algunos navegadores los
     normalizan a "/" y convierten la ruta en un host. */
  for (const c of valor) {
    const code = c.charCodeAt(0);
    if (code < 0x20 || code === 0x7f || c === "\\") return "/";
  }
  return valor;
}
