const { TestUserManager } = require('../helpers/test-user');
const { waitForEvent, emitAndWait } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

// Minimal 1x1 red PNG (base64)
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

// Minimal 1x1 GIF (base64)
const TINY_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAP8AAP///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';

/**
 * Emit an event and wait for EITHER the ack callback OR a socket 'error' event.
 * Some handlers use socket.emit('error') instead of calling the callback on validation failures.
 */
function emitExpectingError(socket, event, data, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('error', onError);
      reject(new Error(`Timed out waiting for ack or error on: ${event}`));
    }, timeoutMs);

    function onError(err) {
      clearTimeout(timer);
      socket.off('error', onError);
      resolve({ socketError: err });
    }

    socket.on('error', onError);

    socket.emit(event, data, (response) => {
      clearTimeout(timer);
      socket.off('error', onError);
      resolve(response);
    });
  });
}

describe('Custom Emojis', () => {
  let users;
  let admin;
  let serverId, channelId;
  let uploadedEmojiId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    admin = await users.createConnected('emojiadmin');

    // Create a server
    const createPromise = waitForEvent(admin.socket, 'server:created', 10000);
    admin.socket.emit('server:create', { name: 'Emoji Test Server' });
    const serverData = await createPromise;
    serverId = serverData.server.id;

    // Find the default text channel
    const textChannels = serverData.server.channels?.text || [];
    const generalChannel = textChannels.find(c => c.name === 'general') || textChannels[0];
    if (!generalChannel) throw new Error('No text channel found');
    channelId = generalChannel.id;

    // Join channel
    admin.socket.emit('channel:join', { channelId });
    await waitForEvent(admin.socket, 'channel:history', 5000).catch(() => null);
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  test('Upload PNG emoji → success', async () => {
    const result = await emitAndWait(admin.socket, 'emoji:upload', {
      serverId,
      name: 'test_emoji',
      imageData: TINY_PNG,
      contentType: 'image/png',
      animated: false,
    });

    expect(result.emoji).toBeDefined();
    expect(result.emoji.id).toBeDefined();
    expect(result.emoji.name).toBe('test_emoji');

    uploadedEmojiId = result.emoji.id;
  });

  test('Upload GIF emoji → success with animated flag', async () => {
    const result = await emitAndWait(admin.socket, 'emoji:upload', {
      serverId,
      name: 'test_gif_emoji',
      imageData: TINY_GIF,
      contentType: 'image/gif',
      animated: true,
    });

    expect(result.emoji).toBeDefined();
    expect(result.emoji.id).toBeDefined();
    expect(result.emoji.name).toBe('test_gif_emoji');
  });

  test('Reject oversized emoji (>350KB)', async () => {
    // Create a base64 string that decodes to > 350KB
    const bigData = 'data:image/png;base64,' + 'A'.repeat(500000);

    const result = await emitExpectingError(admin.socket, 'emoji:upload', {
      serverId,
      name: 'big_emoji',
      imageData: bigData,
      contentType: 'image/png',
    });

    // Handler uses socket.emit('error') for this validation
    if (result.socketError) {
      expect(result.socketError.message).toMatch(/too large|350/i);
    } else if (result.error) {
      expect(result.error).toMatch(/too large|350/i);
    } else {
      // Should not have succeeded
      expect(result.emoji).toBeUndefined();
    }
  });

  test('emoji:get-image returns image data', async () => {
    if (!uploadedEmojiId) return;

    const result = await emitAndWait(admin.socket, 'emoji:get-image', {
      emojiId: uploadedEmojiId,
      serverId,
    });

    expect(result.imageData).toBeDefined();
    expect(result.contentType).toBeDefined();
    expect(result.imageData).toContain('data:image/');
  });

  test('emoji:get lists server emojis', async () => {
    const result = await emitAndWait(admin.socket, 'emoji:get', { serverId });

    expect(result.emojis).toBeDefined();
    expect(Array.isArray(result.emojis)).toBe(true);
    expect(result.emojis.length).toBeGreaterThanOrEqual(1);

    const found = result.emojis.find(e => e.name === 'test_emoji');
    expect(found).toBeDefined();
  });

  test('React with custom emoji string → reaction broadcast', async () => {
    // Send a message first
    const msgPromise = waitForEvent(admin.socket, 'message:new', 5000);
    admin.socket.emit('message:send', { channelId, content: 'React to this' });
    const msg = await msgPromise;

    // React with a custom emoji format
    const customEmojiStr = `<:test_emoji:${uploadedEmojiId}>`;
    const reactionPromise = waitForEvent(admin.socket, 'message:reaction', 5000);
    admin.socket.emit('message:react', {
      channelId,
      messageId: msg.id,
      emoji: customEmojiStr,
    });
    const reactionData = await reactionPromise;

    expect(reactionData.messageId).toBe(msg.id);
    expect(reactionData.reactions).toBeDefined();
    expect(reactionData.reactions[customEmojiStr]).toBeDefined();
    expect(reactionData.reactions[customEmojiStr]).toContain(admin.account.id);
  });

  test('emoji:delete removes emoji', async () => {
    if (!uploadedEmojiId) return;

    const result = await emitAndWait(admin.socket, 'emoji:delete', {
      serverId,
      emojiId: uploadedEmojiId,
    });

    expect(result.success).toBe(true);

    // Verify emoji is gone
    const getResult = await emitAndWait(admin.socket, 'emoji:get-image', {
      emojiId: uploadedEmojiId,
    });

    expect(getResult.error).toBeDefined();
  });

  test('Reject invalid emoji name', async () => {
    const result = await emitExpectingError(admin.socket, 'emoji:upload', {
      serverId,
      name: 'a', // too short (< 2 chars)
      imageData: TINY_PNG,
      contentType: 'image/png',
    });

    // Handler uses socket.emit('error') for this validation
    if (result.socketError) {
      expect(result.socketError.message).toBeDefined();
    } else if (result.error) {
      expect(result.error).toBeDefined();
    } else {
      expect(result.emoji).toBeUndefined();
    }
  });

  test('Non-member cannot access emoji:get', async () => {
    const outsider = await users.createConnected('emojioutsider');

    const result = await emitAndWait(outsider.socket, 'emoji:get', { serverId });
    expect(result.error).toBeDefined();
  });
});
