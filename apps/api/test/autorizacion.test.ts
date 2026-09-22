/**
 * El control más importante del API: un endpoint sin permiso declarado no se
 * sirve. Si esta prueba se cae, una ruta nueva puede quedar abierta por
 * olvido, que es exactamente como ocurren estas fugas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Reflector } from "@nestjs/core";
import { ForbiddenException } from "@nestjs/common";
import { DenyByDefaultGuard, type ActorContext } from "../src/common/deny-by-default.guard.js";
import { PERMISSION_KEY, PUBLIC_KEY, SENSITIVE_PERMISSIONS, grants } from "../src/common/permissions.js";
import { loadEnv } from "../src/config/env.js";

/** Contexto mínimo de Nest, con los metadatos que declararía un decorador. */
function contexto(meta: Record<string, unknown>, actor?: ActorContext) {
  const handler = () => undefined;
  const clase = class {};
  const reflector = {
    getAllAndOverride: (key: string) => meta[key],
  } as unknown as Reflector;
  const ctx = {
    getHandler: () => handler,
    getClass: () => clase,
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  };
  return { guard: new DenyByDefaultGuard(reflector), ctx: ctx as never };
}

const GERENTE: ActorContext = {
  userId: "u1",
  organizationId: "o1",
  permissions: ["billing:*", "organization:read"],
  internal: false,
};

test("un endpoint sin permiso declarado se deniega", () => {
  const { guard, ctx } = contexto({}, GERENTE);
  assert.throws(() => guard.canActivate(ctx), ForbiddenException);
});

test("un endpoint marcado público se sirve sin sesión", () => {
  const { guard, ctx } = contexto({ [PUBLIC_KEY]: true });
  assert.equal(guard.canActivate(ctx), true);
});

test("con permiso declarado y sin sesión se deniega", () => {
  const { guard, ctx } = contexto({ [PERMISSION_KEY]: "billing:read" });
  assert.throws(() => guard.canActivate(ctx), ForbiddenException);
});

test("el comodín de dominio cubre la acción", () => {
  const { guard, ctx } = contexto({ [PERMISSION_KEY]: "billing:read" }, GERENTE);
  assert.equal(guard.canActivate(ctx), true);
});

test("un permiso de otro dominio no alcanza", () => {
  const { guard, ctx } = contexto({ [PERMISSION_KEY]: "affiliation:approve" }, GERENTE);
  assert.throws(() => guard.canActivate(ctx), ForbiddenException);
});

test("grants: comodines y límites", () => {
  assert.equal(grants(["*"], "cualquier:cosa"), true);
  assert.equal(grants(["billing:*"], "billing:read"), true);
  assert.equal(grants(["*:read"], "billing:read"), true);
  assert.equal(grants(["*:read"], "billing:write"), false);
  assert.equal(grants(["billing:read"], "billing:write"), false);
  assert.equal(grants([], "billing:read"), false);
});

test("un permiso mal formado nunca concede", () => {
  /* Tres segmentos se partían en dominio `billing` y cualquier `billing:*`
     los concedía: escalada por una cadena mal formada. */
  assert.equal(grants(["billing:*"], "billing:payment:refund"), false);
  assert.equal(grants(["*"], "billing:payment:refund"), false);
  assert.equal(grants(["billing:*"], "billing"), false);
  assert.equal(grants(["billing:*"], ""), false);
  assert.equal(grants(["billing:*"], ":read"), false);
  assert.equal(grants(["billing:*"], "billing:"), false);
  /* Las mayúsculas no son otra forma del mismo permiso: se rechazan. */
  assert.equal(grants(["billing:*"], "BILLING:read"), false);
});

test("ningún comodín concede un permiso sensible", () => {
  assert.ok(SENSITIVE_PERMISSIONS.size > 0);
  for (const sensible of SENSITIVE_PERMISSIONS) {
    const [dominio, accion] = sensible.split(":");
    assert.equal(grants(["*"], sensible), false, `* no debe conceder ${sensible}`);
    assert.equal(grants([`${dominio}:*`], sensible), false, `${dominio}:* no debe conceder ${sensible}`);
    assert.equal(grants([`*:${accion}`], sensible), false, `*:${accion} no debe conceder ${sensible}`);
    /* Concedido de forma explícita sí funciona: la regla no lo vuelve inútil. */
    assert.equal(grants([sensible], sensible), true);
  }
});

test("el rol gerente de la semilla no alcanza a reembolsar", () => {
  /* `billing:*` es lo que la semilla da al gerente afiliado. */
  const gerente = ["organization:read", "organization:update", "billing:*", "certificate:read"];
  assert.equal(grants(gerente, "billing:read"), true);
  assert.equal(grants(gerente, "billing:pay"), true);
  assert.equal(grants(gerente, "billing:refund"), false);
  assert.equal(grants(gerente, "billing:write-off"), false);
  assert.equal(grants(gerente, "billing:manual-payment"), false);
  assert.equal(grants(gerente, "certificate:revoke"), false);
});

/** Entorno mínimo válido, sobre el que cada prueba quita una pieza. */
const ENV_BASE = {
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  PAYMENT_WEBHOOK_SECRET: "x".repeat(32),
} as unknown as NodeJS.ProcessEnv;

test("el entorno inválido impide arrancar", () => {
  assert.throws(
    () => loadEnv({ ...ENV_BASE, DATABASE_URL: "no-es-una-url" }),
    /DATABASE_URL/,
  );
  assert.throws(
    () => loadEnv({ ...ENV_BASE, NODE_ENV: "production" }),
    /CORS_ORIGINS/,
  );
});

test("sin secreto de webhook no se arranca", () => {
  const { PAYMENT_WEBHOOK_SECRET: _omitido, ...sinSecreto } = ENV_BASE as Record<string, string>;
  assert.throws(() => loadEnv(sinSecreto as NodeJS.ProcessEnv), /PAYMENT_WEBHOOK_SECRET/);
  /* Un secreto corto es tan inservible como ninguno: se rechaza igual. */
  assert.throws(
    () => loadEnv({ ...ENV_BASE, PAYMENT_WEBHOOK_SECRET: "corto" }),
    /PAYMENT_WEBHOOK_SECRET/,
  );
});

test("el entorno válido carga con valores por defecto sanos", () => {
  const env = loadEnv(ENV_BASE);
  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.PORT, 3000);
});
