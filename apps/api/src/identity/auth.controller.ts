import { Controller, Get, Inject, Post, Query, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsBooleanString, IsOptional, IsString, MaxLength } from "class-validator";
import type { Response } from "express";
import { Public, RequireSession } from "../common/permissions.js";
import { StartLoginUseCase } from "./domain/start-login.use-case.js";
import { CompleteLoginUseCase } from "./domain/complete-login.use-case.js";
import { LogoutUseCase } from "./domain/logout.use-case.js";
import {
  clearAuthTransactionCookie,
  clearSessionCookies,
  cookieNames,
  setAuthTransactionCookie,
  setSessionCookies,
} from "./cookies.js";
import { SECURE_COOKIES } from "./identity.tokens.js";
import { requireSession, type RequestWithSession } from "./session.middleware.js";

class StartLoginQuery {
  @IsOptional() @IsString() @MaxLength(500) returnTo?: string;
  @IsOptional() @IsBooleanString() mfa?: string;
  /** `login_hint` de OIDC: una sugerencia para el proveedor, nada más. */
  @IsOptional() @IsString() @MaxLength(320) hint?: string;
}

class CallbackQuery {
  @IsString() @MaxLength(4096) code!: string;
  @IsString() @MaxLength(200) state!: string;
}

/**
 * Las tres puertas de la sesión: entrar, volver del proveedor y salir.
 *
 * Entrar y volver son públicas por naturaleza —todavía no hay sesión— y por
 * eso llevan límite de tasa: son la superficie que un atacante puede golpear
 * sin credenciales.
 */
@ApiTags("identidad")
@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    private readonly iniciar: StartLoginUseCase,
    private readonly completar: CompleteLoginUseCase,
    private readonly cerrar: LogoutUseCase,
    @Inject(SECURE_COOKIES) private readonly secureCookies: boolean,
  ) {}

  @Get("login")
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Abre el inicio de sesión y redirige al proveedor de identidad." })
  async login(@Query() query: StartLoginQuery, @Res() res: Response): Promise<void> {
    const { authorizationUrl, binding } = await this.iniciar.execute({
      returnTo: query.returnTo,
      requireMfa: query.mfa === "true",
      loginHint: query.hint,
    });
    setAuthTransactionCookie(res, binding, this.secureCookies);
    res.redirect(302, authorizationUrl);
  }

  @Get("callback")
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Recibe la vuelta del proveedor, abre la sesión y devuelve al portal." })
  async callback(
    @Query() query: CallbackQuery,
    @Req() req: RequestWithSession,
    @Res() res: Response,
  ): Promise<void> {
    const cookies = (req as { cookies?: Record<string, string> }).cookies ?? {};
    const resultado = await this.completar.execute({
      code: query.code,
      state: query.state,
      binding: cookies[cookieNames(this.secureCookies).authTx],
      ipAddress: req.ip ?? null,
      userAgent: req.header("user-agent") ?? null,
      correlationId: req.correlationId ?? null,
    });
    clearAuthTransactionCookie(res, this.secureCookies);
    setSessionCookies(res, resultado, this.secureCookies);
    res.redirect(302, resultado.returnTo);
  }

  @Post("logout")
  @RequireSession()
  @ApiOperation({ summary: "Revoca la sesión en el servidor y borra sus cookies." })
  async logout(@Req() req: RequestWithSession, @Res() res: Response): Promise<void> {
    const resultado = await this.cerrar.execute({
      session: requireSession(req),
      ipAddress: req.ip ?? null,
      correlationId: req.correlationId ?? null,
    });
    clearSessionCookies(res, this.secureCookies);
    res.status(200).json(resultado);
  }
}
