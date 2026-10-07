import { Controller, Get, HttpStatus, Res, VERSION_NEUTRAL } from "@nestjs/common";
import type { Response } from "express";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service.js";
import { Public } from "../common/permissions.js";

@ApiTags("salud")
/* Las sondas del orquestador no deben toparse con el límite de peticiones. */
@SkipThrottle()
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("live")
  @Public()
  @ApiOperation({ summary: "El proceso responde." })
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  @Public()
  @ApiOperation({ summary: "El proceso responde y la base contesta." })
  async ready(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: "ok" | "degraded"; database: boolean }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: true };
    } catch {
      /* 503: el orquestador lee el código, no el cuerpo. Con 200 seguiría
         mandando tráfico a una réplica sin base. Se reporta degradado sin
         filtrar el motivo: el detalle va al log, no a una respuesta pública. */
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: "degraded", database: false };
    }
  }
}
