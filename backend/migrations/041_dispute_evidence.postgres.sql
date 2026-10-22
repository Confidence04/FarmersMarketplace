-- FE-13: Evidence files submitted by either party on a disputed escrow order (PostgreSQL).
-- The file is stored off chain; its SHA-256 is submitted to the escrow contract
-- via submit_evidence() and the resulting tx is tracked here.

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id SERIAL PRIMARY KEY,
  dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  submitted_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  party TEXT NOT NULL CHECK (party IN ('buyer', 'farmer')),
  file_url TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  sha256 TEXT NOT NULL,
  tx_status TEXT NOT NULL DEFAULT 'pending' CHECK (tx_status IN ('pending', 'confirmed', 'failed', 'skipped')),
  tx_hash TEXT,
  tx_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute_id ON dispute_evidence(dispute_id);
