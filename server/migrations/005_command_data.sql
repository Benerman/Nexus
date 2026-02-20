-- Add command_data JSONB column to messages table for slash commands
ALTER TABLE messages ADD COLUMN IF NOT EXISTS command_data JSONB DEFAULT NULL;
