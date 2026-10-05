import { BadRequestException, ForbiddenException, Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { isConsoleRoute } from "../../common/permissions.js";
import type { ActorContext } from "../../common/deny-by-default.guard.js";
import { SessionService, type ResolvedSession } from "../domain/session.service.js";
import { csrfTokenFor, safeEqual } from "../domain/tokens.js";
import { SESSION_COOKIE, clearSessionCookie, parseCookies } from "./cookies.js";

export const CSRF_HEADER = "x-csrf-token";
const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

export type AuthenticatedRequest = Request & {
  actor?: ActorContext;
  session?: ResolvedSession["session"];
  csrfToken?: string;
  correlationId?: string;
};

/**
 * Convierte la cookie de sesión en `req.actor`. No autoriza: eso lo hace el
 * guard global. Aquí solo se decide QUIÉN es, y se exige el token CSRF a toda
 * petición que cambie estado con una sesión de navegador.
 *
 * La superficie decide la cookie: `/admin/*` lee la de consola y todo lo
 * demás la del portal. Una sesión nunca sirve en la otra superficie.
 */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly sessions: SessionService) {}

  async use(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      /* Solo forma "origin" (`/ruta`). Una URL absoluta en la línea de petición
         (`GET http://host/admin/...`) es legal en HTTP pero ningún navegador la
         envía a un servidor de origen: aquí solo sirve para confundir reglas. */
      if (!req.originalUrl.startsWith("/")) {
        return next(new BadRequestException("Forma de petición no admitida."));
      }
      const channel = isConsoleRoute(req.originalUrl) ? "CONSOLA" : "PORTAL";
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE[channel]];
      if (!token) return next();

      const resuelta = await this.sessions.authenticate(token, channel);
      if (!resuelta) {
        /* Cookie de una sesión vencida o revocada: se borra para que el
           cliente no siga enviándola, y la petición sigue como anónima. */
        clearSessionCookie(res, channel);
        return next();
      }

      const csrf = csrfTokenFor(token);
      if (!METODOS_SEGUROS.has(req.method) && !safeEqual(req.header(CSRF_HEADER), csrf)) {
        return next(new ForbiddenException("Falta o no coincide el token CSRF."));
      }

      req.actor = resuelta.actor;
      req.session = resuelta.session;
      req.csrfToken = csrf;
      next();
    } catch (e) {
      next(e);
    }
  }
}
