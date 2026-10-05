/**
 * Piezas HTTP de la sesión que no necesitan base de datos: cookies, CSRF,
 * redirección segura y el middleware que convierte una cookie en actor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import { SessionMiddleware } from "../src/identity/http/session.middleware.js";
import { SESSION_COOKIE, parseCookies } from "../src/identity/http/cookies.js";
import { csrfTokenFor, pkceChallenge, randomToken, safeEqual, safeReturnTo, TOKEN_FORMAT } from "../src/identity/domain/tokens.js";
import type { SessionService, ResolvedSession } from "../src/identity/domain/session.service.js";

test("safeReturnTo solo admite rutas relativas de la propia aplicación", () => {
  assert.equal(safeReturnTo("/estado-de-cuenta?tab=1"), "/estado-de-cuenta?tab=1");
  for (const malo of [
    "https://evil.com",
    "//evil.com",
    "/\\\\evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "evil.com",
    "/ruta\\r\\nSet-Cookie:x",
    "/ruta\\u0000",
    "javascript:alert(1)",
    "",
    "/" + "a".repeat(400),
    42,
    undefined,
  ]) {
    assert.equal(safeReturnTo(malo), "/", `debió rechazar ${JSON.stringify(malo)}`);
  }
  assert.equal(safeReturnTo("/ruta\r\nSet-Cookie:x"), "/");
  assert.equal(safeReturnTo("/ruta\u0000"), "/");
});

test("tokens: formato, PKCE S256 y CSRF derivado", () => {
  const t = randomToken();
  assert.match(t, TOKEN_FORMAT);
  assert.notEqual(randomToken(), t);
  /* S256 = BASE64URL(SHA256(ASCII(verifier))), sin relleno (RFC 7636 §4.2). */
  const reto = pkceChallenge(t);
  assert.equal(reto, createHash("sha256").update(t, "ascii").digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  assert.match(reto, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(csrfTokenFor(t), csrfTokenFor(t));
  assert.notEqual(csrfTokenFor(t), csrfTokenFor(randomToken()));
  assert.notEqual(csrfTokenFor(t), t);
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual(undefined, "abc"), false);
});

test("parseCookies: la primera gana y los valores rotos no tumban la petición", () => {
  const c = parseCookies("a=1; b=dos%20; a=otro; roto=%E0%A4%A; =sin-nombre");
  assert.equal(c.a, "1");
  assert.equal(c.b, "dos ");
  assert.equal(c.roto, undefined);
  assert.deepEqual(parseCookies(undefined), {});
});

/* ── Middleware con un SessionService de mentira ── */

const TOKEN = randomToken();
const RESUELTA: ResolvedSession = {
  actor: { userId: "u1", organizationId: "o1", permissions: ["billing:*"], internal: false, sessionId: "s1" },
  session: { id: "s1", channel: "PORTAL", mfa: false, expiresAt: new Date(Date.now() + 3_600_000) },
};

function ejecutar(req: { method: string; url: string; cookie?: string; csrf?: string }, resuelve = true) {
  const canales: string[] = [];
  const sesiones = {
    authenticate: async (token: string, channel: string) => {
      canales.push(channel);
      return resuelve && token === TOKEN ? RESUELTA : null;
    },
  } as unknown as SessionService;
  const mw = new SessionMiddleware(sesiones);
  const peticion = {
    method: req.method,
    originalUrl: req.url,
    headers: { cookie: req.cookie },
    header: (n: string) => (n === "x-csrf-token" ? req.csrf : undefined),
  } as never as Parameters<SessionMiddleware["use"]>[0];
  const borradas: string[] = [];
  const respuesta = { clearCookie: (n: string) => borradas.push(n) } as never as Parameters<SessionMiddleware["use"]>[1];
  return new Promise<{ error: unknown; req: typeof peticion; borradas: string[]; canales: string[] }>((resolve) => {
    void mw.use(peticion, respuesta, (error?: unknown) => resolve({ error, req: peticion, borradas, canales }));
  });
}

test("una cookie válida produce el actor; un GET no necesita CSRF", async () => {
  const r = await ejecutar({ method: "GET", url: "/v1/x", cookie: `${SESSION_COOKIE.PORTAL}=${TOKEN}` });
  assert.equal(r.error, undefined);
  assert.equal(r.req.actor?.userId, "u1");
  assert.equal(r.req.csrfToken, csrfTokenFor(TOKEN));
});

test("un POST con sesión y sin token CSRF se rechaza", async () => {
  const sin = await ejecutar({ method: "POST", url: "/v1/payments", cookie: `${SESSION_COOKIE.PORTAL}=${TOKEN}` });
  assert.ok(sin.error instanceof ForbiddenException);
  assert.equal(sin.req.actor, undefined);

  const otro = await ejecutar({
    method: "POST",
    url: "/v1/payments",
    cookie: `${SESSION_COOKIE.PORTAL}=${TOKEN}`,
    csrf: csrfTokenFor(randomToken()),
  });
  assert.ok(otro.error instanceof ForbiddenException);

  const bien = await ejecutar({
    method: "POST",
    url: "/v1/payments",
    cookie: `${SESSION_COOKIE.PORTAL}=${TOKEN}`,
    csrf: csrfTokenFor(TOKEN),
  });
  assert.equal(bien.error, undefined);
  assert.equal(bien.req.actor?.userId, "u1");
});

test("sin cookie la petición sigue anónima (los webhooks no llevan sesión)", async () => {
  const r = await ejecutar({ method: "POST", url: "/v1/webhooks/payments" });
  assert.equal(r.error, undefined);
  assert.equal(r.req.actor, undefined);
  assert.deepEqual(r.canales, []);
});

test("la consola lee solo su cookie: la del portal no autentica /admin", async () => {
  const r = await ejecutar({ method: "GET", url: "/admin/v1/users", cookie: `${SESSION_COOKIE.PORTAL}=${TOKEN}` });
  assert.equal(r.req.actor, undefined);
  assert.deepEqual(r.canales, []);
  const c = await ejecutar({ method: "GET", url: "/admin/v1/users", cookie: `${SESSION_COOKIE.CONSOLA}=${TOKEN}` });
  assert.deepEqual(c.canales, ["CONSOLA"]);
});

test("una sesión vencida o revocada borra la cookie y sigue anónima", async () => {
  const r = await ejecutar({ method: "GET", url: "/v1/x", cookie: `${SESSION_COOKIE.PORTAL}=${TOKEN}` }, false);
  assert.equal(r.error, undefined);
  assert.equal(r.req.actor, undefined);
  assert.deepEqual(r.borradas, [SESSION_COOKIE.PORTAL]);
});
