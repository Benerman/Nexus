const { spawn, execSync } = require('child_process');
const path = require('path');

/**
 * Apply schema patches for columns/tables that exist in production but are
 * missing from the checked-in migration files. This keeps the test DB in
 * sync with what the server code actually expects.
 */
async function applySchemaPatches(databaseUrl) {
  if (!databaseUrl) return;
  try {
    const { Pool } = require(path.resolve(__dirname, '../../../server/node_modules/pg'));
    const pool = new Pool({ connectionString: databaseUrl });
    await pool.query(`
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS settings JSONB;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intro_sound BYTEA;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exit_sound BYTEA;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intro_sound_original BYTEA;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exit_sound_original BYTEA;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intro_sound_trim_start INT;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intro_sound_trim_end INT;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intro_sound_duration FLOAT;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exit_sound_trim_start INT;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exit_sound_trim_end INT;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exit_sound_duration FLOAT;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS intro_sound_volume FLOAT;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS exit_sound_volume FLOAT;
      ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS avatar VARCHAR(255);
      ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS token VARCHAR(255);
      CREATE TABLE IF NOT EXISTS soundboard_sounds (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        server_id VARCHAR(64) NOT NULL,
        name VARCHAR(32) NOT NULL,
        emoji VARCHAR(10),
        original_audio BYTEA,
        trimmed_audio BYTEA,
        trim_start FLOAT,
        trim_end FLOAT,
        duration FLOAT,
        volume FLOAT DEFAULT 1.0,
        is_global BOOLEAN DEFAULT FALSE,
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.end();
    console.log('Schema patches applied successfully');
  } catch (err) {
    console.warn('Schema patch warning (non-fatal):', err.message);
  }
}

async function pollHealth(url, maxAttempts = 30, intervalMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') {
          console.log(`Server healthy after ${i + 1} attempt(s)`);
          return true;
        }
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Server at ${url} did not become healthy after ${maxAttempts} attempts`);
}

module.exports = async function globalSetup() {
  const serverUrl = process.env.SERVER_URL;

  if (serverUrl) {
    // CI mode: server is already running, just wait for health
    console.log(`Waiting for external server at ${serverUrl}...`);
    await pollHealth(serverUrl);
    // Apply schema patches (CI provides DATABASE_URL)
    if (process.env.DATABASE_URL) {
      await applySchemaPatches(process.env.DATABASE_URL);
    }
    globalThis.__SERVER_URL__ = serverUrl;
    return;
  }

  // Local mode: spawn the server process
  const port = 4444;
  const serverDir = path.resolve(__dirname, '../../../server');
  const localUrl = `http://localhost:${port}`;

  console.log(`Starting local server on port ${port}...`);

  const serverProcess = spawn('node', ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      JWT_SECRET: 'integration-test-secret-key-do-not-use-in-prod',
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/nexus_test_db',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  serverProcess.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[server] ${line}`);
  });

  serverProcess.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[server:err] ${line}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });

  await pollHealth(localUrl);

  // Apply schema patches for missing columns/tables
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/nexus_test_db';
  await applySchemaPatches(dbUrl);

  globalThis.__SERVER_URL__ = localUrl;
  globalThis.__SERVER_PID__ = serverProcess.pid;
  // Store for teardown
  process.env.__INTEGRATION_SERVER_PID__ = String(serverProcess.pid);
  process.env.__INTEGRATION_SERVER_URL__ = localUrl;
};
