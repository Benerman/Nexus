-- Add mentions JSONB column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS mentions JSONB DEFAULT '{}'::jsonb;
