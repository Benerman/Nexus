const crypto = require('crypto');
const { isPrivateUrl, makeToken } = require('../../server/utils');
const { v4: uuidv4 } = require('uuid');

// ─── SSRF Protection: isPrivateUrl ──────────────────────────────────────────

describe('isPrivateUrl', () => {
  test('blocks 127.0.0.1 (loopback)', () => {
    expect(isPrivateUrl('http://127.0.0.1/admin')).toBe(true);
  });

  test('blocks 10.x.x.x (private class A)', () => {
    expect(isPrivateUrl('http://10.0.0.1')).toBe(true);
    expect(isPrivateUrl('http://10.255.255.255')).toBe(true);
  });

  test('blocks 192.168.x.x (private class C)', () => {
    expect(isPrivateUrl('http://192.168.1.1')).toBe(true);
    expect(isPrivateUrl('http://192.168.0.100:8080/path')).toBe(true);
  });

  test('blocks 169.254.169.254 (cloud metadata)', () => {
    expect(isPrivateUrl('http://169.254.169.254/latest/meta-data/')).toBe(true);
  });

  test('blocks localhost', () => {
    expect(isPrivateUrl('http://localhost')).toBe(true);
    expect(isPrivateUrl('http://localhost:3000')).toBe(true);
  });

  test('blocks .local domains', () => {
    expect(isPrivateUrl('http://myhost.local')).toBe(true);
  });

  test('blocks .internal domains', () => {
    expect(isPrivateUrl('http://service.internal')).toBe(true);
  });

  test('blocks ::1 (IPv6 loopback)', () => {
    expect(isPrivateUrl('http://[::1]/')).toBe(true);
  });

  test('blocks file:// protocol', () => {
    expect(isPrivateUrl('file:///etc/passwd')).toBe(true);
  });

  test('blocks gopher:// protocol', () => {
    expect(isPrivateUrl('gopher://evil.com')).toBe(true);
  });

  test('blocks ftp:// protocol', () => {
    expect(isPrivateUrl('ftp://files.example.com/secret')).toBe(true);
  });

  test('allows https://example.com', () => {
    expect(isPrivateUrl('https://example.com')).toBe(false);
  });

  test('allows https://google.com', () => {
    expect(isPrivateUrl('https://google.com')).toBe(false);
  });

  test('allows http://public-site.org with path', () => {
    expect(isPrivateUrl('http://public-site.org/page?q=1')).toBe(false);
  });

  test('blocks invalid/malformed URLs', () => {
    expect(isPrivateUrl('not-a-url')).toBe(true);
    expect(isPrivateUrl('')).toBe(true);
  });
});

// ─── Webhook Token Validation ───────────────────────────────────────────────

describe('Webhook token generation', () => {
  test('crypto.randomBytes(32) produces 64-char hex strings', () => {
    const token = crypto.randomBytes(32).toString('hex');
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  test('produces unique values each call', () => {
    const t1 = crypto.randomBytes(32).toString('hex');
    const t2 = crypto.randomBytes(32).toString('hex');
    expect(t1).not.toBe(t2);
  });

  test('webhook ID is valid UUID format', () => {
    const id = uuidv4();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(uuidRegex.test(id)).toBe(true);
  });
});

// ─── Input Validation: Bearer token extraction ──────────────────────────────

describe('Bearer token extraction', () => {
  function extractBearerToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice(7);
  }

  test('extracts token from "Bearer abc123"', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
  });

  test('extracts full hex token', () => {
    const token = 'a'.repeat(64);
    expect(extractBearerToken(`Bearer ${token}`)).toBe(token);
  });

  test('returns null for missing Authorization header', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
  });

  test('returns null for non-Bearer auth', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(extractBearerToken('')).toBeNull();
  });
});

// ─── makeToken from utils ───────────────────────────────────────────────────

describe('makeToken', () => {
  test('returns a 64-char hex string', () => {
    const token = makeToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  test('returns unique values', () => {
    const tokens = new Set(Array.from({ length: 10 }, () => makeToken()));
    expect(tokens.size).toBe(10);
  });
});
