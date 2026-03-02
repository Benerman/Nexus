const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Bookmarks / Saved Messages', () => {
  let users;
  let user1, user2;
  let serverId, channelId;
  let savedMessageId;
  let savedMessageContent;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    user1 = await users.createConnected('bkuser1');

    // Create a server
    const createPromise = waitForEvent(user1.socket, 'server:created', 10000);
    user1.socket.emit('server:create', { name: 'Bookmark Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;

    const textChannels = serverData.server.channels?.text || [];
    const general = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!general) throw new Error('No text channel found');
    channelId = general.id;

    // Create second user and have them join
    user2 = await users.createConnected('bkuser2');
    const invitePromise = waitForEvent(user1.socket, 'invite:created', 5000);
    user1.socket.emit('invite:create', { serverId });
    const inviteData = await invitePromise;

    const joinPromise = waitForEvent(user2.socket, 'invite:joined', 5000);
    user2.socket.emit('invite:use', { inviteCode: inviteData.invite.id || inviteData.invite.code });
    await joinPromise;

    // Both join the channel room
    user1.socket.emit('channel:join', { channelId });
    await waitForEvent(user1.socket, 'channel:history', 5000);
    user2.socket.emit('channel:join', { channelId });
    await waitForEvent(user2.socket, 'channel:history', 5000);
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('message:save bookmarks a message -> message:saved emitted', async () => {
    // Send a message first
    savedMessageContent = 'Bookmark this important message!';
    const msgPromise = waitForEvent(user1.socket, 'message:new', 5000);
    user1.socket.emit('message:send', { channelId, content: savedMessageContent });
    const msg = await msgPromise;
    savedMessageId = msg.id;

    // Save/bookmark it
    const savedPromise = waitForEvent(user1.socket, 'message:saved', 5000);
    user1.socket.emit('message:save', { messageId: msg.id, channelId });
    const data = await savedPromise;

    expect(data.messageId).toBe(msg.id);
  });

  test('bookmarks:get-ids returns saved message IDs', async () => {
    const idsPromise = waitForEvent(user1.socket, 'bookmarks:ids', 5000);
    user1.socket.emit('bookmarks:get-ids');
    const data = await idsPromise;

    expect(Array.isArray(data.ids)).toBe(true);
    expect(data.ids).toContain(savedMessageId);
  });

  test('bookmarks:list returns full bookmark objects', async () => {
    const listPromise = waitForEvent(user1.socket, 'bookmarks:list', 5000);
    user1.socket.emit('bookmarks:list');
    const data = await listPromise;

    expect(Array.isArray(data.bookmarks)).toBe(true);
    expect(data.bookmarks.length).toBeGreaterThanOrEqual(1);

    const bookmark = data.bookmarks.find(b => b.messageId === savedMessageId);
    expect(bookmark).toBeDefined();
    expect(bookmark.channelId).toBe(channelId);
    expect(bookmark.serverId).toBe(serverId);
    expect(bookmark.content).toBe(savedMessageContent);
    expect(bookmark.savedAt).toBeDefined();
    expect(typeof bookmark.savedAt).toBe('number');
    expect(bookmark.author).toBeDefined();
    expect(bookmark.author.username).toBe(user1.username);
  });

  test('Bookmarks are per-user (user2 has no bookmarks)', async () => {
    const idsPromise = waitForEvent(user2.socket, 'bookmarks:ids', 5000);
    user2.socket.emit('bookmarks:get-ids');
    const data = await idsPromise;

    expect(data.ids).not.toContain(savedMessageId);
  });

  test('User2 can bookmark the same message independently', async () => {
    const savedPromise = waitForEvent(user2.socket, 'message:saved', 5000);
    user2.socket.emit('message:save', { messageId: savedMessageId, channelId });
    const data = await savedPromise;

    expect(data.messageId).toBe(savedMessageId);

    // Verify it shows in user2 bookmarks
    const idsPromise = waitForEvent(user2.socket, 'bookmarks:ids', 5000);
    user2.socket.emit('bookmarks:get-ids');
    const idsData = await idsPromise;
    expect(idsData.ids).toContain(savedMessageId);
  });

  test('message:unsave removes bookmark -> message:unsaved emitted', async () => {
    const unsavedPromise = waitForEvent(user1.socket, 'message:unsaved', 5000);
    user1.socket.emit('message:unsave', { messageId: savedMessageId });
    const data = await unsavedPromise;

    expect(data.messageId).toBe(savedMessageId);
  });

  test('Unsaved message no longer appears in bookmark IDs', async () => {
    const idsPromise = waitForEvent(user1.socket, 'bookmarks:ids', 5000);
    user1.socket.emit('bookmarks:get-ids');
    const data = await idsPromise;

    expect(data.ids).not.toContain(savedMessageId);
  });

  test('Unsaved message no longer appears in bookmark list', async () => {
    const listPromise = waitForEvent(user1.socket, 'bookmarks:list', 5000);
    user1.socket.emit('bookmarks:list');
    const data = await listPromise;

    const found = data.bookmarks.find(b => b.messageId === savedMessageId);
    expect(found).toBeUndefined();
  });

  test('Saving multiple messages returns all in bookmarks:list', async () => {
    const messageIds = [];
    for (let i = 0; i < 3; i++) {
      const msgPromise = waitForEvent(user1.socket, 'message:new', 5000);
      user1.socket.emit('message:send', { channelId, content: `Multi-bookmark message ${i}` });
      const msg = await msgPromise;
      messageIds.push(msg.id);

      const savedPromise = waitForEvent(user1.socket, 'message:saved', 5000);
      user1.socket.emit('message:save', { messageId: msg.id, channelId });
      await savedPromise;
    }

    const listPromise = waitForEvent(user1.socket, 'bookmarks:list', 5000);
    user1.socket.emit('bookmarks:list');
    const data = await listPromise;

    for (const id of messageIds) {
      expect(data.bookmarks.some(b => b.messageId === id)).toBe(true);
    }
  });

  test('Duplicate save is idempotent (no error)', async () => {
    // Send and save a message
    const msgPromise = waitForEvent(user1.socket, 'message:new', 5000);
    user1.socket.emit('message:send', { channelId, content: 'Double save test' });
    const msg = await msgPromise;

    const savedPromise = waitForEvent(user1.socket, 'message:saved', 5000);
    user1.socket.emit('message:save', { messageId: msg.id, channelId });
    await savedPromise;

    // Save again - should not crash or error
    // The ON CONFLICT DO NOTHING means no error but also no confirmation
    // We just verify no error event is emitted
    let errorReceived = false;
    const handler = () => { errorReceived = true; };
    user1.socket.on('error', handler);

    user1.socket.emit('message:save', { messageId: msg.id, channelId });
    await new Promise(r => setTimeout(r, 1000));

    user1.socket.off('error', handler);
    expect(errorReceived).toBe(false);
  });
});
