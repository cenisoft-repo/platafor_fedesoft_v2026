import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type {
  AuthorizationRequest,
  ExchangeRequest,
  FederatedIdentity,
  IdentityProviderPort,
} from "../ports/identity-provider.port.js";

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

export interface OidcConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  /** Valor de `acr` con el que el proveedor declara el segundo factor. */
  mfaAcr: string;
}

/** Métodos con los que un proveedor declara que hubo un segundo factor. */
const AMR_DE_SEGUNDO_FACTOR = new Set(["mfa", "otp", "totp", "hwk", "swk", "pop"]);

/**
 * Adaptador OIDC genérico. Sirve para cualquier proveedor conforme —Keycloak,
 * Auth0, Entra— porque solo usa el documento de descubrimiento.
 *
 * Los controles críticos están aquí y no son negociables: PKCE S256, `nonce`
 * comprobado contra el `id_token`, y firma verificada contra el JWKS del
 * emisor con `iss`, `aud` y `exp`. Un `id_token` que no pase los cuatro no
 * produce sesión.
 */
@Injectable()
export class OidcIdentityProvider implements IdentityProviderPort {
  private readonly logger = new Logger(OidcIdentityProvider.name);
  private discovery: Promise<Discovery> | null = null;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(private readonly config: OidcConfig) {}

  private async descubrir(): Promise<Discovery> {
    this.discovery ??= (async () => {
      const url = new URL(".well-known/openid-configuration", `${this.config.issuerUrl.replace(/\/$/, "")}/`);
      const respuesta = await fetch(url, { headers: { accept: "application/json" } });
      if (!respuesta.ok) {
        throw new Error(`El proveedor de identidad no respondió al descubrimiento: ${respuesta.status}`);
      }
      const documento = (await respuesta.json()) as Discovery;
      /* Verificar el token contra el emisor que el propio documento declara
         sería tautológico: si alguien sirve el descubrimiento, sirve también
         el JWKS. El emisor debe ser el que configuramos, y sus endpoints
         tienen que vivir en el mismo origen. */
      const esperado = this.config.issuerUrl.replace(/\/$/, "");
      if (documento.issuer?.replace(/\/$/, "") !== esperado) {
        throw new Error("El proveedor declara un emisor distinto del configurado.");
      }
      const origen = new URL(esperado).origin;
      for (const endpoint of [documento.authorization_endpoint, documento.token_endpoint, documento.jwks_uri]) {
        if (!endpoint || new URL(endpoint).origin !== origen) {
          throw new Error("El descubrimiento apunta a un origen distinto del emisor.");
        }
      }
      return documento;
    })();
    return this.discovery;
  }

  async buildAuthorizationUrl(request: AuthorizationRequest): Promise<string> {
    const { authorization_endpoint } = await this.descubrir();
    const url = new URL(authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("scope", this.config.scope);
    url.searchParams.set("state", request.state);
    url.searchParams.set("nonce", request.nonce);
    url.searchParams.set("code_challenge", request.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (request.loginHint) url.searchParams.set("login_hint", request.loginHint);
    if (request.requireMfa) {
      /* `essential: true` obliga al proveedor a fallar si no puede cumplirlo,
         en vez de devolver una sesión de un solo factor en silencio. */
      url.searchParams.set("acr_values", this.config.mfaAcr);
      url.searchParams.set(
        "claims",
        JSON.stringify({ id_token: { acr: { essential: true, values: [this.config.mfaAcr] } } }),
      );
    }
    return url.toString();
  }

  async exchangeCode(request: ExchangeRequest): Promise<FederatedIdentity> {
    const discovery = await this.descubrir();

    const cuerpo = new URLSearchParams({
      grant_type: "authorization_code",
      code: request.code,
      redirect_uri: this.config.redirectUri,
      code_verifier: request.codeVerifier,
      client_id: this.config.clientId,
    });

    const respuesta = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        /* El secreto va en la cabecera, no en el cuerpo: así no termina en el
           registro de accesos de ningún intermediario. */
        authorization: `Basic ${Buffer.from(
          `${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`,
        ).toString("base64")}`,
      },
      body: cuerpo,
    });

    if (!respuesta.ok) {
      /* El detalle va al registro; a quien llama solo le llega que no. */
      this.logger.warn(`Canje de código rechazado por el proveedor (${respuesta.status}).`);
      throw new UnauthorizedException("No fue posible completar el inicio de sesión.");
    }

    const datos = (await respuesta.json()) as { id_token?: string };
    if (!datos.id_token) throw new UnauthorizedException("No fue posible completar el inicio de sesión.");

    this.jwks ??= createRemoteJWKSet(new URL(discovery.jwks_uri));

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(datos.id_token, this.jwks, {
        issuer: discovery.issuer,
        audience: this.config.clientId,
      }));
    } catch {
      this.logger.warn("id_token con firma, emisor, audiencia o vigencia inválidos.");
      throw new UnauthorizedException("No fue posible completar el inicio de sesión.");
    }

    /* El `nonce` es lo que impide que un `id_token` capturado en otra sesión
       se reinyecte en esta. Se compara siempre, no solo si viene. */
    if (payload.nonce !== request.nonce) {
      this.logger.warn("id_token con nonce que no corresponde al intento en curso.");
      throw new UnauthorizedException("No fue posible completar el inicio de sesión.");
    }

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new UnauthorizedException("No fue posible completar el inicio de sesión.");
    }

    return {
      issuer: discovery.issuer,
      subject: payload.sub,
      email: typeof payload["email"] === "string" ? payload["email"] : null,
      emailVerified: payload["email_verified"] === true,
      mfaSatisfied: segundoFactorAcreditado(payload, this.config.mfaAcr),
    };
  }

  async endSessionUrl(): Promise<string | null> {
    return (await this.descubrir()).end_session_endpoint ?? null;
  }
}

/** ¿El proveedor dice que hubo segundo factor en esta autenticación? */
export function segundoFactorAcreditado(payload: JWTPayload, mfaAcr: string): boolean {
  if (typeof payload["acr"] === "string" && payload["acr"] === mfaAcr) return true;
  const amr = payload["amr"];
  return Array.isArray(amr) && amr.some((m) => typeof m === "string" && AMR_DE_SEGUNDO_FACTOR.has(m));
}
