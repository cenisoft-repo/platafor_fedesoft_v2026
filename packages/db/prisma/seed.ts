/**
 * Datos sintéticos de desarrollo. Nunca copias de producción: la regla no es
 * de comodidad, es de protección de datos personales.
 *
 * Las empresas son ficticias. Las tarifas son las que usa el prototipo y están
 * pendientes de que Fedesoft confirme las reales.
 */
import { existsSync } from "node:fs";
import { PrismaClient, Segment } from "@prisma/client";
import { evaluarEntornoSemilla } from "./seed-guard.js";

/* Usuarios con correos conocidos y roles altos: en un entorno real serían una
   puerta de entrada. Corre solo en desarrollo o pruebas y contra una base local
   o de CI (seed-guard.ts); lo demás se niega. */
for (const archivo of [".env", "prisma/.env"]) {
  /* Prisma lee el .env por su cuenta; hay que leerlo antes para saber a qué base iría. */
  if (!process.env.DATABASE_URL && existsSync(archivo)) {
    try {
      process.loadEnvFile(archivo);
    } catch (e) {
      console.warn(`No pude leer ${archivo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
const veredicto = evaluarEntornoSemilla({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  ALLOW_SYNTHETIC_SEED: process.env.ALLOW_SYNTHETIC_SEED,
});
if (!veredicto.permitida) {
  console.error(`La semilla sintética se niega a correr: ${veredicto.motivo}`);
  process.exit(1);
}

const prisma = new PrismaClient();

/* Roles internos: los nueve de docs/01-consola-administracion.md §2.1 con los
   permisos de ADR-009. Las claves son contrato con el prototipo de la consola
   (que decide los módulos por estas cadenas) y con la prueba
   apps/api/test/roles-internos.test.ts: cambiar una lista sin cambiar el
   oráculo de esa prueba falla el CI. Los comodines los resuelve `grants()`
   (apps/api/src/common/permissions.ts); ninguno concede un permiso sensible. */
const ROLES = [
  /* `role:assign` es sensible: ningún comodín lo concede, ni siquiera `*`, así
     que se declara de forma explícita. */
  { key: "super-admin", name: "Super Admin Fedesoft", internal: true, permissions: ["*", "role:assign"] },
  {
    key: "operaciones",
    name: "Operaciones · Afiliación",
    internal: true,
    permissions: [
      "organization:*", "affiliation:*", "certificate:read", "billing:read", "training:read", "community:read",
      "content:read", "directory:read", "directory:verify", "interaction:read", "analytics:read", "audit:read",
    ],
  },
  {
    key: "cartera",
    name: "Cartera · Financiera",
    internal: true,
    /* Sin comodín en billing: `billing:pay` es el pago del afiliado y no debe
       alcanzar a ningún rol interno, ni siquiera por una superficie futura. */
    permissions: [
      "billing:read", "billing:reconcile", "billing:export", "organization:read", "affiliation:read",
      "certificate:read", "content:read", "analytics:read", "audit:read",
    ],
  },
  {
    key: "formacion",
    name: "Formación y comunidades",
    internal: true,
    permissions: ["training:*", "community:*", "organization:read", "content:read", "analytics:read", "audit:read"],
  },
  {
    key: "comunicaciones",
    name: "Comunicaciones · Contenido",
    internal: true,
    permissions: [
      "content:*", "directory:*", "organization:read", "certificate:read", "training:read", "community:read",
      "community:update", "vertical:read", "analytics:read", "audit:read",
    ],
  },
  {
    key: "relacionamiento",
    name: "Relacionamiento · Verticales",
    internal: true,
    permissions: [
      "opportunity:*", "vertical:*", "organization:read", "content:read", "interaction:read",
      "analytics:read", "audit:read",
    ],
  },
  /* El alcance "solo organizaciones asignadas" del KAM aún no se aplica en el
     servidor (ADR-009 b): no hay modelo de asignación de cuentas. */
  {
    key: "kam",
    name: "Gestor de cuenta",
    internal: true,
    permissions: [
      "organization:read", "affiliation:read", "billing:read", "certificate:read", "training:read",
      "community:read", "directory:read", "vertical:read", "opportunity:read", "interaction:*", "analytics:read",
      "audit:read",
    ],
  },
  { key: "direccion", name: "Dirección", internal: true, permissions: ["*:read", "analytics:export"] },
  { key: "auditor", name: "Auditor", internal: true, permissions: ["*:read", "analytics:export", "audit:export"] },
  /* Roles de empresa: no cambian (ADR-008). */
  { key: "gerente", name: "Gerente afiliado", internal: false, permissions: ["organization:read", "organization:update", "billing:*", "certificate:read", "directory:*", "opportunity:*", "user:read", "user:invite", "user:manage"] },
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
          { name: "Camilo Restrepo", email: "camilo.restrepo@datalabs-andina.test", phone: "+57 310 555 1420", jobTitle: "Gerente General" },
          { name: "Diana Salazar", email: "diana.salazar@datalabs-andina.test", phone: "+57 320 555 8891", jobTitle: "Líder de Talento Humano" },
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

  await sembrarIdentidad(empresa.id);

  process.stdout.write(
    `Semilla lista: ${ROLES.length} roles, 4 parámetros versionados, 1 empresa con afiliación y cargo, ${USUARIOS_DEV.length} usuarios de desarrollo.\n`,
  );
}

/**
 * Usuarios sintéticos. Ninguno trae `authSubject`: se vinculan en su primer
 * login cuando el proveedor de identidad confirma el mismo correo verificado
 * (ADR-008). Coinciden con los usuarios del realm de desarrollo de Keycloak
 * (`infra/docker/keycloak/`). Dos Super Admin porque la regla RA-ACC-008 exige
 * que nunca haya menos; uno por cada uno de los demás roles internos (ADR-009).
 */
const USUARIOS_DEV = [
  { email: "superadmin1@fedesoft-dev.test", name: "Super Admin Uno", internalRole: "super-admin" },
  { email: "superadmin2@fedesoft-dev.test", name: "Super Admin Dos", internalRole: "super-admin" },
  { email: "operaciones@fedesoft-dev.test", name: "Operaciones Dev", internalRole: "operaciones" },
  { email: "cartera@fedesoft-dev.test", name: "Cartera Dev", internalRole: "cartera" },
  { email: "formacion@fedesoft-dev.test", name: "Formación Dev", internalRole: "formacion" },
  { email: "comunicaciones@fedesoft-dev.test", name: "Comunicaciones Dev", internalRole: "comunicaciones" },
  { email: "relacionamiento@fedesoft-dev.test", name: "Relacionamiento Dev", internalRole: "relacionamiento" },
  { email: "kam@fedesoft-dev.test", name: "Gestor de Cuenta Dev", internalRole: "kam" },
  { email: "direccion@fedesoft-dev.test", name: "Dirección Dev", internalRole: "direccion" },
  { email: "auditor@fedesoft-dev.test", name: "Auditor Dev", internalRole: "auditor" },
  { email: "camilo.restrepo@datalabs-andina.test", name: "Camilo Restrepo", orgRole: "gerente" },
  { email: "diana.salazar@datalabs-andina.test", name: "Diana Salazar", orgRole: "talento" },
] as const;

async function sembrarIdentidad(organizationId: string) {
  const sesion = await prisma.parameter.upsert({
    where: { key: "identidad.sesion" },
    update: {},
    create: {
      key: "identidad.sesion",
      description:
        "Duración máxima e inactividad permitida de las sesiones, por canal. La consola usa sesiones cortas (RA-ACC-007).",
      scope: "GLOBAL",
    },
  });
  await prisma.parameterVersion.upsert({
    where: { parameterId_version: { parameterId: sesion.id, version: 1 } },
    update: {},
    create: {
      parameterId: sesion.id,
      version: 1,
      value: {
        portal: { horasMaximas: 12, minutosInactividad: 60 },
        consola: { horasMaximas: 8, minutosInactividad: 30 },
      },
      validFrom: new Date("2026-01-01"),
      approvedBy: "Propuesta por defecto (docs/01-consola-administracion.md §7) — pendiente de aprobación.",
    },
  });

  const invitacion = await prisma.parameter.upsert({
    where: { key: "identidad.invitacion" },
    update: {},
    create: {
      key: "identidad.invitacion",
      description: "Horas de vigencia de una invitación a una empresa antes de que deba reenviarse (RF-IDE-006).",
      scope: "GLOBAL",
    },
  });
  await prisma.parameterVersion.upsert({
    where: { parameterId_version: { parameterId: invitacion.id, version: 1 } },
    update: {},
    create: {
      parameterId: invitacion.id,
      version: 1,
      value: { horasVigencia: 72 },
      validFrom: new Date("2026-01-01"),
      approvedBy: "Propuesta por defecto — pendiente de aprobación.",
    },
  });

  const roles = new Map((await prisma.role.findMany()).map((r) => [r.key, r.id]));
  const rolId = (key: string) => {
    const id = roles.get(key);
    if (!id) throw new Error(`Rol ${key} no sembrado.`);
    return id;
  };

  for (const u of USUARIOS_DEV) {
    const usuario = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, name: u.name, status: "INVITADO" },
    });
    if ("internalRole" in u) {
      await prisma.userInternalRole.upsert({
        where: { userId_roleId: { userId: usuario.id, roleId: rolId(u.internalRole) } },
        update: {},
        create: { userId: usuario.id, roleId: rolId(u.internalRole) },
      });
    } else {
      const contacto = await prisma.contact.findUnique({
        where: { organizationId_email: { organizationId, email: u.email } },
      });
      await prisma.organizationUser.upsert({
        where: { organizationId_userId: { organizationId, userId: usuario.id } },
        update: {},
        create: {
          organizationId,
          userId: usuario.id,
          contactId: contacto?.id ?? null,
          roleId: rolId(u.orgRole),
          status: "ACTIVO",
        },
      });
    }
  }
}

main()
  .catch((e) => {
    process.exitCode = 1;
    console.error(e);
  })
  .finally(() => prisma.$disconnect());
