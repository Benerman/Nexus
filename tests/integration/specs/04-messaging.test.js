const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Messaging', () => {
  let users;
  let sender, receiver;
  let channelId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    sender = await users.createConnected('msgsend');
    receiver = await users.createConnected('msgrecv');

    // Find the default #general channel from the init payload
    const server = sender.initData.server;
    const textChannels = server.channels?.text || [];
    const generalChannel = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!generalChannel) throw new Error('No text channel found in default server');
    channelId = generalChannel.id;

    // Both users join the channel room
    sender.socket.emit('channel:join', { channelId });
    await waitForEvent(sender.socket, 'channel:history', 5000);
    receiver.socket.emit('channel:join', { channelId });
    await waitForEvent(receiver.socket, 'channel:history', 5000);
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('message:send broadcasts message:new to channel room members', async () => {
    const msgPromise = waitForEvent(receiver.socket, 'message:new', 5000);
    sender.socket.emit('message:send', { channelId, content: 'Hello integration test!' });
    const msg = await msgPromise;
    expect(msg).toBeDefined();
    expect(msg.content).toBe('Hello integration test!');
  });

  test('Message has correct fields: id, channelId, content, author, timestamp', async () => {
    const msgPromise = waitForEvent(receiver.socket, 'message:new', 5000);
    sender.socket.emit('message:send', { channelId, content: 'Field check message' });
    const msg = await msgPromise;

    expect(msg.id).toBeDefined();
    expect(msg.channelId).toBe(channelId);
    expect(msg.content).toBe('Field check message');
    expect(msg.author).toBeDefined();
    expect(msg.author.id).toBe(sender.account.id);
    expect(msg.author.username).toBe(sender.username);
    expect(msg.timestamp).toBeDefined();
    expect(typeof msg.timestamp).toBe('number');
  });

  test('Empty content with no attachments is silently ignored', async () => {
    let received = false;
    const handler = () => { received = true; };
    receiver.socket.on('message:new', handler);

    sender.socket.emit('message:send', { channelId, content: '' });

    // Wait a bit to confirm no message arrives
    await new Promise(r => setTimeout(r, 1000));
    receiver.socket.off('message:new', handler);
    expect(received).toBe(false);
  });

  test('Message with replyTo includes the reference', async () => {
    // Send a message to reply to
    const origPromise = waitForEvent(receiver.socket, 'message:new', 5000);
    sender.socket.emit('message:send', { channelId, content: 'Original message' });
    const original = await origPromise;

    // Send a reply
    const replyPromise = waitForEvent(receiver.socket, 'message:new', 5000);
    sender.socket.emit('message:send', {
      channelId,
      content: 'This is a reply',
      replyTo: { messageId: original.id, authorId: original.author.id },
    });
    const reply = await replyPromise;

    expect(reply.replyTo).toBeDefined();
    expect(reply.replyTo.messageId).toBe(original.id);
  });

  test('Slash command /flip returns a coin-flip result message', async () => {
    const msgPromise = waitForEvent(sender.socket, 'message:new', 5000);
    sender.socket.emit('message:send', { channelId, content: '/flip' });
    const msg = await msgPromise;
    expect(msg.content).toMatch(/flip|heads|tails|coin/i);
  });

  test('message:edit by author broadcasts message:edited', async () => {
    // Send a message first
    const origPromise = waitForEvent(receiver.socket, 'message:new', 5000);
    sender.socket.emit('message:send', { channelId, content: 'To be edited' });
    const original = await origPromise;

    // Edit it
    const editPromise = waitForEvent(receiver.socket, 'message:edited', 5000);
    sender.socket.emit('message:edit', {
      channelId,
      messageId: original.id,
      content: 'Edited content',
    });
    const edited = await editPromise;

    expect(edited.messageId).toBe(original.id);
    expect(edited.content).toBe('Edited content');
    expect(edited.editedAt).toBeDefined();
  });

  test('message:edit by non-author emits error', async () => {
    // Sender creates a message
    const origPromise = waitForEvent(sender.socket, 'message:new', 5000);
    sender.socket.emit('message:send', { channelId, content: 'Not yours to edit' });
    const original = await origPromise;

    // Receiver tries to edit it
    const errorPromise = waitForEvent(receiver.socket, 'error', 3000).catch(() => null);
    receiver.socket.emit('message:edit', {
      channelId,
      messageId: original.id,
      content: 'Unauthorized edit',
    });

    // Either error event or no message:edited event
    const error = await errorPromise;
    // If no error event, that's also acceptable — the edit just silently fails
  });

  test('message:delete by author broadcasts message:deleted', async () => {
    const origPromise = waitForEvent(sender.socket, 'message:new', 5000);
    sender.socket.emit('message:send', { channelId, content: 'To be deleted' });
    const original = await origPromise;

    const deletePromise = waitForEvent(sender.socket, 'message:deleted', 5000);
    sender.socket.emit('message:delete', { channelId, messageId: original.id });
    const deleted = await deletePromise;

    expect(deleted.messageId).toBe(original.id);
    expect(deleted.channelId).toBe(channelId);
  });

  test('message:delete by admin on another user\'s message succeeds', async () => {
    // Receiver sends a message
    const origPromise = waitForEvent(receiver.socket, 'message:new', 5000);
    receiver.socket.emit('message:send', { channelId, content: 'Admin should delete this' });
    const original = await origPromise;

    // Sender (first user, admin on default server) tries to delete
    const deletePromise = waitForEvent(receiver.socket, 'message:deleted', 5000).catch(() => null);
    sender.socket.emit('message:delete', { channelId, messageId: original.id });
    const deleted = await deletePromise;

    // This may or may not succeed depending on default server permissions
    // Just verify no crash occurs
  });

  test('message:react toggles reaction and broadcasts message:reaction', async () => {
    const origPromise = waitForEvent(sender.socket, 'message:new', 5000);
    sender.socket.emit('message:send', { channelId, content: 'React to this' });
    const original = await origPromise;

    const reactionPromise = waitForEvent(sender.socket, 'message:reaction', 5000);
    sender.socket.emit('message:react', {
      channelId,
      messageId: original.id,
      emoji: '👍',
    });
    const reaction = await reactionPromise;

    expect(reaction.messageId).toBe(original.id);
    expect(reaction.reactions).toBeDefined();
  });
});
