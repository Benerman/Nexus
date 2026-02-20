-- Migration 008: Add token and avatar columns to webhooks table
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS token VARCHAR(64);
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS avatar VARCHAR(255);

-- Backfill existing webhooks with random tokens
UPDATE webhooks SET token = encode(gen_random_bytes(32), 'hex') WHERE token IS NULL;

-- Make token NOT NULL after backfill
ALTER TABLE webhooks ALTER COLUMN token SET NOT NULL;
