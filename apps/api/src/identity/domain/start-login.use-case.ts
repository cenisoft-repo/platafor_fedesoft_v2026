import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { hashToken, newPkcePair, newToken } from "../../common/tokens.js";
import { IDENTITY_PROVIDER, type IdentityProviderPort } from "../ports/identity-provider.port.js";

/** Un intento de login no vive más que esto. */
const VIGENCIA_MINUTOS = 10;

export interface StartLoginInput {
  returnTo?: string | undefined;
  /** Pide segundo factor al proveedor. Lo usa el reintento tras un 403. */
  requireMfa?: boolean | undefined;
  loginHint?: string | undefined;
}

/**
 * Abre un intento de inicio de sesión.
 *
 * El `state`, el `nonce` y el verificador PKCE se guardan **en el servidor**:
 * un `state` que solo viaje por el navegador no prueba nada, porque quien
 * manipula la vuelta también manipula lo que lleva.
 */
@Injectable()
export class StartLoginUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_PROVIDER) private readonly provider: IdentityProviderPort,
    /** Destinos a los que se permite volver tras autenticar. */
    private readonly destinosPermitidos: readonly string[],
  ) {}

  async execute(input: StartLoginInput): Promise<{ authorizationUrl: string; binding: string }> {
    const returnTo = this.validarDestino(input.returnTo);
    const state = newToken();
    const nonce = newToken();
    /* Este secreto se queda en el navegador que empieza el login y se exige de
       vuelta en el callback. Sin él, un atacante puede iniciar sesión con su
       propia cuenta y hacer que la víctima "termine" ese login: a partir de
       ahí la víctima trabaja dentro de la sesión del atacante. Ni PKCE ni el
       `nonce` cubren eso: protegen al atacante de sí mismo, no a la víctima. */
    const binding = newToken();
    const { verifier, challenge } = newPkcePair();

    await this.prisma.authTransaction.create({
      data: {
        stateHash: hashToken(state),
        bindingHash: hashToken(binding),
        nonce,
        codeVerifier: verifier,
        returnTo,
        mfaRequested: input.requireMfa === true,
        expiresAt: new Date(Date.now() + VIGENCIA_MINUTOS * 60_000),
      },
    });

    const authorizationUrl = await this.provider.buildAuthorizationUrl({
      state,
      nonce,
      codeChallenge: challenge,
      requireMfa: input.requireMfa === true,
      loginHint: input.loginHint,
    });
    return { authorizationUrl, binding };
  }

  /**
   * Un destino de vuelta que no esté en la lista convierte el login en un
   * redirector abierto: el atacante manda a la víctima a autenticarse de
   * verdad y la devuelve a su propio sitio.
   */
  private validarDestino(returnTo: string | undefined): string {
    const porDefecto = this.destinosPermitidos[0];
    if (!porDefecto) throw new Error("No hay ningún destino de vuelta configurado.");
    if (!returnTo) return porDefecto;

    let destino: URL;
    try {
      destino = new URL(returnTo);
    } catch {
      throw new BadRequestException("Destino de vuelta inválido.");
    }
    const permitido = this.destinosPermitidos.some((base) => {
      const raiz = new URL(base);
      return destino.origin === raiz.origin;
    });
    if (!permitido) throw new BadRequestException("Destino de vuelta inválido.");
    return destino.toString();
  }
}
