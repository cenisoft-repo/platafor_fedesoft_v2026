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
import { PERMISSION_KEY, PUBLIC_KEY, grants } from "../src/common/permissions.js";
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
  /* Un permiso mal formado nunca concede: fallar cerrado también aquí. */
  assert.equal(grants(["billing:*"], "billing"), false);
});

test("el entorno inválido impide arrancar", () => {
  assert.throws(() => loadEnv({ DATABASE_URL: "no-es-una-url" } as NodeJS.ProcessEnv), /DATABASE_URL/);
  assert.throws(
    () =>
      loadEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://u:p@h:5432/d",
      } as NodeJS.ProcessEnv),
    /CORS_ORIGINS/,
  );
});

test("el entorno válido carga con valores por defecto sanos", () => {
  const env = loadEnv({ DATABASE_URL: "postgresql://u:p@h:5432/d" } as NodeJS.ProcessEnv);
  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.PORT, 3000);
});
