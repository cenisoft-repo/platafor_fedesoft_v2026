/**
 * Roles internos de la consola (ADR-009), contra los roles que de verdad
 * escribe la semilla.
 *
 * El oráculo de abajo está escrito a mano a partir de la matriz de
 * docs/01-consola-administracion.md §2.2 y del prototipo, NO se calcula desde
 * las listas de permisos: si fuera derivado, cambiar una lista y su "expectativa"
 * a la vez no fallaría nunca. Si esta prueba se cae, hay dos salidas legítimas:
 * corregir la lista de permisos de la semilla, o cambiar la regla de negocio con
 * un ADR que reemplace al ADR-009 y el oráculo en el mismo cambio.
 */
import "reflect-metadata";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod, UnprocessableEntityException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@fedesoft/db";
import { AuditService } from "../src/common/audit.service.js";
import { PERMISSION_KEY, SENSITIVE_PERMISSIONS, grants } from "../src/common/permissions.js";
import { AdminUsersController } from "../src/identity/admin-users.controller.js";
import { InternalUsersUseCase } from "../src/identity/domain/internal-users.use-case.js";
import { SessionService } from "../src/identity/domain/session.service.js";
import { randomToken, sha256Hex } from "../src/identity/domain/tokens.js";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

const exec = promisify(execFile);
const sufijo = () => randomUUID().slice(0, 8);

/* ───────────────────────────── Oráculo ───────────────────────────── */

/** Módulos de la consola, con su permiso de lectura y el de escritura. */
const MODULOS = [
  { id: "afiliados", lectura: "organization:read", escritura: "organization:update" },
  { id: "solicitudes", lectura: "affiliation:read", escritura: "affiliation:update" },
  { id: "cartera", lectura: "billing:read", escritura: "billing:reconcile" },
  { id: "formacion", lectura: "training:read", escritura: "training:update" },
  { id: "contenidos", lectura: "content:read", escritura: "content:update" },
  /* Verticales y convocatorias: se entra por las verticales; publicar convocatorias es escribir. */
  { id: "relacionamiento", lectura: "vertical:read", escritura: "opportunity:update" },
  { id: "cuentas", lectura: "interaction:read", escritura: "interaction:create" },
  { id: "resultados", lectura: "analytics:read", escritura: "analytics:export" },
  { id: "usuarios", lectura: "user:read", escritura: "role:assign" },
  { id: "auditoria", lectura: "audit:read", escritura: "audit:export" },
] as const;

type ModuloId = (typeof MODULOS)[number]["id"];
/** L = lectura · E = lectura y escritura · - = nada. */
type Nivel = "L" | "E" | "-";

/* Una columna por módulo, en el orden de MODULOS:
                      afil solic cart form cont rela cuen resu usua audi
   Auditoría: solo SA, DIR y AUD. Los roles de área y el KAM la recuperan cuando el
   servidor filtre por área (ADR-009, «Qué se deja fuera», b). */
const ORACULO: Record<string, readonly Nivel[]> = {
  "super-admin":    ["E", "E", "E", "E", "E", "E", "E", "E", "E", "E"],
  operaciones:      ["E", "E", "L", "L", "L", "-", "L", "L", "-", "-"],
  cartera:          ["L", "L", "E", "-", "L", "-", "-", "L", "-", "-"],
  formacion:        ["L", "-", "-", "E", "L", "-", "-", "L", "-", "-"],
  comunicaciones:   ["L", "-", "-", "L", "E", "L", "-", "L", "-", "-"],
  relacionamiento:  ["L", "-", "-", "-", "L", "E", "L", "L", "-", "-"],
  kam:              ["L", "L", "L", "L", "-", "L", "E", "L", "-", "-"],
  direccion:        ["L", "L", "L", "L", "L", "L", "L", "E", "L", "L"],
  auditor:          ["L", "L", "L", "L", "L", "L", "L", "E", "L", "E"],
};

/** Nombres tal como los muestra la consola. */
const NOMBRES: Record<string, string> = {
  "super-admin": "Super Admin Fedesoft",
  operaciones: "Operaciones · Afiliación",
  cartera: "Cartera · Financiera",
  formacion: "Formación y comunidades",
  comunicaciones: "Comunicaciones · Contenido",
  relacionamiento: "Relacionamiento · Verticales",
  kam: "Gestor de cuenta",
  direccion: "Dirección",
  auditor: "Auditor",
};

const CLAVES = Object.keys(ORACULO).sort();

function nivel(permisos: readonly string[], m: (typeof MODULOS)[number]): Nivel | "ESCRIBE-SIN-LEER" {
  const lee = grants(permisos, m.lectura);
  const escribe = grants(permisos, m.escritura);
  if (escribe && !lee) return "ESCRIBE-SIN-LEER";
  return escribe ? "E" : lee ? "L" : "-";
}

async function rolesInternos() {
  return prisma.role.findMany({ where: { internal: true }, orderBy: { key: "asc" } });
}

/* ───────────────────── Catálogo y oráculo por módulo ───────────────────── */

test("la semilla deja exactamente los nueve roles internos, con su clave y su nombre", async () => {
  const roles = await rolesInternos();
  assert.deepEqual(roles.map((r) => r.key), CLAVES);
  for (const r of roles) {
    assert.equal(r.name, NOMBRES[r.key], `nombre del rol ${r.key}`);
  }
});

test("cada rol interno alcanza en cada módulo de la consola lo que dice el oráculo", async () => {
  const roles = await rolesInternos();
  const discrepancias: string[] = [];
  for (const r of roles) {
    const esperado = ORACULO[r.key];
    assert.ok(esperado, `rol ${r.key} sin fila en el oráculo`);
    MODULOS.forEach((m, i) => {
      const real = nivel(r.permissions, m);
      if (real !== esperado[i]) {
        discrepancias.push(
          `${r.key} · ${m.id}: esperado ${esperado[i]}, real ${real} (${m.lectura} → ${m.escritura}; permisos: ${r.permissions.join(", ")})`,
        );
      }
    });
  }
  assert.deepEqual(discrepancias, []);
});

test("el oráculo cubre los diez módulos para cada uno de los nueve roles", () => {
  assert.equal(MODULOS.length, 10);
  for (const clave of CLAVES) assert.equal(ORACULO[clave]?.length, MODULOS.length, clave);
  assert.equal(CLAVES.length, 9);
});

/* ───────────────────────── Permisos sensibles y usuarios ───────────────────────── */

/** Quién lleva cada permiso sensible, de forma literal. Escrito a mano. */
const SENSIBLES_POR_ROL: Record<string, readonly string[]> = {
  "super-admin": ["role:assign", "session:inspect", "user:read-affiliates"],
  auditor: ["session:inspect", "user:read-affiliates"],
};

test("los permisos sensibles los lleva literal solo quien el ADR-009 indica, y ningún comodín los concede", async () => {
  /* Los tres que añade el ADR-009 están declarados sensibles. */
  for (const p of ["session:inspect", "user:read-affiliates", "affiliation:approve"]) {
    assert.ok(SENSITIVE_PERMISSIONS.has(p), `${p} debe ser sensible`);
  }
  for (const r of await rolesInternos()) {
    const permitidos = SENSIBLES_POR_ROL[r.key] ?? [];
    for (const sensible of SENSITIVE_PERMISSIONS) {
      const esperado = permitidos.includes(sensible);
      assert.equal(grants(r.permissions, sensible), esperado, `${r.key} · ${sensible}`);
      assert.equal(r.permissions.includes(sensible), esperado, `${r.key} lista ${sensible} de forma literal`);
    }
  }
});

test("en roles internos, comodín de dominio solo donde la matriz da CRUSX completo", async () => {
  /* Oráculo a mano: OPS tiene Empresas CRUSX; TAL, Formación y Comunidades CRUSX; REL,
     Oportunidades y Verticales CRUSX. Donde falta una letra (OPS Solicitudes sin X,
     COM Contenido y Directorio sin X, KAM Cuentas sin S ni X) se listan las acciones. */
  const COMODINES: Record<string, readonly string[]> = {
    "super-admin": ["*"],
    operaciones: ["organization:*"],
    cartera: [],
    formacion: ["training:*", "community:*"],
    comunicaciones: [],
    relacionamiento: ["opportunity:*", "vertical:*"],
    kam: [],
    direccion: ["*:read"],
    auditor: ["*:read"],
  };
  for (const r of await rolesInternos()) {
    const reales = r.permissions.filter((p) => p.includes("*")).sort();
    assert.deepEqual(reales, [...(COMODINES[r.key] ?? [])].sort(), `comodines de ${r.key}`);
  }
});

test("las funciones que la matriz separa no se reparten por comodín", async () => {
  const roles = new Map((await rolesInternos()).map((r) => [r.key, r.permissions]));
  const de = (clave: string) => {
    const p = roles.get(clave);
    assert.ok(p, `rol ${clave}`);
    return p;
  };
  /* Operaciones registra solicitudes pero no las aprueba en 2.º nivel ni las exporta. */
  for (const accion of ["read", "create", "update", "change-status"]) {
    assert.equal(grants(de("operaciones"), `affiliation:${accion}`), true, `operaciones · affiliation:${accion}`);
  }
  for (const accion of ["approve", "export", "delete"]) {
    assert.equal(grants(de("operaciones"), `affiliation:${accion}`), false, `operaciones · affiliation:${accion}`);
  }
  /* Verificar perfiles del directorio es de Operaciones, no de Comunicaciones. */
  assert.equal(grants(de("operaciones"), "directory:verify"), true);
  assert.equal(grants(de("comunicaciones"), "directory:verify"), false);
  assert.equal(grants(de("comunicaciones"), "directory:update"), true);
  assert.equal(grants(de("comunicaciones"), "content:export"), false);
  /* El KAM registra interacciones, no cambia su estado ni las exporta. */
  for (const accion of ["read", "create", "update"]) {
    assert.equal(grants(de("kam"), `interaction:${accion}`), true, `kam · interaction:${accion}`);
  }
  for (const accion of ["change-status", "export", "delete"]) {
    assert.equal(grants(de("kam"), `interaction:${accion}`), false, `kam · interaction:${accion}`);
  }
  /* La aprobación de 2.º nivel no la tiene nadie todavía, ni por `*`. */
  for (const [clave, permisos] of roles) {
    assert.equal(grants(permisos, "affiliation:approve"), false, `${clave} · affiliation:approve`);
  }
});

test("audit:read solo lo tienen Super Admin, Dirección y Auditor", async () => {
  const quienes = (await rolesInternos()).filter((r) => grants(r.permissions, "audit:read")).map((r) => r.key).sort();
  assert.deepEqual(quienes, ["auditor", "direccion", "super-admin"]);
  /* Y ninguno de los demás lo lista de forma literal: no hay forma de heredarlo. */
  for (const r of await rolesInternos()) {
    if (["auditor", "direccion", "super-admin"].includes(r.key)) continue;
    assert.equal(r.permissions.includes("audit:read"), false, r.key);
  }
});

test("billing:pay es el pago del afiliado: ningún rol interno de área lo alcanza", async () => {
  /* El Super Admin lo tiene por "*", y lo frena la separación de superficies (ADR-008 §2).
     Cartera trabaja con permisos explícitos de billing para que un comodín no se lo dé. */
  for (const r of await rolesInternos()) {
    if (r.key === "super-admin") continue;
    assert.equal(grants(r.permissions, "billing:pay"), false, `${r.key} · billing:pay`);
  }
});

/* Que Dirección y Auditor lean por `user:read` no dice QUÉ usuarios ven: eso lo acota el caso
   de uso con `user:read-affiliates` y `session:inspect` (pruebas de más abajo). */
test("en /admin/v1/users solo el Super Admin muta; Dirección y Auditor tienen user:read", async () => {
  const roles = await rolesInternos();
  const proto = AdminUsersController.prototype as unknown as Record<string, unknown>;
  const handlers = Object.getOwnPropertyNames(proto).filter(
    (n) => n !== "constructor" && typeof proto[n] === "function",
  );
  assert.ok(handlers.length >= 8, "no se encontraron los endpoints del controlador");

  for (const nombre of handlers) {
    const fn = proto[nombre] as object;
    const permiso = Reflect.getMetadata(PERMISSION_KEY, fn) as string | undefined;
    const metodo = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod;
    assert.ok(permiso, `${nombre} sin @RequirePermission`);

    const quienes = roles.filter((r) => grants(r.permissions, permiso)).map((r) => r.key).sort();
    const esperado = metodo === RequestMethod.GET ? ["auditor", "direccion", "super-admin"] : ["super-admin"];
    assert.deepEqual(quienes, esperado, `${nombre} (${permiso}) lo alcanzan ${quienes.join(", ")}`);
  }
});

test("ningún rol interno escribe en un módulo sin poder leerlo", async () => {
  for (const r of await rolesInternos()) {
    for (const m of MODULOS) {
      assert.notEqual(nivel(r.permissions, m), "ESCRIBE-SIN-LEER", `${r.key} · ${m.id}`);
    }
  }
});

/* ───────────────────────── Vista de sesión de la consola ───────────────────────── */

const sessions = new SessionService(prisma as never, new AuditService());

/** Crea un usuario interno ya vinculado y una sesión de consola vigente, sin pasar por el proveedor. */
async function sesionDeConsola(roleKeys: string[]) {
  const user = await prisma.user.create({
    data: { email: `rol.${sufijo()}@roles-internos.test`, authSubject: `sub-${randomUUID()}`, status: "ACTIVO" },
  });
  for (const key of roleKeys) {
    const rol = await prisma.role.findUniqueOrThrow({ where: { key } });
    await prisma.userInternalRole.create({ data: { userId: user.id, roleId: rol.id } });
  }
  const token = randomToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      channel: "CONSOLA",
      tokenHash: sha256Hex(token),
      mfa: true,
      idleTimeoutSec: 1800,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  const resuelta = await sessions.authenticate(token, "CONSOLA");
  assert.ok(resuelta, "la sesión de consola debió resolverse");
  return { user, resuelta, vista: await sessions.view(resuelta.actor, resuelta.session) };
}

/* El Super Admin no se crea aquí: la prueba de RA-ACC-008 de identidad.test.ts
   cuenta todos los Super Admin del sistema mientras corre en paralelo, y uno
   nuevo la volvería intermitente. Su lista y su alcance ya los fija el oráculo. */
for (const clave of CLAVES.filter((c) => c !== "super-admin")) {
  test(`la vista de sesión de consola del rol ${clave} trae su nombre y sus permisos`, async () => {
    const { resuelta, vista } = await sesionDeConsola([clave]);
    assert.deepEqual(vista.internalRoles, [{ key: clave, name: NOMBRES[clave] }]);
    assert.deepEqual(vista.organizations, []);
    assert.equal(vista.activeOrganization, null);
    assert.equal(vista.channel, "CONSOLA");

    const rol = await prisma.role.findUniqueOrThrow({ where: { key: clave } });
    assert.deepEqual([...vista.permissions].sort(), [...rol.permissions].sort());
    assert.equal(resuelta.actor.internal, true);
    assert.equal(resuelta.actor.organizationId, null);

    /* Lo que el prototipo calcula con esas mismas cadenas coincide con el oráculo. */
    const esperado = ORACULO[clave] ?? [];
    MODULOS.forEach((m, i) => assert.equal(nivel(vista.permissions, m), esperado[i], `${clave} · ${m.id}`));
  });
}

test("una persona con dos roles internos recibe la unión de sus permisos y ambos nombres", async () => {
  const { vista } = await sesionDeConsola(["kam", "auditor"]);
  assert.deepEqual(
    vista.internalRoles.map((r) => r.key).sort(),
    ["auditor", "kam"],
  );
  assert.deepEqual(
    vista.internalRoles.map((r) => r.name),
    ["Auditor", "Gestor de cuenta"],
    "ordenados por nombre",
  );
  /* Cuentas: escribe por kam. Resultados y auditoría: escribe por auditor. */
  const por = (id: ModuloId) => {
    const m = MODULOS.find((x) => x.id === id);
    assert.ok(m);
    return nivel(vista.permissions, m);
  };
  assert.equal(por("cuentas"), "E");
  assert.equal(por("resultados"), "E");
  assert.equal(por("auditoria"), "E");
  assert.equal(por("usuarios"), "L");
  assert.equal(por("afiliados"), "L");
});

/* ───────────── Quién ve a quién en /admin/v1/users (ADR-009, decisión 5) ───────────── */

const internos = new InternalUsersUseCase(prisma as never, new AuditService(), sessions);
const CTX = { correlationId: "prueba-roles-internos", ip: "127.0.0.1" };

/** Lo que haría el servidor con la lista de permisos del rol sembrado. El `userId` solo debe existir. */
async function actorDeRol(clave: string) {
  const rol = await prisma.role.findUniqueOrThrow({ where: { key: clave } });
  const persona = await prisma.user.create({
    data: { email: `actor.${sufijo()}@roles-internos.test`, authSubject: `sub-${randomUUID()}`, status: "ACTIVO" },
  });
  return { userId: persona.id, permissions: rol.permissions };
}

/** Una persona afiliada con sesión de portal y una persona del equipo con sesión de consola, ambas con IP y agente. */
async function escenarioDeUsuarios() {
  const s = sufijo();
  const nit = String(Math.floor(Math.random() * 900000) + 100000);
  const org = await prisma.organization.create({
    data: { nit: `9028${nit}`, nitDv: "1", legalName: `Visibilidad ${nit} S.A.S.`, segment: "MIPYME", status: "ACTIVA" },
  });
  const gerente = await prisma.role.findUniqueOrThrow({ where: { key: "gerente" } });
  const afiliado = await prisma.user.create({
    data: { email: `afiliado.${s}@roles-internos.test`, authSubject: `sub-${randomUUID()}`, status: "ACTIVO" },
  });
  await prisma.organizationUser.create({ data: { organizationId: org.id, userId: afiliado.id, roleId: gerente.id } });
  await prisma.session.create({
    data: {
      userId: afiliado.id,
      organizationId: org.id,
      channel: "PORTAL",
      tokenHash: sha256Hex(randomToken()),
      mfa: false,
      idleTimeoutSec: 3600,
      expiresAt: new Date(Date.now() + 3_600_000),
      ipAddress: "203.0.113.7",
      userAgent: "ua-afiliado-prueba",
    },
  });

  const formacion = await prisma.role.findUniqueOrThrow({ where: { key: "formacion" } });
  const interno = await prisma.user.create({
    data: { email: `interno.${s}@roles-internos.test`, authSubject: `sub-${randomUUID()}`, status: "ACTIVO" },
  });
  await prisma.userInternalRole.create({ data: { userId: interno.id, roleId: formacion.id } });
  await prisma.session.create({
    data: {
      userId: interno.id,
      channel: "CONSOLA",
      tokenHash: sha256Hex(randomToken()),
      mfa: true,
      idleTimeoutSec: 1800,
      expiresAt: new Date(Date.now() + 3_600_000),
      ipAddress: "198.51.100.9",
      userAgent: "ua-interno-prueba",
    },
  });
  return { s, afiliado, interno };
}

test("Dirección ve a las personas del equipo interno, no a los afiliados, y no ve IP ni agente", async () => {
  const { s, afiliado, interno } = await escenarioDeUsuarios();
  const dir = await actorDeRol("direccion");

  const busqueda = await internos.search(dir, s, 25, 0);
  assert.deepEqual(busqueda.items.map((u) => u.email), [interno.email]);
  assert.equal(busqueda.total, 1);
  assert.equal(busqueda.items[0]?.organizations, null);
  assert.deepEqual(busqueda.visibility, { affiliates: false });

  /* Mismo 404 que un id inexistente: no se confirma que la persona afiliada exista. */
  const inexistente = await internos.detail(dir, randomUUID()).catch((e: unknown) => e);
  const delAfiliado = await internos.detail(dir, afiliado.id).catch((e: unknown) => e);
  assert.ok(delAfiliado instanceof NotFoundException);
  assert.equal((delAfiliado as Error).message, (inexistente as Error).message);

  const ficha = await internos.detail(dir, interno.id);
  assert.equal(ficha.email, interno.email);
  assert.deepEqual(ficha.visibility, { affiliates: false, sessionDetails: false });
  assert.equal(ficha.organizationUsers, null);
  assert.equal(ficha.sessions.length, 1);
  assert.equal(ficha.sessions[0]?.channel, "CONSOLA");
  assert.equal(ficha.sessions[0]?.ipAddress, null);
  assert.equal(ficha.sessions[0]?.userAgent, null);
  assert.ok(!JSON.stringify(ficha).includes("198.51.100.9"), "la IP no debe salir en ninguna parte de la ficha");
  assert.ok(!JSON.stringify(ficha).includes("ua-interno-prueba"));
});

test("El Auditor ve a los afiliados y el detalle de sus sesiones", async () => {
  const { s, afiliado, interno } = await escenarioDeUsuarios();
  const aud = await actorDeRol("auditor");

  const busqueda = await internos.search(aud, s, 25, 0);
  assert.deepEqual(busqueda.items.map((u) => u.email).sort(), [afiliado.email, interno.email].sort());
  assert.equal(busqueda.total, 2);
  assert.equal(busqueda.items.find((u) => u.id === afiliado.id)?.organizations, 1);
  assert.deepEqual(busqueda.visibility, { affiliates: true });

  const ficha = await internos.detail(aud, afiliado.id);
  assert.deepEqual(ficha.visibility, { affiliates: true, sessionDetails: true });
  assert.equal(ficha.organizationUsers?.length, 1);
  assert.equal(ficha.organizationUsers?.[0]?.role.key, "gerente");
  assert.equal(ficha.sessions[0]?.ipAddress, "203.0.113.7");
  assert.equal(ficha.sessions[0]?.userAgent, "ua-afiliado-prueba");

  const delInterno = await internos.detail(aud, interno.id);
  assert.equal(delInterno.sessions[0]?.ipAddress, "198.51.100.9");
});

test("El Super Admin ve lo mismo que el Auditor: afiliados, empresas y sesiones completas", async () => {
  const { s, afiliado, interno } = await escenarioDeUsuarios();
  const sa = await actorDeRol("super-admin");
  const aud = await actorDeRol("auditor");

  assert.deepEqual(await internos.search(sa, s, 25, 0), await internos.search(aud, s, 25, 0));
  for (const id of [afiliado.id, interno.id]) {
    assert.deepEqual(await internos.detail(sa, id), await internos.detail(aud, id));
  }
  const ficha = await internos.detail(sa, afiliado.id);
  assert.equal(ficha.organizationUsers?.[0]?.organization.nit.startsWith("9028"), true);
  assert.equal(ficha.sessions[0]?.ipAddress, "203.0.113.7");
});

test("sin user:read-affiliates ni session:inspect, ningún otro rol interno ve afiliados ni IP", async () => {
  /* Quien llegara a tener user:read por otra vía (rol futuro) tampoco los ve:
     el comodín `*:read` no alcanza a ninguno de los dos permisos literales. */
  const { s, afiliado } = await escenarioDeUsuarios();
  const soloLectura = { userId: (await actorDeRol("direccion")).userId, permissions: ["user:read", "*:read"] };
  const busqueda = await internos.search(soloLectura, s, 25, 0);
  assert.equal(busqueda.items.some((u) => u.id === afiliado.id), false);
  await assert.rejects(internos.detail(soloLectura, afiliado.id), NotFoundException);
});

/* ───────────── El rol kam no se asigna hasta que exista el ABAC por cuentas ───────────── */

test("asignar el rol kam por la consola se rechaza con motivo; lo demás sigue funcionando", async () => {
  const actor = await actorDeRol("super-admin");
  const destino = await prisma.user.create({
    data: { email: `kam.${sufijo()}@roles-internos.test`, authSubject: `sub-${randomUUID()}`, status: "ACTIVO" },
  });

  await assert.rejects(
    internos.grantRole(actor, destino.id, "kam", CTX),
    (e: unknown) => e instanceof UnprocessableEntityException && /cuentas asignadas/.test(e.message) && /RA-ACC-004/.test(e.message),
  );
  assert.equal(await prisma.userInternalRole.count({ where: { userId: destino.id } }), 0);

  /* El alta de un usuario nuevo con kam tampoco: y no deja el usuario a medias. */
  const correo = `alta.${sufijo()}@roles-internos.test`;
  await assert.rejects(
    internos.provision(actor, { email: correo, name: "Alta Kam", roleKey: "kam" }, CTX),
    UnprocessableEntityException,
  );
  assert.equal(await prisma.user.count({ where: { email: correo } }), 0);

  /* El rechazo es solo de kam: otro rol interno se asigna con normalidad (control). */
  await internos.grantRole(actor, destino.id, "formacion", CTX);
  assert.equal(await prisma.userInternalRole.count({ where: { userId: destino.id } }), 1);
});

test("quitar el rol kam a quien ya lo tiene (semilla de desarrollo) no se bloquea", async () => {
  const actor = await actorDeRol("super-admin");
  const kam = await prisma.role.findUniqueOrThrow({ where: { key: "kam" } });
  const persona = await prisma.user.create({
    data: { email: `kamviejo.${sufijo()}@roles-internos.test`, authSubject: `sub-${randomUUID()}`, status: "ACTIVO" },
  });
  await prisma.userInternalRole.create({ data: { userId: persona.id, roleId: kam.id } });
  await internos.revokeRole(actor, persona.id, "kam", CTX);
  assert.equal(await prisma.userInternalRole.count({ where: { userId: persona.id } }), 0);
});

test("el Super Admin sembrado puede otorgar el rol Auditor: lleva literales los permisos sensibles que este trae", async () => {
  const actor = await actorDeRol("super-admin");
  const destino = await prisma.user.create({
    data: { email: `aud.${sufijo()}@roles-internos.test`, authSubject: `sub-${randomUUID()}`, status: "ACTIVO" },
  });
  await internos.grantRole(actor, destino.id, "auditor", CTX);
  assert.equal(await prisma.userInternalRole.count({ where: { userId: destino.id } }), 1);
});

/* ───────────────────────────── La semilla ───────────────────────────── */

const DB_DIR = path.resolve(__dirname, "../../../packages/db");
const sembrar = (env: NodeJS.ProcessEnv = {}) =>
  exec(process.execPath, ["--import", "tsx", "prisma/seed.ts"], {
    cwd: DB_DIR,
    env: { ...process.env, NODE_ENV: "test", ...env },
    timeout: 90_000,
  });

/** Lo que la semilla es dueña de escribir, sin los campos que otras pruebas mutan (estado de usuarios). */
async function instantanea() {
  const dev = { email: { endsWith: "@fedesoft-dev.test" } };
  const empresa = await prisma.organization.findUnique({
    where: { nit: "901487203" },
    select: { id: true, _count: { select: { contacts: true, memberships: true, charges: true } } },
  });
  return {
    roles: await prisma.role.findMany({
      orderBy: { key: "asc" },
      select: { id: true, key: true, name: true, internal: true, permissions: true },
    }),
    usuariosDev: await prisma.user.findMany({ where: dev, orderBy: { email: "asc" }, select: { id: true, email: true, name: true } }),
    rolesDeUsuariosDev: await prisma.userInternalRole.findMany({
      where: { user: dev },
      orderBy: [{ userId: "asc" }, { roleId: "asc" }],
      select: { userId: true, roleId: true },
    }),
    empresa,
    parametros: await prisma.parameter.findMany({
      where: { key: { in: ["afiliacion.cuota_anual", "afiliacion.dias_gracia", "identidad.sesion", "identidad.invitacion"] } },
      orderBy: { key: "asc" },
      select: { id: true, key: true, _count: { select: { versions: true } } },
    }),
  };
}

test("la semilla es idempotente: correrla dos veces no duplica ni cambia nada", async () => {
  await sembrar();
  const antes = await instantanea();
  const salida = await sembrar();
  assert.match(salida.stdout, /Semilla lista/);
  const despues = await instantanea();
  assert.deepEqual(despues, antes);

  /* Y lo que deja es lo esperado: diez usuarios internos de desarrollo, uno por cuenta. */
  assert.equal(despues.usuariosDev.length, 10);
  assert.equal(despues.rolesDeUsuariosDev.length, 10);
  assert.equal(despues.roles.filter((r) => r.internal).length, 9);
  assert.equal(despues.roles.filter((r) => !r.internal).length, 3);
  assert.deepEqual(despues.empresa?._count, { contacts: 2, memberships: 1, charges: 1 });
});

test("cada usuario de desarrollo interno tiene el rol que su correo dice", async () => {
  const filas = await prisma.userInternalRole.findMany({
    where: { user: { email: { endsWith: "@fedesoft-dev.test" } } },
    select: { user: { select: { email: true } }, role: { select: { key: true } } },
  });
  const porCorreo = Object.fromEntries(filas.map((f) => [f.user.email, f.role.key]));
  assert.deepEqual(porCorreo, {
    "superadmin1@fedesoft-dev.test": "super-admin",
    "superadmin2@fedesoft-dev.test": "super-admin",
    "operaciones@fedesoft-dev.test": "operaciones",
    "cartera@fedesoft-dev.test": "cartera",
    "formacion@fedesoft-dev.test": "formacion",
    "comunicaciones@fedesoft-dev.test": "comunicaciones",
    "relacionamiento@fedesoft-dev.test": "relacionamiento",
    "kam@fedesoft-dev.test": "kam",
    "direccion@fedesoft-dev.test": "direccion",
    "auditor@fedesoft-dev.test": "auditor",
  });
});

test("la semilla se niega a correr con NODE_ENV=production, también con el permiso explícito", async () => {
  await assert.rejects(sembrar({ NODE_ENV: "production" }), /NODE_ENV=production/);
  await assert.rejects(sembrar({ NODE_ENV: "production", ALLOW_SYNTHETIC_SEED: "1" }), /NODE_ENV=production/);
});

test("la semilla se niega a correr con NODE_ENV=staging", async () => {
  await assert.rejects(sembrar({ NODE_ENV: "staging" }), /NODE_ENV=staging/);
});

test("la semilla se niega con una base remota si no se autoriza de forma explícita, y no revela la URL", async () => {
  const remota = "postgresql://usuario:clave-secreta@db.ejemplo.test:5432/fedesoft?schema=public";
  await assert.rejects(sembrar({ DATABASE_URL: remota }), (e: unknown) => {
    const err = e as { stderr?: string; message: string };
    const texto = `${err.stderr ?? ""}${err.message}`;
    assert.match(texto, /db\.ejemplo\.test/);
    assert.match(texto, /ALLOW_SYNTHETIC_SEED/);
    assert.ok(!texto.includes("clave-secreta"), "la salida no debe incluir credenciales");
    return true;
  });
});

test("con ALLOW_SYNTHETIC_SEED=1 la semilla corre en un entorno que no es producción", async () => {
  /* Contra la base local de la prueba: se comprueba que el permiso abre el paso sin tocar una remota. */
  const salida = await sembrar({ NODE_ENV: "staging", ALLOW_SYNTHETIC_SEED: "1" });
  assert.match(salida.stdout, /Semilla lista/);
});
