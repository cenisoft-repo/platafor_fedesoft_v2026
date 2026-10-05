/**
 * Proveedor OIDC de mentira, pero por HTTP de verdad y con firmas de verdad.
 * Sirve para probar el adaptador como lo usará producción: descubrimiento,
 * JWKS remoto, intercambio de código con client_secret_basic y PKCE.
 */
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { SignJWT, exportJWK, generateKeyPair, type JWTPayload } from "jose";

export interface CodeGrant {
  /** Verificador PKCE esperado: si no coincide, el token endpoint responde 400. */
  codeVerifier: string;
  claims: JWTPayload;
  /** Para simular ataques: firmar con otra clave, cambiar emisor, etc. */
  idToken?: string;
}

export interface OidcMock {
  issuer: string;
  clientId: string;
  clientSecret: string;
  grant(code: string, grant: CodeGrant): void;
  /** Firma un ID token con la clave publicada (o con otra, para atacar). */
  sign(claims: JWTPayload, opciones?: { foreignKey?: boolean; alg?: string }): Promise<string>;
  close(): Promise<void>;
  requests: { path: string; authorization?: string | undefined; body: string }[];
}

export async function startOidcMock(): Promise<OidcMock> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const ajena = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const clientId = "portal-api";
  const clientSecret = "secreto-de-cliente-de-prueba";
  const codigos = new Map<string, CodeGrant>();
  const requests: OidcMock["requests"] = [];

  let issuer = "";
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", issuer);
      requests.push({ path: url.pathname, authorization: req.headers.authorization, body });
      const json = (status: number, data: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
      };
      /* Responde en cualquier ruta de descubrimiento, siempre con SU emisor:
         así se prueba que el adaptador no acepta metadatos de otro emisor. */
      if (url.pathname.endsWith("/.well-known/openid-configuration")) {
        return json(200, {
          issuer,
          authorization_endpoint: `${issuer}/auth`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          end_session_endpoint: `${issuer}/logout`,
        });
      }
      if (url.pathname === "/jwks") return json(200, { keys: [jwk] });
      if (url.pathname === "/token" && req.method === "POST") {
        const esperado = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
        if (req.headers.authorization !== esperado) return json(401, { error: "invalid_client" });
        const form = new URLSearchParams(body);
        const grant = codigos.get(form.get("code") ?? "");
        /* Los códigos son de un solo uso, como en un proveedor real. */
        codigos.delete(form.get("code") ?? "");
        if (!grant || form.get("code_verifier") !== grant.codeVerifier) {
          return json(400, { error: "invalid_grant" });
        }
        return void firmar(grant.claims).then((t) => json(200, { id_token: grant.idToken ?? t, token_type: "Bearer" }));
      }
      json(404, {});
    });
  });

  async function firmar(claims: JWTPayload, opciones: { foreignKey?: boolean; alg?: string } = {}) {
    if (opciones.alg === "none") {
      const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
      return `${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.`;
    }
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .sign(opciones.foreignKey ? ajena.privateKey : privateKey);
  }

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    issuer,
    clientId,
    clientSecret,
    requests,
    grant: (code, grant) => codigos.set(code, grant),
    sign: firmar,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** Claims mínimos válidos para este emisor y cliente. */
export function baseClaims(mock: Pick<OidcMock, "issuer" | "clientId">, extra: JWTPayload = {}): JWTPayload {
  const ahora = Math.floor(Date.now() / 1000);
  return {
    iss: mock.issuer,
    aud: mock.clientId,
    sub: "sujeto-1",
    iat: ahora,
    exp: ahora + 300,
    email: "persona@empresa.test",
    email_verified: true,
    name: "Persona de Prueba",
    ...extra,
  };
}

export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
