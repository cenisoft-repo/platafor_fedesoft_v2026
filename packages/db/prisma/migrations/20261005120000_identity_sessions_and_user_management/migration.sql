-- EPIC-02 · Identidad: sesiones de servidor, roles internos y gestión de
-- usuarios por empresa. Ver ADR-008.
--
-- Expand: columnas nuevas con valor por defecto y tablas nuevas. La única
-- restricción reemplazada (organization_users.role_id) se sustituye por una
-- más estricta sobre el mismo dato; si alguna empresa tuviera hoy un rol
-- interno asignado, el despliegue falla aquí en lugar de dejarlo pasar.

-- CreateEnum
CREATE TYPE "OrganizationUserStatus" AS ENUM ('INVITADO', 'ACTIVO', 'DESACTIVADO');

-- CreateEnum
CREATE TYPE "SessionChannel" AS ENUM ('PORTAL', 'CONSOLA');

-- DropForeignKey
ALTER TABLE "public"."organization_users" DROP CONSTRAINT "organization_users_role_id_fkey";

-- AlterTable
ALTER TABLE "organization_users" ADD COLUMN     "invite_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "invited_by_user_id" UUID,
ADD COLUMN     "role_internal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "OrganizationUserStatus" NOT NULL DEFAULT 'ACTIVO',
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "name" VARCHAR(200);

-- CreateTable
CREATE TABLE "user_internal_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "role_internal" BOOLEAN NOT NULL DEFAULT true,
    "granted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_internal_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "SessionChannel" NOT NULL,
    "organization_id" UUID,
    "mfa" BOOLEAN NOT NULL DEFAULT false,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "idle_timeout_sec" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" VARCHAR(60),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_flows" (
    "id" UUID NOT NULL,
    "state_hash" CHAR(64) NOT NULL,
    "channel" "SessionChannel" NOT NULL,
    "nonce" VARCHAR(128) NOT NULL,
    "code_verifier" VARCHAR(128) NOT NULL,
    "return_to" VARCHAR(300) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_flows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_internal_roles_role_id_idx" ON "user_internal_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_flows_state_hash_key" ON "auth_flows"("state_hash");

-- CreateIndex
CREATE INDEX "auth_flows_expires_at_idx" ON "auth_flows"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_id_internal_unique" ON "roles"("id", "internal");

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "org_users_external_role" FOREIGN KEY ("role_id", "role_internal") REFERENCES "roles"("id", "internal") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_internal_roles" ADD CONSTRAINT "user_internal_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_internal_roles" ADD CONSTRAINT "user_internal_roles_internal_role" FOREIGN KEY ("role_id", "role_internal") REFERENCES "roles"("id", "internal") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_member_of_org" FOREIGN KEY ("organization_id", "user_id") REFERENCES "organization_users"("organization_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───────────────────── Invariantes que el ORM no expresa ─────────────────────

-- Un rol interno de Fedesoft nunca se asigna dentro de una empresa, y un rol de
-- empresa nunca es rol interno. Con la clave compuesta hacia roles(id,
-- internal), esta constante es lo que lo hace imposible en la base: ni un
-- endpoint nuevo ni un script de soporte pueden saltárselo.
ALTER TABLE organization_users
  ADD CONSTRAINT organization_users_role_is_external CHECK (role_internal = false);
ALTER TABLE user_internal_roles
  ADD CONSTRAINT user_internal_roles_role_is_internal CHECK (role_internal = true);

-- Una invitación pendiente siempre vence.
ALTER TABLE organization_users
  ADD CONSTRAINT organization_users_invite_expires
  CHECK (status <> 'INVITADO' OR invite_expires_at IS NOT NULL);

-- La consola no opera dentro de una empresa y no admite sesión sin segundo
-- factor (RA-ACC-002). Si un error de código lo intentara, la base lo impide.
ALTER TABLE sessions
  ADD CONSTRAINT sessions_console_requires_mfa
  CHECK (channel <> 'CONSOLA' OR (mfa = true AND organization_id IS NULL));

ALTER TABLE sessions
  ADD CONSTRAINT sessions_valid_window
  CHECK (expires_at > created_at AND idle_timeout_sec > 0);

-- El correo es identidad: dos mayúsculas distintas no pueden ser dos cuentas.
-- NOT VALID: rige para toda fila nueva o modificada sin fallar el despliegue
-- por filas antiguas. Validarla (VALIDATE CONSTRAINT) es el paso "contract",
-- después de normalizar los correos existentes.
ALTER TABLE users
  ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email)) NOT VALID;
