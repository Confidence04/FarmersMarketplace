DROP INDEX IF EXISTS idx_webhook_deliveries_webhook_id_attempt;
ALTER TABLE webhook_deliveries DROP COLUMN webhook_timestamp;
ALTER TABLE webhook_deliveries DROP COLUMN webhook_id;
