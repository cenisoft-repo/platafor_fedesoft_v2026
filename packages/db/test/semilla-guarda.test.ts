/**
 * La guarda de la semilla sintética (prisma/seed-guard.ts). No necesita base:
 * decide solo con el entorno que recibe. Es lo único que separa una semilla con
 * usuarios de contraseña pública de un entorno real, así que cada rechazo y cada
 * caso permitido está escrito a mano.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { evaluarEntornoSemilla, hostDeLaBase } from "../prisma/seed-guard.js";

const LOCAL = "postgresql://fedesoft:fedesoft_ci@localhost:5432/fedesoft_test?schema=public";
const REMOTA = "postgresql://usuario:clave-secreta@db.ejemplo.test:5432/fedesoft?schema=public";

const permite = (env: Parameters<typeof evaluarEntornoSemilla>[0]) => evaluarEntornoSemilla(env).permitida;
const motivo = (env: Parameters<typeof evaluarEntornoSemilla>[0]) => {
  const v = evaluarEntornoSemilla(env);
  assert.equal(v.permitida, false);
  return v.permitida ? "" : v.motivo;
};

test("corre en desarrollo y pruebas contra una base local o de CI", () => {
  for (const NODE_ENV of [undefined, "", "development", "test"]) {
    for (const DATABASE_URL of [
      LOCAL, // el CI
      "postgresql://u:p@127.0.0.1:5498/x?schema=public",
      "postgresql://u:p@[::1]:5432/x",
      "postgresql://u:p@postgres:5432/fedesoft_dev?schema=public", // servicio de compose
      "postgresql://u:p@LOCALHOST:5432/x",
      "postgresql://u@localhost/x?host=/var/run/postgresql",
      "postgres://u:p@localhost:5432/x",
    ]) {
      assert.equal(permite({ NODE_ENV, DATABASE_URL }), true, `${NODE_ENV ?? "(sin NODE_ENV)"} · ${DATABASE_URL}`);
    }
  }
});

test("se niega con NODE_ENV=production en cualquier forma, aunque la base sea local y esté el permiso", () => {
  for (const NODE_ENV of ["production", "Production", "PRODUCTION", " production ", "prod"]) {
    assert.match(motivo({ NODE_ENV, DATABASE_URL: LOCAL }), /production/i, NODE_ENV);
    assert.match(motivo({ NODE_ENV, DATABASE_URL: LOCAL, ALLOW_SYNTHETIC_SEED: "1" }), /production/i, NODE_ENV);
  }
});

test("se niega con cualquier NODE_ENV que no sea development o test", () => {
  for (const NODE_ENV of ["staging", "preview", "qa", "demo", "uat"]) {
    assert.match(motivo({ NODE_ENV, DATABASE_URL: LOCAL }), new RegExp(`NODE_ENV=${NODE_ENV}`), NODE_ENV);
  }
});

test("se niega con una base remota o ilegible, y dice por qué", () => {
  assert.match(motivo({ NODE_ENV: "test", DATABASE_URL: REMOTA }), /db\.ejemplo\.test/);
  assert.match(motivo({ NODE_ENV: "development", DATABASE_URL: "postgresql://u:p@10.0.0.5:5432/x" }), /10\.0\.0\.5/);
  assert.match(motivo({ NODE_ENV: "test" }), /DATABASE_URL/);
  assert.match(motivo({ NODE_ENV: "test", DATABASE_URL: "" }), /DATABASE_URL/);
  assert.match(motivo({ NODE_ENV: "test", DATABASE_URL: "no es una url" }), /DATABASE_URL/);
  assert.match(motivo({ NODE_ENV: "test", DATABASE_URL: "mysql://u:p@localhost/x" }), /DATABASE_URL/);
});

test("no se deja engañar por nombres que empiezan o contienen localhost", () => {
  for (const host of ["localhost.evil.test", "127.0.0.1.evil.test", "mylocalhost", "postgres.interno.test", "evil.test"]) {
    assert.equal(permite({ NODE_ENV: "test", DATABASE_URL: `postgresql://u:p@${host}:5432/x` }), false, host);
  }
  /* El usuario de la URL no es el host: `localhost@evil.test` va a evil.test. */
  assert.equal(hostDeLaBase("postgresql://localhost@evil.test:5432/x"), "evil.test");
  assert.equal(permite({ NODE_ENV: "test", DATABASE_URL: "postgresql://localhost@evil.test:5432/x" }), false);
  /* Ni la base llamada localhost, ni el parámetro host que no es un socket. */
  assert.equal(permite({ NODE_ENV: "test", DATABASE_URL: "postgresql://u:p@evil.test/localhost" }), false);
  assert.equal(permite({ NODE_ENV: "test", DATABASE_URL: "postgresql://u:p@evil.test/x?host=localhost" }), false);
});

test("ALLOW_SYNTHETIC_SEED=1 autoriza un entorno remoto que no es producción; otros valores no cuentan", () => {
  assert.equal(permite({ NODE_ENV: "staging", DATABASE_URL: REMOTA, ALLOW_SYNTHETIC_SEED: "1" }), true);
  assert.equal(permite({ NODE_ENV: "test", DATABASE_URL: REMOTA, ALLOW_SYNTHETIC_SEED: "1" }), true);
  for (const valor of ["true", "yes", "0", "", " 1", "1 ", "si"]) {
    assert.equal(permite({ NODE_ENV: "staging", DATABASE_URL: REMOTA, ALLOW_SYNTHETIC_SEED: valor }), false, JSON.stringify(valor));
  }
});

test("el motivo nunca incluye la URL de la base ni su contraseña", () => {
  const textos = [
    motivo({ NODE_ENV: "test", DATABASE_URL: REMOTA }),
    motivo({ NODE_ENV: "staging", DATABASE_URL: REMOTA }),
    motivo({ NODE_ENV: "production", DATABASE_URL: REMOTA }),
  ];
  for (const t of textos) {
    assert.ok(!t.includes("clave-secreta"), t);
    assert.ok(!t.includes("usuario:"), t);
    assert.ok(!t.includes("postgresql://"), t);
  }
});
