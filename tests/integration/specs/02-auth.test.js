const { ApiClient } = require('../helpers/api-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';
const api = new ApiClient(SERVER_URL);

describe('Authentication', () => {
  const uniquePrefix = `auth_${Date.now()}`;
  let registeredUser;

  test('Register returns token and account with id/username/avatar/color', async () => {
    const username = `${uniquePrefix}_reg`;
    const { status, body } = await api.register(username, 'TestPass123!');
    expect(status).toBe(200);
    expect(body.token).toBeDefined();
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.account).toBeDefined();
    expect(body.account.id).toBeDefined();
    expect(body.account.username).toBe(username);
    expect(body.account.avatar).toBeDefined();
    expect(body.account.color).toBeDefined();
    registeredUser = { username, password: 'TestPass123!', token: body.token };
  });

  test('Register returns 409 for duplicate username', async () => {
    const username = `${uniquePrefix}_dup`;
    await api.register(username, 'TestPass123!');
    const { status, body } = await api.register(username, 'TestPass123!');
    expect(status).toBe(409);
    expect(body.error).toMatch(/already taken/i);
  });

  test('Register returns 400 for missing username or password', async () => {
    const res1 = await api.register('', 'TestPass123!');
    expect(res1.status).toBe(400);

    const res2 = await api.register(`${uniquePrefix}_nopass`, '');
    expect(res2.status).toBe(400);
  });

  test('Register returns 400 for password < 8 chars', async () => {
    const { status, body } = await api.register(`${uniquePrefix}_short`, 'short');
    expect(status).toBe(400);
    expect(body.error).toMatch(/8/);
  });

  test('Register returns 400 for username with invalid chars', async () => {
    const { status } = await api.register('user\x00name', 'TestPass123!');
    expect(status).toBe(400);
  });

  test('Login returns token and account for valid credentials', async () => {
    const username = `${uniquePrefix}_login`;
    await api.register(username, 'TestPass123!');
    const { status, body } = await api.login(username, 'TestPass123!');
    expect(status).toBe(200);
    expect(body.token).toBeDefined();
    expect(body.account).toBeDefined();
    expect(body.account.id).toBeDefined();
    expect(body.account.username).toBe(username);
  });

  test('Login returns 401 for wrong password', async () => {
    const username = `${uniquePrefix}_wrongpw`;
    await api.register(username, 'TestPass123!');
    const { status, body } = await api.login(username, 'WrongPassword!');
    expect(status).toBe(401);
    expect(body.error).toMatch(/invalid/i);
  });

  test('Login returns 401 for non-existent user', async () => {
    const { status, body } = await api.login('nonexistent_user_xyz_999', 'TestPass123!');
    expect(status).toBe(401);
    expect(body.error).toMatch(/invalid/i);
  });

  test('Login returns 400 for missing credentials', async () => {
    const res1 = await api.login('', 'TestPass123!');
    expect(res1.status).toBe(400);

    const res2 = await api.login('someuser', '');
    expect(res2.status).toBe(400);
  });

  test('Logout invalidates token', async () => {
    const username = `${uniquePrefix}_logout`;
    const reg = await api.register(username, 'TestPass123!');
    expect(reg.status).toBe(200);

    const { status, body } = await api.logout(reg.body.token);
    expect(status).toBe(200);
    expect(body.success).toBe(true);

    // Token should no longer work for authenticated endpoints
    const avatarRes = await api.uploadAvatar(reg.body.token, 'data:image/png;base64,abc');
    expect(avatarRes.status).toBe(401);
  });
});
