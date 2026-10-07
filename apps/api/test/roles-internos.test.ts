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
import { RequestMethod } from "@nestjs/common";
import { PrismaClient } from "@fedesoft/db";
import { AuditService } from "../src/common/audit.service.js";
import { PERMISSION_KEY, SENSITIVE_PERMISSIONS, grants } from "../src/common/permissions.js";
import { AdminUsersController } from "../src/identity/admin-users.controller.js";
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
  { id: "relacionamiento", lectura: "opportunity:read", escritura: "opportunity:update" },
  { id: "cuentas", lectura: "interaction:read", escritura: "interaction:create" },
  { id: "resultados", lectura: "analytics:read", escritura: "analytics:export" },
  { id: "usuarios", lectura: "user:read", escritura: "role:assign" },
  { id: "auditoria", lectura: "audit:read", escritura: "audit:export" },
] as const;

type ModuloId = (typeof MODULOS)[number]["id"];
/** L = lectura · E = lectura y escritura · - = nada. */
type Nivel = "L" | "E" | "-";

/* Una columna por módulo, en el orden de MODULOS:
                      afil solic cart form cont rela cuen resu usua audi */
const ORACULO: Record<string, readonly Nivel[]> = {
  "super-admin":    ["E", "E", "E", "E", "E", "E", "E", "E", "E", "E"],
  operaciones:      ["E", "E", "L", "L", "L", "-", "L", "L", "-", "L"],
  cartera:          ["L", "L", "E", "-", "L", "-", "-", "L", "-", "L"],
  formacion:        ["L", "-", "-", "E", "L", "-", "-", "L", "-", "L"],
  comunicaciones:   ["L", "-", "-", "L", "E", "L", "-", "L", "-", "L"],
  relacionamiento:  ["L", "-", "-", "-", "L", "E", "L", "L", "-", "L"],
  kam:              ["L", "L", "L", "L", "-", "L", "E", "L", "-", "L"],
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

test("ningún rol interno recibe un permiso sensible, salvo role:assign del Super Admin", async () => {
  for (const r of await rolesInternos()) {
    for (const sensible of SENSITIVE_PERMISSIONS) {
      const esperado = r.key === "super-admin" && sensible === "role:assign";
      assert.equal(grants(r.permissions, sensible), esperado, `${r.key} · ${sensible}`);
      assert.equal(r.permissions.includes(sensible), esperado, `${r.key} lista ${sensible} de forma literal`);
    }
  }
});

test("en /admin/v1/users solo el Super Admin muta; Dirección y Auditor solo leen", async () => {
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

test("la semilla se niega a correr con NODE_ENV=production", async () => {
  await assert.rejects(sembrar({ NODE_ENV: "production" }), /NODE_ENV=production/);
});
