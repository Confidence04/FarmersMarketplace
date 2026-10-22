-- Security hardening for refresh-token rotation and 2FA recovery.
ALTER TABLE refresh_tokens ADD COLUMN revoked_at DATETIME;
ALTER TABLE refresh_tokens ADD COLUMN replaced_by INTEGER;

CREATE TABLE IF NOT EXISTS user_2fa_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  totp_secret TEXT NOT NULL,
  backup_codes TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

CREATE TABLE IF NOT EXISTS two_factor_recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_2fa_recovery_code_hash ON two_factor_recovery_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_2fa_recovery_user ON two_factor_recovery_codes(user_id, used_at);
