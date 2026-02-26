-- Add embeds column and widen webhook_avatar to support URLs
ALTER TABLE messages ADD COLUMN IF NOT EXISTS embeds JSONB DEFAULT '[]'::jsonb;
ALTER TABLE messages ALTER COLUMN webhook_avatar TYPE TEXT;
