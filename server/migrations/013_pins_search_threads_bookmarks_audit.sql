-- Migration 013: Message pinning, full-text search, threads, bookmarks, and audit log

-- 1. Message pinning — track pinned messages per channel
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(channel_id) WHERE pinned = TRUE;

-- 2. Full-text search index on message content
CREATE INDEX IF NOT EXISTS idx_messages_fts ON messages USING gin(to_tsvector('english', content));

-- 3. Threads — self-referencing thread parent
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES messages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id) WHERE thread_id IS NOT NULL;

-- 4. Saved messages / bookmarks
CREATE TABLE IF NOT EXISTS saved_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  channel_id VARCHAR(64) NOT NULL,
  server_id VARCHAR(64),
  saved_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_saved UNIQUE(user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_messages_user ON saved_messages(user_id, saved_at DESC);

-- 5. Audit log
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id VARCHAR(64) NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  target_id VARCHAR(255),
  changes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_server ON audit_logs(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(server_id, action);
