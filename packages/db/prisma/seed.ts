/**
 * Datos sintéticos de desarrollo. Nunca copias de producción: la regla no es
 * de comodidad, es de protección de datos personales.
 *
 * Las empresas son ficticias. Las tarifas son las que usa el prototipo y están
 * pendientes de que Fedesoft confirme las reales.
 */
import { PrismaClient, Segment } from "@prisma/client";

const prisma = new PrismaClient();

const ROLES = [
  { key: "super-admin", name: "Super Admin Fedesoft", internal: true, permissions: ["*"] },
  { key: "operaciones", name: "Operaciones Fedesoft", internal: true, permissions: ["affiliation:*", "billing:read", "billing:reconcile", "organization:*", "training:*"] },
  { key: "kam", name: "Gestor de cuenta", internal: true, permissions: ["organization:read", "interaction:*", "opportunity:read"] },
  { key: "auditor", name: "Auditor", internal: true, permissions: ["*:read"] },
  { key: "gerente", name: "Gerente afiliado", internal: false, permissions: ["organization:read", "organization:update", "billing:*", "certificate:read", "directory:*", "opportunity:*"] },
  { key: "talento", name: "Talento humano afiliado", internal: false, permissions: ["training:*", "community:read", "organization:read"] },
  { key: "contacto", name: "Contacto afiliado", internal: false, permissions: ["organization:read", "training:read"] },
];

/** Tarifa vigente: sale de un parámetro versionado, no de una constante. */
const TARIFAS_2026 = [
  { rango: "1 a 10 empleados", desde: 1, hasta: 10, segmento: "MIPYME", valor: 1_150_000 },
  { rango: "11 a 50 empleados", desde: 11, hasta: 50, segmento: "MIPYME", valor: 2_450_000 },
  { rango: "51 a 200 empleados", desde: 51, hasta: 200, segmento: "MIPYME", valor: 4_800_000 },
  { rango: "201 empleados o más", desde: 201, hasta: null, segmento: "GRANDE", valor: 8_900_000 },
];

async function main() {
  for (const rol of ROLES) {
    await prisma.role.upsert({ where: { key: rol.key }, update: rol, create: rol });
  }

  const parametro = await prisma.parameter.upsert({
    where: { key: "afiliacion.cuota_anual" },
    update: {},
    create: {
      key: "afiliacion.cuota_anual",
      description: "Cuota anual de afiliación por rango de empleados y segmento.",
      scope: "GLOBAL",
    },
  });

  await prisma.parameterVersion.upsert({
    where: { parameterId_version: { parameterId: parametro.id, version: 4 } },
    update: {},
    create: {
      parameterId: parametro.id,
      version: 4,
      value: { tarifas: TARIFAS_2026 },
      validFrom: new Date("2026-01-01"),
      validTo: new Date("2026-12-31"),
      approvedBy: "Junta Directiva · acta JD-2025-11 (valores provisionales)",
    },
  });

  /* La regla de "al día" aún no está decidida (Anexo A). El parámetro existe
     con un valor provisional para que el código no la inicie en una constante
     y luego haya que ir a buscarla por todo el repositorio. */
  const gracia = await prisma.parameter.upsert({
    where: { key: "afiliacion.dias_gracia" },
    update: {},
    create: {
      key: "afiliacion.dias_gracia",
      description:
        "Días después del vencimiento antes de que la afiliación deje de estar al día. PENDIENTE de decisión de Fedesoft.",
      scope: "GLOBAL",
    },
  });

  await prisma.parameterVersion.upsert({
    where: { parameterId_version: { parameterId: gracia.id, version: 1 } },
    update: {},
    create: {
      parameterId: gracia.id,
      version: 1,
      value: { dias: 30, provisional: true },
      validFrom: new Date("2026-01-01"),
      approvedBy: "Provisional — sin aprobar. Ver RQ-FED, Anexo A.",
    },
  });

  const empresa = await prisma.organization.upsert({
    where: { nit: "901487203" },
    update: {},
    create: {
      nit: "901487203",
      nitDv: "6",
      legalName: "Datalabs Andina S.A.S.",
      segment: Segment.MIPYME,
      status: "ACTIVA",
      employees: 24,
      city: "Bogotá D.C.",
      sector: "Desarrollo a la medida / apps",
      website: "datalabsandina.co",
      contacts: {
        create: [
          { name: "Camilo Restrepo", email: "camilo.restrepo@datalabsandina.co", phone: "+57 310 555 1420", jobTitle: "Gerente General" },
          { name: "Diana Salazar", email: "diana.salazar@datalabsandina.co", phone: "+57 320 555 8891", jobTitle: "Líder de Talento Humano" },
        ],
      },
      memberships: {
        create: [{ type: "ACTIVO", status: "AL_DIA", validFrom: new Date("2021-03-15") }],
      },
    },
  });

  const version = await prisma.parameterVersion.findFirst({
    where: { parameterId: parametro.id, version: 4 },
  });

  await prisma.charge.upsert({
    where: {
      organizationId_concept_period: {
        organizationId: empresa.id,
        concept: "Cuota de afiliación anual",
        period: "2026",
      },
    },
    update: {},
    create: {
      organizationId: empresa.id,
      concept: "Cuota de afiliación anual",
      period: "2026",
      amount: "2450000.00",
      dueDate: new Date("2026-10-15"),
      status: "PENDIENTE",
      parameterVersionId: version?.id ?? null,
    },
  });

  process.stdout.write(
    `Semilla lista: ${ROLES.length} roles, 2 parámetros versionados, 1 empresa con afiliación y cargo.\n`,
  );
}

main()
  .catch((e) => {
    process.exitCode = 1;
    console.error(e);
  })
  .finally(() => prisma.$disconnect());
