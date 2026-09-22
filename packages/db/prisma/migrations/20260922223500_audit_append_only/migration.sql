-- La auditoría es append-only. Decirlo en un comentario no lo impide: esto sí.
-- Un UPDATE o DELETE sobre audit_events falla en la base de datos, venga de
-- donde venga —una pantalla, un script, una consola de soporte—.

CREATE OR REPLACE FUNCTION fedesoft_audit_is_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_events es de solo adición: % no está permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION fedesoft_audit_is_append_only();

CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION fedesoft_audit_is_append_only();

-- Un solo período de afiliación abierto por empresa. Sin esto, dos filas con
-- valid_to nulo harían ambiguo el estado "vigente" del que cuelgan el
-- certificado y el acceso a los módulos de pago.
CREATE UNIQUE INDEX memberships_one_open_per_organization
  ON memberships (organization_id)
  WHERE valid_to IS NULL;

-- Una organización no puede tener dos certificados vigentes a la vez.
CREATE UNIQUE INDEX certificates_one_current_per_organization
  ON certificates (organization_id)
  WHERE status = 'VIGENTE';

-- Los montos son positivos. Un cargo o un pago en negativo es una nota
-- crédito, que es otra cosa y tendrá su propia tabla.
ALTER TABLE charges  ADD CONSTRAINT charges_amount_positive  CHECK (amount > 0);
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
ALTER TABLE payment_charges ADD CONSTRAINT payment_charges_amount_positive CHECK (amount > 0);

-- Un período de vigencia no puede terminar antes de empezar.
ALTER TABLE memberships
  ADD CONSTRAINT memberships_valid_range CHECK (valid_to IS NULL OR valid_to >= valid_from);
ALTER TABLE parameter_versions
  ADD CONSTRAINT parameter_versions_valid_range CHECK (valid_to IS NULL OR valid_to >= valid_from);

-- Una factura emitida sin CUFE no existe para la DIAN: el estado y el dato
-- tienen que contar la misma historia.
ALTER TABLE invoices
  ADD CONSTRAINT invoices_emitted_requires_cufe
  CHECK (status <> 'EMITIDA' OR (cufe IS NOT NULL AND number IS NOT NULL AND issued_at IS NOT NULL));

-- Un pago aprobado tiene referencia del proveedor y fecha de confirmación.
-- Es la barrera contra marcar un pago exitoso por respuesta del navegador.
ALTER TABLE payments
  ADD CONSTRAINT payments_approved_requires_confirmation
  CHECK (status <> 'APROBADO' OR (provider_reference IS NOT NULL AND confirmed_at IS NOT NULL));
