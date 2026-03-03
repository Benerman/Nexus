-- Recovery codes for password recovery
CREATE TABLE IF NOT EXISTS recovery_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  code_hash VARCHAR(255) NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_account ON recovery_codes(account_id);
