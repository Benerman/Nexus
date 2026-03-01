const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Message Threads', () => {
  let users;
  let admin, member;
  let serverId, channelId;
  let parentMessageId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    admin = await users.createConnected('threadadmin');

    // Create a server
    const createPromise = waitForEvent(admin.socket, 'server:created', 10000);
    admin.socket.emit('server:create', { name: 'Thread Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;

    const textChannels = serverData.server.channels?.text || [];
    const general = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!general) throw new Error('No text channel found');
    channelId = general.id;

    // Create a member and have them join
    member = await users.createConnected('threadmember');
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

    // Send a parent message to thread on
    const msgPromise = waitForEvent(admin.socket, 'message:new', 5000);
    admin.socket.emit('message:send', { channelId, content: 'Parent message for threading' });
    const msg = await msgPromise;
    parentMessageId = msg.id;
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('thread:reply sends a reply and broadcasts thread:new-reply', async () => {
    const replyPromise = waitForEvent(admin.socket, 'thread:new-reply', 5000);
    admin.socket.emit('thread:reply', {
      channelId,
      threadId: parentMessageId,
      content: 'First thread reply',
    });
    const data = await replyPromise;

    expect(data.channelId).toBe(channelId);
    expect(data.threadId).toBe(parentMessageId);
    expect(data.message).toBeDefined();
    expect(data.message.content).toBe('First thread reply');
    expect(data.message.threadId).toBe(parentMessageId);
    expect(data.message.author.id).toBe(admin.account.id);
    expect(data.replyCount).toBe(1);
    expect(data.lastReplyAt).toBeDefined();
    expect(typeof data.lastReplyAt).toBe('number');
  });

  test('Member receives thread:new-reply broadcast', async () => {
    const memberReplyPromise = waitForEvent(member.socket, 'thread:new-reply', 5000);
    admin.socket.emit('thread:reply', {
      channelId,
      threadId: parentMessageId,
      content: 'Second thread reply from admin',
    });
    const data = await memberReplyPromise;

    expect(data.threadId).toBe(parentMessageId);
    expect(data.message.content).toBe('Second thread reply from admin');
    expect(data.replyCount).toBe(2);
  });

  test('Member can reply to a thread', async () => {
    const replyPromise = waitForEvent(admin.socket, 'thread:new-reply', 5000);
    member.socket.emit('thread:reply', {
      channelId,
      threadId: parentMessageId,
      content: 'Member reply to thread',
    });
    const data = await replyPromise;

    expect(data.message.content).toBe('Member reply to thread');
    expect(data.message.author.id).toBe(member.account.id);
    expect(data.replyCount).toBe(3);
  });

  test('thread:get returns parent and all replies', async () => {
    const threadPromise = waitForEvent(admin.socket, 'thread:messages', 5000);
    admin.socket.emit('thread:get', { channelId, threadId: parentMessageId });
    const data = await threadPromise;

    expect(data.channelId).toBe(channelId);
    expect(data.threadId).toBe(parentMessageId);

    // Parent message
    expect(data.parent).toBeDefined();
    expect(data.parent.id).toBe(parentMessageId);
    expect(data.parent.content).toBe('Parent message for threading');

    // Replies
    expect(Array.isArray(data.messages)).toBe(true);
    expect(data.messages.length).toBe(3);

    // Replies are ordered by created_at ASC
    expect(data.messages[0].content).toBe('First thread reply');
    expect(data.messages[1].content).toBe('Second thread reply from admin');
    expect(data.messages[2].content).toBe('Member reply to thread');
  });

  test('Thread replies have correct author info', async () => {
    const threadPromise = waitForEvent(admin.socket, 'thread:messages', 5000);
    admin.socket.emit('thread:get', { channelId, threadId: parentMessageId });
    const data = await threadPromise;

    // First two replies from admin, third from member
    expect(data.messages[0].author.id).toBe(admin.account.id);
    expect(data.messages[0].author.username).toBe(admin.username);
    expect(data.messages[2].author.id).toBe(member.account.id);
    expect(data.messages[2].author.username).toBe(member.username);
  });

  test('Empty thread reply is silently ignored', async () => {
    let received = false;
    const handler = () => { received = true; };
    admin.socket.on('thread:new-reply', handler);

    admin.socket.emit('thread:reply', {
      channelId,
      threadId: parentMessageId,
      content: '',
    });

    await new Promise(r => setTimeout(r, 1000));
    admin.socket.off('thread:new-reply', handler);
    expect(received).toBe(false);
  });

  test('thread:get on a message with no replies returns empty messages array', async () => {
    // Send a new message that has no thread replies
    const msgPromise = waitForEvent(admin.socket, 'message:new', 5000);
    admin.socket.emit('message:send', { channelId, content: 'No replies here' });
    const msg = await msgPromise;

    const threadPromise = waitForEvent(admin.socket, 'thread:messages', 5000);
    admin.socket.emit('thread:get', { channelId, threadId: msg.id });
    const data = await threadPromise;

    expect(data.parent).toBeDefined();
    expect(data.parent.id).toBe(msg.id);
    expect(data.messages).toEqual([]);
  });
});
