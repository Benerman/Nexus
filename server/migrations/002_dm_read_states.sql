-- ============================================================================
-- Migration: 002_dm_read_states
-- Description: Add unread count tracking for DM channels
-- ============================================================================

-- DM read states (track what messages users have seen)
CREATE TABLE IF NOT EXISTS dm_read_states (
  user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_read_states_user ON dm_read_states(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_read_states_channel ON dm_read_states(channel_id);

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- View to easily get unread counts per DM channel for a user
CREATE OR REPLACE VIEW dm_unread_counts AS
SELECT
  rs.user_id,
  rs.channel_id,
  rs.last_read_message_id,
  rs.last_read_at,
  COUNT(m.id) FILTER (WHERE m.created_at > COALESCE(rs.last_read_at, '1970-01-01'::timestamp) AND m.author_id != rs.user_id) as unread_count
FROM dm_read_states rs
LEFT JOIN dm_channels dc ON rs.channel_id = dc.id
LEFT JOIN messages m ON m.channel_id = dc.id::varchar
GROUP BY rs.user_id, rs.channel_id, rs.last_read_message_id, rs.last_read_at;
