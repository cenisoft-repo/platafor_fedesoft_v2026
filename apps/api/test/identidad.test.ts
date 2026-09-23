/**
 * Los controles de la capa de identidad que no necesitan base de datos.
 *
 * Lo que se prueba aquí es lo que un atacante intenta primero: entrar sin
 * segundo factor, montar una petición desde otro sitio, devolver el login a un
 * destino propio y quedarse con una cookie legible desde JavaScript.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DenyByDefaultGuard, type ActorContext } from "../src/common/deny-by-default.guard.js";
import { PERMISSION_KEY, SESSION_KEY } from "../src/common/permissions.js";
import { hashToken, hashesMatch, newPkcePair, newToken } from "../src/common/tokens.js";
import { CsrfGuard } from "../src/identity/csrf.guard.js";
import { cookieNames, CSRF_HEADER } from "../src/identity/cookies.js";
import { segundoFactorAcreditado } from "../src/identity/adapters/oidc-identity-provider.adapter.js";
import { StubIdentityProvider } from "../src/identity/adapters/stub-identity-provider.adapter.js";
import { StartLoginUseCase } from "../src/identity/domain/start-login.use-case.js";
import { loadEnv } from "../src/config/env.js";

const ACTOR_BASE: ActorContext = {
  userId: "u1",
  sessionId: "s1",
  organizationId: "o1",
  roleKey: "gerente",
  permissions: ["billing:*"],
  internal: false,
  mfaRequired: false,
  mfaSatisfied: false,
  segment: "MIPYME",
  membershipStatus: "AL_DIA",
};

function contextoDeGuard(meta: Record<string, unknown>, actor?: ActorContext) {
  const reflector = { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
  const ctx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  };
  return { guard: new DenyByDefaultGuard(reflector), ctx: ctx as never };
}

/* ───────────────────────────── Segundo factor ──────────────────────────── */

test("un perfil interno sin segundo factor no opera", () => {
  const interno = { ...ACTOR_BASE, internal: true, mfaRequired: true, permissions: ["*"] };
  const { guard, ctx } = contextoDeGuard({ [PERMISSION_KEY]: "organization:read" }, interno);
  assert.throws(() => guard.canActivate(ctx), ForbiddenException);
});

test("el mismo perfil interno con segundo factor sí opera", () => {
  const interno = { ...ACTOR_BASE, internal: true, mfaRequired: true, mfaSatisfied: true, permissions: ["*"] };
  const { guard, ctx } = contextoDeGuard({ [PERMISSION_KEY]: "organization:read" }, interno);
  assert.equal(guard.canActivate(ctx), true);
});

test("un rol interno mal sembrado —sin mfaRequired— tampoco pasa", () => {
  /* La fila dice que no hace falta; el guard mira además que sea interno. Una
     semilla equivocada no debe abrir la consola. */
  const interno = { ...ACTOR_BASE, internal: true, mfaRequired: false, permissions: ["*"] };
  const { guard, ctx } = contextoDeGuard({ [PERMISSION_KEY]: "organization:read" }, interno);
  assert.throws(() => guard.canActivate(ctx), ForbiddenException);
});

test("un permiso sensible exige segundo factor aunque el rol sea externo", () => {
  const conPermiso = { ...ACTOR_BASE, permissions: ["billing:refund"] };
  const sin = contextoDeGuard({ [PERMISSION_KEY]: "billing:refund" }, conPermiso);
  assert.throws(() => sin.guard.canActivate(sin.ctx), ForbiddenException);

  const con = contextoDeGuard({ [PERMISSION_KEY]: "billing:refund" }, { ...conPermiso, mfaSatisfied: true });
  assert.equal(con.guard.canActivate(con.ctx), true);
});

/* ────────────────────────────── Solo sesión ────────────────────────────── */

test("@RequireSession sirve con sesión y deniega sin ella", () => {
  const con = contextoDeGuard({ [SESSION_KEY]: true }, ACTOR_BASE);
  assert.equal(con.guard.canActivate(con.ctx), true);

  const sin = contextoDeGuard({ [SESSION_KEY]: true });
  assert.throws(() => sin.guard.canActivate(sin.ctx), ForbiddenException);
});

/* ─────────────────────────────────── CSRF ──────────────────────────────── */

function peticion(method: string, opciones: { session?: { csrfTokenHash: string }; header?: string }) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        session: opciones.session,
        header: (nombre: string) => (nombre === CSRF_HEADER ? opciones.header : undefined),
      }),
    }),
  } as never;
}

test("un POST con sesión y sin token anti-CSRF se deniega", () => {
  const guard = new CsrfGuard();
  const session = { csrfTokenHash: hashToken(newToken()) };
  assert.throws(() => guard.canActivate(peticion("POST", { session })), ForbiddenException);
});

test("un POST con el token anti-CSRF correcto pasa, y con uno ajeno no", () => {
  const guard = new CsrfGuard();
  const token = newToken();
  const session = { csrfTokenHash: hashToken(token) };
  assert.equal(guard.canActivate(peticion("POST", { session, header: token })), true);
  assert.throws(
    () => guard.canActivate(peticion("POST", { session, header: newToken() })),
    ForbiddenException,
  );
});

test("sin sesión no hay nada que montar: el webhook servidor a servidor pasa", () => {
  const guard = new CsrfGuard();
  assert.equal(guard.canActivate(peticion("POST", {})), true);
});

test("una lectura no exige token anti-CSRF", () => {
  const guard = new CsrfGuard();
  const session = { csrfTokenHash: hashToken(newToken()) };
  assert.equal(guard.canActivate(peticion("GET", { session })), true);
});

/* ───────────────────────────────── Cookies ─────────────────────────────── */

test("con HTTPS las cookies llevan el prefijo __Host-", () => {
  assert.equal(cookieNames(true).session, "__Host-fdsft_sid");
  assert.equal(cookieNames(false).session, "fdsft_sid");
});

/* ───────────────────────────────── Tokens ──────────────────────────────── */

test("los tokens no se repiten y solo se guarda su hash", () => {
  const a = newToken();
  const b = newToken();
  assert.notEqual(a, b);
  /* 256 bits en base64url: 43 caracteres. */
  assert.ok(a.length >= 43);
  assert.equal(hashToken(a).length, 64);
  assert.notEqual(hashToken(a), a);
  assert.equal(hashesMatch(hashToken(a), hashToken(a)), true);
  assert.equal(hashesMatch(hashToken(a), hashToken(b)), false);
});

test("el reto PKCE es el SHA-256 del verificador, no el verificador", () => {
  const { verifier, challenge } = newPkcePair();
  assert.notEqual(verifier, challenge);
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
});

/* ──────────────────────── Segundo factor del proveedor ─────────────────── */

test("se reconoce el segundo factor por acr y por amr, y no se inventa", () => {
  assert.equal(segundoFactorAcreditado({ acr: "mfa" }, "mfa"), true);
  assert.equal(segundoFactorAcreditado({ amr: ["pwd", "otp"] }, "mfa"), true);
  assert.equal(segundoFactorAcreditado({ amr: ["pwd"] }, "mfa"), false);
  assert.equal(segundoFactorAcreditado({ acr: "urn:otro" }, "mfa"), false);
  assert.equal(segundoFactorAcreditado({}, "mfa"), false);
});

/* ─────────────────────── Destino de vuelta del login ───────────────────── */

/** Doble de la base: el destino se valida antes de escribir nada. */
const prismaFalso = { authTransaction: { create: async () => ({}) } } as never;

test("el login no devuelve a un destino fuera de la lista", async () => {
  const caso = new StartLoginUseCase(prismaFalso, new StubIdentityProvider("http://localhost:3000/v1/auth/callback"), [
    "http://localhost:3001/",
  ]);
  await assert.rejects(() => caso.execute({ returnTo: "https://sitio-del-atacante.test/" }), /Destino/);
  await assert.rejects(() => caso.execute({ returnTo: "no-es-una-url" }), /Destino/);

  const permitido = await caso.execute({ returnTo: "http://localhost:3001/facturacion" });
  assert.ok(permitido.authorizationUrl.includes("state="));
});

test("el proveedor de desarrollo exige el nonce igual que el real", async () => {
  const stub = new StubIdentityProvider("http://localhost:3000/v1/auth/callback");
  const url = new URL(
    await stub.buildAuthorizationUrl({
      state: "s",
      nonce: "n-correcto",
      codeChallenge: "c",
      requireMfa: false,
    }),
  );
  const code = url.searchParams.get("code") ?? "";
  await assert.rejects(() => stub.exchangeCode({ code, codeVerifier: "v", nonce: "n-distinto" }));
  const identidad = await stub.exchangeCode({ code, codeVerifier: "v", nonce: "n-correcto" });
  assert.equal(identidad.emailVerified, true);
  assert.equal(identidad.mfaSatisfied, false);
});

/* ───────────────────────────────── Entorno ─────────────────────────────── */

const ENV_BASE = {
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  PAYMENT_WEBHOOK_SECRET: "x".repeat(32),
  CORS_ORIGINS: "https://portal.fedesoft.org",
  IDENTITY_PROVIDER: "stub",
  SESSION_COOKIE_SECURE: "false",
} as unknown as NodeJS.ProcessEnv;

test("el proveedor de desarrollo no puede quedar activo en producción", () => {
  assert.throws(
    () => loadEnv({ ...ENV_BASE, NODE_ENV: "production", IDENTITY_PROVIDER: "stub" }),
    /IDENTITY_PROVIDER/,
  );
});

test("en producción la cookie de sesión no puede ir sin Secure", () => {
  assert.throws(
    () =>
      loadEnv({
        ...ENV_BASE,
        NODE_ENV: "production",
        IDENTITY_PROVIDER: "oidc",
        OIDC_ISSUER_URL: "https://idp.test/realms/x",
        OIDC_CLIENT_ID: "portal",
        OIDC_CLIENT_SECRET: "s",
        SESSION_COOKIE_SECURE: "false",
      }),
    /SESSION_COOKIE_SECURE/,
  );
});

test("con OIDC sin credenciales no se arranca", () => {
  assert.throws(() => loadEnv({ ...ENV_BASE, IDENTITY_PROVIDER: "oidc" }), /OIDC_ISSUER_URL/);
});

test("el proveedor de identidad es obligatorio y explícito", () => {
  const { IDENTITY_PROVIDER: _omitido, ...sinProveedor } = ENV_BASE as Record<string, string>;
  assert.throws(() => loadEnv(sinProveedor as NodeJS.ProcessEnv), /IDENTITY_PROVIDER/);
});

test("el proveedor de desarrollo tampoco sirve donde hay TLS", () => {
  /* Un preproductivo con NODE_ENV=development y HTTPS está igual de expuesto
     a internet que producción: ahí el stub sería una puerta abierta. */
  assert.throws(
    () => loadEnv({ ...ENV_BASE, IDENTITY_PROVIDER: "stub", SESSION_COOKIE_SECURE: "true" }),
    /SESSION_COOKIE_SECURE/,
  );
});
