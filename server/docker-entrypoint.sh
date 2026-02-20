#!/bin/sh
set -e

echo "==================================="
echo "Nexus Server Initialization"
echo "==================================="

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h "postgres" -U "postgres" -d "nexus_db" -c '\q' 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "✓ PostgreSQL is ready!"

# Wait for Redis to be ready
echo "Waiting for Redis to be ready..."
until redis-cli -h redis ping 2>/dev/null; do
  echo "Redis is unavailable - sleeping"
  sleep 2
done

echo "✓ Redis is ready!"

# Check if database is initialized
echo "Checking database initialization..."
TABLE_EXISTS=$(PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h "postgres" -U "postgres" -d "nexus_db" -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts');")

if [ "$TABLE_EXISTS" = "f" ]; then
  echo "Database not initialized. Running migrations..."
  PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h "postgres" -U "postgres" -d "nexus_db" -f /app/migrations/001_initial_schema.sql
  echo "✓ Database migrations completed!"
else
  echo "✓ Database already initialized"
fi

# Run incremental migrations (safe to run repeatedly)
echo "Running incremental migrations..."
PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h "postgres" -U "postgres" -d "nexus_db" -c "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;" 2>/dev/null || true
PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h "postgres" -U "postgres" -d "nexus_db" -c "
CREATE TABLE IF NOT EXISTS soundboard_sounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id VARCHAR(64) NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(32) NOT NULL,
  emoji VARCHAR(10) DEFAULT '🔊',
  original_audio TEXT NOT NULL,
  trimmed_audio TEXT NOT NULL,
  trim_start REAL DEFAULT 0,
  trim_end REAL DEFAULT 0,
  duration REAL DEFAULT 0,
  created_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_soundboard_server ON soundboard_sounds(server_id);
" 2>/dev/null || true
PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h "postgres" -U "postgres" -d "nexus_db" -c "
ALTER TABLE soundboard_sounds ADD COLUMN IF NOT EXISTS volume REAL DEFAULT 1.0;
ALTER TABLE soundboard_sounds ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;
" 2>/dev/null || true
PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h "postgres" -U "postgres" -d "nexus_db" -c "
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intro_sound TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exit_sound TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intro_sound_original TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exit_sound_original TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intro_sound_trim_start REAL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intro_sound_trim_end REAL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intro_sound_duration REAL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exit_sound_trim_start REAL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exit_sound_trim_end REAL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exit_sound_duration REAL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intro_sound_volume REAL DEFAULT 100;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exit_sound_volume REAL DEFAULT 100;
" 2>/dev/null || true
PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h "postgres" -U "postgres" -d "nexus_db" -f /app/migrations/008_webhook_token.sql 2>/dev/null || true
PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h "postgres" -U "postgres" -d "nexus_db" -f /app/migrations/009_server_ice_config.sql 2>/dev/null || true
echo "✓ Migrations complete"

# Clean up expired tokens on startup
echo "Performing startup maintenance..."

echo "==================================="
echo "Starting Nexus Server..."
echo "==================================="

# Start the Node.js application
exec node index.js
