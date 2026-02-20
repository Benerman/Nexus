-- ============================================================================
-- Migration: 003_group_dms
-- Description: Add support for group DMs (3+ participants)
-- ============================================================================

-- Add group DM support to dm_channels
ALTER TABLE dm_channels ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE;
ALTER TABLE dm_channels ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE dm_channels ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Drop the unique constraint on 1-on-1 DMs since it won't work for group DMs
ALTER TABLE dm_channels DROP CONSTRAINT IF EXISTS unique_dm;

-- DM participants junction table (for group DMs with 3+ participants)
CREATE TABLE IF NOT EXISTS dm_participants (
  channel_id UUID NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_participants_channel ON dm_participants(channel_id);
CREATE INDEX IF NOT EXISTS idx_dm_participants_user ON dm_participants(user_id);

-- Migrate existing 1-on-1 DMs to use the participants table
INSERT INTO dm_participants (channel_id, user_id, joined_at)
SELECT id, participant_1, created_at FROM dm_channels
ON CONFLICT DO NOTHING;

INSERT INTO dm_participants (channel_id, user_id, joined_at)
SELECT id, participant_2, created_at FROM dm_channels
ON CONFLICT DO NOTHING;
