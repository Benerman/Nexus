/**
 * Tests for docker-compose.coturn.yml and docker-compose.coturn.dev.yml
 *
 * Validates that the coturn compose overlay files:
 * - Parse as valid YAML
 * - Define the expected services (coturn + server env overrides)
 * - Use correct coturn image, networking, and command flags
 * - Production and dev files use different ports to avoid conflicts
 * - Environment variables reference the correct STUN/TURN/SECRET vars
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '../..');
const PROD_FILE = path.join(ROOT, 'docker-compose.coturn.yml');
const DEV_FILE = path.join(ROOT, 'docker-compose.coturn.dev.yml');

let prod, dev;

beforeAll(() => {
  prod = yaml.load(fs.readFileSync(PROD_FILE, 'utf8'));
  dev = yaml.load(fs.readFileSync(DEV_FILE, 'utf8'));
});

describe('Coturn compose — production', () => {
  test('file parses as valid YAML', () => {
    expect(prod).toBeDefined();
    expect(prod.services).toBeDefined();
  });

  test('defines coturn and server services', () => {
    expect(prod.services.coturn).toBeDefined();
    expect(prod.services.server).toBeDefined();
  });

  test('coturn uses official image', () => {
    expect(prod.services.coturn.image).toMatch(/^coturn\/coturn/);
  });

  test('coturn uses host networking for UDP relay', () => {
    expect(prod.services.coturn.network_mode).toBe('host');
  });

  test('coturn container name is nexus-coturn', () => {
    expect(prod.services.coturn.container_name).toBe('nexus-coturn');
  });

  test('coturn command includes required flags', () => {
    const cmd = prod.services.coturn.command;
    expect(cmd).toMatch(/--use-auth-secret/);
    expect(cmd).toMatch(/--listening-port=3478/);
    expect(cmd).toMatch(/--min-port=49152/);
    expect(cmd).toMatch(/--max-port=49252/);
    expect(cmd).toMatch(/--lt-cred-mech/);
    expect(cmd).toMatch(/--fingerprint/);
    expect(cmd).toMatch(/--realm=nexus\b/);
  });

  test('coturn relay port range is 100 ports', () => {
    const cmd = prod.services.coturn.command;
    const minMatch = cmd.match(/--min-port=(\d+)/);
    const maxMatch = cmd.match(/--max-port=(\d+)/);
    expect(minMatch).not.toBeNull();
    expect(maxMatch).not.toBeNull();
    const range = parseInt(maxMatch[1]) - parseInt(minMatch[1]);
    expect(range).toBe(100);
  });

  test('coturn environment references TURN_SECRET', () => {
    const env = prod.services.coturn.environment;
    const secretVar = env.find(e => e.includes('TURN_SECRET'));
    expect(secretVar).toBeDefined();
  });

  test('server environment overrides set STUN_URLS, TURN_URL, TURN_SECRET', () => {
    const env = prod.services.server.environment;
    expect(env.some(e => e.startsWith('STUN_URLS='))).toBe(true);
    expect(env.some(e => e.startsWith('TURN_URL='))).toBe(true);
    expect(env.some(e => e.startsWith('TURN_SECRET='))).toBe(true);
  });

  test('server STUN/TURN URLs point to port 3478', () => {
    const env = prod.services.server.environment;
    const stunUrl = env.find(e => e.startsWith('STUN_URLS='));
    const turnUrl = env.find(e => e.startsWith('TURN_URL='));
    expect(stunUrl).toMatch(/:3478/);
    expect(turnUrl).toMatch(/:3478/);
  });

  test('coturn has restart policy', () => {
    expect(prod.services.coturn.restart).toBeDefined();
  });
});

describe('Coturn compose — development', () => {
  test('file parses as valid YAML', () => {
    expect(dev).toBeDefined();
    expect(dev.services).toBeDefined();
  });

  test('defines coturn and server services', () => {
    expect(dev.services.coturn).toBeDefined();
    expect(dev.services.server).toBeDefined();
  });

  test('dev container name differs from production', () => {
    expect(dev.services.coturn.container_name).toBe('nexus-dev-coturn');
    expect(dev.services.coturn.container_name).not.toBe(prod.services.coturn.container_name);
  });

  test('dev uses different listening port than production', () => {
    const devCmd = dev.services.coturn.command;
    const prodCmd = prod.services.coturn.command;
    const devPort = devCmd.match(/--listening-port=(\d+)/)[1];
    const prodPort = prodCmd.match(/--listening-port=(\d+)/)[1];
    expect(devPort).not.toBe(prodPort);
    expect(devPort).toBe('3479');
  });

  test('dev relay port range does not overlap production', () => {
    const devCmd = dev.services.coturn.command;
    const prodCmd = prod.services.coturn.command;
    const devMin = parseInt(devCmd.match(/--min-port=(\d+)/)[1]);
    const prodMax = parseInt(prodCmd.match(/--max-port=(\d+)/)[1]);
    expect(devMin).toBeGreaterThan(prodMax);
  });

  test('dev has a default TURN_SECRET for convenience', () => {
    const env = dev.services.coturn.environment;
    const secretVar = env.find(e => e.includes('TURN_SECRET'));
    // Dev file uses a default value (:-nexus-dev-turn-secret)
    expect(secretVar).toMatch(/:-/);
  });

  test('dev server URLs point to dev port', () => {
    const env = dev.services.server.environment;
    const stunUrl = env.find(e => e.startsWith('STUN_URLS='));
    const turnUrl = env.find(e => e.startsWith('TURN_URL='));
    expect(stunUrl).toMatch(/:3479/);
    expect(turnUrl).toMatch(/:3479/);
  });

  test('dev realm differs from production', () => {
    const devCmd = dev.services.coturn.command;
    const prodCmd = prod.services.coturn.command;
    const devRealm = devCmd.match(/--realm=(\S+)/)[1];
    const prodRealm = prodCmd.match(/--realm=(\S+)/)[1];
    expect(devRealm).not.toBe(prodRealm);
  });
});
