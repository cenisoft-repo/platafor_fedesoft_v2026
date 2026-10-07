import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsUUID } from "class-validator";
import type { Response } from "express";
import { Authenticated, Public } from "../common/permissions.js";
import { SessionService } from "./domain/session.service.js";
import { OrganizationUsersUseCase } from "./domain/organization-users.use-case.js";
import { AuthHttpService } from "./http/auth-http.service.js";
import type { AuthenticatedRequest } from "./http/session.middleware.js";

class SelectOrganizationDto {
  @IsUUID("4")
  organizationId!: string;
}

/* Límite más estricto en los endpoints que inician o completan un login: frena
   el abuso sin estorbar a quien se equivoca de contraseña (eso lo limita el
   proveedor, que es quien la valida). El guard global es ActorThrottlerGuard. */
const LIMITE_LOGIN = { default: { limit: 10, ttl: 60_000 } };

@ApiTags("identidad")
@Controller({ path: "auth", version: "1" })
export class PortalAuthController {
  constructor(
    private readonly http: AuthHttpService,
    private readonly sessions: SessionService,
    private readonly invitaciones: OrganizationUsersUseCase,
  ) {}

  @Get("login")
  @Public()
  @Throttle(LIMITE_LOGIN)
  @ApiOperation({ summary: "Inicia el login OIDC del portal (redirige al proveedor)." })
  async login(@Query("returnTo") returnTo: unknown, @Res() res: Response) {
    await this.http.start("PORTAL", returnTo, res);
  }

  @Get("callback")
  @Public()
  @Throttle(LIMITE_LOGIN)
  @ApiOperation({ summary: "Regreso del proveedor de identidad. Crea la sesión y redirige al portal." })
  async callback(@Query() query: Record<string, unknown>, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    await this.http.callback("PORTAL", query, req, res);
  }

  @Get("session")
  @Authenticated()
  @ApiOperation({ summary: "Sesión actual: usuario, empresa activa, empresas disponibles, permisos y token CSRF." })
  async session(@Req() req: AuthenticatedRequest) {
    return { ...(await this.sessions.view(actorDe(req), sesionDe(req))), csrfToken: req.csrfToken ?? null };
  }

  @Post("session/organization")
  @Authenticated()
  @HttpCode(204)
  @ApiOperation({ summary: "Elige la empresa con la que se opera (usuarios con varias empresas)." })
  async selectOrganization(@Body() dto: SelectOrganizationDto, @Req() req: AuthenticatedRequest) {
    await this.sessions.selectOrganization(actorDe(req), dto.organizationId, {
      correlationId: req.correlationId ?? null,
      ip: req.ip ?? null,
    });
  }

  /* El identificador de empresa de la ruta nombra la invitación a responder;
     el caso de uso verifica que sea del usuario en sesión. */
  @Post("invitations/:organizationId/accept")
  @Authenticated()
  @HttpCode(200)
  @ApiOperation({ summary: "Acepta una invitación propia. Si no había empresa activa, pasa a ser esta." })
  async accept(@Param("organizationId", new ParseUUIDPipe()) organizationId: string, @Req() req: AuthenticatedRequest) {
    return this.invitaciones.acceptInvitation(actorDe(req), organizationId, {
      correlationId: req.correlationId ?? null,
      ip: req.ip ?? null,
    });
  }

  @Post("invitations/:organizationId/decline")
  @Authenticated()
  @HttpCode(200)
  @ApiOperation({ summary: "Rechaza una invitación propia." })
  async decline(@Param("organizationId", new ParseUUIDPipe()) organizationId: string, @Req() req: AuthenticatedRequest) {
    return this.invitaciones.declineInvitation(actorDe(req), organizationId, {
      correlationId: req.correlationId ?? null,
      ip: req.ip ?? null,
    });
  }

  @Post("logout")
  @Authenticated()
  @HttpCode(200)
  @ApiOperation({ summary: "Cierra la sesión. Devuelve la URL de cierre en el proveedor, si existe." })
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.http.logout("PORTAL", req, res);
  }
}

@ApiTags("consola · identidad")
@Controller({ path: "admin/v1/auth", version: VERSION_NEUTRAL })
export class ConsoleAuthController {
  constructor(
    private readonly http: AuthHttpService,
    private readonly sessions: SessionService,
  ) {}

  @Get("login")
  @Public()
  @Throttle(LIMITE_LOGIN)
  @ApiOperation({ summary: "Inicia el login de la consola. Exige segundo factor." })
  async login(@Query("returnTo") returnTo: unknown, @Res() res: Response) {
    await this.http.start("CONSOLA", returnTo, res);
  }

  @Get("callback")
  @Public()
  @Throttle(LIMITE_LOGIN)
  @ApiOperation({ summary: "Regreso del proveedor para la consola." })
  async callback(@Query() query: Record<string, unknown>, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    await this.http.callback("CONSOLA", query, req, res);
  }

  @Get("session")
  @Authenticated()
  @ApiOperation({ summary: "Sesión de consola actual y token CSRF." })
  async session(@Req() req: AuthenticatedRequest) {
    return { ...(await this.sessions.view(actorDe(req), sesionDe(req))), csrfToken: req.csrfToken ?? null };
  }

  @Post("logout")
  @Authenticated()
  @HttpCode(200)
  @ApiOperation({ summary: "Cierra la sesión de consola." })
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.http.logout("CONSOLA", req, res);
  }
}

/* El guard ya garantizó la sesión en los endpoints @Authenticated; esto solo
   lo hace explícito para el compilador sin usar `!`. */
export function actorDe(req: AuthenticatedRequest) {
  if (!req.actor) throw new Error("Endpoint autenticado sin actor: revisar el orden middleware/guard.");
  return req.actor;
}

function sesionDe(req: AuthenticatedRequest) {
  if (!req.session) throw new Error("Endpoint autenticado sin sesión.");
  return req.session;
}
