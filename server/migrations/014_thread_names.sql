-- Add thread_name column to messages for named threads
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_name VARCHAR(100);
