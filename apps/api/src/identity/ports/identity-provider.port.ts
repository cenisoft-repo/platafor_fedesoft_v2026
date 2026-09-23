/**
 * Lo único que el dominio sabe del proveedor de identidad.
 *
 * Detrás puede estar Keycloak, Auth0 o Entra: cuál, es una variable de
 * entorno (ADR-008). Ninguna regla de autorización vive aquí, y ninguna
 * credencial tampoco — la contraseña y el segundo factor son del proveedor.
 */

export interface AuthorizationRequest {
  /** Valor de un solo uso que ata la vuelta del navegador a este intento. */
  state: string;
  /** Valor de un solo uso que ata el `id_token` a este intento. */
  nonce: string;
  /** Reto PKCE S256 del verificador guardado en el servidor. */
  codeChallenge: string;
  /** Pedirle al proveedor que exija segundo factor en esta autenticación. */
  requireMfa: boolean;
  /** Sugerencia de identidad (`login_hint` de OIDC). Nunca decide nada. */
  loginHint?: string | undefined;
}

/** Quién dice el proveedor que es esta persona. */
export interface FederatedIdentity {
  issuer: string;
  subject: string;
  email: string | null;
  /** El proveedor da el correo por verificado. Sin esto no se enlaza nada. */
  emailVerified: boolean;
  /** El proveedor acreditó un segundo factor en esta autenticación. */
  mfaSatisfied: boolean;
}

export interface ExchangeRequest {
  code: string;
  codeVerifier: string;
  /** Se compara contra el `nonce` del `id_token`; si no coincide, se rechaza. */
  nonce: string;
}

export interface IdentityProviderPort {
  buildAuthorizationUrl(request: AuthorizationRequest): Promise<string>;
  exchangeCode(request: ExchangeRequest): Promise<FederatedIdentity>;
  /** URL para cerrar también la sesión del proveedor, si la ofrece. */
  endSessionUrl(): Promise<string | null>;
}

export const IDENTITY_PROVIDER = Symbol("IdentityProviderPort");
