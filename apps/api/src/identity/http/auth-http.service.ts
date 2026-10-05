import { Inject, Injectable } from "@nestjs/common";
import type { Response } from "express";
import type { SessionChannel } from "@fedesoft/db";
import { FLOW_TTL_MS, LoginRejectedError, LoginUseCase, type LoginUrls } from "../domain/login.use-case.js";
import { SessionService } from "../domain/session.service.js";
import { IDENTITY_PROVIDER, type IdentityProviderPort } from "../ports/identity-provider.port.js";
import {
  FLOW_COOKIE,
  SESSION_COOKIE,
  clearFlowCookie,
  clearSessionCookie,
  parseCookies,
  setFlowCookie,
  setSessionCookie,
} from "./cookies.js";
import type { AuthenticatedRequest } from "./session.middleware.js";

export const IDENTITY_URLS = Symbol("IDENTITY_URLS");

export interface IdentityUrls {
  apiPublicUrl: string;
  portalUrl: string;
  consoleUrl: string;
}

/** Ruta del callback de cada superficie. Debe registrarse tal cual en el proveedor. */
export const CALLBACK_PATH: Record<SessionChannel, string> = {
  PORTAL: "/v1/auth/callback",
  CONSOLA: "/admin/v1/auth/callback",
};

/** Página de la aplicación que explica por qué no se pudo entrar. */
const PAGINA_ERROR = "/acceso/error";

/**
 * La parte HTTP del login, común a portal y consola. Los controladores solo
 * eligen el canal; aquí se manejan cookies y redirecciones.
 */
@Injectable()
export class AuthHttpService {
  constructor(
    private readonly login: LoginUseCase,
    private readonly sessions: SessionService,
    @Inject(IDENTITY_PROVIDER) private readonly idp: IdentityProviderPort,
    @Inject(IDENTITY_URLS) private readonly urls: IdentityUrls,
  ) {}

  async start(channel: SessionChannel, returnTo: unknown, res: Response): Promise<void> {
    const { url, state } = await this.login.begin(channel, returnTo, this.urlsDe(channel));
    setFlowCookie(res, channel, state, FLOW_TTL_MS);
    res.redirect(302, url);
  }

  async callback(
    channel: SessionChannel,
    query: { code?: unknown; state?: unknown; error?: unknown },
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    const urls = this.urlsDe(channel);
    const cookies = parseCookies(req.headers.cookie);
    const stateCookie = cookies[FLOW_COOKIE[channel]];
    clearFlowCookie(res, channel);

    if (typeof query.error === "string") {
      /* El usuario canceló o el proveedor negó: no hay nada que consumir. */
      res.redirect(302, this.paginaError(urls, query.error === "access_denied" ? "cancelado" : "proveedor"));
      return;
    }

    try {
      const hecho = await this.login.complete(
        {
          channel,
          code: typeof query.code === "string" ? query.code : undefined,
          state: typeof query.state === "string" ? query.state : undefined,
          stateCookie,
          ip: req.ip ?? null,
          userAgent: req.header("user-agent") ?? null,
          correlationId: req.correlationId ?? null,
        },
        urls,
      );
      /* En un equipo compartido, la sesión de quien entró antes no debe
         seguir viva detrás de la nueva (hallazgo A5 B3). */
      await this.sessions.revokeToken(cookies[SESSION_COOKIE[channel]], "reemplazada-por-nuevo-login");
      setSessionCookie(res, channel, hecho.sessionToken, hecho.maxAgeMs);
      res.redirect(302, hecho.redirectTo);
    } catch (e) {
      if (!(e instanceof LoginRejectedError)) throw e;
      res.redirect(302, this.paginaError(urls, e.code));
    }
  }

  async logout(channel: SessionChannel, req: AuthenticatedRequest, res: Response): Promise<{ logoutUrl: string | null }> {
    if (req.actor) {
      await this.sessions.logout(req.actor, { correlationId: req.correlationId ?? null, ip: req.ip ?? null });
    }
    clearSessionCookie(res, channel);
    /* Cerrar también en el proveedor: si no, el siguiente "Entrar" vuelve a
       entrar sin pedir credenciales en un equipo compartido. */
    const logoutUrl = await this.idp.logoutUrl(this.urlsDe(channel).appUrl).catch(() => null);
    return { logoutUrl };
  }

  private urlsDe(channel: SessionChannel): LoginUrls {
    return {
      callbackUrl: new URL(CALLBACK_PATH[channel], this.urls.apiPublicUrl).toString(),
      appUrl: channel === "CONSOLA" ? this.urls.consoleUrl : this.urls.portalUrl,
    };
  }

  private paginaError(urls: LoginUrls, motivo: string): string {
    const url = new URL(PAGINA_ERROR, urls.appUrl);
    url.searchParams.set("motivo", motivo);
    return url.toString();
  }
}
