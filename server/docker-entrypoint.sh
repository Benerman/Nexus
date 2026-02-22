#!/bin/sh
set -e

echo "==================================="
echo "Nexus Server Initialization"
echo "==================================="

# Wait for PostgreSQL to be ready (with auth check and max retries)
echo "Waiting for PostgreSQL to be ready..."
PG_MAX_RETRIES=30
PG_RETRY=0
while [ "$PG_RETRY" -lt "$PG_MAX_RETRIES" ]; do
  PG_RETRY=$((PG_RETRY + 1))

  # First check if PostgreSQL is accepting connections at all
  if ! pg_isready -h "postgres" -U "postgres" -q 2>/dev/null; then
    echo "PostgreSQL is not accepting connections yet (attempt $PG_RETRY/$PG_MAX_RETRIES)"
    sleep 2
    continue
  fi

  # Verify password authentication and database access
  # Note: capture exit code manually; set -e would kill the script on psql failure
  if PG_OUTPUT=$(PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h "postgres" -U "postgres" -d "nexus_db" -c 'SELECT 1' 2>&1); then
    PG_EXIT=0
  else
    PG_EXIT=$?
  fi

  if [ "$PG_EXIT" -eq 0 ]; then
    echo "✓ PostgreSQL is ready!"
    break
  fi

  # Check for auth failure specifically — this won't resolve with retries
  if echo "$PG_OUTPUT" | grep -qi "password authentication failed"; then
    echo ""
    echo "ERROR: PostgreSQL password authentication failed!"
    echo "The POSTGRES_PASSWORD in .env does not match the password stored in the PostgreSQL volume."
    echo ""
    echo "To fix this, either:"
    echo "  1. Update POSTGRES_PASSWORD in .env to match the original password, or"
    echo "  2. Remove the volume and reinitialize: docker compose down -v && docker compose up -d --build"
    echo ""
    exit 1
  fi

  echo "PostgreSQL is unavailable (attempt $PG_RETRY/$PG_MAX_RETRIES)"
  sleep 2
done

if [ "$PG_RETRY" -ge "$PG_MAX_RETRIES" ]; then
  echo "ERROR: PostgreSQL did not become ready after $PG_MAX_RETRIES attempts"
  exit 1
fi

# Wait for Redis to be ready
echo "Waiting for Redis to be ready..."
REDIS_MAX_RETRIES=15
REDIS_RETRY=0
while [ "$REDIS_RETRY" -lt "$REDIS_MAX_RETRIES" ]; do
  REDIS_RETRY=$((REDIS_RETRY + 1))
  if redis-cli -h redis ping 2>/dev/null | grep -q PONG; then
    echo "✓ Redis is ready!"
    break
  fi
  echo "Redis is unavailable (attempt $REDIS_RETRY/$REDIS_MAX_RETRIES)"
  sleep 2
done

if [ "$REDIS_RETRY" -ge "$REDIS_MAX_RETRIES" ]; then
  echo "ERROR: Redis did not become ready after $REDIS_MAX_RETRIES attempts"
  exit 1
fi

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
