import { Injectable, UnauthorizedException } from "@nestjs/common";
import type {
  AuthorizationRequest,
  ExchangeRequest,
  FederatedIdentity,
  IdentityProviderPort,
} from "../ports/identity-provider.port.js";

export const STUB_ISSUER = "urn:fedesoft:proveedor-de-desarrollo";

/**
 * Proveedor de identidad para desarrollo y pruebas.
 *
 * No es un atajo del middleware: recorre el mismo flujo, consume el mismo
 * `state` de un solo uso y produce la misma sesión que el proveedor real. Lo
 * único que no hace es pedir credenciales, porque en este entorno no hay a
 * quién pedírselas.
 *
 * El arranque falla si aparece con `NODE_ENV=production` (`config/env.ts`).
 * Esa comprobación es la que sostiene que esto exista.
 */
@Injectable()
export class StubIdentityProvider implements IdentityProviderPort {
  constructor(private readonly redirectUri: string) {}

  async buildAuthorizationUrl(request: AuthorizationRequest): Promise<string> {
    const sujeto = request.loginHint ?? "gerente@empresa.test";
    const code = Buffer.from(
      JSON.stringify({ sub: sujeto, email: sujeto, mfa: request.requireMfa, nonce: request.nonce }),
      "utf8",
    ).toString("base64url");
    const url = new URL(this.redirectUri);
    url.searchParams.set("code", code);
    url.searchParams.set("state", request.state);
    return url.toString();
  }

  async exchangeCode(request: ExchangeRequest): Promise<FederatedIdentity> {
    let datos: { sub?: string; email?: string; mfa?: boolean; nonce?: string };
    try {
      datos = JSON.parse(Buffer.from(request.code, "base64url").toString("utf8"));
    } catch {
      throw new UnauthorizedException("No fue posible completar el inicio de sesión.");
    }

    /* El `nonce` se comprueba igual que con el proveedor real: es el control
       que hace que la prueba sirva de algo. */
    if (!datos.sub || datos.nonce !== request.nonce) {
      throw new UnauthorizedException("No fue posible completar el inicio de sesión.");
    }

    return {
      issuer: STUB_ISSUER,
      subject: datos.sub,
      email: datos.email ?? null,
      emailVerified: true,
      mfaSatisfied: datos.mfa === true,
    };
  }

  async endSessionUrl(): Promise<string | null> {
    return null;
  }
}
