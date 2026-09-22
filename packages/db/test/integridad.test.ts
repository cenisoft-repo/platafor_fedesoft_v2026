/**
 * Pruebas de integridad del esquema.
 *
 * Verifican reglas no negociables del proyecto en el único sitio donde no se
 * pueden eludir: la base de datos. Un control que solo vive en el código de la
 * aplicación se salta con un script, una consola de soporte o un bug.
 *
 * Requieren una base real. En CI la levanta el servicio de Postgres.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

/** Ejecuta algo que debe fallar y devuelve el mensaje de error de Postgres. */
async function debeFallar(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return `${e.code} ${e.message}`;
    }
    return e instanceof Error ? e.message : String(e);
  }
  assert.fail("La operación debía fallar y pasó.");
}

async function empresaDePrueba(sufijo: string) {
  return prisma.organization.create({
    data: {
      nit: `9019${sufijo}`,
      nitDv: "1",
      legalName: `Prueba ${sufijo} S.A.S.`,
      segment: "MIPYME",
    },
  });
}

test.after(() => prisma.$disconnect());

test("la auditoría no se puede modificar ni borrar", async () => {
  const evento = await prisma.auditEvent.create({
    data: { actor: "prueba", action: "test.run", objectType: "Test" },
  });

  const alModificar = await debeFallar(() =>
    prisma.auditEvent.update({ where: { id: evento.id }, data: { action: "alterado" } }),
  );
  assert.match(alModificar, /solo adición/);

  const alBorrar = await debeFallar(() =>
    prisma.auditEvent.delete({ where: { id: evento.id } }),
  );
  assert.match(alBorrar, /solo adición/);
});

test("un cargo no puede tener monto negativo", async () => {
  const empresa = await empresaDePrueba("00010");
  const error = await debeFallar(() =>
    prisma.charge.create({
      data: {
        organizationId: empresa.id,
        concept: "Cuota",
        period: "2026",
        amount: new Prisma.Decimal(-1),
        dueDate: new Date("2026-12-31"),
      },
    }),
  );
  assert.match(error, /charges_amount_positive/);
});

test("una factura EMITIDA sin CUFE no entra", async () => {
  const empresa = await empresaDePrueba("00011");
  const pago = await prisma.payment.create({
    data: {
      organizationId: empresa.id,
      amount: new Prisma.Decimal(1000),
      provider: "prueba",
      idempotencyKey: `k-${empresa.id}`,
    },
  });

  const error = await debeFallar(() =>
    prisma.invoice.create({
      data: { organizationId: empresa.id, paymentId: pago.id, status: "EMITIDA" },
    }),
  );
  assert.match(error, /invoices_emitted_requires_cufe/);
});

test("un pago APROBADO exige confirmación del proveedor", async () => {
  const empresa = await empresaDePrueba("00012");
  const pago = await prisma.payment.create({
    data: {
      organizationId: empresa.id,
      amount: new Prisma.Decimal(1000),
      provider: "prueba",
      idempotencyKey: `k2-${empresa.id}`,
    },
  });

  const error = await debeFallar(() =>
    prisma.payment.update({ where: { id: pago.id }, data: { status: "APROBADO" } }),
  );
  assert.match(error, /payments_approved_requires_confirmation/);

  // Con referencia y fecha sí pasa: la regla no bloquea el camino legítimo.
  const aprobado = await prisma.payment.update({
    where: { id: pago.id },
    data: { status: "APROBADO", providerReference: "ref-1", confirmedAt: new Date() },
  });
  assert.equal(aprobado.status, "APROBADO");
});

test("la misma clave de idempotencia no crea dos pagos", async () => {
  const empresa = await empresaDePrueba("00013");
  const clave = `idem-${empresa.id}`;
  await prisma.payment.create({
    data: {
      organizationId: empresa.id,
      amount: new Prisma.Decimal(500),
      provider: "prueba",
      idempotencyKey: clave,
    },
  });

  const error = await debeFallar(() =>
    prisma.payment.create({
      data: {
        organizationId: empresa.id,
        amount: new Prisma.Decimal(500),
        provider: "prueba",
        idempotencyKey: clave,
      },
    }),
  );
  assert.match(error, /P2002/);
});

test("el mismo webhook del mismo proveedor entra una sola vez", async () => {
  await prisma.webhookDelivery.create({
    data: { provider: "prueba", eventId: "evt-1", signature: "firma", payload: {} },
  });

  const error = await debeFallar(() =>
    prisma.webhookDelivery.create({
      data: { provider: "prueba", eventId: "evt-1", signature: "firma", payload: {} },
    }),
  );
  assert.match(error, /P2002/);
});

test("una empresa no puede tener dos afiliaciones abiertas", async () => {
  const empresa = await empresaDePrueba("00014");
  await prisma.membership.create({
    data: {
      organizationId: empresa.id,
      type: "ACTIVO",
      status: "AL_DIA",
      validFrom: new Date("2026-01-01"),
    },
  });

  const error = await debeFallar(() =>
    prisma.membership.create({
      data: {
        organizationId: empresa.id,
        type: "ACTIVO",
        status: "AL_DIA",
        validFrom: new Date("2026-06-01"),
      },
    }),
  );
  // Prisma traduce el índice parcial a P2002 sobre organization_id; el nombre
  // del índice no llega al cliente, así que se verifica el efecto, no la etiqueta.
  assert.match(error, /P2002/);
  assert.match(error, /organization_id/);
});

test("scopeToOrganization no deja armar una consulta sin empresa", async () => {
  const { scopeToOrganization } = await import("../src/index.js");
  assert.throws(() => scopeToOrganization(undefined), /organizationId/);
  assert.throws(() => scopeToOrganization(""), /organizationId/);
  assert.deepEqual(scopeToOrganization("abc"), { organizationId: "abc" });
});
