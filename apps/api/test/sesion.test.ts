/**
 * La sesión contra una base real: entrar, cambiar de empresa, perder el rol y
 * quedarse fuera.
 *
 * Lo que se verifica aquí no es que el camino feliz funcione —eso lo enseña
 * cualquier demostración—, sino que el acceso se **retire** cuando debe: un
 * privilegio que sobrevive a su revocación es una fuga, no un detalle.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@fedesoft/db";
import { AuditService } from "../src/common/audit.service.js";
import { hashToken } from "../src/common/tokens.js";
import { ActorResolver } from "../src/identity/domain/actor.resolver.js";
import { SessionService } from "../src/identity/domain/session.service.js";
import { StartLoginUseCase } from "../src/identity/domain/start-login.use-case.js";
import { CompleteLoginUseCase } from "../src/identity/domain/complete-login.use-case.js";
import { SwitchOrganizationUseCase } from "../src/identity/domain/switch-organization.use-case.js";
import { LogoutUseCase } from "../src/identity/domain/logout.use-case.js";
import { StubIdentityProvider } from "../src/identity/adapters/stub-identity-provider.adapter.js";

const prisma = new PrismaClient();
const VUELTA = "http://localhost:3001/";
const CALLBACK = "http://localhost:3000/v1/auth/callback";

const provider = new StubIdentityProvider(CALLBACK);
const audit = new AuditService();
const sessions = new SessionService(prisma as never, { absoluteMinutes: 480, idleMinutes: 30 });
const actores = new ActorResolver(prisma as never);
const iniciar = new StartLoginUseCase(prisma as never, provider, [VUELTA]);
const completar = new CompleteLoginUseCase(prisma as never, provider, sessions, audit);
const cambiar = new SwitchOrganizationUseCase(prisma as never, sessions, audit);
const cerrar = new LogoutUseCase(prisma as never, sessions, audit, provider);

function sufijo(): string {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

/** Empresa afiliada con un contacto que puede entrar como gerente. */
async function empresaConGerente(rol = "gerente") {
  const s = sufijo();
  const empresa = await prisma.organization.create({
    data: {
      nit: `9017${s}`,
      nitDv: "1",
      legalName: `Sesión ${s} S.A.S.`,
      segment: "MIPYME",
      status: "ACTIVA",
      memberships: { create: [{ type: "ACTIVO", status: "AL_DIA", validFrom: new Date("2026-01-01") }] },
    },
  });
  const email = `gerente.${s}@empresa.test`;
  const usuario = await prisma.user.create({ data: { email, status: "ACTIVO" } });
  const filaRol = await prisma.role.findUniqueOrThrow({ where: { key: rol } });
  const vinculo = await prisma.organizationUser.create({
    data: { organizationId: empresa.id, userId: usuario.id, roleId: filaRol.id },
  });
  return { empresa, usuario, email, vinculo };
}

/** Recorre el login entero: autorización, vuelta del proveedor y sesión. */
async function entrar(email: string, opciones: { mfa?: boolean } = {}) {
  const { authorizationUrl, binding } = await iniciar.execute({
    returnTo: VUELTA,
    requireMfa: opciones.mfa === true,
    loginHint: email,
  });
  const url = new URL(authorizationUrl);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  return { resultado: await completar.execute({ code, state, binding }), code, state, binding };
}

test("entrar deja sesión, vínculo de identidad y rastro de auditoría", async () => {
  const { empresa, usuario, email } = await empresaConGerente();
  const { resultado } = await entrar(email);

  assert.equal(resultado.session.userId, usuario.id);
  assert.equal(resultado.session.activeOrganizationId, empresa.id);
  assert.equal(resultado.returnTo, VUELTA);

  const identidad = await prisma.userIdentity.findFirst({ where: { userId: usuario.id } });
  assert.ok(identidad, "el primer inicio de sesión enlaza la identidad federada");

  const evento = await prisma.auditEvent.findFirst({
    where: { action: "auth.login", objectId: resultado.session.id },
  });
  assert.ok(evento);
  assert.equal(evento.organizationId, empresa.id);

  const actor = await actores.resolve(resultado.session);
  assert.ok(actor);
  assert.equal(actor.roleKey, "gerente");
  assert.equal(actor.organizationId, empresa.id);
  assert.equal(actor.segment, "MIPYME");
  assert.equal(actor.membershipStatus, "AL_DIA");
  assert.equal(actor.internal, false);
});

test("la base no guarda el identificador de sesión en claro", async () => {
  const { email } = await empresaConGerente();
  const { resultado } = await entrar(email);

  const fila = await prisma.session.findUniqueOrThrow({ where: { id: resultado.session.id } });
  assert.notEqual(fila.tokenHash, resultado.token);
  assert.equal(fila.tokenHash, hashToken(resultado.token));
  /* Y con el contenido de la tabla no se puede reconstruir la cookie. */
  assert.equal(await sessions.resolve(fila.tokenHash), null);
});

test("el state del login es de un solo uso", async () => {
  const { email } = await empresaConGerente();
  const { code, state, binding } = await entrar(email);
  await assert.rejects(() => completar.execute({ code, state, binding }), /inicio de sesión/);
});

test("un callback ajeno no abre sesión en el navegador de la víctima", async () => {
  /* El atacante inicia el login con su cuenta y entrega a la víctima el enlace
     de vuelta. Sin la cookie del intento, ese callback no vale —y, sobre todo,
     no consume el `state`, así que tampoco quema el login del atacante ni el
     de nadie—. */
  const { email } = await empresaConGerente();
  const { authorizationUrl, binding } = await iniciar.execute({ returnTo: VUELTA, loginHint: email });
  const url = new URL(authorizationUrl);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  await assert.rejects(() => completar.execute({ code, state, binding: undefined }), /inicio de sesión/);
  await assert.rejects(
    () => completar.execute({ code, state, binding: "cookie-de-otro-navegador" }),
    /inicio de sesión/,
  );

  /* Y el intento legítimo sigue en pie. */
  const valido = await completar.execute({ code, state, binding });
  assert.ok(valido.session.id);
});

test("consumir el intento borra el verificador y el nonce", async () => {
  const { email } = await empresaConGerente();
  const { state } = await entrar(email);
  const fila = await prisma.authTransaction.findUniqueOrThrow({ where: { stateHash: hashToken(state) } });
  assert.ok(fila.consumedAt);
  assert.equal(fila.codeVerifier, "");
  assert.equal(fila.nonce, "");
});

test("quien no está en el padrón no entra, aunque el proveedor lo conozca", async () => {
  await assert.rejects(() => entrar(`desconocido.${sufijo()}@ninguna.test`), /inicio de sesión/);
  const evento = await prisma.auditEvent.findFirst({
    where: { action: "auth.login.rejected" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(evento, "el rechazo queda auditado aunque la respuesta no diga por qué");
});

test("cambiar de empresa rota la sesión: el identificador anterior muere", async () => {
  const primera = await empresaConGerente();
  const segunda = await empresaConGerente();
  /* La misma persona, vinculada también a la segunda empresa. */
  const rolContacto = await prisma.role.findUniqueOrThrow({ where: { key: "contacto" } });
  await prisma.organizationUser.create({
    data: { organizationId: segunda.empresa.id, userId: primera.usuario.id, roleId: rolContacto.id },
  });

  const { resultado } = await entrar(primera.email);
  const nuevos = await cambiar.execute({
    session: resultado.session,
    organizationId: segunda.empresa.id,
  });

  assert.notEqual(nuevos.token, resultado.token);
  assert.equal(await sessions.resolve(resultado.token), null, "el token anterior deja de valer");

  const vigente = await sessions.resolve(nuevos.token);
  assert.ok(vigente);
  const actor = await actores.resolve(vigente);
  /* No acumula: en la segunda empresa es contacto, no gerente. */
  assert.equal(actor?.organizationId, segunda.empresa.id);
  assert.equal(actor?.roleKey, "contacto");
  assert.equal(actor?.permissions.includes("billing:*"), false);
});

test("no se puede saltar a una empresa en la que no se está", async () => {
  const propia = await empresaConGerente();
  const ajena = await empresaConGerente();
  const { resultado } = await entrar(propia.email);

  await assert.rejects(
    () => cambiar.execute({ session: resultado.session, organizationId: ajena.empresa.id }),
    /No opera sobre esa empresa/,
  );

  const sigue = await sessions.resolve(resultado.token);
  assert.equal(sigue?.activeOrganizationId, propia.empresa.id, "la empresa activa no cambió");
});

test("quitar el rol se siente en la petición siguiente, sin re-login", async () => {
  const { usuario, email, vinculo } = await empresaConGerente();
  const { resultado } = await entrar(email);

  const antes = await actores.resolve(resultado.session);
  assert.ok(antes?.permissions.includes("billing:*"));

  await prisma.organizationUser.delete({ where: { id: vinculo.id } });

  const viva = await sessions.resolve(resultado.token);
  assert.ok(viva, "la sesión sigue viva: es el permiso lo que desaparece");
  const despues = await actores.resolve(viva);
  assert.deepEqual(despues?.permissions, []);
  assert.equal(despues?.organizationId, null);
  assert.equal(despues?.userId, usuario.id);
});

test("bloquear a la persona mata la sesión de inmediato", async () => {
  const { usuario, email } = await empresaConGerente();
  const { resultado } = await entrar(email);

  await prisma.user.update({ where: { id: usuario.id }, data: { status: "BLOQUEADO" } });

  const viva = await sessions.resolve(resultado.token);
  assert.ok(viva, "la fila sigue ahí");
  assert.equal(await actores.resolve(viva), null, "pero ya no produce actor");
});

test("revocar en bloque cierra todas las sesiones de una persona", async () => {
  const { usuario, email } = await empresaConGerente();
  const a = await entrar(email);
  const b = await entrar(email);

  const cerradas = await prisma.$transaction((tx) =>
    sessions.revokeAllForUser(tx, usuario.id, "cambio_de_privilegios"),
  );
  assert.equal(cerradas, 2);
  assert.equal(await sessions.resolve(a.resultado.token), null);
  assert.equal(await sessions.resolve(b.resultado.token), null);
});

test("cerrar sesión revoca la fila, no solo la cookie", async () => {
  const { email } = await empresaConGerente();
  const { resultado } = await entrar(email);

  await cerrar.execute({ session: resultado.session });

  assert.equal(await sessions.resolve(resultado.token), null);
  const fila = await prisma.session.findUniqueOrThrow({ where: { id: resultado.session.id } });
  assert.equal(fila.status, "REVOCADA");
  assert.ok(fila.revokedReason);
});

test("una sesión caducada o inactiva deja de servir y queda marcada", async () => {
  const { email } = await empresaConGerente();

  const caducada = await entrar(email);
  /* Se envejece la sesión entera: la invariante de la base no deja poner una
     caducidad anterior a su emisión ni siquiera desde una prueba. */
  await prisma.session.update({
    where: { id: caducada.resultado.session.id },
    data: {
      issuedAt: new Date(Date.now() - 10 * 60 * 60_000),
      expiresAt: new Date(Date.now() - 2 * 60 * 60_000),
    },
  });
  assert.equal(await sessions.resolve(caducada.resultado.token), null);
  const filaCaducada = await prisma.session.findUniqueOrThrow({
    where: { id: caducada.resultado.session.id },
  });
  assert.equal(filaCaducada.status, "EXPIRADA");

  const inactiva = await entrar(email);
  await prisma.session.update({
    where: { id: inactiva.resultado.session.id },
    data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) },
  });
  assert.equal(await sessions.resolve(inactiva.resultado.token), null);
});

test("el segundo factor de la sesión sale del proveedor, no de la petición", async () => {
  const { email } = await empresaConGerente("operaciones");

  const sinFactor = await entrar(email);
  const actorSin = await actores.resolve(sinFactor.resultado.session);
  assert.equal(actorSin?.internal, true);
  assert.equal(actorSin?.mfaRequired, true, "la semilla exige segundo factor a los roles internos");
  assert.equal(actorSin?.mfaSatisfied, false);

  const conFactor = await entrar(email, { mfa: true });
  const actorCon = await actores.resolve(conFactor.resultado.session);
  assert.equal(actorCon?.mfaSatisfied, true);
});

test("la base no acepta una sesión que caduque antes de nacer", async () => {
  const { usuario } = await empresaConGerente();
  await assert.rejects(
    () =>
      prisma.session.create({
        data: {
          userId: usuario.id,
          tokenHash: hashToken(`incoherente-${sufijo()}`),
          csrfTokenHash: hashToken(`csrf-${sufijo()}`),
          expiresAt: new Date(Date.now() - 60_000),
        },
      }),
    /sessions_expires_after_issued/,
  );
});

test.after(async () => {
  await prisma.$disconnect();
});
