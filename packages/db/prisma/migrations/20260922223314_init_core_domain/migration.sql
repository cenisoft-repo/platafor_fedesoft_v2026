-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('MIPYME', 'GRANDE');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('PROSPECTO', 'ACTIVA', 'SUSPENDIDA', 'RETIRADA');

-- CreateEnum
CREATE TYPE "MembershipType" AS ENUM ('ACTIVO', 'ADHERENTE');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('AL_DIA', 'PENDIENTE', 'VENCIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDIENTE', 'PAGADO', 'VENCIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INICIADO', 'EN_PROCESO', 'APROBADO', 'RECHAZADO', 'REVERSADO');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('EN_PROCESO', 'EMITIDA', 'RECHAZADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('VIGENTE', 'REVOCADO');

-- CreateEnum
CREATE TYPE "AffiliationRequestStatus" AS ENUM ('NUEVA', 'EN_REVISION', 'INFO_SOLICITADA', 'APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVO', 'INVITADO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "ParameterScope" AS ENUM ('GLOBAL', 'SEGMENTO', 'ORGANIZACION');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDIENTE', 'PUBLICADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "nit" VARCHAR(15) NOT NULL,
    "nit_dv" CHAR(1) NOT NULL,
    "legal_name" VARCHAR(300) NOT NULL,
    "trade_name" VARCHAR(300),
    "segment" "Segment" NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PROSPECTO',
    "employees" INTEGER,
    "city" VARCHAR(120),
    "sector" VARCHAR(180),
    "website" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(40),
    "job_title" VARCHAR(180),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "auth_subject" VARCHAR(255),
    "status" "UserStatus" NOT NULL DEFAULT 'INVITADO',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "contact_id" UUID,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "MembershipType" NOT NULL,
    "status" "MembershipStatus" NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charges" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "concept" VARCHAR(240) NOT NULL,
    "period" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'COP',
    "due_date" DATE NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDIENTE',
    "parameter_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'COP',
    "provider" VARCHAR(40) NOT NULL,
    "provider_reference" VARCHAR(180),
    "status" "PaymentStatus" NOT NULL DEFAULT 'INICIADO',
    "idempotency_key" VARCHAR(120) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "failure_reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_charges" (
    "payment_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "payment_charges_pkey" PRIMARY KEY ("payment_id","charge_id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "number" VARCHAR(40),
    "cufe" VARCHAR(96),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'EN_PROCESO',
    "issued_at" TIMESTAMPTZ(6),
    "provider_payload" JSONB,
    "rejection_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "folio" VARCHAR(40) NOT NULL,
    "membership_snapshot" JSONB NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'VIGENTE',
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" DATE NOT NULL,
    "file_key" VARCHAR(400),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliation_requests" (
    "id" UUID NOT NULL,
    "filing_number" VARCHAR(30) NOT NULL,
    "nit" VARCHAR(15) NOT NULL,
    "nit_dv" CHAR(1) NOT NULL,
    "legal_name" VARCHAR(300) NOT NULL,
    "segment" "Segment" NOT NULL,
    "employees" INTEGER NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "sector" VARCHAR(180) NOT NULL,
    "website" VARCHAR(300),
    "contact_name" VARCHAR(200) NOT NULL,
    "contact_email" VARCHAR(320) NOT NULL,
    "contact_phone" VARCHAR(40) NOT NULL,
    "contact_role" VARCHAR(180) NOT NULL,
    "status" "AffiliationRequestStatus" NOT NULL DEFAULT 'NUEVA',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "consent_at" TIMESTAMPTZ(6),
    "consent_text" VARCHAR(120),
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "affiliation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parameters" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "description" VARCHAR(400) NOT NULL,
    "scope" "ParameterScope" NOT NULL DEFAULT 'GLOBAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parameter_versions" (
    "id" UUID NOT NULL,
    "parameter_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "value" JSONB NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "approved_by" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parameter_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_messages" (
    "id" UUID NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "aggregate_type" VARCHAR(60) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" VARCHAR(64),
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDIENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "event_id" VARCHAR(180) NOT NULL,
    "signature" VARCHAR(400) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "error" VARCHAR(500),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor" VARCHAR(240) NOT NULL,
    "actor_user_id" UUID,
    "organization_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "object_type" VARCHAR(60) NOT NULL,
    "object_id" VARCHAR(80),
    "metadata" JSONB,
    "ip_address" VARCHAR(64),
    "correlation_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_nit_key" ON "organizations"("nit");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE INDEX "organizations_segment_idx" ON "organizations"("segment");

-- CreateIndex
CREATE INDEX "contacts_organization_id_idx" ON "contacts"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_organization_id_email_key" ON "contacts"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_subject_key" ON "users"("auth_subject");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE INDEX "organization_users_user_id_idx" ON "organization_users"("user_id");

-- CreateIndex
CREATE INDEX "organization_users_organization_id_idx" ON "organization_users"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_users_organization_id_user_id_key" ON "organization_users"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "memberships_organization_id_valid_from_idx" ON "memberships"("organization_id", "valid_from");

-- CreateIndex
CREATE INDEX "memberships_status_idx" ON "memberships"("status");

-- CreateIndex
CREATE INDEX "charges_organization_id_status_idx" ON "charges"("organization_id", "status");

-- CreateIndex
CREATE INDEX "charges_due_date_idx" ON "charges"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "charges_organization_id_concept_period_key" ON "charges"("organization_id", "concept", "period");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_organization_id_status_idx" ON "payments"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_reference_key" ON "payments"("provider", "provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_payment_id_key" ON "invoices"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_cufe_key" ON "invoices"("cufe");

-- CreateIndex
CREATE INDEX "invoices_organization_id_status_idx" ON "invoices"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_folio_key" ON "certificates"("folio");

-- CreateIndex
CREATE INDEX "certificates_organization_id_status_idx" ON "certificates"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "affiliation_requests_filing_number_key" ON "affiliation_requests"("filing_number");

-- CreateIndex
CREATE INDEX "affiliation_requests_status_created_at_idx" ON "affiliation_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "affiliation_requests_nit_idx" ON "affiliation_requests"("nit");

-- CreateIndex
CREATE UNIQUE INDEX "parameters_key_key" ON "parameters"("key");

-- CreateIndex
CREATE INDEX "parameter_versions_parameter_id_valid_from_idx" ON "parameter_versions"("parameter_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "parameter_versions_parameter_id_version_key" ON "parameter_versions"("parameter_id", "version");

-- CreateIndex
CREATE INDEX "outbox_messages_status_available_at_idx" ON "outbox_messages"("status", "available_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_processed_at_idx" ON "webhook_deliveries"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_provider_event_id_key" ON "webhook_deliveries"("provider", "event_id");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_created_at_idx" ON "audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_object_type_object_id_idx" ON "audit_events"("object_type", "object_id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_parameter_version_id_fkey" FOREIGN KEY ("parameter_version_id") REFERENCES "parameter_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parameter_versions" ADD CONSTRAINT "parameter_versions_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "parameters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
