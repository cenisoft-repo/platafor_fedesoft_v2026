import { Controller, Get, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service.js";
import { Public } from "../common/permissions.js";

@ApiTags("salud")
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
  async ready(): Promise<{ status: "ok" | "degraded"; database: boolean }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: true };
    } catch {
      /* Se reporta degradado sin filtrar el motivo: el detalle va al log,
         no a una respuesta pública. */
      return { status: "degraded", database: false };
    }
  }
}
