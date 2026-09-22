-- Ata el flujo de dinero a la empresa por estructura, no por criterio.
--
-- Antes, payment_charges tenía dos claves foráneas independientes y nada
-- exigía que el cargo perteneciera a la misma organización que el pago. El
-- caso de uso lo filtraba, pero un `if` en el servicio se salta desde el
-- siguiente endpoint que alguien escriba, y la consecuencia no es solo una
-- fuga de cartera: es una factura electrónica emitida al NIT equivocado.
--
-- También separa dos cosas que estaban mezcladas en `idempotency_key`:
--   · `reference`: la genera el servidor, es opaca, global y viaja a la
--     pasarela. Es por la que el webhook encuentra el pago.
--   · `idempotency_key`: la propone el cliente y ahora es única POR EMPRESA.
--     Global y bajo control del cliente, adivinar la clave de otra
--     organización habría devuelto su pago, y reservarlas en masa habría
--     sido una denegación de servicio.

ALTER TABLE "invoices"        DROP CONSTRAINT "invoices_payment_id_fkey";
ALTER TABLE "payment_charges" DROP CONSTRAINT "payment_charges_charge_id_fkey";
ALTER TABLE "payment_charges" DROP CONSTRAINT "payment_charges_payment_id_fkey";

DROP INDEX "payments_idempotency_key_key";

ALTER TABLE "payment_charges" ADD COLUMN "organization_id" UUID NOT NULL;
ALTER TABLE "payments"        ADD COLUMN "reference" VARCHAR(64) NOT NULL;

-- Pares que las claves compuestas necesitan poder referenciar.
CREATE UNIQUE INDEX "payments_id_org_unique" ON "payments"("id", "organization_id");
CREATE UNIQUE INDEX "charges_id_org_unique"  ON "charges"("id", "organization_id");
CREATE UNIQUE INDEX "invoices_payment_org_unique" ON "invoices"("payment_id", "organization_id");

CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");
CREATE UNIQUE INDEX "payments_organization_id_idempotency_key_key"
  ON "payments"("organization_id", "idempotency_key");
CREATE INDEX "payment_charges_organization_id_idx" ON "payment_charges"("organization_id");

-- El corazón del cambio: pago y cargo tienen que compartir organización.
ALTER TABLE "payment_charges" ADD CONSTRAINT "pc_payment_same_org"
  FOREIGN KEY ("payment_id", "organization_id")
  REFERENCES "payments"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_charges" ADD CONSTRAINT "pc_charge_same_org"
  FOREIGN KEY ("charge_id", "organization_id")
  REFERENCES "charges"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Y una factura no sale a nombre de una empresa distinta de la que pagó.
ALTER TABLE "invoices" ADD CONSTRAINT "invoice_payment_same_org"
  FOREIGN KEY ("payment_id", "organization_id")
  REFERENCES "payments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- La moneda del pago y la del cargo que salda tienen que ser la misma.
-- Sin esto, un cargo en COP podría saldarse con un pago en otra moneda y el
-- monto "coincidiría" numéricamente.
ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_cop_por_ahora"
  CHECK (currency = 'COP');
ALTER TABLE "charges"  ADD CONSTRAINT "charges_currency_cop_por_ahora"
  CHECK (currency = 'COP');
