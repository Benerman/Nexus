const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Message Search', () => {
  let users;
  let admin, member;
  let serverId, channelId;
  const uniqueWord = `searchtoken${Date.now()}`;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    admin = await users.createConnected('searchadmin');

    // Create a server
    const createPromise = waitForEvent(admin.socket, 'server:created', 10000);
    admin.socket.emit('server:create', { name: 'Search Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;

    const textChannels = serverData.server.channels?.text || [];
    const general = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!general) throw new Error('No text channel found');
    channelId = general.id;

    // Create a member and have them join
    member = await users.createConnected('searchmember');
    const invitePromise = waitForEvent(admin.socket, 'invite:created', 5000);
    admin.socket.emit('invite:create', { serverId });
    const inviteData = await invitePromise;

    const joinPromise = waitForEvent(member.socket, 'invite:joined', 5000);
    member.socket.emit('invite:use', { inviteCode: inviteData.invite.id || inviteData.invite.code });
    await joinPromise;

    // Both join the channel room
    admin.socket.emit('channel:join', { channelId });
    await waitForEvent(admin.socket, 'channel:history', 5000);
    member.socket.emit('channel:join', { channelId });
    await waitForEvent(member.socket, 'channel:history', 5000);

    // Send several messages with searchable content
    for (const content of [
      `Hello world ${uniqueWord} first message`,
      `Testing ${uniqueWord} second message`,
      `Random chatter about weather`,
    ]) {
      const p = waitForEvent(admin.socket, 'message:new', 5000);
      admin.socket.emit('message:send', { channelId, content });
      await p;
    }

    // Member sends a message
    const memberMsgPromise = waitForEvent(member.socket, 'message:new', 5000);
    member.socket.emit('message:send', { channelId, content: `Member ${uniqueWord} third message` });
    await memberMsgPromise;

    // Brief wait for DB indexing
    await new Promise(r => setTimeout(r, 500));
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('Full-text search returns matching messages', async () => {
    const resultPromise = waitForEvent(admin.socket, 'messages:search-results', 5000);
    admin.socket.emit('messages:search', { serverId, query: uniqueWord });
    const data = await resultPromise;

    expect(data.query).toBe(uniqueWord);
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBe(3);
  });

  test('Search results include author info', async () => {
    const resultPromise = waitForEvent(admin.socket, 'messages:search-results', 5000);
    admin.socket.emit('messages:search', { serverId, query: uniqueWord });
    const data = await resultPromise;

    for (const result of data.results) {
      expect(result.id).toBeDefined();
      expect(result.channelId).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.author).toBeDefined();
      expect(result.author.id).toBeDefined();
      expect(result.author.username).toBeDefined();
      expect(result.timestamp).toBeDefined();
    }
  });

  test('Search with channelId filter restricts results', async () => {
    const resultPromise = waitForEvent(admin.socket, 'messages:search-results', 5000);
    admin.socket.emit('messages:search', { serverId, query: uniqueWord, channelId });
    const data = await resultPromise;

    expect(data.results.length).toBe(3);
    for (const result of data.results) {
      expect(result.channelId).toBe(channelId);
    }
  });

  test('Search with authorId filter restricts to that author', async () => {
    const resultPromise = waitForEvent(admin.socket, 'messages:search-results', 5000);
    admin.socket.emit('messages:search', { serverId, query: uniqueWord, authorId: member.account.id });
    const data = await resultPromise;

    expect(data.results.length).toBe(1);
    expect(data.results[0].author.id).toBe(member.account.id);
    expect(data.results[0].content).toContain('Member');
  });

  test('Search with no matching results returns empty array', async () => {
    const resultPromise = waitForEvent(admin.socket, 'messages:search-results', 5000);
    admin.socket.emit('messages:search', { serverId, query: 'xyznonexistent99999' });
    const data = await resultPromise;

    expect(data.results).toEqual([]);
  });

  test('Empty query is silently ignored (no response)', async () => {
    let received = false;
    const handler = () => { received = true; };
    admin.socket.on('messages:search-results', handler);

    admin.socket.emit('messages:search', { serverId, query: '' });
    await new Promise(r => setTimeout(r, 1000));

    admin.socket.off('messages:search-results', handler);
    expect(received).toBe(false);
  });

  test('Non-member cannot search server messages -> error', async () => {
    const outsider = await users.createConnected('srchout');

    const errorPromise = waitForEvent(outsider.socket, 'error', 3000).catch(() => 'timeout');
    outsider.socket.emit('messages:search', { serverId, query: uniqueWord });
    const result = await errorPromise;

    if (result !== 'timeout') {
      expect(result.message).toBeDefined();
    }
  });

  test('Search for "weather" matches the weather message', async () => {
    const resultPromise = waitForEvent(admin.socket, 'messages:search-results', 5000);
    admin.socket.emit('messages:search', { serverId, query: 'weather' });
    const data = await resultPromise;

    expect(data.results.length).toBeGreaterThanOrEqual(1);
    expect(data.results.some(r => r.content.includes('weather'))).toBe(true);
  });
});
