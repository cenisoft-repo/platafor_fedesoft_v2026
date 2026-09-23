import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuditService } from "../../common/audit.service.js";
import { hashToken } from "../../common/tokens.js";
import { IDENTITY_PROVIDER, type IdentityProviderPort } from "../ports/identity-provider.port.js";
import { SessionService, type SessionTokens } from "./session.service.js";

export interface CompleteLoginInput {
  code: string;
  state: string;
  /** Secreto que el navegador guardó al iniciar el login. Sin él no se canjea. */
  binding: string | undefined;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

export interface CompleteLoginResult extends SessionTokens {
  returnTo: string;
}

/**
 * Cierra el intento de login y abre la sesión.
 *
 * Orden deliberado: primero se consume el `state` —una sola vez, con guarda en
 * el `WHERE`, no con un `SELECT` previo que deja una ventana—, y solo después
 * se habla con el proveedor. Al revés, un `state` reusado permitiría repetir
 * el canje tantas veces como se quiera.
 *
 * No hay autoaprovisionamiento: autenticarse no crea una cuenta. Quien no
 * exista en el padrón, no entra, aunque el proveedor lo conozca.
 */
@Injectable()
export class CompleteLoginUseCase {
  private readonly logger = new Logger(CompleteLoginUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_PROVIDER) private readonly provider: IdentityProviderPort,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async execute(input: CompleteLoginInput): Promise<CompleteLoginResult> {
    const transaccion = await this.consumirState(input.state, input.binding);

    const identidad = await this.provider.exchangeCode({
      code: input.code,
      codeVerifier: transaccion.codeVerifier,
      nonce: transaccion.nonce,
    });

    const usuario = await this.resolverUsuario(identidad, input);

    return this.prisma.$transaction(async (tx) => {
      /* Primer inicio de sesión con este proveedor: se enlaza aquí, no antes,
         para que el vínculo y la sesión nazcan juntos. */
      await tx.userIdentity.upsert({
        where: { issuer_subject: { issuer: identidad.issuer, subject: identidad.subject } },
        update: {},
        create: { userId: usuario.id, issuer: identidad.issuer, subject: identidad.subject },
      });

      const vinculos = await tx.organizationUser.findMany({
        where: { userId: usuario.id },
        orderBy: { createdAt: "asc" },
        take: 1,
      });

      const tokens = await this.sessions.create(tx, {
        userId: usuario.id,
        organizationId: vinculos[0]?.organizationId ?? null,
        mfaSatisfied: identidad.mfaSatisfied,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });

      await tx.user.update({ where: { id: usuario.id }, data: { lastLoginAt: new Date() } });

      await this.audit.record(tx, {
        actor: `usuario:${usuario.id}`,
        actorUserId: usuario.id,
        organizationId: tokens.session.activeOrganizationId,
        action: "auth.login",
        objectType: "session",
        objectId: tokens.session.id,
        /* Ni el token, ni el código, ni el correo: lo que sirve para auditar y
           nada que sirva para suplantar. */
        metadata: { issuer: identidad.issuer, mfa: identidad.mfaSatisfied },
        ipAddress: input.ipAddress ?? null,
        correlationId: input.correlationId ?? null,
      });

      return { ...tokens, returnTo: transaccion.returnTo };
    });
  }

  /**
   * De un solo uso, con vigencia y atado al navegador que lo abrió.
   *
   * Las tres condiciones van dentro del mismo `WHERE`: si el `binding` no
   * coincide, el `state` ni siquiera se consume, y un callback ajeno no puede
   * quemar el intento legítimo de otra persona. Un `SELECT` previo seguido de
   * un `UPDATE` dejaría una ventana entre ambos.
   */
  private async consumirState(
    state: string,
    binding: string | undefined,
  ): Promise<{ codeVerifier: string; nonce: string; returnTo: string }> {
    if (!binding) {
      this.logger.warn("Callback sin la cookie del intento de login.");
      throw new UnauthorizedException("No fue posible completar el inicio de sesión.");
    }
    const stateHash = hashToken(state);
    const transaccion = await this.prisma.authTransaction.findUnique({ where: { stateHash } });
    const { count } = await this.prisma.authTransaction.updateMany({
      where: {
        stateHash,
        bindingHash: hashToken(binding),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      /* El verificador y el nonce ya no hacen falta: se borran al consumir
         para no dejar secretos de un solo uso guardados para siempre. */
      data: { consumedAt: new Date(), codeVerifier: "", nonce: "" },
    });
    if (count !== 1 || !transaccion) {
      this.logger.warn("Callback con state desconocido, ya usado, vencido o de otro navegador.");
      throw new UnauthorizedException("No fue posible completar el inicio de sesión.");
    }
    return transaccion;
  }

  private async resolverUsuario(
    identidad: { issuer: string; subject: string; email: string | null; emailVerified: boolean },
    input: CompleteLoginInput,
  ): Promise<{ id: string }> {
    const porSujeto = await this.prisma.userIdentity.findUnique({
      where: { issuer_subject: { issuer: identidad.issuer, subject: identidad.subject } },
      include: { user: true },
    });
    if (porSujeto) {
      if (porSujeto.user.status !== "ACTIVO") {
        return this.rechazar(identidad, input, "usuario_no_activo");
      }
      return porSujeto.user;
    }

    /* Primer enlace. El correo solo sirve aquí, y solo si el proveedor lo da
       por verificado: aceptar uno sin verificar regala la cuenta a quien
       registre ese correo en el proveedor. */
    const correo = identidad.emailVerified ? identidad.email : null;
    if (!correo) return this.rechazar(identidad, input, "correo_no_verificado");

    const usuario = await this.prisma.user.findUnique({ where: { email: correo.toLowerCase() } });
    if (!usuario || usuario.status !== "ACTIVO") {
      return this.rechazar(identidad, input, "sin_cuenta_activa_en_el_padron");
    }
    return usuario;
  }

  /**
   * Un rechazo no dice por qué. El motivo va a la auditoría, que es donde lo
   * necesita el equipo; decirlo en la respuesta convertiría el login en un
   * detector de qué correos existen.
   */
  private async rechazar(
    identidad: { issuer: string; subject: string },
    input: CompleteLoginInput,
    motivo: string,
  ): Promise<never> {
    await this.audit.record(this.prisma, {
      actor: "anonimo",
      action: "auth.login.rejected",
      objectType: "session",
      metadata: { issuer: identidad.issuer, subject: identidad.subject, motivo },
      ipAddress: input.ipAddress ?? null,
      correlationId: input.correlationId ?? null,
    });
    throw new UnauthorizedException("No fue posible completar el inicio de sesión.");
  }
}
