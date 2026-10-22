ALTER TABLE webhook_deliveries ADD COLUMN webhook_id TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN webhook_timestamp BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id_attempt
  ON webhook_deliveries(webhook_id, attempt);
