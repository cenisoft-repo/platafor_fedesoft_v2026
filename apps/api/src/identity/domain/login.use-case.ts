import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SessionChannel } from "@fedesoft/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuditService } from "../../common/audit.service.js";
import {
  IDENTITY_PROVIDER,
  IdentityProviderError,
  type IdentityProviderPort,
  type VerifiedIdentity,
} from "../ports/identity-provider.port.js";
import { IdentityParameters } from "./identity-parameters.js";
import { pkceChallenge, randomToken, safeEqual, safeReturnTo, sha256Hex } from "./tokens.js";

/** Vida del estado entre "ir al proveedor" y "volver del proveedor". */
export const FLOW_TTL_MS = 10 * 60_000;

/**
 * Motivos de rechazo que ve el usuario. Son categorías, no diagnósticos: el
 * detalle (qué claim faltó, qué respondió el proveedor) va al log y a la
 * auditoría.
 */
export type LoginRejection =
  | "flujo-invalido"
  | "proveedor"
  | "correo-no-verificado"
  | "identidad-en-conflicto"
  | "sin-acceso"
  | "cuenta-bloqueada"
  | "sin-empresa"
  | "sin-rol-interno"
  | "mfa-requerida";

export class LoginRejectedError extends Error {
  constructor(
    readonly code: LoginRejection,
    readonly detail: string,
    readonly identity?: Pick<VerifiedIdentity, "subject" | "email">,
  ) {
    super(detail);
    this.name = "LoginRejectedError";
  }
}

export interface LoginUrls {
  /** redirect_uri registrada en el proveedor para este canal. */
  callbackUrl: string;
  /** Raíz de la aplicación a la que vuelve el usuario. */
  appUrl: string;
}

export interface CompleteLoginInput {
  channel: SessionChannel;
  code: string | undefined;
  state: string | undefined;
  /** El mismo `state`, leído de la cookie del navegador que inició el login. */
  stateCookie: string | undefined;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

export interface CompletedLogin {
  sessionToken: string;
  maxAgeMs: number;
  redirectTo: string;
}

@Injectable()
export class LoginUseCase {
  private readonly log = new Logger(LoginUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly params: IdentityParameters,
    @Inject(IDENTITY_PROVIDER) private readonly idp: IdentityProviderPort,
  ) {}

  /** Paso 1: prepara state, nonce y PKCE, y devuelve adónde ir. */
  async begin(channel: SessionChannel, returnTo: unknown, urls: LoginUrls): Promise<{ url: string; state: string }> {
    const ahora = new Date();
    const state = randomToken();
    const nonce = randomToken();
    const codeVerifier = randomToken();

    /* Limpieza oportunista: los flujos abandonados no se acumulan. */
    await this.prisma.authFlow.deleteMany({ where: { expiresAt: { lt: ahora } } });
    await this.prisma.authFlow.create({
      data: {
        stateHash: sha256Hex(state),
        channel,
        nonce,
        codeVerifier,
        returnTo: safeReturnTo(returnTo),
        expiresAt: new Date(ahora.getTime() + FLOW_TTL_MS),
      },
    });

    const url = await this.idp.authorizationUrl({
      redirectUri: urls.callbackUrl,
      state,
      nonce,
      codeChallenge: pkceChallenge(codeVerifier),
      requireMfa: channel === "CONSOLA",
    });
    return { url, state };
  }

  /**
   * Paso 2: el proveedor devolvió al usuario con un código.
   *
   * Orden deliberado: primero se prueba que este navegador inició este login
   * (state contra cookie) y se consume el flujo; solo entonces se gasta el
   * código. Así un callback reenviado o fabricado no llega al proveedor.
   */
  async complete(input: CompleteLoginInput, urls: LoginUrls): Promise<CompletedLogin> {
    try {
      return await this.completar(input, urls);
    } catch (e) {
      const rechazo =
        e instanceof LoginRejectedError ? e : new LoginRejectedError("proveedor", (e as Error).message);
      if (!(e instanceof LoginRejectedError)) this.log.error(`Login fallido: ${rechazo.detail}`);
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          actor: rechazo.identity ? `oidc:${rechazo.identity.subject}` : "anonimo",
          action: "identity.login.rejected",
          objectType: "Session",
          metadata: {
            channel: input.channel,
            code: rechazo.code,
            detail: rechazo.detail.slice(0, 300),
            /* Hash y no el correo: muchos rechazados ni siquiera son usuarios,
               y la auditoría es para siempre (Ley 1581, minimización). */
            ...(rechazo.identity ? { emailHash: sha256Hex(rechazo.identity.email.trim().toLowerCase()) } : {}),
          },
          ipAddress: input.ip ?? null,
          correlationId: input.correlationId ?? null,
        }),
      );
      throw rechazo;
    }
  }

  private async completar(input: CompleteLoginInput, urls: LoginUrls): Promise<CompletedLogin> {
    const ahora = new Date();
    const { channel } = input;

    if (!input.code || !input.state || !safeEqual(input.state, input.stateCookie)) {
      throw new LoginRejectedError("flujo-invalido", "state ausente o distinto del de la cookie.");
    }

    const flujo = await this.prisma.authFlow.findUnique({ where: { stateHash: sha256Hex(input.state) } });
    if (!flujo || flujo.channel !== channel) {
      throw new LoginRejectedError("flujo-invalido", "state desconocido o de otro canal.");
    }
    /* Un solo uso, decidido por la base: dos callbacks simultáneos con el
       mismo state ven count = 1 y count = 0. */
    const consumido = await this.prisma.authFlow.deleteMany({
      where: { id: flujo.id, expiresAt: { gt: ahora } },
    });
    if (consumido.count === 0) {
      throw new LoginRejectedError("flujo-invalido", "Flujo de login expirado o ya usado.");
    }

    let identidad: VerifiedIdentity;
    try {
      identidad = await this.idp.exchangeCode({
        code: input.code,
        redirectUri: urls.callbackUrl,
        codeVerifier: flujo.codeVerifier,
        nonce: flujo.nonce,
        requireMfa: channel === "CONSOLA",
      });
    } catch (e) {
      const detalle = e instanceof IdentityProviderError ? e.message : `Error inesperado: ${(e as Error).message}`;
      throw new LoginRejectedError("proveedor", detalle);
    }

    const quien = { subject: identidad.subject, email: identidad.email };
    if (!identidad.emailVerified) {
      /* El correo es lo que vincula la identidad externa con el usuario y sus
         invitaciones. Sin verificar, cualquiera podría declararse otro. */
      throw new LoginRejectedError("correo-no-verificado", "email_verified distinto de true.", quien);
    }
    const email = identidad.email.trim().toLowerCase();
    const policy = await this.params.session(channel, ahora);
    const sessionToken = randomToken();

    await this.prisma.$transaction(async (tx) => {
      let usuario = await tx.user.findUnique({ where: { authSubject: identidad.subject } });

      if (!usuario) {
        const porCorreo = await tx.user.findUnique({ where: { email } });
        if (!porCorreo) {
          /* Sin registro abierto: al portal se entra por invitación de la
             empresa o alta de Fedesoft, no por tener cuenta en el proveedor. */
          throw new LoginRejectedError("sin-acceso", "No existe usuario para este correo.", quien);
        }
        if (porCorreo.authSubject && porCorreo.authSubject !== identidad.subject) {
          /* Mismo correo, otra identidad externa: una cuenta recreada en el
             proveedor no hereda el acceso de la anterior sin intervención. */
          throw new LoginRejectedError(
            "identidad-en-conflicto",
            "El usuario ya está vinculado a otro sujeto del proveedor.",
            quien,
          );
        }
        /* Condicional: dos callbacks simultáneos con sujetos distintos y el
           mismo correo no pueden pisarse; el segundo ve count = 0. */
        const vinculado = await tx.user.updateMany({
          where: { id: porCorreo.id, authSubject: null },
          data: { authSubject: identidad.subject },
        });
        if (vinculado.count === 0) {
          throw new LoginRejectedError("identidad-en-conflicto", "Vinculación concurrente con otro sujeto.", quien);
        }
        usuario = { ...porCorreo, authSubject: identidad.subject };
      }

      if (usuario.status === "BLOQUEADO") {
        throw new LoginRejectedError("cuenta-bloqueada", "Usuario bloqueado.", quien);
      }

      let organizationId: string | null = null;
      if (channel === "PORTAL") {
        const vinculos = await tx.organizationUser.findMany({
          where: { userId: usuario.id, status: "ACTIVO" },
          select: { organizationId: true },
        });
        if (vinculos.length === 0) {
          /* Sin empresa activa solo se entra a responder invitaciones vigentes. */
          const pendientes = await tx.organizationUser.count({
            where: { userId: usuario.id, status: "INVITADO", inviteExpiresAt: { gt: ahora } },
          });
          if (pendientes === 0) {
            throw new LoginRejectedError("sin-empresa", "Sin vínculo activo ni invitación vigente.", quien);
          }
        }
        /* Con una sola empresa se entra directo; con varias, el usuario
           elige (RF-IDE-003) y hasta entonces no tiene permisos de negocio. */
        organizationId = vinculos.length === 1 ? (vinculos[0]?.organizationId ?? null) : null;
      } else {
        const roles = await tx.userInternalRole.count({ where: { userId: usuario.id } });
        if (roles === 0) {
          throw new LoginRejectedError("sin-rol-interno", "Sin rol interno asignado.", quien);
        }
        if (!identidad.mfa) {
          throw new LoginRejectedError("mfa-requerida", "El proveedor no afirmó segundo factor (amr/acr).", quien);
        }
      }

      const sesion = await tx.session.create({
        data: {
          tokenHash: sha256Hex(sessionToken),
          userId: usuario.id,
          channel,
          organizationId,
          mfa: identidad.mfa,
          ipAddress: input.ip?.slice(0, 64) ?? null,
          userAgent: input.userAgent?.slice(0, 300) ?? null,
          idleTimeoutSec: policy.idleSec,
          expiresAt: new Date(ahora.getTime() + policy.absoluteMs),
          lastSeenAt: ahora,
        },
      });

      await tx.user.update({
        where: { id: usuario.id },
        /* Manda el nombre del proveedor: es el que la persona controla. */
        data: { status: "ACTIVO", lastLoginAt: ahora, name: identidad.name ?? usuario.name },
      });

      await this.audit.record(tx, {
        actor: `usuario:${usuario.id}`,
        actorUserId: usuario.id,
        organizationId,
        action: "identity.login.succeeded",
        objectType: "Session",
        objectId: sesion.id,
        metadata: { channel, mfa: identidad.mfa, provider: this.idp.name, rule: policy.rule },
        ipAddress: input.ip ?? null,
        correlationId: input.correlationId ?? null,
      });
    });

    return {
      sessionToken,
      maxAgeMs: policy.absoluteMs,
      redirectTo: new URL(flujo.returnTo, urls.appUrl).toString(),
    };
  }
}
