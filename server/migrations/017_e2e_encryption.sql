-- E2E Encryption support
-- Add public_key to accounts for X25519 key exchange
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS public_key TEXT;

-- Add encrypted flag to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE;
