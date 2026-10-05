import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import {
  IdentityProviderError,
  type AuthorizationRequest,
  type CodeExchange,
  type IdentityProviderPort,
  type VerifiedIdentity,
} from "../ports/identity-provider.port.js";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Valores de `amr` o `acr` que cuentan como segundo factor. */
  mfaValues: readonly string[];
  /** `acr_values` a pedir cuando se exige segundo factor. */
  mfaAcrRequest?: string | undefined;
}

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

/** Algoritmos asimétricos aceptados. `none` y HS* quedan fuera a propósito. */
const ALGORITMOS = ["RS256", "PS256", "ES256", "EdDSA"];
const TIMEOUT_MS = 10_000;

/**
 * Adaptador OIDC genérico: Authorization Code + PKCE con cliente confidencial.
 *
 * Implementado sobre `fetch` y `jose` en lugar de una librería cliente
 * completa para que cada verificación sea visible y probada: emisor,
 * audiencia, `azp`, firma asimétrica, vigencia con tolerancia acotada y
 * `nonce`. Si una falta, el login no ocurre.
 */
export class OidcIdentityProvider implements IdentityProviderPort {
  readonly name = "oidc";
  private discovery: Promise<Discovery> | undefined;
  private jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  constructor(private readonly config: OidcConfig) {}

  async authorizationUrl(req: AuthorizationRequest): Promise<string> {
    const meta = await this.meta();
    const url = new URL(meta.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", req.redirectUri);
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", req.state);
    url.searchParams.set("nonce", req.nonce);
    url.searchParams.set("code_challenge", req.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (req.requireMfa && this.config.mfaAcrRequest) {
      url.searchParams.set("acr_values", this.config.mfaAcrRequest);
    }
    return url.toString();
  }

  async exchangeCode(ex: CodeExchange): Promise<VerifiedIdentity> {
    const meta = await this.meta();

    const cuerpo = new URLSearchParams({
      grant_type: "authorization_code",
      code: ex.code,
      redirect_uri: ex.redirectUri,
      code_verifier: ex.codeVerifier,
    });
    /* client_secret_basic (RFC 6749 §2.3.1): id y secreto codificados antes
       de unirlos, para que un ":" en el secreto no corte la credencial. */
    const basic = Buffer.from(
      `${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`,
    ).toString("base64");

    let respuesta: Response;
    try {
      respuesta = await fetch(meta.token_endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          authorization: `Basic ${basic}`,
        },
        body: cuerpo.toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
    } catch (e) {
      throw new IdentityProviderError(`Endpoint de token inalcanzable: ${(e as Error).message}`);
    }
    if (!respuesta.ok) {
      throw new IdentityProviderError(`El proveedor rechazó el código (HTTP ${respuesta.status}).`);
    }

    const tokens = (await respuesta.json().catch(() => ({}))) as { id_token?: unknown };
    if (typeof tokens.id_token !== "string") {
      throw new IdentityProviderError("La respuesta del proveedor no trae id_token.");
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(tokens.id_token, this.keys(meta), {
        issuer: meta.issuer,
        audience: this.config.clientId,
        algorithms: ALGORITMOS,
        clockTolerance: 30,
        requiredClaims: ["sub", "exp", "iat"],
      }));
    } catch (e) {
      throw new IdentityProviderError(`ID token inválido: ${(e as Error).message}`);
    }

    if (payload.nonce !== ex.nonce) {
      throw new IdentityProviderError("El nonce del ID token no corresponde a este login.");
    }
    /* Con varias audiencias, OIDC Core §3.1.3.7 exige que el token se haya
       emitido para este cliente: si no, es un token ajeno reutilizado. */
    if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== this.config.clientId) {
      throw new IdentityProviderError("El ID token no fue emitido para este cliente (azp).");
    }

    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== "string" || sub.length === 0 || sub.length > 255) {
      throw new IdentityProviderError("El ID token no trae un sujeto válido.");
    }
    if (typeof email !== "string" || email.length === 0 || email.length > 320) {
      throw new IdentityProviderError("El ID token no trae correo: falta el scope email.");
    }

    const amr = Array.isArray(payload.amr) ? payload.amr.filter((v): v is string => typeof v === "string") : [];
    const acr = typeof payload.acr === "string" ? payload.acr : null;
    const mfa =
      amr.some((v) => this.config.mfaValues.includes(v)) ||
      (acr !== null && this.config.mfaValues.includes(acr));

    return {
      subject: sub,
      email,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name.slice(0, 200) : null,
      mfa,
    };
  }

  async logoutUrl(postLogoutRedirectUri: string): Promise<string | null> {
    const meta = await this.meta();
    if (!meta.end_session_endpoint) return null;
    const url = new URL(meta.end_session_endpoint);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
    return url.toString();
  }

  private keys(meta: Discovery) {
    /* jose cachea las claves y vuelve a pedirlas cuando aparece un `kid`
       desconocido: la rotación de claves del proveedor no rompe el login. */
    this.jwks ??= createRemoteJWKSet(new URL(meta.jwks_uri), { timeoutDuration: TIMEOUT_MS });
    return this.jwks;
  }

  private meta(): Promise<Discovery> {
    this.discovery ??= this.descubrir().catch((e: unknown) => {
      /* Un fallo de red no puede quedar en caché para siempre. */
      this.discovery = undefined;
      throw e;
    });
    return this.discovery;
  }

  private async descubrir(): Promise<Discovery> {
    const emisor = this.config.issuer;
    let datos: Partial<Discovery>;
    try {
      const r = await fetch(`${emisor.replace(/\/$/, "")}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      datos = (await r.json()) as Partial<Discovery>;
    } catch (e) {
      throw new IdentityProviderError(`Descubrimiento OIDC fallido: ${(e as Error).message}`);
    }
    /* OIDC Discovery §4.3: el emisor publicado debe ser idéntico al
       configurado. Si no, alguien sirve metadatos de otro emisor. */
    if (datos.issuer !== emisor) {
      throw new IdentityProviderError("El emisor publicado no coincide con el configurado.");
    }
    for (const campo of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
      if (typeof datos[campo] !== "string") {
        throw new IdentityProviderError(`Metadatos OIDC sin ${campo}.`);
      }
    }
    return datos as Discovery;
  }
}
