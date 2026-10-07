/**
 * Contrato del adaptador OIDC. Cada prueba negativa es un ataque concreto:
 * si alguna pasa a aceptarse, alguien puede iniciar sesión como otro.
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { OidcIdentityProvider } from "../src/identity/adapters/oidc-identity-provider.adapter.js";
import { IdentityProviderError } from "../src/identity/ports/identity-provider.port.js";
import { baseClaims, startOidcMock, type OidcMock } from "./support/oidc-mock.js";

let mock: OidcMock;
let idp: OidcIdentityProvider;
const REDIRECT = "http://localhost:3000/v1/auth/callback";

before(async () => {
  mock = await startOidcMock();
  idp = new OidcIdentityProvider({
    issuer: mock.issuer,
    clientId: mock.clientId,
    clientSecret: mock.clientSecret,
    mfaValues: ["mfa", "otp"],
    mfaAcrRequest: "mfa",
    mfaMaxAgeSec: 900,
  });
});
after(() => mock.close());

let n = 0;
async function canjear(
  claims: Record<string, unknown>,
  opciones: { idToken?: string; nonce?: string; requireMfa?: boolean } = {},
) {
  const code = `codigo-${++n}`;
  mock.grant(code, {
    codeVerifier: "verificador",
    claims: baseClaims(mock, { nonce: "nonce-1", ...claims }),
    ...(opciones.idToken ? { idToken: opciones.idToken } : {}),
  });
  return idp.exchangeCode({
    code,
    redirectUri: REDIRECT,
    codeVerifier: "verificador",
    nonce: opciones.nonce ?? "nonce-1",
    requireMfa: opciones.requireMfa ?? false,
  });
}

test("la URL de autorización lleva PKCE S256, state, nonce y scope", async () => {
  const url = new URL(
    await idp.authorizationUrl({ redirectUri: REDIRECT, state: "st", nonce: "nn", codeChallenge: "reto", requireMfa: false }),
  );
  assert.equal(url.origin + url.pathname, `${mock.issuer}/auth`);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge"), "reto");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "st");
  assert.equal(url.searchParams.get("nonce"), "nn");
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT);
  assert.match(url.searchParams.get("scope") ?? "", /openid/);
  assert.equal(url.searchParams.get("acr_values"), null);
  assert.equal(url.searchParams.get("max_age"), null);

  const consola = new URL(
    await idp.authorizationUrl({ redirectUri: REDIRECT, state: "s", nonce: "n", codeChallenge: "r", requireMfa: true }),
  );
  assert.equal(consola.searchParams.get("acr_values"), "mfa");
  assert.equal(consola.searchParams.get("max_age"), "900");
});

test("un ID token válido produce la identidad verificada", async () => {
  const id = await canjear({});
  assert.deepEqual(id, {
    subject: "sujeto-1",
    email: "persona@empresa.test",
    emailVerified: true,
    name: "Persona de Prueba",
    mfa: false,
  });
  /* El intercambio se autenticó con client_secret_basic y envió el verificador. */
  const token = mock.requests.filter((r) => r.path === "/token").at(-1);
  assert.match(token?.authorization ?? "", /^Basic /);
  assert.match(token?.body ?? "", /code_verifier=verificador/);
});

test("amr o acr con un valor configurado cuentan como segundo factor", async () => {
  assert.equal((await canjear({ amr: ["pwd", "otp"] })).mfa, true);
  assert.equal((await canjear({ acr: "mfa" })).mfa, true);
  assert.equal((await canjear({ amr: ["pwd"], acr: "1" })).mfa, false);
});

test("para la consola, autenticación reciente sin otp no cuenta como segundo factor", async () => {
  const id = await canjear({ amr: ["pwd"], auth_time: Math.floor(Date.now() / 1000) }, { requireMfa: true });
  assert.equal(id.mfa, false);
});

test("para la consola, una autenticación reciente se acepta", async () => {
  const id = await canjear({ amr: ["pwd", "otp"], auth_time: Math.floor(Date.now() / 1000) - 60 }, { requireMfa: true });
  assert.equal(id.mfa, true);
});

test("email_verified ausente o en texto no cuenta como verificado", async () => {
  assert.equal((await canjear({ email_verified: undefined })).emailVerified, false);
  assert.equal((await canjear({ email_verified: "true" })).emailVerified, false);
});

const ATAQUES: [string, () => Promise<unknown>][] = [
  ["firmado con una clave que no es la del proveedor", async () =>
    canjear({}, { idToken: await mock.sign(baseClaims(mock, { nonce: "nonce-1" }), { foreignKey: true }) })],
  ["sin firma (alg: none)", async () =>
    canjear({}, { idToken: await mock.sign(baseClaims(mock, { nonce: "nonce-1" }), { alg: "none" }) })],
  ["de otro emisor", () => canjear({ iss: "https://otro-emisor.example" })],
  ["para otro cliente (aud)", () => canjear({ aud: "otro-cliente" })],
  ["con varias audiencias y azp ajeno", () => canjear({ aud: [mock.clientId, "otro"], azp: "otro" })],
  ["con varias audiencias y sin azp", () => canjear({ aud: [mock.clientId, "otro"] })],
  ["con azp de otro cliente aunque la audiencia sea única", () => canjear({ azp: "otro" })],
  ["para la consola sin auth_time", () => canjear({ amr: ["otp"] }, { requireMfa: true })],
  ["para la consola con una autenticación vieja", () =>
    canjear({ amr: ["otp"], auth_time: Math.floor(Date.now() / 1000) - 3600 }, { requireMfa: true })],
  ["vencido", () => canjear({ exp: Math.floor(Date.now() / 1000) - 120 })],
  ["con nonce de otro login", () => canjear({}, { nonce: "nonce-distinto" })],
  ["sin correo", () => canjear({ email: undefined })],
  ["sin sujeto", () => canjear({ sub: undefined })],
];

for (const [nombre, ataque] of ATAQUES) {
  test(`se rechaza un ID token ${nombre}`, async () => {
    await assert.rejects(ataque, IdentityProviderError);
  });
}

test("un código ya usado, o con otro verificador PKCE, no produce sesión", async () => {
  mock.grant("unico", { codeVerifier: "v", claims: baseClaims(mock, { nonce: "n" }) });
  await idp.exchangeCode({ code: "unico", redirectUri: REDIRECT, codeVerifier: "v", nonce: "n", requireMfa: false });
  await assert.rejects(
    idp.exchangeCode({ code: "unico", redirectUri: REDIRECT, codeVerifier: "v", nonce: "n", requireMfa: false }),
    IdentityProviderError,
  );
  mock.grant("pkce", { codeVerifier: "correcto", claims: baseClaims(mock, { nonce: "n" }) });
  await assert.rejects(
    idp.exchangeCode({ code: "pkce", redirectUri: REDIRECT, codeVerifier: "robado", nonce: "n", requireMfa: false }),
    IdentityProviderError,
  );
});

test("un emisor que publica metadatos de otro emisor se rechaza", async () => {
  const impostor = new OidcIdentityProvider({
    issuer: `${mock.issuer}/realms/otro`,
    clientId: mock.clientId,
    clientSecret: mock.clientSecret,
    mfaValues: [],
    mfaMaxAgeSec: 900,
  });
  await assert.rejects(
    impostor.authorizationUrl({ redirectUri: REDIRECT, state: "s", nonce: "n", codeChallenge: "c", requireMfa: false }),
    /emisor publicado no coincide/,
  );
});

test("la URL de cierre de sesión apunta al proveedor con la ruta de regreso", async () => {
  const url = new URL((await idp.logoutUrl("http://localhost:3001")) ?? "");
  assert.equal(url.pathname, "/logout");
  assert.equal(url.searchParams.get("post_logout_redirect_uri"), "http://localhost:3001");
  assert.equal(url.searchParams.get("client_id"), mock.clientId);
});
