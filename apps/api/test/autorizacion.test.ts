/**
 * El control más importante del API: un endpoint sin permiso declarado no se
 * sirve. Si esta prueba se cae, una ruta nueva puede quedar abierta por
 * olvido, que es exactamente como ocurren estas fugas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Reflector } from "@nestjs/core";
import "reflect-metadata";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { DenyByDefaultGuard, type ActorContext } from "../src/common/deny-by-default.guard.js";
import {
  AUTHENTICATED_KEY,
  PERMISSION_KEY,
  PUBLIC_KEY,
  SENSITIVE_PERMISSIONS,
  grants,
  canDelegate,
  isConsoleController,
  isConsoleRoute,
} from "../src/common/permissions.js";
import { loadEnv } from "../src/config/env.js";

/** Contexto mínimo de Nest, con los metadatos que declararía un decorador. */
function contexto(meta: Record<string, unknown>, actor?: ActorContext, rutaControlador = "payments") {
  const handler = () => undefined;
  const clase = class {};
  /* Lo que escribiría @Controller({ path }): el guard decide la superficie con esto. */
  Reflect.defineMetadata(PATH_METADATA, rutaControlador, clase);
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

test("con permiso declarado y sin sesión se responde 401", () => {
  const { guard, ctx } = contexto({ [PERMISSION_KEY]: "billing:read" });
  assert.throws(() => guard.canActivate(ctx), UnauthorizedException);
});

test("@Authenticated exige sesión pero ningún permiso", () => {
  const sinPermisos: ActorContext = { ...GERENTE, organizationId: null, permissions: [] };
  assert.equal(contexto({ [AUTHENTICATED_KEY]: true }, sinPermisos).guard.canActivate(
    contexto({ [AUTHENTICATED_KEY]: true }, sinPermisos).ctx,
  ), true);
  const anonimo = contexto({ [AUTHENTICATED_KEY]: true });
  assert.throws(() => anonimo.guard.canActivate(anonimo.ctx), UnauthorizedException);
});

const INTERNO: ActorContext = { userId: "u9", organizationId: null, permissions: ["*"], internal: true };

test("la consola solo acepta actores internos, aunque el permiso alcance", () => {
  const gerenteEnConsola = contexto({ [PERMISSION_KEY]: "billing:read" }, GERENTE, "admin/v1/users");
  assert.throws(() => gerenteEnConsola.guard.canActivate(gerenteEnConsola.ctx), ForbiddenException);
  const internoEnConsola = contexto({ [PERMISSION_KEY]: "user:read" }, INTERNO, "admin/v1/users");
  assert.equal(internoEnConsola.guard.canActivate(internoEnConsola.ctx), true);
});

test("un actor interno no opera en el portal", () => {
  /* Las sesiones de consola no tienen empresa: dejarlas pasar al portal
     abriría endpoints que asumen un organizationId. */
  const { guard, ctx } = contexto({ [PERMISSION_KEY]: "billing:read" }, INTERNO, "payments");
  assert.throws(() => guard.canActivate(ctx), ForbiddenException);
});

test("la superficie sale del controlador, no del texto de la URL (hallazgo A5 C1)", () => {
  /* Express enruta /ADMIN/v1/users y "GET http://host/admin/v1/users" al
     controlador de la consola. Con la decisión por URL, una sesión de portal
     pasaba; con la decisión por controlador, no hay texto que manipular. */
  for (const declarado of ["admin/v1/users", "/admin/v1/users", "Admin/V1/Users", ["admin/v1/x", "otro"]]) {
    const { guard, ctx } = contexto({ [PERMISSION_KEY]: "user:read" }, { ...GERENTE, permissions: ["user:read"] }, declarado as string);
    assert.throws(() => guard.canActivate(ctx), ForbiddenException, `debió negar ${JSON.stringify(declarado)}`);
  }
  assert.equal(isConsoleController("administracion"), false);
  assert.equal(isConsoleController("auth"), false);
  assert.equal(isConsoleController(undefined), false);
});

test("isConsoleRoute no se engaña con prefijos parecidos ni con mayúsculas", () => {
  assert.equal(isConsoleRoute("/ADMIN/v1/users"), true);
  assert.equal(isConsoleRoute("/Admin/V1/Users"), true);
  assert.equal(isConsoleRoute("/admin/v1/users"), true);
  assert.equal(isConsoleRoute("/admin"), true);
  assert.equal(isConsoleRoute("/admin/v1/users?x=1"), true);
  assert.equal(isConsoleRoute("/administracion"), false);
  assert.equal(isConsoleRoute("/v1/admin/users"), false);
  assert.equal(isConsoleRoute("/v1/x?next=/admin/"), false);
  assert.equal(isConsoleRoute(undefined), false);
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
  API_PUBLIC_URL: "http://localhost:3000",
  PORTAL_URL: "http://localhost:3001",
  CONSOLE_URL: "http://localhost:3002",
  OIDC_ISSUER_URL: "http://localhost:8080/realms/fedesoft",
  OIDC_CLIENT_ID: "portal-api",
  OIDC_CLIENT_SECRET: "s".repeat(16),
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

test("sin configuración OIDC no se arranca", () => {
  for (const clave of ["OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "API_PUBLIC_URL"]) {
    const { [clave]: _omitida, ...resto } = ENV_BASE as Record<string, string>;
    assert.throws(() => loadEnv(resto as NodeJS.ProcessEnv), new RegExp(clave));
  }
  assert.throws(() => loadEnv({ ...ENV_BASE, OIDC_CLIENT_SECRET: "corto" }), /OIDC_CLIENT_SECRET/);
});

test("en producción las URL de identidad deben ser https", () => {
  const prod = { ...ENV_BASE, NODE_ENV: "production", CORS_ORIGINS: "https://portal.example" };
  assert.throws(() => loadEnv(prod as NodeJS.ProcessEnv), /https/);
  const seguro = {
    ...prod,
    API_PUBLIC_URL: "https://api.example",
    PORTAL_URL: "https://portal.example",
    CONSOLE_URL: "https://consola.example",
    OIDC_ISSUER_URL: "https://id.example/realms/fedesoft",
  };
  assert.equal(loadEnv(seguro as NodeJS.ProcessEnv).NODE_ENV, "production");
});

test("por defecto, swk/hwk no cuentan como segundo factor", () => {
  assert.equal(loadEnv(ENV_BASE).OIDC_MFA_VALUES, "otp,mfa");
});

test("en producción se rechazan los secretos de ejemplo", () => {
  const prod = {
    ...ENV_BASE,
    NODE_ENV: "production",
    CORS_ORIGINS: "https://portal.example",
    API_PUBLIC_URL: "https://api.example",
    PORTAL_URL: "https://portal.example",
    CONSOLE_URL: "https://consola.example",
    OIDC_ISSUER_URL: "https://id.example/realms/fedesoft",
  };
  assert.throws(() => loadEnv({ ...prod, OIDC_CLIENT_SECRET: "cambiar-secreto-local-del-cliente" } as NodeJS.ProcessEnv), /OIDC_CLIENT_SECRET/);
});

test("en producción CORS solo admite orígenes https exactos", () => {
  const prod = {
    ...ENV_BASE,
    NODE_ENV: "production",
    API_PUBLIC_URL: "https://api.example",
    PORTAL_URL: "https://portal.example",
    CONSOLE_URL: "https://consola.example",
    OIDC_ISSUER_URL: "https://id.example/realms/fedesoft",
  };
  for (const malo of ["*", "http://portal.example", "https://*.example", "https://portal.example/", "portal.example"]) {
    assert.throws(() => loadEnv({ ...prod, CORS_ORIGINS: malo } as NodeJS.ProcessEnv), /CORS_ORIGINS/, malo);
  }
  const env = loadEnv({ ...prod, CORS_ORIGINS: "https://portal.example, https://consola.example:8443" } as NodeJS.ProcessEnv);
  assert.equal(env.NODE_ENV, "production");
});

test("en producción el API no arranca con la credencial de migraciones a la vista", () => {
  const prod = {
    ...ENV_BASE,
    NODE_ENV: "production",
    CORS_ORIGINS: "https://portal.example",
    API_PUBLIC_URL: "https://api.example",
    PORTAL_URL: "https://portal.example",
    CONSOLE_URL: "https://consola.example",
    OIDC_ISSUER_URL: "https://id.example/realms/fedesoft",
  };
  assert.throws(
    () => loadEnv({ ...prod, MIGRATION_DATABASE_URL: "postgresql://owner:x@db/fedesoft" } as NodeJS.ProcessEnv),
    /MIGRATION_DATABASE_URL/,
  );
});

test("canDelegate: nadie reparte más de lo que tiene", () => {
  assert.equal(canDelegate(["*", "role:assign"], "*"), true);
  assert.equal(canDelegate(["*", "role:assign"], "role:assign"), true);
  assert.equal(canDelegate(["*"], "role:assign"), false);
  assert.equal(canDelegate(["role:assign", "user:read"], "*"), false);
  assert.equal(canDelegate(["billing:*"], "billing:*"), true);
  assert.equal(canDelegate(["billing:read"], "billing:*"), false);
  assert.equal(canDelegate(["*:read"], "*:read"), true);
  assert.equal(canDelegate(["billing:*"], "*:read"), false);
  assert.equal(canDelegate(["billing:*"], "billing:read"), true);
});
