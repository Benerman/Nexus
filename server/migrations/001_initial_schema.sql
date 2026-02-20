-- Nexus Chat - Initial Database Schema
-- PostgreSQL 12+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ACCOUNTS & AUTHENTICATION
-- ============================================================================

-- User accounts
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(32) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  salt VARCHAR(32) NOT NULL,
  avatar VARCHAR(10) DEFAULT '🐺',
  custom_avatar TEXT,
  color VARCHAR(7) DEFAULT '#3B82F6',
  bio VARCHAR(128) DEFAULT '',
  status VARCHAR(10) DEFAULT 'online',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_accounts_username ON accounts(username);

-- Authentication tokens
CREATE TABLE tokens (
  token VARCHAR(64) PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  last_used TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tokens_account ON tokens(account_id);
CREATE INDEX idx_tokens_expiry ON tokens(expires_at);

-- ============================================================================
-- SERVERS & CHANNELS
-- ============================================================================

-- Servers
CREATE TABLE servers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(32) NOT NULL,
  icon VARCHAR(10) DEFAULT '⬡',
  custom_icon TEXT,
  description VARCHAR(256) DEFAULT '',
  owner_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_servers_owner ON servers(owner_id);

-- Server members (junction table)
CREATE TABLE server_members (
  server_id VARCHAR(64) NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  roles JSONB DEFAULT '["everyone"]'::jsonb,
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (server_id, account_id)
);

CREATE INDEX idx_server_members_account ON server_members(account_id);

-- Categories (channel groups)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id VARCHAR(64) NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(32) NOT NULL,
  position INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_categories_server ON categories(server_id);

-- Channels
CREATE TABLE channels (
  id VARCHAR(64) PRIMARY KEY,
  server_id VARCHAR(64) NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name VARCHAR(32) NOT NULL,
  type VARCHAR(10) NOT NULL, -- 'text' or 'voice'
  description VARCHAR(128) DEFAULT '',
  topic VARCHAR(256) DEFAULT '',
  position INT DEFAULT 0,
  is_private BOOLEAN DEFAULT FALSE,
  nsfw BOOLEAN DEFAULT FALSE,
  slow_mode INT DEFAULT 0,
  permission_overrides JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_channels_server ON channels(server_id);
CREATE INDEX idx_channels_category ON channels(category_id);

-- Roles
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id VARCHAR(64) NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(32) NOT NULL,
  color VARCHAR(7),
  position INT DEFAULT 0,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_roles_server ON roles(server_id);

-- ============================================================================
-- MESSAGES
-- ============================================================================

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id VARCHAR(64) NOT NULL,
  author_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  content TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  reactions JSONB DEFAULT '{}'::jsonb,
  is_webhook BOOLEAN DEFAULT FALSE,
  webhook_username VARCHAR(32),
  webhook_avatar VARCHAR(10),
  reply_to UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  edited_at TIMESTAMP
);

CREATE INDEX idx_messages_channel ON messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_author ON messages(author_id);

-- ============================================================================
-- DIRECT MESSAGES & SOCIAL
-- ============================================================================

-- DM channels
CREATE TABLE dm_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_1 UUID REFERENCES accounts(id) ON DELETE CASCADE,
  participant_2 UUID REFERENCES accounts(id) ON DELETE CASCADE,
  is_group BOOLEAN DEFAULT FALSE,
  name VARCHAR(64),
  created_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_dm UNIQUE(participant_1, participant_2),
  CONSTRAINT no_self_dm CHECK (participant_1 != participant_2 OR is_group = TRUE)
);

CREATE INDEX idx_dm_channels_p1 ON dm_channels(participant_1);
CREATE INDEX idx_dm_channels_p2 ON dm_channels(participant_2);

-- DM participants (for group DMs and efficient querying)
CREATE TABLE dm_participants (
  channel_id UUID NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX idx_dm_participants_user ON dm_participants(user_id);
CREATE INDEX idx_dm_participants_channel ON dm_participants(channel_id);

-- DM read states (tracks unread messages per user per channel)
CREATE TABLE dm_read_states (
  user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX idx_dm_read_states_user ON dm_read_states(user_id);
CREATE INDEX idx_dm_read_states_channel ON dm_read_states(channel_id);

-- Friendships (also handles blocking)
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'accepted', 'blocked'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_friendship UNIQUE(requester_id, addressee_id),
  CONSTRAINT no_self_friend CHECK (requester_id != addressee_id)
);

CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX idx_friendships_status ON friendships(status);

-- ============================================================================
-- WEBHOOKS & INVITES
-- ============================================================================

-- Webhooks
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id VARCHAR(64) NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name VARCHAR(32) NOT NULL,
  created_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhooks_channel ON webhooks(channel_id);

-- Server invites
CREATE TABLE invites (
  id VARCHAR(10) PRIMARY KEY,
  server_id VARCHAR(64) NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  created_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
  max_uses INT DEFAULT 0, -- 0 = unlimited
  uses INT DEFAULT 0,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_invites_server ON invites(server_id);
CREATE INDEX idx_invites_expiry ON invites(expires_at);

-- ============================================================================
-- REPORTS & MODERATION
-- ============================================================================

-- User reports
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  reported_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  report_type VARCHAR(20) NOT NULL, -- 'spam', 'harassment', 'inappropriate', 'other'
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'reviewed', 'actioned', 'dismissed'
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE INDEX idx_reports_reported ON reports(reported_id);
CREATE INDEX idx_reports_status ON reports(status);

-- Server bans (prevent rejoining)
CREATE TABLE server_bans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id VARCHAR(64) NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  banned_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(server_id, user_id)
);

CREATE INDEX idx_bans_server ON server_bans(server_id);
CREATE INDEX idx_bans_user ON server_bans(user_id);

-- Server timeouts (temporary mute)
CREATE TABLE server_timeouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id VARCHAR(64) NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  timeout_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
  duration_minutes INT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(server_id, user_id)
);

CREATE INDEX idx_timeouts_server ON server_timeouts(server_id);
CREATE INDEX idx_timeouts_user ON server_timeouts(user_id);
CREATE INDEX idx_timeouts_expiry ON server_timeouts(expires_at);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update trigger to relevant tables
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON servers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_friendships_updated_at BEFORE UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
