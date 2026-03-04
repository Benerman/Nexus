-- AutoMod rules table
CREATE TABLE IF NOT EXISTS automod_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  rule_type VARCHAR(30) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  action VARCHAR(20) DEFAULT 'block',
  config JSONB DEFAULT '{}'::jsonb,
  exempt_roles JSONB DEFAULT '[]'::jsonb,
  exempt_channels JSONB DEFAULT '[]'::jsonb,
  timeout_duration INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automod_rules_server ON automod_rules(server_id);
