const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent, emitAndWait } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Platform Admin', () => {
  let users;
  let regularUser;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    regularUser = await users.createConnected('nonadmin');
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('Non-admin cannot access admin:get-users', async () => {
    const result = await emitAndWait(regularUser.socket, 'admin:get-users', {});
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/not authorized/i);
  });

  test('Non-admin cannot access admin:get-servers', async () => {
    const result = await emitAndWait(regularUser.socket, 'admin:get-servers', {});
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/not authorized/i);
  });

  test('Non-admin cannot delete a server', async () => {
    const result = await emitAndWait(regularUser.socket, 'admin:delete-server', { serverId: 'fake-id' });
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/not authorized/i);
  });

  test('Non-admin cannot delete a user', async () => {
    const result = await emitAndWait(regularUser.socket, 'admin:delete-user', { userId: 'fake-id' });
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/not authorized/i);
  });

  test('Non-admin cannot get orphaned stats', async () => {
    const result = await emitAndWait(regularUser.socket, 'admin:get-orphaned-stats', {});
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/not authorized/i);
  });

  test('Non-admin cannot cleanup empty DMs', async () => {
    const result = await emitAndWait(regularUser.socket, 'admin:cleanup-empty-dms', {});
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/not authorized/i);
  });

  test('Non-admin cannot assign ownerless servers', async () => {
    const result = await emitAndWait(regularUser.socket, 'admin:assign-ownerless-servers', {});
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/not authorized/i);
  });
});
