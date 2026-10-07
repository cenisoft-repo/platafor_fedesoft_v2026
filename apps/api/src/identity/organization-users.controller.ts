import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsEmail, Matches, MaxLength } from "class-validator";
import { RequirePermission } from "../common/permissions.js";
import { OrganizationUsersUseCase, type OrgActor } from "./domain/organization-users.use-case.js";
import type { AuthenticatedRequest } from "./http/session.middleware.js";
import { actorDe } from "./auth.controller.js";

const CLAVE_ROL = /^[a-z][a-z0-9-]{1,59}$/;

class InviteUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @Matches(CLAVE_ROL)
  roleKey!: string;
}

class ChangeRoleDto {
  @Matches(CLAVE_ROL)
  roleKey!: string;
}

/**
 * Usuarios de la empresa en sesión. No hay `organizationId` en la ruta ni en
 * el cuerpo: la empresa es la de la sesión, siempre.
 */
@ApiTags("identidad · usuarios de mi empresa")
@Controller({ path: "organization/users", version: "1" })
export class OrganizationUsersController {
  constructor(private readonly users: OrganizationUsersUseCase) {}

  @Get()
  @RequirePermission("user:read")
  @ApiOperation({ summary: "Usuarios e invitaciones de la empresa en sesión." })
  list(@Req() req: AuthenticatedRequest) {
    return this.users.list(orgActor(req).organizationId);
  }

  @Get("roles")
  @RequirePermission("user:read")
  @ApiOperation({ summary: "Roles que se pueden asignar dentro de una empresa." })
  roles() {
    return this.users.assignableRoles();
  }

  @Post("invitations")
  @RequirePermission("user:invite")
  /* Cada invitación dispara un correo con el nombre de nuestro dominio: sin
     techo propio, el endpoint sirve para enviar spam (hallazgo A5 A1). */
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @ApiOperation({ summary: "Invita (o reinvita) a una persona por correo, con un rol de empresa." })
  invite(@Body() dto: InviteUserDto, @Req() req: AuthenticatedRequest) {
    return this.users.invite(orgActor(req), dto, ctx(req));
  }

  @Post(":userId/deactivate")
  @RequirePermission("user:manage")
  @HttpCode(200)
  @ApiOperation({ summary: "Desactiva el acceso de un usuario a la empresa. Sus sesiones se cierran." })
  deactivate(@Param("userId", new ParseUUIDPipe()) userId: string, @Req() req: AuthenticatedRequest) {
    return this.users.deactivate(orgActor(req), userId, ctx(req));
  }

  @Post(":userId/reactivate")
  @RequirePermission("user:manage")
  @HttpCode(200)
  @ApiOperation({ summary: "Reactiva el acceso de un usuario desactivado." })
  reactivate(@Param("userId", new ParseUUIDPipe()) userId: string, @Req() req: AuthenticatedRequest) {
    return this.users.reactivate(orgActor(req), userId, ctx(req));
  }

  @Patch(":userId/role")
  @RequirePermission("user:manage")
  @ApiOperation({ summary: "Cambia el rol de un usuario en la empresa. Sus sesiones se cierran." })
  changeRole(
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() dto: ChangeRoleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.users.changeRole(orgActor(req), userId, dto.roleKey, ctx(req));
  }
}

function orgActor(req: AuthenticatedRequest): OrgActor {
  const actor = actorDe(req);
  /* Sin empresa activa no hay permisos de negocio, así que el guard ya habría
     negado; esto cubre el caso si alguna vez cambia esa regla. */
  if (!actor.organizationId) throw new Error("Endpoint de empresa sin empresa activa.");
  return { userId: actor.userId, organizationId: actor.organizationId, permissions: actor.permissions };
}

function ctx(req: AuthenticatedRequest) {
  return { correlationId: req.correlationId ?? null, ip: req.ip ?? null };
}
