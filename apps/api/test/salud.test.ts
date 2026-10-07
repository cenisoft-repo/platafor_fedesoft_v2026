/**
 * Las sondas deciden si una réplica recibe tráfico. El orquestador mira el
 * código HTTP, no el cuerpo: sin base, la sonda de disponibilidad debe
 * fallar con 503, o el balanceador seguirá enviando peticiones condenadas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "reflect-metadata";
import type { Response } from "express";
import { HealthController } from "../src/health/health.controller.js";
import type { PrismaService } from "../src/prisma/prisma.service.js";

function respuesta() {
  const r = { codigo: 200, status(c: number) { r.codigo = c; return r; } };
  return r;
}

test("ready: con base responde ok y deja el 200", async () => {
  const prisma = { $queryRaw: async () => [{ "?column?": 1 }] } as unknown as PrismaService;
  const res = respuesta();
  const cuerpo = await new HealthController(prisma).ready(res as unknown as Response);
  assert.deepEqual(cuerpo, { status: "ok", database: true });
  assert.equal(res.codigo, 200);
});

test("ready: sin base responde 503 y no filtra el motivo", async () => {
  const prisma = {
    $queryRaw: async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password authentication failed");
    },
  } as unknown as PrismaService;
  const res = respuesta();
  const cuerpo = await new HealthController(prisma).ready(res as unknown as Response);
  assert.equal(res.codigo, 503);
  assert.deepEqual(cuerpo, { status: "degraded", database: false });
  assert.doesNotMatch(JSON.stringify(cuerpo), /ECONNREFUSED|password|10\.0\.0\.5/);
});
