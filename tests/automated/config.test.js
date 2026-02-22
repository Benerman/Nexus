/**
 * Tests for server/config.js — configuration module with env fallbacks.
 *
 * We can't test the production fail-fast (process.exit) branch easily,
 * but we can test the default (development) config structure and values.
 */

// Ensure we're in development mode for these tests
const originalEnv = { ...process.env };

// Env vars managed by these tests — deleted before each test so config.js
// picks up its hardcoded defaults instead of values from .env files.
const managedVars = [
  'NODE_ENV', 'PORT', 'LOG_LEVEL', 'DATABASE_URL', 'DATABASE_SSL',
  'REDIS_URL', 'CLIENT_URL', 'JWT_SECRET', 'SESSION_EXPIRY', 'REFRESH_EXPIRY',
  'MAX_MESSAGE_LENGTH', 'MAX_ATTACHMENTS', 'MAX_ATTACHMENT_SIZE',
  'ENABLE_GUEST_MODE', 'RATE_LIMIT_MESSAGES', 'RATE_LIMIT_WINDOW',
  'STUN_URLS', 'TURN_URL', 'TURN_SECRET',
];

function deleteManagedVars() {
  managedVars.forEach(v => delete process.env[v]);
}

// Absolute path to dotenv so jest.doMock can resolve it from the test dir
const dotenvPath = require.resolve('dotenv', {
  paths: [require('path').resolve(__dirname, '../../server')],
});

// Require config with a clean env: reset modules, delete managed vars,
// and stub dotenv so it doesn't re-inject .env file values during require.
function requireCleanConfig(envOverrides = {}) {
  jest.resetModules();
  deleteManagedVars();
  Object.assign(process.env, envOverrides);
  // Stub dotenv before requiring config so config.js's
  // require('dotenv').config() is a no-op
  jest.doMock(dotenvPath, () => ({ config: () => {} }));
  return require('../../server/config');
}

beforeEach(() => {
  deleteManagedVars();
  jest.resetModules();
});

afterAll(() => {
  // Restore original env
  Object.assign(process.env, originalEnv);
});

describe('config module structure', () => {
  test('exports all top-level sections', () => {
    const config = requireCleanConfig();
    expect(config).toHaveProperty('server');
    expect(config).toHaveProperty('database');
    expect(config).toHaveProperty('redis');
    expect(config).toHaveProperty('client');
    expect(config).toHaveProperty('security');
    expect(config).toHaveProperty('features');
    expect(config).toHaveProperty('rateLimit');
    expect(config).toHaveProperty('webrtc');
  });
});

describe('config.server defaults', () => {
  test('port defaults to 3001', () => {
    const config = requireCleanConfig();
    expect(config.server.port).toBe(3001);
  });

  test('env defaults to development', () => {
    const config = requireCleanConfig();
    expect(config.server.env).toBe('development');
  });

  test('logLevel defaults to info', () => {
    const config = requireCleanConfig();
    expect(config.server.logLevel).toBe('info');
  });

  test('port uses PORT env var', () => {
    const config = requireCleanConfig({ PORT: '4000' });
    expect(config.server.port).toBe(4000);
  });
});

describe('config.database defaults', () => {
  test('ssl defaults to false', () => {
    const config = requireCleanConfig();
    expect(config.database.ssl).toBe(false);
  });

  test('url has a default postgresql connection string', () => {
    const config = requireCleanConfig();
    expect(config.database.url).toContain('postgresql://');
    expect(config.database.url).toContain('nexus_db');
  });
});

describe('config.security defaults', () => {
  test('jwtSecret defaults to dev-secret-key', () => {
    const config = requireCleanConfig();
    expect(config.security.jwtSecret).toBe('dev-secret-key');
  });

  test('sessionExpiry defaults to 7 days in ms', () => {
    const config = requireCleanConfig();
    expect(config.security.sessionExpiry).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('refreshExpiry defaults to 30 days in ms', () => {
    const config = requireCleanConfig();
    expect(config.security.refreshExpiry).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('config.features defaults', () => {
  test('maxMessageLength defaults to 2000', () => {
    const config = requireCleanConfig();
    expect(config.features.maxMessageLength).toBe(2000);
  });

  test('maxAttachments defaults to 4', () => {
    const config = requireCleanConfig();
    expect(config.features.maxAttachments).toBe(4);
  });

  test('maxAttachmentSize defaults to 10MB', () => {
    const config = requireCleanConfig();
    expect(config.features.maxAttachmentSize).toBe(10 * 1024 * 1024);
  });

  test('enableGuestMode defaults to false', () => {
    const config = requireCleanConfig();
    expect(config.features.enableGuestMode).toBe(false);
  });

  test('enableGuestMode reads from env', () => {
    const config = requireCleanConfig({ ENABLE_GUEST_MODE: 'true' });
    expect(config.features.enableGuestMode).toBe(true);
  });
});

describe('config.rateLimit defaults', () => {
  test('messages defaults to 10', () => {
    const config = requireCleanConfig();
    expect(config.rateLimit.messages).toBe(10);
  });

  test('window defaults to 10000ms', () => {
    const config = requireCleanConfig();
    expect(config.rateLimit.window).toBe(10000);
  });
});

describe('config.webrtc defaults', () => {
  test('stunUrls is an array of STUN servers', () => {
    const config = requireCleanConfig();
    expect(Array.isArray(config.webrtc.stunUrls)).toBe(true);
    expect(config.webrtc.stunUrls.length).toBeGreaterThanOrEqual(1);
    expect(config.webrtc.stunUrls[0]).toContain('stun:');
  });

  test('turnUrl defaults to empty string', () => {
    const config = requireCleanConfig();
    expect(config.webrtc.turnUrl).toBe('');
  });

  test('turnSecret defaults to empty string', () => {
    const config = requireCleanConfig();
    expect(config.webrtc.turnSecret).toBe('');
  });
});

describe('config.redis defaults', () => {
  test('url defaults to redis://localhost:6379', () => {
    const config = requireCleanConfig();
    expect(config.redis.url).toBe('redis://localhost:6379');
  });
});

describe('config.client defaults', () => {
  test('url defaults to http://localhost:3000', () => {
    const config = requireCleanConfig();
    expect(config.client.url).toBe('http://localhost:3000');
  });
});
