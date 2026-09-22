import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * La regla de "al día".
 *
 * **Esta regla todavía no está decidida por Fedesoft** (Anexo A del catálogo
 * de requerimientos). Por eso no vive aquí como constante: se lee del
 * parámetro `afiliacion.dias_gracia`, versionado y con vigencia.
 *
 * Cuando Fedesoft decida, se crea una versión nueva del parámetro. No hay que
 * tocar este archivo, y los certificados ya emitidos siguen explicando bajo
 * qué versión se expidieron.
 */

export interface Eligibility {
  eligible: boolean;
  reason: string;
  /** Regla aplicada, con versión: va al snapshot del certificado. */
  rule: string;
  validUntil: Date;
}

export interface EligibilityInput {
  charges: { dueDate: Date; status: string }[];
  /** Inyectable para poder probar los bordes sin depender del reloj. */
  now?: Date;
}

@Injectable()
export class MembershipPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(input: EligibilityInput): Promise<Eligibility> {
    const ahora = input.now ?? new Date();
    const { dias, version, provisional } = await this.diasDeGracia(ahora);

    const vencidos = input.charges.filter((c) => {
      const limite = new Date(c.dueDate);
      limite.setDate(limite.getDate() + dias);
      return limite < ahora;
    });

    const regla = `afiliacion.dias_gracia v${version} (${dias} días${provisional ? ", provisional" : ""})`;

    if (vencidos.length > 0) {
      return {
        eligible: false,
        reason: `${vencidos.length} cargo(s) vencido(s) más allá de los ${dias} días de gracia.`,
        rule: regla,
        validUntil: ahora,
      };
    }

    /* Vigencia hasta el cierre del año en curso, que es como opera hoy la
       cuota anual. Si Fedesoft define otra cosa, también será un parámetro. */
    const validUntil = new Date(Date.UTC(ahora.getUTCFullYear(), 11, 31));

    return { eligible: true, reason: "Sin cargos vencidos.", rule: regla, validUntil };
  }

  private async diasDeGracia(
    ahora: Date,
  ): Promise<{ dias: number; version: number; provisional: boolean }> {
    const version = await this.prisma.parameterVersion.findFirst({
      where: {
        parameter: { key: "afiliacion.dias_gracia" },
        validFrom: { lte: ahora },
        OR: [{ validTo: null }, { validTo: { gte: ahora } }],
      },
      orderBy: { version: "desc" },
    });

    if (!version) {
      /* Sin parámetro no se inventa un valor: negar es más seguro que
         adivinar cuántos días de gracia quiso dar la federación. */
      throw new Error(
        "No hay versión vigente de afiliacion.dias_gracia. La regla de elegibilidad no puede evaluarse.",
      );
    }

    const valor = version.value as { dias?: number; provisional?: boolean };
    return {
      dias: typeof valor.dias === "number" ? valor.dias : 0,
      version: version.version,
      provisional: valor.provisional === true,
    };
  }
}
