import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../common/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { MembershipPolicy } from "./membership.policy.js";

/**
 * Generación del certificado de afiliación, disparada por `invoice.issued`.
 *
 * El certificado no se emite porque alguien lo pida: se emite cuando la
 * empresa cumple la regla de elegibilidad, y guarda el retrato del estado que
 * lo justificó. Así, meses después, se puede explicar por qué se expidió.
 */
@Injectable()
export class IssueCertificateUseCase {
  private readonly log = new Logger(IssueCertificateUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly policy: MembershipPolicy,
  ) {}

  async execute(organizationId: string, correlationId?: string | null): Promise<string | null> {
    const empresa = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        memberships: { where: { validTo: null }, take: 1 },
        charges: { where: { status: { in: ["PENDIENTE", "VENCIDO"] } } },
      },
    });

    const afiliacion = empresa?.memberships[0];
    if (!empresa || !afiliacion) {
      this.log.warn(`Sin afiliación abierta para ${organizationId}: no se emite certificado.`);
      return null;
    }

    const elegibilidad = await this.policy.evaluate({
      charges: empresa.charges.map((c) => ({ dueDate: c.dueDate, status: c.status })),
    });

    if (!elegibilidad.eligible) {
      this.log.log(`Certificado no emitido para ${organizationId}: ${elegibilidad.reason}`);
      return null;
    }

    /* Un solo certificado vigente por empresa (índice único parcial). Emitir
       uno nuevo revoca el anterior, en la misma transacción: si se hiciera en
       dos pasos, un fallo dejaría a la empresa sin ninguno o con dos. */
    const folio = await this.siguienteFolio();

    const certificado = await this.prisma.$transaction(async (tx) => {
      await tx.certificate.updateMany({
        where: { organizationId, status: "VIGENTE" },
        data: { status: "REVOCADO", revokedAt: new Date() },
      });

      const creado = await tx.certificate.create({
        data: {
          organizationId,
          folio,
          status: "VIGENTE",
          validUntil: elegibilidad.validUntil,
          membershipSnapshot: {
            tipo: afiliacion.type,
            estado: afiliacion.status,
            desde: afiliacion.validFrom.toISOString().slice(0, 10),
            razonSocial: empresa.legalName,
            nit: `${empresa.nit}-${empresa.nitDv}`,
            /* La regla bajo la que se emitió, con su versión: si mañana
               cambia, este certificado sigue siendo explicable. */
            regla: elegibilidad.rule,
          },
        },
      });

      await this.outbox.append(tx, {
        eventType: "certificate.generated",
        aggregateType: "Certificate",
        aggregateId: creado.id,
        payload: { certificateId: creado.id, organizationId, folio },
        correlationId: correlationId ?? null,
      });

      await this.audit.record(tx, {
        actor: "sistema",
        organizationId,
        action: "certificate.generated",
        objectType: "Certificate",
        objectId: creado.id,
        metadata: { folio, regla: elegibilidad.rule },
        correlationId: correlationId ?? null,
      });

      return creado;
    });

    return certificado.folio;
  }

  private async siguienteFolio(): Promise<string> {
    const anio = new Date().getFullYear();
    const emitidos = await this.prisma.certificate.count({
      where: { folio: { startsWith: `FS-${anio}-` } },
    });
    return `FS-${anio}-${String(emitidos + 1).padStart(5, "0")}`;
  }
}
