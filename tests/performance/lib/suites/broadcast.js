'use strict';

const { waitForEvent, sleep } = require('../harness');

async function run(harness, metrics, duration) {
  console.log('\n=== Broadcast Fan-out Tests ===\n');

  await testMessageFanOut(harness, metrics);
  await testTypingFanOut(harness, metrics);
  await testReactionFanOut(harness, metrics);
}

async function testMessageFanOut(harness, metrics) {
  const label = 'broadcast_message_fanout';
  const channelId = harness.defaultChannelId;
  if (!channelId) return;

  const sockets = harness.getAllSockets();
  if (sockets.length < 2) return;

  // All users join channel
  await harness.joinChannel(channelId);
  await sleep(500);

  const sender = sockets[0];
  const receivers = sockets.slice(1);
  const rounds = 20;

  const progress = metrics.createProgress(0, 'Message fan-out');
  progress.start();

  for (let i = 0; i < rounds; i++) {
    const content = `fanout-${Date.now()}-${i}`;
    const sendTime = Date.now();

    // Set up listeners on all receivers before sending
    const receivePromises = receivers.map((socket) => {
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 10000);
        const handler = (msg) => {
          if (msg.content === content) {
            clearTimeout(timer);
            socket.off('message:new', handler);
            resolve(Date.now() - sendTime);
          }
        };
        socket.on('message:new', handler);
      });
    });

    sender.emit('message:send', {
      serverId: harness.serverId,
      channelId,
      content,
    });

    const latencies = await Promise.all(receivePromises);
    const delivered = latencies.filter(l => l !== null);

    for (const lat of delivered) {
      metrics.record(label, lat, true);
    }
    for (let j = 0; j < latencies.length - delivered.length; j++) {
      metrics.recordError(label, 'delivery_timeout');
    }

    if (delivered.length > 0) {
      const maxLat = Math.max(...delivered);
      metrics.record('broadcast_tail_latency', maxLat, true);
    }

    progress.tick();
    await sleep(500);
  }

  progress.stop();
}

async function testTypingFanOut(harness, metrics) {
  const label = 'broadcast_typing_fanout';
  const channelId = harness.defaultChannelId;
  if (!channelId) return;

  const sockets = harness.getAllSockets();
  if (sockets.length < 2) return;

  const sender = sockets[0];
  const receivers = sockets.slice(1, 11); // Up to 10 receivers
  const rounds = 15;

  const progress = metrics.createProgress(0, 'Typing fan-out');
  progress.start();

  for (let i = 0; i < rounds; i++) {
    const sendTime = Date.now();

    const receivePromises = receivers.map((socket) => {
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 5000);
        const handler = (data) => {
          clearTimeout(timer);
          socket.off('typing:users', handler);
          resolve(Date.now() - sendTime);
        };
        socket.on('typing:users', handler);
      });
    });

    sender.emit('typing:start', {
      serverId: harness.serverId,
      channelId,
    });

    const latencies = await Promise.all(receivePromises);
    const delivered = latencies.filter(l => l !== null);

    for (const lat of delivered) {
      metrics.record(label, lat, true);
    }
    for (let j = 0; j < latencies.length - delivered.length; j++) {
      metrics.recordError(label, 'delivery_timeout');
    }

    progress.tick();
    await sleep(600);
  }

  progress.stop();
}

async function testReactionFanOut(harness, metrics) {
  const label = 'broadcast_reaction_fanout';
  const channelId = harness.defaultChannelId;
  if (!channelId) return;

  const sockets = harness.getAllSockets();
  if (sockets.length < 2) return;

  // First send a message to react to
  await harness.joinChannel(channelId);
  await sleep(500);

  const sender = sockets[0];
  const receivers = sockets.slice(1, 11);

  // Send a target message
  let targetMessageId = null;
  try {
    const newMsgPromise = waitForEvent(sender, 'message:new', 10000);
    sender.emit('message:send', {
      serverId: harness.serverId,
      channelId,
      content: 'reaction-target-' + Date.now(),
    });
    const msg = await newMsgPromise;
    targetMessageId = msg.id;
  } catch {
    console.log('  Could not create target message for reaction test');
    return;
  }

  await sleep(500);

  const rounds = 10;
  const emojis = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '✅', '💯', '🚀', '⭐'];
  const progress = metrics.createProgress(0, 'Reaction fan-out');
  progress.start();

  for (let i = 0; i < rounds; i++) {
    const emoji = emojis[i % emojis.length];
    const sendTime = Date.now();

    const receivePromises = receivers.map((socket) => {
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 5000);
        const handler = () => {
          clearTimeout(timer);
          socket.off('message:reaction-added', handler);
          resolve(Date.now() - sendTime);
        };
        socket.on('message:reaction-added', handler);
      });
    });

    sender.emit('message:react', {
      serverId: harness.serverId,
      channelId,
      messageId: targetMessageId,
      emoji,
    });

    const latencies = await Promise.all(receivePromises);
    const delivered = latencies.filter(l => l !== null);

    for (const lat of delivered) {
      metrics.record(label, lat, true);
    }
    for (let j = 0; j < latencies.length - delivered.length; j++) {
      metrics.recordError(label, 'delivery_timeout');
    }

    progress.tick();
    await sleep(400);
  }

  progress.stop();
}

module.exports = { run };
