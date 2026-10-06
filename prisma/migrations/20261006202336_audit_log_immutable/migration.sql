-- AuditLog is append-only: reject UPDATE and DELETE (including from the application role).
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% not permitted)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- ShipmentEvent is the shipment timeline of record: also append-only.
CREATE TRIGGER shipment_event_no_update
  BEFORE UPDATE ON "ShipmentEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
