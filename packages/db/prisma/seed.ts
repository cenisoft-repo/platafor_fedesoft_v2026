/**
 * Datos sintéticos de desarrollo. Nunca copias de producción: la regla no es
 * de comodidad, es de protección de datos personales.
 *
 * Las empresas son ficticias. Las tarifas son las que usa el prototipo y están
 * pendientes de que Fedesoft confirme las reales.
 */
import { PrismaClient, Segment } from "@prisma/client";

const prisma = new PrismaClient();

/* ───────────────────── Roles internos: la matriz, en código ─────────────
 *
 * Esta tabla es la matriz de permisos de `docs/01-consola-administracion.md`
 * §2.2, fila por fila y columna por columna. Se escribe así, y no como listas
 * de permisos a mano, porque es la única forma de que una divergencia entre el
 * documento y la base se vea de un golpe en lugar de descubrirse el día que
 * alguien pueda algo que no debía.
 *
 * Códigos, los mismos del documento: C crear · R ver · U editar ·
 * S cambiar estado · X exportar · P parametrizar · "" sin acceso.
 *
 * Las cadenas tienen **dos segmentos**, `dominio:accion`, que es lo que el
 * guard del API acepta: una de tres se partiría mal y cualquier `dominio:*`
 * concedería lo que no debe. El recurso es el dominio.
 */
const ACCIONES: Record<string, string> = {
  C: "create",
  R: "read",
  U: "update",
  S: "transition",
  X: "export",
  P: "configure",
};

/** Los ocho roles que se enumeran. `SA` va aparte: su fila es "todo". */
type RolInterno = "OPS" | "FIN" | "TAL" | "COM" | "REL" | "KAM" | "DIR" | "AUD";

interface FilaDeMatriz {
  recurso: string;
  dominios: string[];
  celdas: Record<RolInterno, string>;
}

const MATRIZ: FilaDeMatriz[] = [
  { recurso: "Empresas y contactos", dominios: ["organization", "contact"],
    celdas: { OPS: "CRUSX", FIN: "R", TAL: "R", COM: "R", REL: "R", KAM: "R", DIR: "R", AUD: "RX" } },
  { recurso: "Solicitudes y estados de afiliación", dominios: ["affiliation"],
    celdas: { OPS: "CRUS", FIN: "R", TAL: "", COM: "", REL: "", KAM: "R", DIR: "RX", AUD: "RX" } },
  { recurso: "Tarifas, cargos, pagos y conciliación", dominios: ["charge", "payment"],
    celdas: { OPS: "R", FIN: "CRUSX", TAL: "", COM: "", REL: "", KAM: "R", DIR: "R", AUD: "RX" } },
  { recurso: "Facturas electrónicas", dominios: ["invoice"],
    celdas: { OPS: "R", FIN: "RSX", TAL: "", COM: "", REL: "", KAM: "", DIR: "R", AUD: "RX" } },
  { recurso: "Certificados y sello", dominios: ["certificate"],
    celdas: { OPS: "CRS", FIN: "R", TAL: "", COM: "R", REL: "", KAM: "R", DIR: "R", AUD: "RX" } },
  { recurso: "Formación: cursos, sesiones, inscripciones", dominios: ["training"],
    celdas: { OPS: "R", FIN: "", TAL: "CRUSX", COM: "R", REL: "", KAM: "R", DIR: "R", AUD: "RX" } },
  { recurso: "Comunidades y materiales", dominios: ["community"],
    celdas: { OPS: "R", FIN: "", TAL: "CRUSX", COM: "RU", REL: "", KAM: "R", DIR: "R", AUD: "RX" } },
  { recurso: "Directorio, ofertas e insights", dominios: ["directory"],
    celdas: { OPS: "RU", FIN: "", TAL: "", COM: "CRUS", REL: "", KAM: "R", DIR: "R", AUD: "RX" } },
  { recurso: "Verticales, mesas y documentos", dominios: ["vertical"],
    celdas: { OPS: "", FIN: "", TAL: "", COM: "R", REL: "CRUSX", KAM: "R", DIR: "R", AUD: "RX" } },
  { recurso: "Oportunidades y postulaciones", dominios: ["opportunity"],
    celdas: { OPS: "", FIN: "", TAL: "", COM: "", REL: "CRUSX", KAM: "R", DIR: "R", AUD: "RX" } },
  { recurso: "Cuentas estratégicas e interacciones", dominios: ["account", "interaction"],
    celdas: { OPS: "R", FIN: "", TAL: "", COM: "", REL: "R", KAM: "CRU", DIR: "R", AUD: "RX" } },
  { recurso: "Plantillas, campañas y comunicaciones", dominios: ["template", "campaign"],
    celdas: { OPS: "R", FIN: "R", TAL: "RU", COM: "CRUS", REL: "R", KAM: "", DIR: "R", AUD: "RX" } },
  /* Tres filas y no una: con los tres recursos juntos, la salvedad de la
     matriz —`FIN` solo tarifas, `DIR` solo metas— se perdía al expandir, y
     Dirección terminaba pudiendo activar un feature flag. */
  { recurso: "Parámetros y reglas de negocio", dominios: ["parameter"],
    celdas: { OPS: "R", FIN: "RP", TAL: "R", COM: "R", REL: "R", KAM: "", DIR: "RP", AUD: "RX" } },
  { recurso: "Catálogos maestros", dominios: ["catalog"],
    celdas: { OPS: "R", FIN: "R", TAL: "R", COM: "R", REL: "R", KAM: "", DIR: "R", AUD: "RX" } },
  { recurso: "Feature flags y pilotos", dominios: ["flag"],
    celdas: { OPS: "R", FIN: "", TAL: "", COM: "", REL: "", KAM: "", DIR: "R", AUD: "RX" } },
  { recurso: "Usuarios internos y roles", dominios: ["user", "role"],
    celdas: { OPS: "", FIN: "", TAL: "", COM: "", REL: "", KAM: "", DIR: "R", AUD: "R" } },
  { recurso: "Proveedores e integraciones", dominios: ["provider"],
    celdas: { OPS: "", FIN: "R", TAL: "", COM: "", REL: "", KAM: "", DIR: "", AUD: "R" } },
  { recurso: "Importación de padrón", dominios: ["import"],
    celdas: { OPS: "CRX", FIN: "", TAL: "", COM: "", REL: "", KAM: "", DIR: "", AUD: "RX" } },
  { recurso: "Colas y webhooks", dominios: ["queue", "webhook"],
    celdas: { OPS: "R", FIN: "R", TAL: "", COM: "", REL: "", KAM: "", DIR: "", AUD: "RX" } },
  { recurso: "Auditoría", dominios: ["audit"],
    celdas: { OPS: "R", FIN: "R", TAL: "R", COM: "R", REL: "R", KAM: "R", DIR: "R", AUD: "RX" } },
  { recurso: "Analítica y dashboards", dominios: ["analytics"],
    celdas: { OPS: "R", FIN: "R", TAL: "R", COM: "R", REL: "R", KAM: "R", DIR: "RX", AUD: "RX" } },
];

/**
 * Lo que la matriz no puede decir con letras.
 *
 * Los permisos sensibles no los hereda ningún comodín —ni `*`, ni `dominio:*`—,
 * así que se conceden uno por uno y con el motivo escrito. Incluido a `SA`:
 * tener `*` no alcanza para reembolsar ni para repartir roles.
 */
const SENSIBLES_POR_ROL: Record<string, string[]> = {
  /* Responsable técnico: todo, pero declarado. */
  SA: [
    "billing:refund",
    "billing:write-off",
    "billing:manual-payment",
    "certificate:revoke",
    "parameter:approve",
    "role:assign",
    "user:impersonate",
    "organization:delete",
  ],
  /* Revoca un certificado cuando la empresa deja de estar al día (gestión 5.5). */
  OPS: ["certificate:revoke"],
  /* Anulaciones, castigos de cartera y el pago por transferencia que sigue
     existiendo; y aprobar tarifas y reglas de cartera, acotado por ABAC a esos
     parámetros y a ningún otro. */
  FIN: ["billing:refund", "billing:write-off", "billing:manual-payment", "parameter:approve"],
  /* Única excepción a su alcance de solo lectura: sus propias metas anuales,
     acotado por ABAC a ese parámetro (docs/01, §2.2). */
  DIR: ["parameter:approve"],
};

/** Acciones transversales que no son CRUD y por eso no caben en una celda. */
const EXTRAS_POR_ROL: Record<string, string[]> = {
  /* La conciliación diaria contra la pasarela es suya (gestión 5.3). */
  FIN: ["billing:reconcile"],
};

const ROLES_INTERNOS: { sigla: RolInterno | "SA"; key: string; name: string }[] = [
  { sigla: "SA", key: "super-admin", name: "Super Admin Fedesoft" },
  { sigla: "OPS", key: "operaciones", name: "Operaciones · Afiliación" },
  { sigla: "FIN", key: "cartera", name: "Cartera · Financiera" },
  { sigla: "TAL", key: "formacion", name: "Formación y comunidades" },
  { sigla: "COM", key: "comunicaciones", name: "Comunicaciones · Contenido" },
  { sigla: "REL", key: "relacionamiento", name: "Relacionamiento · Verticales y Cenisoft" },
  { sigla: "KAM", key: "kam", name: "Gestor de cuenta (KAM)" },
  { sigla: "DIR", key: "direccion", name: "Dirección · Presidencia Ejecutiva" },
  { sigla: "AUD", key: "auditor", name: "Auditor" },
];

/** Expande una columna de la matriz a su lista de permisos. */
function permisosDe(sigla: RolInterno | "SA"): string[] {
  const permisos = new Set<string>();

  if (sigla === "SA") {
    /* Su fila en el documento es "todo", y el comodín es cómo se dice eso sin
       tener que volver aquí cada vez que aparece un recurso nuevo. */
    permisos.add("*");
  } else {
    for (const fila of MATRIZ) {
      for (const codigo of fila.celdas[sigla]) {
        const accion = ACCIONES[codigo];
        if (!accion) throw new Error(`Código desconocido '${codigo}' en '${fila.recurso}'.`);
        for (const dominio of fila.dominios) permisos.add(`${dominio}:${accion}`);
      }
    }
  }

  for (const permiso of EXTRAS_POR_ROL[sigla] ?? []) permisos.add(permiso);
  for (const permiso of SENSIBLES_POR_ROL[sigla] ?? []) permisos.add(permiso);
  return [...permisos].sort();
}

/* Los roles del afiliado no salen de la matriz de la consola: esa tabla
   describe quién opera por dentro. Aquí la experiencia la define el rol del
   contacto en su empresa. */
const ROLES_EXTERNOS = [
  { key: "gerente", name: "Gerente afiliado", permissions: ["organization:read", "organization:update", "billing:*", "certificate:read", "directory:*", "opportunity:*"] },
  { key: "talento", name: "Talento humano afiliado", permissions: ["training:*", "community:read", "organization:read"] },
  { key: "contacto", name: "Contacto afiliado", permissions: ["organization:read", "training:read"] },
];

/* `mfaRequired` sigue a `internal`: quien opera por dentro entra con segundo
   factor (ADR-008). Es una columna y no una constante para que una excepción
   futura sea una fila, no un despliegue. */
const ROLES = [
  ...ROLES_INTERNOS.map((rol) => ({
    key: rol.key,
    name: rol.name,
    internal: true,
    permissions: permisosDe(rol.sigla),
  })),
  ...ROLES_EXTERNOS.map((rol) => ({ ...rol, internal: false })),
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
    const fila = { ...rol, mfaRequired: rol.internal };
    await prisma.role.upsert({ where: { key: rol.key }, update: fila, create: fila });
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

  await sembrarAccesos(empresa.id);

  process.stdout.write(
    `Semilla lista: ${ROLES_INTERNOS.length} roles internos y ${ROLES_EXTERNOS.length} del afiliado, ` +
      `2 parámetros versionados, 1 empresa con afiliación y cargo, 3 usuarios con acceso.\n`,
  );
}

/**
 * Personas que pueden entrar al portal en desarrollo.
 *
 * El vínculo con el proveedor de identidad se siembra contra el proveedor de
 * desarrollo (`apps/api/src/identity/adapters/stub-identity-provider.adapter.ts`).
 * Con un proveedor real, esta tabla la llena el primer inicio de sesión: aquí
 * está para que `pnpm db:seed` deje el entorno listo para entrar.
 */
const EMISOR_DE_DESARROLLO = "urn:fedesoft:proveedor-de-desarrollo";

async function sembrarAccesos(organizationId: string): Promise<void> {
  /* La propia federación también es una organización: los perfiles internos
     cuelgan de ella. El NIT es sintético; el real lo aporta Fedesoft. */
  const fedesoft = await prisma.organization.upsert({
    where: { nit: "900000001" },
    update: {},
    create: {
      nit: "900000001",
      nitDv: "0",
      legalName: "Fedesoft — entorno de desarrollo",
      segment: Segment.GRANDE,
      status: "ACTIVA",
      city: "Bogotá D.C.",
    },
  });

  const accesos = [
    { email: "camilo.restrepo@datalabsandina.co", rol: "gerente", organizationId },
    { email: "diana.salazar@datalabsandina.co", rol: "talento", organizationId },
    { email: "operaciones@fedesoft.test", rol: "operaciones", organizationId: fedesoft.id },
  ];

  for (const acceso of accesos) {
    const rol = await prisma.role.findUniqueOrThrow({ where: { key: acceso.rol } });
    const usuario = await prisma.user.upsert({
      where: { email: acceso.email },
      update: { status: "ACTIVO" },
      create: { email: acceso.email, status: "ACTIVO" },
    });

    await prisma.userIdentity.upsert({
      where: { issuer_subject: { issuer: EMISOR_DE_DESARROLLO, subject: acceso.email } },
      update: {},
      create: { userId: usuario.id, issuer: EMISOR_DE_DESARROLLO, subject: acceso.email },
    });

    const contacto = await prisma.contact.findUnique({
      where: { organizationId_email: { organizationId: acceso.organizationId, email: acceso.email } },
    });

    await prisma.organizationUser.upsert({
      where: { organizationId_userId: { organizationId: acceso.organizationId, userId: usuario.id } },
      update: { roleId: rol.id, contactId: contacto?.id ?? null },
      create: {
        organizationId: acceso.organizationId,
        userId: usuario.id,
        roleId: rol.id,
        contactId: contacto?.id ?? null,
      },
    });
  }
}

main()
  .catch((e) => {
    process.exitCode = 1;
    console.error(e);
  })
  .finally(() => prisma.$disconnect());
