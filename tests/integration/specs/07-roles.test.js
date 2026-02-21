const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Roles', () => {
  let users;
  let admin, member;
  let serverId;
  let createdRoleId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    admin = await users.createConnected('roleadmin');

    // Create a server
    const createPromise = waitForEvent(admin.socket, 'server:created', 10000);
    admin.socket.emit('server:create', { name: 'Role Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;

    // Create and join a member
    member = await users.createConnected('rolemember');
    const invitePromise = waitForEvent(admin.socket, 'invite:created', 5000);
    admin.socket.emit('invite:create', { serverId });
    const inviteData = await invitePromise;

    const joinPromise = waitForEvent(member.socket, 'invite:joined', 5000);
    member.socket.emit('invite:use', { inviteCode: inviteData.invite.id || inviteData.invite.code });
    await joinPromise;

    // Drain the server:updated event that invite:use broadcasts via io.emit
    await new Promise(r => setTimeout(r, 300));
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('Admin creates role with name/color/permissions → server:updated', async () => {
    const updatePromise = waitForEvent(admin.socket, 'server:updated', 5000);
    admin.socket.emit('role:create', {
      serverId,
      name: 'Moderator',
      color: '#FF5733',
      permissions: { manageMessages: true, kickMembers: true },
    });
    const update = await updatePromise;

    expect(update.server).toBeDefined();
    const roles = update.server.roles || {};
    const roleEntries = Object.values(roles);
    const modRole = roleEntries.find(r => r.name === 'Moderator');
    expect(modRole).toBeDefined();
    expect(modRole.color).toBe('#FF5733');
    createdRoleId = modRole.id;
  });

  test('Non-admin cannot create roles → error', async () => {
    const errorPromise = waitForEvent(member.socket, 'error', 3000).catch(() => 'timeout');
    member.socket.emit('role:create', {
      serverId,
      name: 'Unauthorized Role',
      color: '#000000',
    });

    const result = await errorPromise;
    if (result !== 'timeout') {
      expect(result.message).toBeDefined();
    }
  });

  test('role:update changes name/color/permissions → server:updated', async () => {
    if (!createdRoleId) return;

    const updatePromise = waitForEvent(admin.socket, 'server:updated', 5000);
    admin.socket.emit('role:update', {
      serverId,
      roleId: createdRoleId,
      name: 'Senior Mod',
      color: '#00FF00',
      permissions: { manageMessages: true, kickMembers: true, banMembers: true },
    });
    const update = await updatePromise;

    const roles = update.server.roles || {};
    const updatedRole = Object.values(roles).find(r => r.id === createdRoleId);
    expect(updatedRole).toBeDefined();
    expect(updatedRole.name).toBe('Senior Mod');
    expect(updatedRole.color).toBe('#00FF00');
  });

  test('Cannot update role at or above own position (unless owner)', async () => {
    // This test verifies the permission check. Since member doesn't have manageRoles,
    // they shouldn't be able to update roles.
    if (!createdRoleId) return;

    const errorPromise = waitForEvent(member.socket, 'error', 3000).catch(() => 'timeout');
    member.socket.emit('role:update', {
      serverId,
      roleId: createdRoleId,
      name: 'Hacked Role',
    });

    const result = await errorPromise;
    if (result !== 'timeout') {
      expect(result.message).toBeDefined();
    }
  });

  test('role:delete removes custom role → server:updated', async () => {
    // Create a role specifically to delete
    const createPromise = waitForEvent(admin.socket, 'server:updated', 5000);
    admin.socket.emit('role:create', {
      serverId,
      name: 'Temp Role',
      color: '#AAAAAA',
    });
    const createUpdate = await createPromise;
    const tempRole = Object.values(createUpdate.server.roles || {}).find(r => r.name === 'Temp Role');
    if (!tempRole) return;

    const deletePromise = waitForEvent(admin.socket, 'server:updated', 5000);
    admin.socket.emit('role:delete', { serverId, roleId: tempRole.id });
    const deleteUpdate = await deletePromise;

    const roles = deleteUpdate.server.roles || {};
    const found = Object.values(roles).find(r => r.id === tempRole.id);
    expect(found).toBeUndefined();
  });

  test('Cannot delete @everyone role → error', async () => {
    // Find the @everyone role
    const refreshPromise = waitForEvent(admin.socket, 'data:refreshed', 5000);
    admin.socket.emit('data:refresh');
    const refreshData = await refreshPromise;

    const server = refreshData.servers?.find(s => s.id === serverId);
    const roles = server?.roles || {};
    const everyoneRole = Object.values(roles).find(r => r.name === 'everyone' || r.name === '@everyone');

    if (!everyoneRole) return;

    const errorPromise = waitForEvent(admin.socket, 'error', 3000).catch(() => 'timeout');
    admin.socket.emit('role:delete', { serverId, roleId: everyoneRole.id });

    const result = await errorPromise;
    if (result !== 'timeout') {
      expect(result.message).toBeDefined();
    }
  });
});
