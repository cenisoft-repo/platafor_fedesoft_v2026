-- Identidad y sesión (ADR-008).
--
-- Fase de expansión: se añade todo lo nuevo y no se retira nada. La columna
-- users.auth_subject queda en su sitio aunque el código deje de usarla; su
-- eliminación va en una migración posterior, cuando nada la lea.
--
-- No hay relleno que hacer: ninguna ruta de código escribió nunca
-- auth_subject —la identidad federada nace con UserIdentity—, así que no
-- existe una fila que trasladar. Inventarle un emisor a un sujeto huérfano
-- sería peor que no migrarlo.

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVA', 'REVOCADA', 'EXPIRADA');

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "mfa_required" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "issuer" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "csrf_token_hash" CHAR(64) NOT NULL,
    "active_organization_id" UUID,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVA',
    "mfa_satisfied_at" TIMESTAMPTZ(6),
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" VARCHAR(120),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(300),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_transactions" (
    "id" UUID NOT NULL,
    "state_hash" CHAR(64) NOT NULL,
    "binding_hash" CHAR(64) NOT NULL,
    "nonce" VARCHAR(120) NOT NULL,
    "code_verifier" VARCHAR(200) NOT NULL,
    "return_to" VARCHAR(500) NOT NULL,
    "mfa_requested" BOOLEAN NOT NULL DEFAULT false,
    "consumed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_issuer_subject_key" ON "user_identities"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_status_idx" ON "sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_transactions_state_hash_key" ON "auth_transactions"("state_hash");

-- CreateIndex
CREATE INDEX "auth_transactions_expires_at_idx" ON "auth_transactions"("expires_at");

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_organization_id_fkey" FOREIGN KEY ("active_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────── Invariantes ───────────────────────────
-- Las reglas que no pueden depender de que el código se acuerde.

-- Una sesión no puede caducar antes de existir.
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_expires_after_issued"
  CHECK ("expires_at" > "issued_at");

-- Revocada exige el momento y el motivo: una sesión muerta sin explicación no
-- sirve para auditar. Y una sesión activa no puede llevar fecha de revocación.
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_revoked_is_explained"
  CHECK (
    ("status" <> 'REVOCADA' OR ("revoked_at" IS NOT NULL AND "revoked_reason" IS NOT NULL))
    AND ("status" <> 'ACTIVA' OR "revoked_at" IS NULL)
  );

-- Lo mismo para el intento de login: ventana corta y coherente.
ALTER TABLE "auth_transactions"
  ADD CONSTRAINT "auth_transactions_expires_after_created"
  CHECK ("expires_at" > "created_at");
