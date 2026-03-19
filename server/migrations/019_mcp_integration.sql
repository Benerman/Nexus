-- MCP Integration: bot tokens, bot accounts, MCP connections, agent configs
-- Bot tokens for MCP authentication
CREATE TABLE IF NOT EXISTS bot_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    scopes JSONB NOT NULL DEFAULT '["read", "write"]',
    server_ids JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_bot_tokens_token_hash ON bot_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_bot_tokens_account_id ON bot_tokens(account_id);
CREATE INDEX IF NOT EXISTS idx_bot_tokens_expires_at ON bot_tokens(expires_at);

-- Migration: rename token → token_hash for existing deployments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bot_tokens' AND column_name = 'token') THEN
    ALTER TABLE bot_tokens RENAME COLUMN token TO token_hash;
    -- Truncate existing plaintext tokens (they're now invalid anyway)
    DELETE FROM bot_tokens;
    DROP INDEX IF EXISTS idx_bot_tokens_token;
  END IF;
END $$;

-- Add is_bot flag to accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS bot_owner_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS bot_description TEXT DEFAULT '';

-- MCP server connections (external MCP servers connected to channels)
CREATE TABLE IF NOT EXISTS mcp_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id VARCHAR(64) NOT NULL,
    channel_id UUID,
    name VARCHAR(128) NOT NULL,
    transport VARCHAR(16) NOT NULL DEFAULT 'sse',
    server_url TEXT NOT NULL,
    auth_config TEXT DEFAULT '{}',
    enabled_tools JSONB DEFAULT '[]',
    enabled BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_connections_server_id ON mcp_connections(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_connections_channel_id ON mcp_connections(channel_id);

-- Migration: change auth_config from JSONB to TEXT for encrypted storage
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mcp_connections' AND column_name = 'auth_config' AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE mcp_connections ALTER COLUMN auth_config TYPE TEXT USING auth_config::TEXT;
    ALTER TABLE mcp_connections ALTER COLUMN auth_config SET DEFAULT '{}';
  END IF;
END $$;

-- Agent configurations per server
CREATE TABLE IF NOT EXISTS agent_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id VARCHAR(64) NOT NULL,
    bot_account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    system_prompt TEXT DEFAULT '',
    trigger_mode VARCHAR(32) NOT NULL DEFAULT 'mention',
    trigger_channels JSONB DEFAULT '[]',
    trigger_keywords JSONB DEFAULT '[]',
    mcp_connection_id UUID REFERENCES mcp_connections(id) ON DELETE SET NULL,
    max_response_length INTEGER DEFAULT 2000,
    created_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_configs_server_id ON agent_configs(server_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_bot_account_id ON agent_configs(bot_account_id);

-- Agent activity log
CREATE TABLE IF NOT EXISTS agent_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_config_id UUID REFERENCES agent_configs(id) ON DELETE CASCADE,
    server_id VARCHAR(64) NOT NULL,
    channel_id UUID,
    action VARCHAR(64) NOT NULL,
    input_summary TEXT,
    output_summary TEXT,
    tool_calls JSONB DEFAULT '[]',
    tokens_used INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_server_id ON agent_activity_log(server_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_created_at ON agent_activity_log(created_at);
