import { Body, Controller, Get, Inject, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import type { Response } from "express";
import { RequireSession } from "../common/permissions.js";
import { ActorResolver } from "./domain/actor.resolver.js";
import { SwitchOrganizationUseCase } from "./domain/switch-organization.use-case.js";
import { setSessionCookies } from "./cookies.js";
import { SECURE_COOKIES } from "./identity.tokens.js";
import { requireActor, requireSession, type RequestWithSession } from "./session.middleware.js";

class SwitchOrganizationDto {
  /**
   * Única excepción de todo el API a la regla "el `organizationId` no entra
   * por el cuerpo": este endpoint **es** el que lo cambia, y lo primero que
   * hace es comprobar que la persona pertenezca a esa empresa. Cualquier otro
   * endpoint que declare este campo está mal.
   */
  @IsUUID("4")
  organizationId!: string;
}

/**
 * Qué puede ver y hacer quien está en sesión, según el servidor.
 *
 * El portal usa esta respuesta para armar su navegación, pero no es una
 * autorización: cada endpoint vuelve a decidir por su cuenta. Ocultar una
 * opción es cortesía; denegarla es el control.
 */
@ApiTags("identidad")
@Controller({ path: "session", version: "1" })
export class SessionController {
  constructor(
    private readonly actores: ActorResolver,
    private readonly cambiar: SwitchOrganizationUseCase,
    @Inject(SECURE_COOKIES) private readonly secureCookies: boolean,
  ) {}

  @Get()
  @RequireSession()
  @ApiOperation({ summary: "Contexto de la sesión: persona, empresa activa, rol y segmento." })
  async current(@Req() req: RequestWithSession) {
    const actor = requireActor(req);
    return {
      userId: actor.userId,
      organizationId: actor.organizationId,
      roleKey: actor.roleKey,
      permissions: actor.permissions,
      internal: actor.internal,
      segment: actor.segment,
      membershipStatus: actor.membershipStatus,
      mfaRequired: actor.mfaRequired,
      mfaSatisfied: actor.mfaSatisfied,
      organizations: await this.actores.organizationsOf(actor.userId),
    };
  }

  @Post("organization")
  @RequireSession()
  @ApiOperation({ summary: "Cambia la empresa activa y rota el identificador de sesión." })
  async switchOrganization(
    @Body() dto: SwitchOrganizationDto,
    @Req() req: RequestWithSession,
    @Res() res: Response,
  ): Promise<void> {
    const tokens = await this.cambiar.execute({
      session: requireSession(req),
      organizationId: dto.organizationId,
      ipAddress: req.ip ?? null,
      correlationId: req.correlationId ?? null,
    });
    setSessionCookies(res, tokens, this.secureCookies);
    res.status(200).json({ organizationId: tokens.session.activeOrganizationId });
  }
}
