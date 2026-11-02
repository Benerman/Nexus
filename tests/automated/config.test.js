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
  'NODE_ENV', 'PORT', 'LOG_LEVEL', 'DATABASE_URL', 'DATABASE_SSL', 'POSTGRES_PASSWORD',
  'REDIS_URL', 'CLIENT_URL', 'JWT_SECRET', 'SESSION_EXPIRY', 'REFRESH_EXPIRY',
  'MAX_MESSAGE_LENGTH', 'MAX_ATTACHMENTS', 'MAX_ATTACHMENT_SIZE',
  'ENABLE_GUEST_MODE', 'RATE_LIMIT_MESSAGES', 'RATE_LIMIT_WINDOW',
  'STUN_URLS', 'TURN_URL', 'TURN_SECRET',
  'PLATFORM_ADMIN',
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

describe('config.admin defaults', () => {
  test('admin section exists', () => {
    const config = requireCleanConfig();
    expect(config).toHaveProperty('admin');
  });

  test('platformAdminUsername defaults to empty string', () => {
    const config = requireCleanConfig();
    expect(config.admin.platformAdminUsername).toBe('');
  });

  test('reads from PLATFORM_ADMIN env var', () => {
    const config = requireCleanConfig({ PLATFORM_ADMIN: 'superadmin' });
    expect(config.admin.platformAdminUsername).toBe('superadmin');
  });

  test('preserves case from env var', () => {
    const config = requireCleanConfig({ PLATFORM_ADMIN: 'AdminUser' });
    expect(config.admin.platformAdminUsername).toBe('AdminUser');
  });
});

describe('production fail-fast checks', () => {
  const prodSecrets = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-real-production-secret',
    DATABASE_URL: 'postgresql://user:pw@db:5432/nexus_db',
    POSTGRES_PASSWORD: 'pw',
  };

  let exitSpy;
  let errorSpy;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('exits when all required secrets are missing in production', () => {
    requireCleanConfig({ NODE_ENV: 'production' });
    expect(exitSpy).toHaveBeenCalledWith(1);
    const message = errorSpy.mock.calls[0][0];
    expect(message).toContain('Missing required environment variables for production');
    expect(message).toContain('JWT_SECRET');
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('POSTGRES_PASSWORD');
  });

  test('names only the secrets that are actually missing', () => {
    const { JWT_SECRET, ...rest } = prodSecrets;
    requireCleanConfig(rest);
    expect(exitSpy).toHaveBeenCalledWith(1);
    const message = errorSpy.mock.calls[0][0];
    expect(message).toContain('JWT_SECRET');
    expect(message).not.toContain('DATABASE_URL');
    expect(message).not.toContain('POSTGRES_PASSWORD');
  });

  test('exits when production still uses the default JWT_SECRET', () => {
    requireCleanConfig({ ...prodSecrets, JWT_SECRET: 'dev-secret-key' });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'JWT_SECRET must be changed from default value in production'
    );
  });

  test('starts up cleanly when production secrets are all set', () => {
    const config = requireCleanConfig(prodSecrets);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(config.server.env).toBe('production');
    expect(config.security.jwtSecret).toBe('a-real-production-secret');
  });

  test('skips the fail-fast checks outside production', () => {
    requireCleanConfig({ NODE_ENV: 'development' });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
