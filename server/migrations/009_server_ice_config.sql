-- Add per-server ICE (STUN/TURN) configuration
-- NULL = use instance defaults from env vars
ALTER TABLE servers ADD COLUMN IF NOT EXISTS ice_config JSONB DEFAULT NULL;
