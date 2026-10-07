/**
 * Lo único que el dominio sabe del proveedor de identidad.
 *
 * Keycloak, Microsoft Entra, Auth0… cualquiera que hable OIDC entra por un
 * adaptador. Las reglas de autorización (roles, empresa, segmento) viven en
 * nuestra base y no cambian al cambiar de proveedor (RF-IDE-001, RI-006).
 */

export const IDENTITY_PROVIDER = Symbol("IDENTITY_PROVIDER");

export interface AuthorizationRequest {
  redirectUri: string;
  state: string;
  nonce: string;
  /** S256 del verificador PKCE. */
  codeChallenge: string;
  /** Pedir segundo factor y autenticación reciente (entrada a la consola). */
  requireMfa: boolean;
}

export interface CodeExchange {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  /** El que se envió al iniciar: el ID token debe traerlo de vuelta. */
  nonce: string;
  /** Exigir que la autenticación sea reciente (`auth_time` dentro de `max_age`). */
  requireMfa: boolean;
}

/** Afirmaciones ya verificadas (firma, emisor, audiencia, vigencia, nonce). */
export interface VerifiedIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  /** El proveedor afirma que hubo segundo factor en ESTA autenticación. */
  mfa: boolean;
}

export interface IdentityProviderPort {
  readonly name: string;
  authorizationUrl(request: AuthorizationRequest): Promise<string>;
  exchangeCode(exchange: CodeExchange): Promise<VerifiedIdentity>;
  /** URL de cierre de sesión en el proveedor, si la ofrece. */
  logoutUrl(postLogoutRedirectUri: string): Promise<string | null>;
}

/** Cualquier fallo del proveedor. El detalle va al log, nunca al usuario. */
export class IdentityProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityProviderError";
  }
}
