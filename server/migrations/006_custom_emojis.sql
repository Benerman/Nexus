-- Custom emoji support
CREATE TABLE IF NOT EXISTS custom_emojis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id VARCHAR(64) NOT NULL,
  name VARCHAR(32) NOT NULL,
  image_data TEXT NOT NULL,
  content_type VARCHAR(32) DEFAULT 'image/png',
  animated BOOLEAN DEFAULT FALSE,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ce_server ON custom_emojis(server_id);

-- Add emoji_sharing column to servers
ALTER TABLE servers ADD COLUMN IF NOT EXISTS emoji_sharing BOOLEAN DEFAULT FALSE;
