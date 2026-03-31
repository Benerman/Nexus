const { createClient } = require('redis');
const config = require('./config');
const logger = require('./logger');

const log = logger.child ? logger.child({ module: 'redis' }) : logger;

let client = null;
let connected = false;

async function connect() {
  if (client) return client;

  client = createClient({ url: config.redis.url });

  client.on('error', (err) => {
    // Log but don't crash — Redis is optional (cache layer only)
    if (connected) {
      log.warn({ err: err.message }, '[Redis] Connection error — cache disabled until reconnect');
    }
    connected = false;
  });

  client.on('ready', () => {
    connected = true;
    log.info('[Redis] Connected');
  });

  client.on('reconnecting', () => {
    log.info('[Redis] Reconnecting...');
  });

  try {
    await client.connect();
  } catch (err) {
    log.warn({ err: err.message }, '[Redis] Failed to connect — running without cache');
    connected = false;
  }

  return client;
}

function isConnected() {
  return connected && client !== null;
}

// ─── Channel message cache ────────────────────────────────────────────────────

const CHANNEL_MESSAGES_KEY = (channelId) => `channel:messages:${channelId}`;
const CHANNEL_MESSAGES_TTL = 300; // 5 minutes

async function getCachedMessages(channelId) {
  if (!isConnected()) return null;
  try {
    const raw = await client.get(CHANNEL_MESSAGES_KEY(channelId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    log.warn({ err: err.message, channelId }, '[Redis] getCachedMessages failed');
    return null;
  }
}

async function setCachedMessages(channelId, messages) {
  if (!isConnected()) return;
  try {
    await client.setEx(
      CHANNEL_MESSAGES_KEY(channelId),
      CHANNEL_MESSAGES_TTL,
      JSON.stringify(messages)
    );
  } catch (err) {
    log.warn({ err: err.message, channelId }, '[Redis] setCachedMessages failed');
  }
}

async function invalidateChannelMessages(channelId) {
  if (!isConnected()) return;
  try {
    await client.del(CHANNEL_MESSAGES_KEY(channelId));
  } catch (err) {
    log.warn({ err: err.message, channelId }, '[Redis] invalidateChannelMessages failed');
  }
}

module.exports = { connect, isConnected, getCachedMessages, setCachedMessages, invalidateChannelMessages };
