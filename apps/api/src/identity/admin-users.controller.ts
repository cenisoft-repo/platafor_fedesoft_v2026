import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { RequirePermission } from "../common/permissions.js";
import { InternalUsersUseCase } from "./domain/internal-users.use-case.js";
import type { AuthenticatedRequest } from "./http/session.middleware.js";
import { actorDe } from "./auth.controller.js";
import type { ConsoleActor } from "./domain/internal-users.use-case.js";

const CLAVE_ROL = /^[a-z][a-z0-9-]{1,59}$/;

class ProvisionInternalUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @Matches(CLAVE_ROL)
  roleKey!: string;
}

class GrantRoleDto {
  @Matches(CLAVE_ROL)
  roleKey!: string;
}

class ReasonDto {
  /* Toda acción sobre el acceso de una persona lleva motivo: es lo que el
     auditor lee seis meses después. */
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

@ApiTags("consola · usuarios")
@Controller({ path: "admin/v1/users", version: VERSION_NEUTRAL })
export class AdminUsersController {
  constructor(private readonly users: InternalUsersUseCase) {}

  @Get()
  @RequirePermission("user:read")
  @ApiOperation({ summary: "Busca usuarios por correo. Las personas afiliadas solo con user:read-affiliates." })
  search(
    @Query("q") q: string | undefined,
    @Query("take", new DefaultValuePipe(25), ParseIntPipe) take: number,
    @Query("skip", new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.users.search(
      consola(req),
      typeof q === "string" ? q.slice(0, 320) : undefined,
      Math.min(Math.max(take, 1), 100),
      Math.max(skip, 0),
    );
  }

  @Get("roles")
  @RequirePermission("user:read")
  @ApiOperation({ summary: "Roles internos disponibles." })
  roles() {
    return this.users.internalRoles();
  }

  @Get(":userId")
  @RequirePermission("user:read")
  @ApiOperation({
    summary:
      "Ficha del usuario: roles internos, sesiones activas y, con user:read-affiliates, sus empresas. IP y agente de las sesiones solo con session:inspect.",
  })
  detail(@Param("userId", new ParseUUIDPipe()) userId: string, @Req() req: AuthenticatedRequest) {
    return this.users.detail(consola(req), userId);
  }

  @Post()
  @RequirePermission("role:assign")
  @ApiOperation({ summary: "Da de alta un usuario interno con su primer rol." })
  provision(@Body() dto: ProvisionInternalUserDto, @Req() req: AuthenticatedRequest) {
    return this.users.provision(consola(req), dto, ctx(req));
  }

  @Post(":userId/internal-roles")
  @RequirePermission("role:assign")
  @ApiOperation({ summary: "Asigna un rol interno. Las sesiones de consola del usuario se cierran." })
  grant(
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() dto: GrantRoleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.users.grantRole(consola(req), userId, dto.roleKey, ctx(req));
  }

  @Delete(":userId/internal-roles/:roleKey")
  @RequirePermission("role:assign")
  @ApiOperation({ summary: "Quita un rol interno. Nunca deja menos de dos Super Admin." })
  revoke(
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Param("roleKey") roleKey: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.users.revokeRole(consola(req), userId, roleKey, ctx(req));
  }

  @Post(":userId/block")
  @RequirePermission("user:block")
  @HttpCode(200)
  @ApiOperation({ summary: "Bloquea la cuenta en todo el sistema y cierra sus sesiones." })
  block(@Param("userId", new ParseUUIDPipe()) userId: string, @Body() dto: ReasonDto, @Req() req: AuthenticatedRequest) {
    return this.users.block(consola(req), userId, dto.reason, ctx(req));
  }

  @Post(":userId/unblock")
  @RequirePermission("user:block")
  @HttpCode(200)
  @ApiOperation({ summary: "Desbloquea la cuenta." })
  unblock(@Param("userId", new ParseUUIDPipe()) userId: string, @Body() dto: ReasonDto, @Req() req: AuthenticatedRequest) {
    return this.users.unblock(consola(req), userId, dto.reason, ctx(req));
  }

  @Post(":userId/sessions/revoke")
  @RequirePermission("session:revoke")
  @HttpCode(200)
  @ApiOperation({ summary: "Cierra todas las sesiones del usuario (cierre forzado)." })
  revokeSessions(@Param("userId", new ParseUUIDPipe()) userId: string, @Req() req: AuthenticatedRequest) {
    return this.users.revokeSessions(consola(req), userId, ctx(req));
  }
}

function consola(req: AuthenticatedRequest): ConsoleActor {
  const actor = actorDe(req);
  return { userId: actor.userId, permissions: actor.permissions };
}

function ctx(req: AuthenticatedRequest) {
  return { correlationId: req.correlationId ?? null, ip: req.ip ?? null };
}
