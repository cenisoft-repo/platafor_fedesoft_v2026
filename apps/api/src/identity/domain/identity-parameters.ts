import { Injectable } from "@nestjs/common";
import type { SessionChannel } from "@fedesoft/db";
import { PrismaService } from "../../prisma/prisma.service.js";

export interface SessionPolicy {
  absoluteMs: number;
  idleSec: number;
  rule: string;
}

/**
 * Reglas de identidad que Fedesoft cambia sin desplegar: duración de sesión,
 * inactividad y vigencia de invitaciones. Viven en `Parameter`, no aquí.
 *
 * Sin versión vigente no se inventa un valor: el login falla cerrado, igual
 * que la regla de "al día" (`MembershipPolicy`).
 */
@Injectable()
export class IdentityParameters {
  constructor(private readonly prisma: PrismaService) {}

  async session(channel: SessionChannel, ahora = new Date()): Promise<SessionPolicy> {
    const { value, version } = await this.vigente("identidad.sesion", ahora);
    const canal = (value as Record<string, { horasMaximas?: unknown; minutosInactividad?: unknown }>)[
      channel === "CONSOLA" ? "consola" : "portal"
    ];
    const horas = canal?.horasMaximas;
    const minutos = canal?.minutosInactividad;
    if (!esPositivo(horas) || !esPositivo(minutos)) {
      throw new Error(`identidad.sesion v${version} no define horasMaximas/minutosInactividad para ${channel}.`);
    }
    return {
      absoluteMs: horas * 3_600_000,
      idleSec: Math.round(minutos * 60),
      rule: `identidad.sesion v${version}`,
    };
  }

  async invitationHours(ahora = new Date()): Promise<number> {
    const { value, version } = await this.vigente("identidad.invitacion", ahora);
    const horas = (value as { horasVigencia?: unknown }).horasVigencia;
    if (!esPositivo(horas)) throw new Error(`identidad.invitacion v${version} no define horasVigencia.`);
    return horas;
  }

  private async vigente(key: string, ahora: Date) {
    const version = await this.prisma.parameterVersion.findFirst({
      where: {
        parameter: { key },
        validFrom: { lte: ahora },
        OR: [{ validTo: null }, { validTo: { gte: ahora } }],
      },
      orderBy: { version: "desc" },
    });
    if (!version) throw new Error(`No hay versión vigente de ${key}.`);
    return version;
  }
}

function esPositivo(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}
