/**
 * Identidad y gestión de usuarios contra una base real (EPIC-02, ADR-008).
 *
 * El proveedor es de mentira (su contrato se prueba en oidc-contrato.test.ts);
 * todo lo demás —flujo de login, sesiones, invitaciones, revocación,
 * aislamiento entre empresas e invariantes de la base— es el código real.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaClient, type SessionChannel } from "@fedesoft/db";
import { AuditService } from "../src/common/audit.service.js";
import { OutboxService } from "../src/outbox/outbox.service.js";
import { IdentityParameters } from "../src/identity/domain/identity-parameters.js";
import { SessionService } from "../src/identity/domain/session.service.js";
import { LoginRejectedError, LoginUseCase, type LoginRejection } from "../src/identity/domain/login.use-case.js";
import { OrganizationUsersUseCase } from "../src/identity/domain/organization-users.use-case.js";
import { InternalUsersUseCase, SUPER_ADMIN_ROLE } from "../src/identity/domain/internal-users.use-case.js";
import type {
  AuthorizationRequest,
  IdentityProviderPort,
  VerifiedIdentity,
} from "../src/identity/ports/identity-provider.port.js";
import { sha256Hex } from "../src/identity/domain/tokens.js";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

/** Devuelve la identidad que la prueba le indique y cuenta los canjes. */
class FakeIdp implements IdentityProviderPort {
  readonly name = "fake";
  next: VerifiedIdentity | null = null;
  canjes = 0;
  ultimo: AuthorizationRequest | null = null;
  async authorizationUrl(req: AuthorizationRequest) {
    this.ultimo = req;
    return `https://idp.test/auth?state=${req.state}`;
  }
  async exchangeCode() {
    this.canjes += 1;
    if (!this.next) throw new Error("sin identidad preparada");
    return this.next;
  }
  async logoutUrl() {
    return null;
  }
}

const idp = new FakeIdp();
const audit = new AuditService();
const params = new IdentityParameters(prisma as never);
const sessions = new SessionService(prisma as never, audit);
const login = new LoginUseCase(prisma as never, audit, params, idp);
const orgUsers = new OrganizationUsersUseCase(prisma as never, audit, new OutboxService(), params, sessions);
const internos = new InternalUsersUseCase(prisma as never, audit, sessions);
const URLS = { callbackUrl: "http://api.test/v1/auth/callback", appUrl: "http://portal.test" };
const CTX = { correlationId: "prueba-identidad", ip: "127.0.0.1" };

const sufijo = () => randomUUID().slice(0, 8);

async function rol(key: string) {
  return prisma.role.findUniqueOrThrow({ where: { key } });
}

async function empresa() {
  const s = String(Math.floor(Math.random() * 900000) + 100000);
  return prisma.organization.create({
    data: { nit: `9027${s}`, nitDv: "1", legalName: `Identidad ${s} S.A.S.`, segment: "MIPYME", status: "ACTIVA" },
  });
}

/** Usuario ya vinculado a su identidad externa. */
async function usuario(opciones: { org?: string; rol?: string; interno?: string; status?: "ACTIVO" | "BLOQUEADO" } = {}) {
  const email = `persona.${sufijo()}@identidad.test`;
  const u = await prisma.user.create({
    data: { email, authSubject: `sub-${randomUUID()}`, status: opciones.status ?? "ACTIVO" },
  });
  if (opciones.org) {
    await prisma.organizationUser.create({
      data: { organizationId: opciones.org, userId: u.id, roleId: (await rol(opciones.rol ?? "gerente")).id },
    });
  }
  if (opciones.interno) {
    await prisma.userInternalRole.create({ data: { userId: u.id, roleId: (await rol(opciones.interno)).id } });
  }
  return u;
}

function identidad(u: { email: string; authSubject: string | null }, extra: Partial<VerifiedIdentity> = {}): VerifiedIdentity {
  return { subject: u.authSubject ?? `sub-${randomUUID()}`, email: u.email, emailVerified: true, name: "Prueba", mfa: false, ...extra };
}

/** Recorre el login completo como lo haría el navegador. */
async function entrar(channel: SessionChannel, id: VerifiedIdentity) {
  const { state } = await login.begin(channel, "/inicio", URLS);
  idp.next = id;
  const hecho = await login.complete({ channel, code: "codigo", state, stateCookie: state, ip: "127.0.0.1" }, URLS);
  return hecho.sessionToken;
}

async function rechazo(promesa: Promise<unknown>, codigo: LoginRejection) {
  await assert.rejects(promesa, (e: unknown) => e instanceof LoginRejectedError && e.code === codigo);
}

/* ─────────────────────────────── Login ─────────────────────────────── */

test("un gerente con una sola empresa entra directo a ella con los permisos de su rol", async () => {
  const org = await empresa();
  const u = await usuario({ org: org.id, rol: "gerente" });
  const token = await entrar("PORTAL", identidad(u));

  const s = await sessions.authenticate(token, "PORTAL");
  assert.equal(s?.actor.userId, u.id);
  assert.equal(s?.actor.organizationId, org.id);
  assert.equal(s?.actor.internal, false);
  assert.ok(s?.actor.permissions.includes("user:manage"));

  /* En la base no queda el token, solo su hash. */
  const fila = await prisma.session.findFirstOrThrow({ where: { userId: u.id } });
  assert.equal(fila.tokenHash, sha256Hex(token));
  assert.notEqual(fila.tokenHash, token);

  const auditoria = await prisma.auditEvent.count({ where: { actorUserId: u.id, action: "identity.login.succeeded" } });
  assert.equal(auditoria, 1);
  assert.match(idp.ultimo?.codeChallenge ?? "", /^[A-Za-z0-9_-]{43}$/);
});

test("el primer login vincula al usuario pre-registrado por su correo verificado", async () => {
  const org = await empresa();
  const email = `nuevo.${sufijo()}@identidad.test`;
  const u = await prisma.user.create({ data: { email, status: "INVITADO" } });
  await prisma.organizationUser.create({ data: { organizationId: org.id, userId: u.id, roleId: (await rol("talento")).id } });

  const sujeto = `sub-${randomUUID()}`;
  await entrar("PORTAL", { subject: sujeto, email: email.toUpperCase(), emailVerified: true, name: "Nueva Persona", mfa: false });
  const despues = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  assert.equal(despues.authSubject, sujeto);
  assert.equal(despues.status, "ACTIVO");
  assert.equal(despues.name, "Nueva Persona");
});

test("el callback exige el state de la cookie y es de un solo uso", async () => {
  const org = await empresa();
  const u = await usuario({ org: org.id });
  idp.next = identidad(u);

  const { state } = await login.begin("PORTAL", "/", URLS);
  const antes = idp.canjes;
  /* Login CSRF: el atacante envía a la víctima un callback con SU state. */
  await rechazo(login.complete({ channel: "PORTAL", code: "c", state, stateCookie: "otro" }, URLS), "flujo-invalido");
  await rechazo(login.complete({ channel: "PORTAL", code: "c", state, stateCookie: undefined }, URLS), "flujo-invalido");

  await login.complete({ channel: "PORTAL", code: "c", state, stateCookie: state }, URLS);
  await rechazo(login.complete({ channel: "PORTAL", code: "c", state, stateCookie: state }, URLS), "flujo-invalido");
  /* Los intentos rechazados nunca llegaron a gastar el código en el proveedor. */
  assert.equal(idp.canjes, antes + 1);

  /* Un state de portal no sirve para la consola. */
  const otro = await login.begin("PORTAL", "/", URLS);
  await rechazo(login.complete({ channel: "CONSOLA", code: "c", state: otro.state, stateCookie: otro.state }, URLS), "flujo-invalido");
});

test("un flujo de login vencido no se puede completar", async () => {
  const org = await empresa();
  const u = await usuario({ org: org.id });
  idp.next = identidad(u);
  const { state } = await login.begin("PORTAL", "/", URLS);
  await prisma.authFlow.update({ where: { stateHash: sha256Hex(state) }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await rechazo(login.complete({ channel: "PORTAL", code: "c", state, stateCookie: state }, URLS), "flujo-invalido");
});

test("se rechazan correo sin verificar, correo desconocido, identidad en conflicto y cuenta bloqueada", async () => {
  const org = await empresa();
  const u = await usuario({ org: org.id });
  await rechazo(entrar("PORTAL", identidad(u, { emailVerified: false })), "correo-no-verificado");
  await rechazo(entrar("PORTAL", identidad({ email: `nadie.${sufijo()}@x.test`, authSubject: null })), "sin-acceso");
  /* Mismo correo, otro sujeto: una cuenta recreada en el proveedor no hereda el acceso. */
  await rechazo(entrar("PORTAL", identidad(u, { subject: `otro-${randomUUID()}` })), "identidad-en-conflicto");

  const bloqueado = await usuario({ org: org.id, status: "BLOQUEADO" });
  await rechazo(entrar("PORTAL", identidad(bloqueado)), "cuenta-bloqueada");

  const auditados = await prisma.auditEvent.count({
    where: { action: "identity.login.rejected", metadata: { path: ["email"], equals: u.email } },
  });
  assert.ok(auditados >= 2);
});

test("la consola exige rol interno y segundo factor; el portal y la consola no comparten sesión", async () => {
  const sa = await usuario({ interno: "operaciones" });
  await rechazo(entrar("CONSOLA", identidad(sa, { mfa: false })), "mfa-requerida");
  const token = await entrar("CONSOLA", identidad(sa, { mfa: true }));

  const s = await sessions.authenticate(token, "CONSOLA");
  assert.equal(s?.actor.internal, true);
  assert.equal(s?.actor.organizationId, null);
  assert.ok(s?.actor.permissions.includes("affiliation:*"));
  assert.equal(await sessions.authenticate(token, "PORTAL"), null);

  const org = await empresa();
  const gerente = await usuario({ org: org.id });
  await rechazo(entrar("CONSOLA", identidad(gerente, { mfa: true })), "sin-rol-interno");
  const tokenPortal = await entrar("PORTAL", identidad(gerente));
  assert.equal(await sessions.authenticate(tokenPortal, "CONSOLA"), null);
});

test("con varias empresas se entra sin permisos hasta elegir una propia", async () => {
  const a = await empresa();
  const b = await empresa();
  const ajena = await empresa();
  const u = await usuario({ org: a.id, rol: "gerente" });
  await prisma.organizationUser.create({ data: { organizationId: b.id, userId: u.id, roleId: (await rol("talento")).id } });

  const token = await entrar("PORTAL", identidad(u));
  const sinElegir = await sessions.authenticate(token, "PORTAL");
  assert.equal(sinElegir?.actor.organizationId, null);
  assert.deepEqual(sinElegir?.actor.permissions, []);

  const actor = sinElegir?.actor;
  assert.ok(actor);
  await assert.rejects(sessions.selectOrganization(actor, ajena.id, CTX), ForbiddenException);
  await sessions.selectOrganization(actor, b.id, CTX);
  const elegida = await sessions.authenticate(token, "PORTAL");
  assert.equal(elegida?.actor.organizationId, b.id);
  assert.ok(elegida?.actor.permissions.includes("training:*"));
  assert.ok(!elegida?.actor.permissions.includes("billing:*"));

  const vista = await sessions.view(elegida.actor, elegida.session);
  assert.equal(vista.organizations.length, 2);
  assert.equal(vista.activeOrganization?.id, b.id);
});

/* ─────────────────────── Sesión: caducidad ─────────────────────── */

test("la inactividad y la expiración absoluta cierran la sesión", async () => {
  const org = await empresa();
  const u = await usuario({ org: org.id });
  const token = await entrar("PORTAL", identidad(u));
  const fila = await prisma.session.findFirstOrThrow({ where: { tokenHash: sha256Hex(token) } });

  const inactivo = new Date(fila.lastSeenAt.getTime() + fila.idleTimeoutSec * 1000 + 1000);
  assert.equal(await sessions.authenticate(token, "PORTAL", inactivo), null);
  const revocada = await prisma.session.findUniqueOrThrow({ where: { id: fila.id } });
  assert.equal(revocada.revokedReason, "inactividad");
  /* Revocada es definitiva: volver a la hora "buena" no la resucita. */
  assert.equal(await sessions.authenticate(token, "PORTAL"), null);

  const otro = await entrar("PORTAL", identidad(u));
  const filaOtra = await prisma.session.findFirstOrThrow({ where: { tokenHash: sha256Hex(otro) } });
  assert.equal(await sessions.authenticate(otro, "PORTAL", new Date(filaOtra.expiresAt.getTime() + 1)), null);

  assert.equal(await sessions.authenticate("no-es-un-token", "PORTAL"), null);
});

test("si el vínculo deja de estar activo por cualquier vía, la sesión deja de servir", async () => {
  /* Defensa en profundidad: aunque un script o un endpoint futuro cambie el
     estado sin revocar sesiones, la verificación por petición lo detecta. */
  const org = await empresa();
  const u = await usuario({ org: org.id });
  const token = await entrar("PORTAL", identidad(u));
  await prisma.organizationUser.update({
    where: { organizationId_userId: { organizationId: org.id, userId: u.id } },
    data: { status: "DESACTIVADO" },
  });
  assert.equal(await sessions.authenticate(token, "PORTAL"), null);

  const interno = await usuario({ interno: "auditor" });
  const tokenConsola = await entrar("CONSOLA", identidad(interno, { mfa: true }));
  await prisma.userInternalRole.deleteMany({ where: { userId: interno.id } });
  assert.equal(await sessions.authenticate(tokenConsola, "CONSOLA"), null);
});

/* ──────────────────── Gestión de usuarios de la empresa ──────────────────── */

test("el gerente invita; entrar con el correo invitado acepta la invitación", async () => {
  const org = await empresa();
  const gerente = await usuario({ org: org.id });
  const email = `invitada.${sufijo()}@identidad.test`;

  const r = await orgUsers.invite(
    { userId: gerente.id, organizationId: org.id },
    { email: email.toUpperCase(), name: "Persona Invitada", roleKey: "talento" },
    CTX,
  );
  assert.equal(r.status, "INVITADO");

  const contacto = await prisma.contact.findUniqueOrThrow({ where: { organizationId_email: { organizationId: org.id, email } } });
  assert.equal(contacto.name, "Persona Invitada");
  const evento = await prisma.outboxMessage.findFirst({ where: { eventType: "identity.user.invited", payload: { path: ["email"], equals: email } } });
  assert.ok(evento, "la invitación debe dejar un evento para el correo");

  const lista = await orgUsers.list(org.id);
  assert.equal(lista.find((f) => f.email === email)?.status, "INVITADO");

  const token = await entrar("PORTAL", { subject: `sub-${randomUUID()}`, email, emailVerified: true, name: null, mfa: false });
  const s = await sessions.authenticate(token, "PORTAL");
  assert.equal(s?.actor.organizationId, org.id);
  assert.ok(s?.actor.permissions.includes("training:*"));

  await assert.rejects(
    orgUsers.invite({ userId: gerente.id, organizationId: org.id }, { email, name: "Otra vez", roleKey: "talento" }, CTX),
    ConflictException,
  );
});

test("una invitación vencida no da acceso", async () => {
  const org = await empresa();
  const gerente = await usuario({ org: org.id });
  const email = `vencida.${sufijo()}@identidad.test`;
  const r = await orgUsers.invite({ userId: gerente.id, organizationId: org.id }, { email, name: "Vencida", roleKey: "contacto" }, CTX);
  await prisma.organizationUser.update({
    where: { organizationId_userId: { organizationId: org.id, userId: r.userId } },
    data: { inviteExpiresAt: new Date(Date.now() - 1000) },
  });
  await rechazo(entrar("PORTAL", { subject: `sub-${randomUUID()}`, email, emailVerified: true, name: null, mfa: false }), "sin-empresa");
});

test("el gerente no puede asignar roles internos", async () => {
  const org = await empresa();
  const gerente = await usuario({ org: org.id });
  await assert.rejects(
    orgUsers.invite({ userId: gerente.id, organizationId: org.id }, { email: `x.${sufijo()}@i.test`, name: "Escalada", roleKey: SUPER_ADMIN_ROLE }, CTX),
    BadRequestException,
  );
  const talento = await usuario({ org: org.id, rol: "talento" });
  await assert.rejects(orgUsers.changeRole({ userId: gerente.id, organizationId: org.id }, talento.id, "operaciones", CTX), BadRequestException);
});

test("desactivar a un usuario cierra sus sesiones en la empresa de inmediato", async () => {
  const org = await empresa();
  const gerente = await usuario({ org: org.id });
  const talento = await usuario({ org: org.id, rol: "talento" });
  const token = await entrar("PORTAL", identidad(talento));
  assert.ok(await sessions.authenticate(token, "PORTAL"));

  await orgUsers.deactivate({ userId: gerente.id, organizationId: org.id }, talento.id, CTX);
  assert.equal(await sessions.authenticate(token, "PORTAL"), null);
  await rechazo(entrar("PORTAL", identidad(talento)), "sin-empresa");

  await orgUsers.reactivate({ userId: gerente.id, organizationId: org.id }, talento.id, CTX);
  assert.ok(await sessions.authenticate(await entrar("PORTAL", identidad(talento)), "PORTAL"));
});

test("cambiar el rol invalida las sesiones del afectado (RF-IDE-008)", async () => {
  const org = await empresa();
  const gerente = await usuario({ org: org.id });
  const otro = await usuario({ org: org.id, rol: "gerente" });
  const token = await entrar("PORTAL", identidad(otro));

  await orgUsers.changeRole({ userId: gerente.id, organizationId: org.id }, otro.id, "contacto", CTX);
  assert.equal(await sessions.authenticate(token, "PORTAL"), null);
  const nueva = await sessions.authenticate(await entrar("PORTAL", identidad(otro)), "PORTAL");
  assert.ok(!nueva?.actor.permissions.includes("billing:*"));
});

test("la empresa nunca se queda sin quien administre usuarios, y nadie se desactiva a sí mismo", async () => {
  const org = await empresa();
  const gerente = await usuario({ org: org.id });
  const actor = { userId: gerente.id, organizationId: org.id };
  await assert.rejects(orgUsers.deactivate(actor, gerente.id, CTX), ConflictException);
  await assert.rejects(orgUsers.changeRole(actor, gerente.id, "contacto", CTX), ConflictException);

  /* Dos gerentes: uno puede degradar al otro, pero el segundo ya no puede
     degradar al primero porque la empresa se quedaría sin administrador. */
  const segundo = await usuario({ org: org.id, rol: "gerente" });
  await orgUsers.changeRole(actor, segundo.id, "talento", CTX);
  const admin2 = await usuario({ org: org.id, rol: "gerente" });
  await orgUsers.deactivate({ userId: admin2.id, organizationId: org.id }, gerente.id, CTX);
  await assert.rejects(
    orgUsers.deactivate({ userId: gerente.id, organizationId: org.id }, admin2.id, CTX),
    ConflictException,
  );
});

test("aislamiento: un gerente no ve ni toca usuarios de otra empresa", async () => {
  const a = await empresa();
  const b = await empresa();
  const gerenteA = await usuario({ org: a.id });
  const deB = await usuario({ org: b.id, rol: "talento" });
  const tokenB = await entrar("PORTAL", identidad(deB));
  const actorA = { userId: gerenteA.id, organizationId: a.id };

  assert.ok(!(await orgUsers.list(a.id)).some((f) => f.userId === deB.id));
  await assert.rejects(orgUsers.deactivate(actorA, deB.id, CTX), NotFoundException);
  await assert.rejects(orgUsers.changeRole(actorA, deB.id, "contacto", CTX), NotFoundException);
  await assert.rejects(orgUsers.reactivate(actorA, deB.id, CTX), NotFoundException);
  /* El usuario de B sigue intacto. */
  assert.ok(await sessions.authenticate(tokenB, "PORTAL"));
});

/* ─────────────────────────── Consola ─────────────────────────── */

test("bloquear una cuenta cierra todas sus sesiones y le impide entrar", async () => {
  const sa = await usuario({ interno: "operaciones" });
  const org = await empresa();
  const u = await usuario({ org: org.id });
  const token = await entrar("PORTAL", identidad(u));

  await internos.block({ userId: sa.id }, u.id, "Prueba de bloqueo", CTX);
  assert.equal(await sessions.authenticate(token, "PORTAL"), null);
  await rechazo(entrar("PORTAL", identidad(u)), "cuenta-bloqueada");
  await assert.rejects(internos.block({ userId: sa.id }, sa.id, "Autobloqueo", CTX), ConflictException);

  await internos.unblock({ userId: sa.id }, u.id, "Fin de la prueba", CTX);
  assert.ok(await sessions.authenticate(await entrar("PORTAL", identidad(u)), "PORTAL"));
});

test("asignar o quitar un rol interno cierra las sesiones de consola del afectado", async () => {
  const sa = await usuario({ interno: SUPER_ADMIN_ROLE });
  const op = await usuario({ interno: "operaciones" });
  const token = await entrar("CONSOLA", identidad(op, { mfa: true }));

  await internos.grantRole({ userId: sa.id }, op.id, "auditor", CTX);
  assert.equal(await sessions.authenticate(token, "CONSOLA"), null);
  await assert.rejects(internos.grantRole({ userId: sa.id }, op.id, "auditor", CTX), ConflictException);
  await assert.rejects(internos.grantRole({ userId: sa.id }, op.id, "gerente", CTX), BadRequestException);

  const otro = await entrar("CONSOLA", identidad(op, { mfa: true }));
  await internos.revokeRole({ userId: sa.id }, op.id, "auditor", CTX);
  assert.equal(await sessions.authenticate(otro, "CONSOLA"), null);
});

test("siempre quedan al menos dos Super Admin y ninguno se autodegrada (RA-ACC-008)", async () => {
  /* La regla cuenta todos los Super Admin del sistema. Para probar el borde
     se apartan temporalmente los que ya existían y se restauran al final. */
  const previos = await prisma.user.findMany({
    where: { status: { not: "BLOQUEADO" }, internalRoles: { some: { role: { key: SUPER_ADMIN_ROLE } } } },
    select: { id: true, status: true },
  });
  await prisma.user.updateMany({ where: { id: { in: previos.map((p) => p.id) } }, data: { status: "BLOQUEADO" } });
  try {
    const a = await usuario({ interno: SUPER_ADMIN_ROLE });
    const b = await usuario({ interno: SUPER_ADMIN_ROLE });
    const c = await usuario({ interno: SUPER_ADMIN_ROLE });

    await assert.rejects(internos.revokeRole({ userId: a.id }, a.id, SUPER_ADMIN_ROLE, CTX), ConflictException);
    await internos.revokeRole({ userId: a.id }, c.id, SUPER_ADMIN_ROLE, CTX);
    /* Quedan a y b: ni quitar el rol ni bloquear a uno de ellos es posible. */
    await assert.rejects(internos.revokeRole({ userId: a.id }, b.id, SUPER_ADMIN_ROLE, CTX), ConflictException);
    await assert.rejects(internos.block({ userId: a.id }, b.id, "Dejaría uno solo", CTX), ConflictException);
  } finally {
    for (const p of previos) {
      await prisma.user.update({ where: { id: p.id }, data: { status: p.status } });
    }
  }
});

/* ──────────────────── Invariantes en la base ──────────────────── */

test("la base impide una sesión de consola sin segundo factor o con empresa", async () => {
  const u = await usuario({ interno: "operaciones" });
  const base = {
    userId: u.id,
    channel: "CONSOLA" as const,
    idleTimeoutSec: 60,
    expiresAt: new Date(Date.now() + 60_000),
  };
  await assert.rejects(prisma.session.create({ data: { ...base, tokenHash: sha256Hex(randomUUID()), mfa: false } }), /sessions_console_requires_mfa/);
});

test("la base impide un rol interno dentro de una empresa", async () => {
  const org = await empresa();
  const u = await usuario();
  const interno = await rol(SUPER_ADMIN_ROLE);
  await assert.rejects(
    prisma.organizationUser.create({ data: { organizationId: org.id, userId: u.id, roleId: interno.id } }),
  );
  await assert.rejects(
    prisma.$executeRaw`INSERT INTO organization_users (id, organization_id, user_id, role_id, role_internal)
      VALUES (gen_random_uuid(), ${org.id}::uuid, ${u.id}::uuid, ${interno.id}::uuid, true)`,
    /organization_users_role_is_external/,
  );
  const externo = await rol("gerente");
  await assert.rejects(prisma.userInternalRole.create({ data: { userId: u.id, roleId: externo.id } }));
});

test("la base impide una sesión de portal en una empresa a la que el usuario no pertenece", async () => {
  const propia = await empresa();
  const ajena = await empresa();
  const u = await usuario({ org: propia.id });
  await assert.rejects(
    prisma.session.create({
      data: {
        tokenHash: sha256Hex(randomUUID()),
        userId: u.id,
        channel: "PORTAL",
        organizationId: ajena.id,
        idleTimeoutSec: 60,
        expiresAt: new Date(Date.now() + 60_000),
      },
    }),
  );
});

test("la base impide una invitación sin vencimiento y correos con mayúsculas", async () => {
  const org = await empresa();
  const u = await usuario();
  await assert.rejects(
    prisma.organizationUser.create({
      data: { organizationId: org.id, userId: u.id, roleId: (await rol("talento")).id, status: "INVITADO" },
    }),
    /organization_users_invite_expires/,
  );
  await assert.rejects(prisma.user.create({ data: { email: `Mayus.${sufijo()}@X.test` } }), /users_email_lowercase/);
});
