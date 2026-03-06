'use strict';

const { waitForEvent, sleep } = require('../harness');

async function run(harness, metrics, duration) {
  console.log('\n=== Messaging Tests ===\n');

  await testSustainedThroughput(harness, metrics, duration);
  await testMultiChannelParallel(harness, metrics, duration);
  await testLargePayloads(harness, metrics);
  await testRateLimitBoundary(harness, metrics);
}

async function testSustainedThroughput(harness, metrics, duration) {
  const label = 'message_send';
  const channelId = harness.defaultChannelId;
  if (!channelId) {
    console.log('  Skipping sustained throughput: no default channel');
    return;
  }

  // All users join the channel
  await harness.joinChannel(channelId);
  await sleep(500);

  const progress = metrics.createProgress(duration, 'Sustained messaging');
  progress.start();

  const endTime = Date.now() + duration * 1000;
  const sockets = harness.getAllSockets();

  // Each user sends at ~3 msg/sec (350ms interval)
  const userPromises = sockets.map(async (socket, idx) => {
    let msgNum = 0;
    while (Date.now() < endTime) {
      const content = `perf-msg-${idx}-${msgNum++}`;
      const start = Date.now();

      try {
        const newMsgPromise = waitForEvent(socket, 'message:new', 10000);
        socket.emit('message:send', {
          serverId: harness.serverId,
          channelId,
          content,
        });
        await newMsgPromise;
        metrics.record(label, Date.now() - start, true);
      } catch (err) {
        const errMsg = err.message || '';
        if (errMsg.includes('rate') || errMsg.includes('Rate')) {
          metrics.record(label, Date.now() - start, false, true);
        } else {
          metrics.record(label, Date.now() - start, false);
          metrics.recordError(label, errMsg.slice(0, 50));
        }
      }

      progress.tick();
      await sleep(350);
    }
  });

  await Promise.all(userPromises);
  progress.stop();
}

async function testMultiChannelParallel(harness, metrics, duration) {
  const label = 'message_multi_channel';
  const channelIds = harness.getChannelIds();
  if (channelIds.length < 2) {
    console.log('  Skipping multi-channel: need at least 2 channels');
    return;
  }

  // Join all channels
  for (const chId of channelIds) {
    await harness.joinChannel(chId);
  }
  await sleep(500);

  const testDuration = Math.min(duration, 15);
  const progress = metrics.createProgress(testDuration, 'Multi-channel parallel');
  progress.start();

  const endTime = Date.now() + testDuration * 1000;
  const sockets = harness.getAllSockets();

  const userPromises = sockets.map(async (socket, idx) => {
    const myChannel = channelIds[idx % channelIds.length];
    let msgNum = 0;
    while (Date.now() < endTime) {
      const start = Date.now();
      try {
        const newMsgPromise = waitForEvent(socket, 'message:new', 10000);
        socket.emit('message:send', {
          serverId: harness.serverId,
          channelId: myChannel,
          content: `multi-ch-${idx}-${msgNum++}`,
        });
        await newMsgPromise;
        metrics.record(label, Date.now() - start, true);
      } catch (err) {
        const errMsg = err.message || '';
        if (errMsg.includes('rate') || errMsg.includes('Rate')) {
          metrics.record(label, Date.now() - start, false, true);
        } else {
          metrics.record(label, Date.now() - start, false);
        }
      }
      progress.tick();
      await sleep(400);
    }
  });

  await Promise.all(userPromises);
  progress.stop();
}

async function testLargePayloads(harness, metrics) {
  const label = 'message_large_payload';
  const channelId = harness.defaultChannelId;
  if (!channelId) return;

  const progress = metrics.createProgress(0, 'Large payloads (2000 char)');
  progress.start();

  const socket = harness.getSocket(0);
  const largeContent = 'A'.repeat(2000);
  const count = 20;

  for (let i = 0; i < count; i++) {
    const start = Date.now();
    try {
      const newMsgPromise = waitForEvent(socket, 'message:new', 10000);
      socket.emit('message:send', {
        serverId: harness.serverId,
        channelId,
        content: largeContent,
      });
      await newMsgPromise;
      metrics.record(label, Date.now() - start, true);
    } catch (err) {
      const errMsg = err.message || '';
      if (errMsg.includes('rate') || errMsg.includes('Rate')) {
        metrics.record(label, Date.now() - start, false, true);
      } else {
        metrics.record(label, Date.now() - start, false);
      }
    }
    progress.tick();
    await sleep(500);
  }

  progress.stop();
}

async function testRateLimitBoundary(harness, metrics) {
  const label = 'message_rate_limit_probe';
  const channelId = harness.defaultChannelId;
  if (!channelId) return;

  const progress = metrics.createProgress(0, 'Rate limit boundary');
  progress.start();

  const socket = harness.getSocket(0);
  let sent = 0;
  let rateLimited = false;

  // Send rapidly without delay until rate limited or 30 messages
  for (let i = 0; i < 30 && !rateLimited; i++) {
    const start = Date.now();
    try {
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ timeout: true }), 5000);
        const errorHandler = (data) => {
          if (data.message && (data.message.includes('rate') || data.message.includes('Rate') || data.message.includes('slow'))) {
            clearTimeout(timer);
            socket.off('error', errorHandler);
            resolve({ rateLimited: true });
          }
        };
        socket.on('error', errorHandler);
        socket.once('message:new', () => {
          clearTimeout(timer);
          socket.off('error', errorHandler);
          resolve({ success: true });
        });
        socket.emit('message:send', {
          serverId: harness.serverId,
          channelId,
          content: `ratelimit-probe-${i}`,
        });
      });

      if (result.rateLimited) {
        metrics.record(label, Date.now() - start, false, true);
        rateLimited = true;
      } else if (result.success) {
        metrics.record(label, Date.now() - start, true);
        sent++;
      } else {
        metrics.record(label, Date.now() - start, false);
      }
    } catch {
      metrics.record(label, Date.now() - start, false);
    }
    progress.tick();
  }

  console.log(`  Rate limit hit after ${sent} rapid sends`);
  progress.stop();

  // Cool down
  await sleep(11000);
}

module.exports = { run };
