/**
 * Tests for server/config.js — configuration module with env fallbacks.
 *
 * We can't test the production fail-fast (process.exit) branch easily,
 * but we can test the default (development) config structure and values.
 */

// Ensure we're in development mode for these tests
const originalEnv = { ...process.env };

beforeEach(() => {
  // Reset relevant env vars to test defaults
  delete process.env.NODE_ENV;
  delete process.env.PORT;
  delete process.env.LOG_LEVEL;
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_SSL;
  delete process.env.REDIS_URL;
  delete process.env.CLIENT_URL;
  delete process.env.JWT_SECRET;
  delete process.env.SESSION_EXPIRY;
  delete process.env.REFRESH_EXPIRY;
  delete process.env.MAX_MESSAGE_LENGTH;
  delete process.env.MAX_ATTACHMENTS;
  delete process.env.MAX_ATTACHMENT_SIZE;
  delete process.env.ENABLE_GUEST_MODE;
  delete process.env.RATE_LIMIT_MESSAGES;
  delete process.env.RATE_LIMIT_WINDOW;
  delete process.env.STUN_URLS;
  delete process.env.TURN_URL;
  delete process.env.TURN_SECRET;

  // Clear cached module so it re-evaluates
  jest.resetModules();
});

afterAll(() => {
  // Restore original env
  Object.assign(process.env, originalEnv);
});

describe('config module structure', () => {
  test('exports all top-level sections', () => {
    const config = require('../../server/config');
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
    const config = require('../../server/config');
    expect(config.server.port).toBe(3001);
  });

  test('env defaults to development', () => {
    const config = require('../../server/config');
    expect(config.server.env).toBe('development');
  });

  test('logLevel defaults to info', () => {
    const config = require('../../server/config');
    expect(config.server.logLevel).toBe('info');
  });

  test('port uses PORT env var', () => {
    process.env.PORT = '4000';
    const config = require('../../server/config');
    expect(config.server.port).toBe(4000);
  });
});

describe('config.database defaults', () => {
  test('ssl defaults to false', () => {
    const config = require('../../server/config');
    expect(config.database.ssl).toBe(false);
  });

  test('url has a default postgresql connection string', () => {
    const config = require('../../server/config');
    expect(config.database.url).toContain('postgresql://');
    expect(config.database.url).toContain('nexus_db');
  });
});

describe('config.security defaults', () => {
  test('jwtSecret defaults to dev-secret-key', () => {
    const config = require('../../server/config');
    expect(config.security.jwtSecret).toBe('dev-secret-key');
  });

  test('sessionExpiry defaults to 7 days in ms', () => {
    const config = require('../../server/config');
    expect(config.security.sessionExpiry).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('refreshExpiry defaults to 30 days in ms', () => {
    const config = require('../../server/config');
    expect(config.security.refreshExpiry).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('config.features defaults', () => {
  test('maxMessageLength defaults to 2000', () => {
    const config = require('../../server/config');
    expect(config.features.maxMessageLength).toBe(2000);
  });

  test('maxAttachments defaults to 4', () => {
    const config = require('../../server/config');
    expect(config.features.maxAttachments).toBe(4);
  });

  test('maxAttachmentSize defaults to 10MB', () => {
    const config = require('../../server/config');
    expect(config.features.maxAttachmentSize).toBe(10 * 1024 * 1024);
  });

  test('enableGuestMode defaults to false', () => {
    const config = require('../../server/config');
    expect(config.features.enableGuestMode).toBe(false);
  });

  test('enableGuestMode reads from env', () => {
    process.env.ENABLE_GUEST_MODE = 'true';
    const config = require('../../server/config');
    expect(config.features.enableGuestMode).toBe(true);
  });
});

describe('config.rateLimit defaults', () => {
  test('messages defaults to 10', () => {
    const config = require('../../server/config');
    expect(config.rateLimit.messages).toBe(10);
  });

  test('window defaults to 10000ms', () => {
    const config = require('../../server/config');
    expect(config.rateLimit.window).toBe(10000);
  });
});

describe('config.webrtc defaults', () => {
  test('stunUrls is an array of STUN servers', () => {
    const config = require('../../server/config');
    expect(Array.isArray(config.webrtc.stunUrls)).toBe(true);
    expect(config.webrtc.stunUrls.length).toBeGreaterThanOrEqual(1);
    expect(config.webrtc.stunUrls[0]).toContain('stun:');
  });

  test('turnUrl defaults to empty string', () => {
    const config = require('../../server/config');
    expect(config.webrtc.turnUrl).toBe('');
  });

  test('turnSecret defaults to empty string', () => {
    const config = require('../../server/config');
    expect(config.webrtc.turnSecret).toBe('');
  });
});

describe('config.redis defaults', () => {
  test('url defaults to redis://localhost:6379', () => {
    const config = require('../../server/config');
    expect(config.redis.url).toBe('redis://localhost:6379');
  });
});

describe('config.client defaults', () => {
  test('url defaults to http://localhost:3000', () => {
    const config = require('../../server/config');
    expect(config.client.url).toBe('http://localhost:3000');
  });
});
