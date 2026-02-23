-- Migration 010: Preserve DM channels when a user deletes their account
-- Changes participant FK behavior from CASCADE to SET NULL so DM threads persist

ALTER TABLE dm_channels DROP CONSTRAINT IF EXISTS dm_channels_participant_1_fkey;
ALTER TABLE dm_channels DROP CONSTRAINT IF EXISTS dm_channels_participant_2_fkey;

ALTER TABLE dm_channels ADD CONSTRAINT dm_channels_participant_1_fkey
  FOREIGN KEY (participant_1) REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE dm_channels ADD CONSTRAINT dm_channels_participant_2_fkey
  FOREIGN KEY (participant_2) REFERENCES accounts(id) ON DELETE SET NULL;

-- Drop constraints that don't work with NULL participants
ALTER TABLE dm_channels DROP CONSTRAINT IF EXISTS no_self_dm;
ALTER TABLE dm_channels DROP CONSTRAINT IF EXISTS unique_dm;
