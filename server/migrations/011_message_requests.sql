-- Migration 011: Message Request System
-- Adds a status column to dm_channels so non-friend DMs require acceptance

-- Add status to dm_channels: 'active' (friends/accepted), 'pending' (awaiting acceptance)
ALTER TABLE dm_channels ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Index for querying pending message requests
CREATE INDEX IF NOT EXISTS idx_dm_channels_status ON dm_channels(status);

-- Track who initiated the DM (needed for pending requests to know who to prompt)
ALTER TABLE dm_channels ADD COLUMN IF NOT EXISTS initiated_by UUID REFERENCES accounts(id) ON DELETE SET NULL;
