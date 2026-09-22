/**
 * Recorrido crítico de extremo a extremo: pago → webhook firmado → factura
 * con CUFE → certificado.
 *
 * Corre contra una base real y ejercita el camino feliz y, sobre todo, los
 * caminos de ataque. Un webhook de pagos que solo se prueba con el mensaje
 * correcto no está probado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@fedesoft/db";
import { HmacSandboxGateway, VENTANA_REPLAY_MS } from "../src/billing/adapters/hmac-sandbox-gateway.adapter.js";
import { SandboxInvoicer } from "../src/billing/adapters/sandbox-invoicer.adapter.js";
import { AuditService } from "../src/common/audit.service.js";
import { OutboxService } from "../src/outbox/outbox.service.js";
import { OutboxDispatcher } from "../src/outbox/outbox.dispatcher.js";
import { StartPaymentUseCase } from "../src/billing/domain/start-payment.use-case.js";
import { ConfirmPaymentUseCase } from "../src/billing/domain/confirm-payment.use-case.js";
import { IssueInvoiceUseCase } from "../src/billing/domain/issue-invoice.use-case.js";
import { IssueCertificateUseCase } from "../src/certificates/issue-certificate.use-case.js";
import { MembershipPolicy } from "../src/certificates/membership.policy.js";

const SECRETO = "secreto-de-prueba-de-al-menos-32-caracteres";
const prisma = new PrismaClient();

const gateway = new HmacSandboxGateway({ secret: SECRETO });
const invoicer = new SandboxInvoicer();
const audit = new AuditService();
const outbox = new OutboxService();
const policy = new MembershipPolicy(prisma as never);
const iniciar = new StartPaymentUseCase(prisma as never, audit, gateway);
const confirmar = new ConfirmPaymentUseCase(prisma as never, outbox, audit, gateway);
const facturar = new IssueInvoiceUseCase(prisma as never, outbox, audit, invoicer);
const certificar = new IssueCertificateUseCase(prisma as never, outbox, audit, policy);
const despachador = new OutboxDispatcher(prisma as never, facturar, certificar);

/** Empresa nueva con una cuota pendiente. */
async function empresaConCuota(monto = "2450000.00") {
  const sufijo = String(Math.floor(Math.random() * 900000) + 100000);
  const empresa = await prisma.organization.create({
    data: {
      nit: `9018${sufijo}`,
      nitDv: "4",
      legalName: `Recorrido ${sufijo} S.A.S.`,
      segment: "MIPYME",
      status: "ACTIVA",
      city: "Bogotá D.C.",
      memberships: {
        create: [{ type: "ACTIVO", status: "AL_DIA", validFrom: new Date("2026-01-01") }],
      },
    },
  });
  const cargo = await prisma.charge.create({
    data: {
      organizationId: empresa.id,
      concept: "Cuota de afiliación anual",
      period: `2026-${sufijo}`,
      amount: new Prisma.Decimal(monto),
      dueDate: new Date("2026-12-15"),
      status: "PENDIENTE",
    },
  });
  return { empresa, cargo };
}

/** Mensaje del proveedor, firmado como lo firmaría él. */
function webhookFirmado(
  opciones: { reference: string; amount: string; status?: string; eventId?: string; edad?: number },
) {
  const cuerpo = Buffer.from(
    JSON.stringify({
      id: opciones.eventId ?? `evt-${randomUUID()}`,
      data: {
        transaction_id: `TXN-${randomUUID().slice(0, 8)}`,
        reference: opciones.reference,
        amount: opciones.amount,
        currency: "COP",
        status: opciones.status ?? "APPROVED",
      },
    }),
  );
  const timestamp = String(Date.now() - (opciones.edad ?? 0));
  return {
    cuerpo,
    headers: { "x-signature": gateway.sign(cuerpo, timestamp), "x-timestamp": timestamp },
  };
}

const ACTOR = { userId: randomUUID(), label: "prueba" };
const CTX = { ip: "10.0.0.1", correlationId: "corr-prueba" };

test.after(() => prisma.$disconnect());

/* ───────────────────────── El camino completo ───────────────────────── */

test("pago → webhook → factura con CUFE → certificado", async () => {
  const { empresa, cargo } = await empresaConCuota();

  const pago = await iniciar.execute({
    organizationId: empresa.id,
    chargeIds: [cargo.id],
    returnUrl: "http://localhost/gracias",
    actor: ACTOR,
  });
  assert.equal(pago.amount, "2450000");

  const { cuerpo, headers } = webhookFirmado({ reference: pago.reference, amount: "2450000" });
  const resultado = await confirmar.execute(cuerpo, headers, CTX);
  assert.equal(resultado.outcome, "aplicado");

  // El pago quedó aprobado con referencia y confirmación del proveedor.
  const aplicado = await prisma.payment.findUniqueOrThrow({ where: { id: pago.paymentId } });
  assert.equal(aplicado.status, "APROBADO");
  assert.ok(aplicado.providerReference);
  assert.ok(aplicado.confirmedAt);

  // El cargo quedó saldado.
  const saldado = await prisma.charge.findUniqueOrThrow({ where: { id: cargo.id } });
  assert.equal(saldado.status, "PAGADO");

  // El outbox lleva el evento, y drenarlo emite la factura.
  assert.ok((await despachador.drain()) >= 1);
  const factura = await prisma.invoice.findUniqueOrThrow({ where: { paymentId: pago.paymentId } });
  assert.equal(factura.status, "EMITIDA");
  assert.ok(factura.cufe, "una factura emitida sin CUFE no debería existir");
  assert.ok(factura.number);

  // Drenar de nuevo dispara el certificado desde invoice.issued.
  await despachador.drain();
  const certificado = await prisma.certificate.findFirstOrThrow({
    where: { organizationId: empresa.id, status: "VIGENTE" },
  });
  assert.match(certificado.folio, /^FS-\d{4}-\d{5}$/);

  // El certificado guarda bajo qué regla se emitió.
  const snapshot = certificado.membershipSnapshot as { regla?: string };
  assert.match(snapshot.regla ?? "", /dias_gracia v\d+/);

  // Y todo quedó auditado.
  const acciones = await prisma.auditEvent.findMany({
    where: { organizationId: empresa.id },
    select: { action: true },
  });
  const nombres = acciones.map((a) => a.action);
  for (const esperada of ["payment.started", "payment.approved", "invoice.issued", "certificate.generated"]) {
    assert.ok(nombres.includes(esperada), `falta la auditoría de ${esperada}`);
  }
});

/* ─────────────────────────── Los ataques ────────────────────────────── */

test("una firma inválida no aplica nada", async () => {
  const { empresa, cargo } = await empresaConCuota();
  const pago = await iniciar.execute({
    organizationId: empresa.id, chargeIds: [cargo.id], returnUrl: "http://localhost/x", actor: ACTOR,
  });

  const { cuerpo } = webhookFirmado({ reference: pago.reference, amount: "2450000" });
  const resultado = await confirmar.execute(
    cuerpo,
    { "x-signature": "f".repeat(64), "x-timestamp": String(Date.now()) },
    CTX,
  );

  assert.equal(resultado.outcome, "rechazado");
  const sinTocar = await prisma.payment.findUniqueOrThrow({ where: { id: pago.paymentId } });
  assert.equal(sinTocar.status, "INICIADO");
});

test("sin firma no se procesa", async () => {
  const { cuerpo } = webhookFirmado({ reference: "PAY-x", amount: "1" });
  const r = await confirmar.execute(cuerpo, {}, CTX);
  assert.equal(r.outcome, "rechazado");
  assert.equal(r.reason, "firma-ausente");
});

test("un mensaje viejo se rechaza aunque venga bien firmado", async () => {
  const { empresa, cargo } = await empresaConCuota();
  const pago = await iniciar.execute({
    organizationId: empresa.id, chargeIds: [cargo.id], returnUrl: "http://localhost/x", actor: ACTOR,
  });

  const { cuerpo, headers } = webhookFirmado({
    reference: pago.reference,
    amount: "2450000",
    edad: VENTANA_REPLAY_MS + 60_000,
  });
  const r = await confirmar.execute(cuerpo, headers, CTX);

  assert.equal(r.outcome, "rechazado");
  assert.equal(r.reason, "fuera-de-ventana");
});

test("el mismo evento dos veces se aplica una sola vez", async () => {
  const { empresa, cargo } = await empresaConCuota();
  const pago = await iniciar.execute({
    organizationId: empresa.id, chargeIds: [cargo.id], returnUrl: "http://localhost/x", actor: ACTOR,
  });

  const eventId = `evt-fijo-${randomUUID()}`;
  const uno = webhookFirmado({ reference: pago.reference, amount: "2450000", eventId });
  assert.equal((await confirmar.execute(uno.cuerpo, uno.headers, CTX)).outcome, "aplicado");

  const dos = webhookFirmado({ reference: pago.reference, amount: "2450000", eventId });
  assert.equal((await confirmar.execute(dos.cuerpo, dos.headers, CTX)).outcome, "duplicado");

  const aprobaciones = await prisma.auditEvent.count({
    where: { organizationId: empresa.id, action: "payment.approved" },
  });
  assert.equal(aprobaciones, 1, "el reenvío no puede auditar dos aprobaciones");
});

test("un monto distinto al esperado no salda el cargo", async () => {
  const { empresa, cargo } = await empresaConCuota();
  const pago = await iniciar.execute({
    organizationId: empresa.id, chargeIds: [cargo.id], returnUrl: "http://localhost/x", actor: ACTOR,
  });

  // Firma válida, pero el proveedor reporta mil pesos.
  const { cuerpo, headers } = webhookFirmado({ reference: pago.reference, amount: "1000" });
  const r = await confirmar.execute(cuerpo, headers, CTX);

  assert.equal(r.outcome, "rechazado");
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: pago.paymentId } })).status, "INICIADO");
  assert.equal((await prisma.charge.findUniqueOrThrow({ where: { id: cargo.id } })).status, "PENDIENTE");
  // Y el intento quedó registrado para que alguien lo mire.
  assert.equal(
    await prisma.auditEvent.count({
      where: { organizationId: empresa.id, action: "payment.amount_mismatch" },
    }),
    1,
  );
});

test("no se puede pagar el cargo de otra empresa", async () => {
  const propia = await empresaConCuota();
  const ajena = await empresaConCuota();

  await assert.rejects(
    () =>
      iniciar.execute({
        organizationId: propia.empresa.id,
        chargeIds: [ajena.cargo.id],
        returnUrl: "http://localhost/x",
        actor: ACTOR,
      }),
    /no existe, no pertenece/,
  );
});

test("dos webhooks simultáneos del mismo pago aplican una sola transición", async () => {
  const { empresa, cargo } = await empresaConCuota();
  const pago = await iniciar.execute({
    organizationId: empresa.id, chargeIds: [cargo.id], returnUrl: "http://localhost/x", actor: ACTOR,
  });

  // Eventos distintos —no los frena la unicidad— para el mismo pago, a la vez.
  const a = webhookFirmado({ reference: pago.reference, amount: "2450000" });
  const b = webhookFirmado({ reference: pago.reference, amount: "2450000" });
  const [ra, rb] = await Promise.all([
    confirmar.execute(a.cuerpo, a.headers, CTX),
    confirmar.execute(b.cuerpo, b.headers, CTX),
  ]);

  const aplicados = [ra, rb].filter((r) => r.outcome === "aplicado");
  assert.equal(aplicados.length, 1, "solo uno de los dos puede aplicar la transición");

  assert.equal(
    await prisma.outboxMessage.count({
      where: { aggregateId: pago.paymentId, eventType: "payment.succeeded" },
    }),
    1,
    "un solo evento de dominio, o se emitirían dos facturas",
  );
});

test("un pago rechazado no salda el cargo y deja el motivo", async () => {
  const { empresa, cargo } = await empresaConCuota();
  const pago = await iniciar.execute({
    organizationId: empresa.id, chargeIds: [cargo.id], returnUrl: "http://localhost/x", actor: ACTOR,
  });

  const { cuerpo, headers } = webhookFirmado({
    reference: pago.reference, amount: "2450000", status: "DECLINED",
  });
  await confirmar.execute(cuerpo, headers, CTX);

  const p = await prisma.payment.findUniqueOrThrow({ where: { id: pago.paymentId } });
  assert.equal(p.status, "RECHAZADO");
  assert.ok(p.failureReason);
  assert.equal((await prisma.charge.findUniqueOrThrow({ where: { id: cargo.id } })).status, "PENDIENTE");
});

test("no hay certificado sin pago: un cargo vencido lo impide", async () => {
  const sufijo = String(Math.floor(Math.random() * 900000) + 100000);
  const empresa = await prisma.organization.create({
    data: {
      nit: `9017${sufijo}`, nitDv: "9", legalName: `Morosa ${sufijo} S.A.S.`,
      segment: "MIPYME", status: "ACTIVA",
      memberships: { create: [{ type: "ACTIVO", status: "VENCIDA", validFrom: new Date("2026-01-01") }] },
      charges: {
        create: [{
          concept: "Cuota", period: `2025-${sufijo}`,
          amount: new Prisma.Decimal("1000000"),
          dueDate: new Date("2025-01-15"), status: "VENCIDO",
        }],
      },
    },
  });

  assert.equal(await certificar.execute(empresa.id), null);
  assert.equal(await prisma.certificate.count({ where: { organizationId: empresa.id } }), 0);
});

test("reintentar la emisión no produce dos facturas", async () => {
  const { empresa, cargo } = await empresaConCuota();
  const pago = await iniciar.execute({
    organizationId: empresa.id, chargeIds: [cargo.id], returnUrl: "http://localhost/x", actor: ACTOR,
  });
  const { cuerpo, headers } = webhookFirmado({ reference: pago.reference, amount: "2450000" });
  await confirmar.execute(cuerpo, headers, CTX);

  await facturar.execute(pago.paymentId);
  await facturar.execute(pago.paymentId);
  await facturar.execute(pago.paymentId);

  assert.equal(await prisma.invoice.count({ where: { paymentId: pago.paymentId } }), 1);
});

test("emitir un certificado nuevo revoca el anterior", async () => {
  const { empresa } = await empresaConCuota();
  const primero = await certificar.execute(empresa.id);
  const segundo = await certificar.execute(empresa.id);

  assert.ok(primero && segundo && primero !== segundo);
  assert.equal(await prisma.certificate.count({ where: { organizationId: empresa.id, status: "VIGENTE" } }), 1);
  assert.equal(await prisma.certificate.count({ where: { organizationId: empresa.id, status: "REVOCADO" } }), 1);
});
