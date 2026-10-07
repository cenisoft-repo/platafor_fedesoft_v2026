/**
 * Los roles de la semilla, contra la matriz que los define.
 *
 * Una matriz de permisos en un documento no protege nada; lo que protege es la
 * fila que termina en la base. Estas pruebas leen los roles sembrados y
 * comprueban que dicen lo que `docs/01-consola-administracion.md` §2.2 dice,
 * porque el día que alguien añada un permiso de más no va a fallar nada: va a
 * funcionar, que es el problema.
 *
 * Requiere la base sembrada (`pnpm db:seed`), igual que el CI.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@fedesoft/db";
import { SENSITIVE_PERMISSIONS, grants } from "../src/common/permissions.js";

const prisma = new PrismaClient();

const INTERNOS = [
  "super-admin",
  "operaciones",
  "cartera",
  "formacion",
  "comunicaciones",
  "relacionamiento",
  "kam",
  "direccion",
  "auditor",
] as const;

/** Formas válidas de un permiso *concedido*: comodines incluidos. */
const FORMA_CONCEDIDA = /^(\*|[a-z][a-z0-9-]*:(\*|[a-z][a-z0-9-]*)|\*:[a-z][a-z0-9-]*)$/;

async function permisosDe(key: string): Promise<string[]> {
  const rol = await prisma.role.findUniqueOrThrow({ where: { key } });
  return rol.permissions;
}

test("los nueve roles internos existen y todos exigen segundo factor", async () => {
  const roles = await prisma.role.findMany({ where: { internal: true }, orderBy: { key: "asc" } });
  assert.deepEqual(
    roles.map((r) => r.key),
    [...INTERNOS].sort(),
  );
  for (const rol of roles) {
    assert.equal(rol.mfaRequired, true, `${rol.key} debería exigir segundo factor`);
    assert.ok(rol.permissions.length > 0, `${rol.key} no puede quedar sin permisos`);
  }
});

test("ningún permiso sembrado tiene una forma que el guard no entienda", async () => {
  /* Tres segmentos eran escalada: `billing:payment:refund` lo concedía
     cualquier `billing:*`. Si una semilla los reintroduce, se ve aquí. */
  const roles = await prisma.role.findMany();
  for (const rol of roles) {
    for (const permiso of rol.permissions) {
      assert.match(permiso, FORMA_CONCEDIDA, `${rol.key} tiene '${permiso}', que no es un permiso válido`);
    }
  }
});

test("solo el responsable técnico reparte roles, suplanta o borra empresas", async () => {
  const exclusivos = ["role:assign", "user:impersonate", "organization:delete"];
  for (const key of INTERNOS) {
    const permisos = await permisosDe(key);
    for (const permiso of exclusivos) {
      const esperado = key === "super-admin";
      assert.equal(
        grants(permisos, permiso),
        esperado,
        `${key} ${esperado ? "debería" : "no debería"} poder '${permiso}'`,
      );
    }
  }
});

test("el comodín del responsable técnico no le alcanza: los sensibles están concedidos uno por uno", async () => {
  const permisos = await permisosDe("super-admin");
  assert.ok(permisos.includes("*"), "su fila en el documento es 'todo'");
  for (const sensible of SENSITIVE_PERMISSIONS) {
    assert.ok(
      permisos.includes(sensible),
      `'${sensible}' tiene que estar escrito: ningún comodín lo concede`,
    );
    assert.equal(grants(["*"], sensible), false, "y esto es por qué");
  }
});

test("Dirección no muta nada salvo sus propias metas", async () => {
  const permisos = await permisosDe("direccion");
  const mutaciones = permisos.filter((p) => !p.endsWith(":read") && !p.endsWith(":export"));
  /* La única excepción declarada a su alcance de lectura (docs/01 §2.2). El
     recorte a *las metas* es ABAC y lo aplica el endpoint, no el permiso. */
  assert.deepEqual(mutaciones.sort(), ["parameter:approve", "parameter:configure"]);

  /* Lo que la corrección de la matriz vino a cerrar. */
  assert.equal(grants(permisos, "affiliation:transition"), false, "no aprueba afiliaciones");
  assert.equal(grants(permisos, "flag:configure"), false, "no activa feature flags");
  assert.equal(grants(permisos, "catalog:configure"), false, "no edita catálogos");
  assert.equal(grants(permisos, "organization:update"), false, "no edita el padrón");
});

test("el auditor no muta nada, en absoluto", async () => {
  const permisos = await permisosDe("auditor");
  const mutaciones = permisos.filter((p) => !p.endsWith(":read") && !p.endsWith(":export"));
  assert.deepEqual(mutaciones, []);
});

test("el dinero lo mueve Cartera, y nadie más", async () => {
  const deCartera = ["billing:refund", "billing:write-off", "billing:manual-payment"];
  for (const key of INTERNOS) {
    const permisos = await permisosDe(key);
    const esperado = key === "cartera" || key === "super-admin";
    for (const permiso of deCartera) {
      assert.equal(grants(permisos, permiso), esperado, `${key} y '${permiso}'`);
    }
  }
  /* Y la conciliación diaria también es suya: Operaciones la perdió al
     alinear la semilla con la matriz, que solo le da lectura de cartera. */
  assert.equal(grants(await permisosDe("cartera"), "billing:reconcile"), true);
  assert.equal(grants(await permisosDe("operaciones"), "billing:reconcile"), false);
});

test("cada rol se queda en su área: comprobaciones contra la matriz", async () => {
  const ops = await permisosDe("operaciones");
  assert.equal(grants(ops, "affiliation:transition"), true, "activa afiliaciones");
  assert.equal(grants(ops, "certificate:revoke"), true, "revoca certificados (gestión 5.5)");
  assert.equal(grants(ops, "training:update"), false, "no administra formación");
  assert.equal(grants(ops, "vertical:read"), false, "no ve verticales");

  const tal = await permisosDe("formacion");
  assert.equal(grants(tal, "training:create"), true);
  assert.equal(grants(tal, "charge:read"), false, "no ve cartera");

  const com = await permisosDe("comunicaciones");
  assert.equal(grants(com, "directory:transition"), true, "modera el directorio");
  assert.equal(grants(com, "community:create"), false, "lee y edita comunidades, no las crea");

  const rel = await permisosDe("relacionamiento");
  assert.equal(grants(rel, "opportunity:update"), true);
  assert.equal(grants(rel, "account:update"), false, "las cuentas estratégicas son del KAM");

  const kam = await permisosDe("kam");
  assert.equal(grants(kam, "account:update"), true);
  assert.equal(grants(kam, "interaction:create"), true);
  assert.equal(grants(kam, "invoice:read"), false, "no ve facturas");
  assert.equal(grants(kam, "organization:update"), false, "ve su cartera de cuentas, no la edita");
});

test("los roles del afiliado no heredan nada de la consola", async () => {
  for (const key of ["gerente", "talento", "contacto"]) {
    const permisos = await permisosDe(key);
    for (const sensible of SENSITIVE_PERMISSIONS) {
      assert.equal(grants(permisos, sensible), false, `${key} no puede '${sensible}'`);
    }
    assert.equal(grants(permisos, "audit:read"), false, `${key} no ve la auditoría`);
    assert.equal(grants(permisos, "analytics:read"), false, `${key} no ve los tableros internos`);
  }
});

test.after(async () => {
  await prisma.$disconnect();
});
