import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Secretos que viajan al navegador: sesión, anti-CSRF, `state` de OIDC.
 *
 * Dos reglas y ninguna excepción: el valor en claro solo existe en tránsito
 * —nunca en la base— y toda comparación es en tiempo constante. Un `===`
 * sobre un secreto se detiene en el primer byte distinto, y con suficientes
 * intentos eso reconstruye el secreto byte a byte.
 */

/** 256 bits de aleatoriedad criptográfica, en base64url. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 en hexadecimal: lo único que se guarda de un token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Compara dos hashes hexadecimales sin filtrar dónde difieren. */
export function hashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** Verificador PKCE y su reto S256, como exige RFC 7636. */
export function newPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
