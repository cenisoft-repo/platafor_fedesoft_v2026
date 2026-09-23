import { Inject, Injectable, NestMiddleware, UnauthorizedException } from "@nestjs/common";
import type { Session } from "@fedesoft/db";
import type { NextFunction, Request, Response } from "express";
import type { ActorContext } from "../common/deny-by-default.guard.js";
import { ActorResolver } from "./domain/actor.resolver.js";
import { SessionService } from "./domain/session.service.js";
import { cookieNames } from "./cookies.js";
import { SECURE_COOKIES } from "./identity.tokens.js";

/** Lo que el middleware deja en la petición para el resto del API. */
export interface RequestWithSession extends Request {
  actor?: ActorContext;
  session?: Session;
  correlationId?: string;
}

/**
 * Traduce la cookie en un actor.
 *
 * No decide nada: ni deniega, ni exige permisos. Si la sesión no vale, deja la
 * petición sin actor y el guard global hace lo suyo —denegar—. Esa separación
 * es deliberada: quien autentica no autoriza, y así ningún endpoint queda
 * abierto porque este archivo tuviera un `return next()` de más.
 */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(
    private readonly sessions: SessionService,
    private readonly actores: ActorResolver,
    @Inject(SECURE_COOKIES) private readonly secureCookies: boolean,
  ) {}

  async use(req: RequestWithSession, _res: Response, next: NextFunction): Promise<void> {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
    const token = cookies[cookieNames(this.secureCookies).session];
    if (!token) return next();

    const session = await this.sessions.resolve(token);
    if (!session) return next();

    const actor = await this.actores.resolve(session);
    if (!actor) return next();

    req.session = session;
    req.actor = actor;
    next();
  }
}

/**
 * El guard global ya garantiza que estas dos cosas existen cuando el endpoint
 * declara `@RequireSession` o un permiso. Estas funciones lo hacen explícito
 * para el compilador sin recurrir a una aserción que esconda el caso.
 */
export function requireSession(req: RequestWithSession): Session {
  if (!req.session) throw new UnauthorizedException("Sin sesión.");
  return req.session;
}

export function requireActor(req: RequestWithSession): ActorContext {
  if (!req.actor) throw new UnauthorizedException("Sin sesión.");
  return req.actor;
}
