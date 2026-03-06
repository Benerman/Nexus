'use strict';

const { waitForEvent, sleep } = require('../harness');

async function run(harness, metrics, duration) {
  console.log('\n=== Channel Tests ===\n');

  await testRapidSwitching(harness, metrics);
  await testCreationThroughput(harness, metrics);
  await testConcurrentJoinBurst(harness, metrics);
}

async function testRapidSwitching(harness, metrics) {
  const label = 'channel_switch';
  const channelIds = harness.getChannelIds();
  if (channelIds.length < 2) {
    console.log('  Skipping rapid switching: need at least 2 channels');
    return;
  }

  const progress = metrics.createProgress(0, 'Rapid channel switching');
  progress.start();

  // Use up to 10 users
  const sockets = harness.getAllSockets().slice(0, 10);
  const cyclesPerUser = 20;

  const promises = sockets.map(async (socket) => {
    for (let i = 0; i < cyclesPerUser; i++) {
      const targetChannel = channelIds[i % channelIds.length];
      const start = Date.now();

      try {
        const historyPromise = waitForEvent(socket, 'channel:history', 10000);
        socket.emit('channel:join', {
          channelId: targetChannel,
          serverId: harness.serverId,
        });
        await historyPromise;
        metrics.record(label, Date.now() - start, true);
      } catch (err) {
        metrics.record(label, Date.now() - start, false);
        metrics.recordError(label, err.message?.slice(0, 50));
      }

      progress.tick();
      await sleep(100);
    }
  });

  await Promise.all(promises);
  progress.stop();
}

async function testCreationThroughput(harness, metrics) {
  const label = 'channel_create';
  const progress = metrics.createProgress(0, 'Channel creation');
  progress.start();

  const owner = harness.getSocket(0);
  const count = 8; // Stay under rate limit (10/60s)
  const created = [];

  for (let i = 0; i < count; i++) {
    const name = `perf-create-${Date.now()}-${i}`;
    const start = Date.now();

    try {
      const createdPromise = waitForEvent(owner, 'channel:created', 10000);
      owner.emit('channel:create', {
        serverId: harness.serverId,
        name,
        type: 'text',
      });
      const data = await createdPromise;
      metrics.record(label, Date.now() - start, true);
      created.push(data.channel.id);
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
    await sleep(200);
  }

  // Cleanup: delete created channels
  for (const chId of created) {
    try {
      owner.emit('channel:delete', {
        serverId: harness.serverId,
        channelId: chId,
      });
      await sleep(200);
    } catch {
      // ignore
    }
  }

  progress.stop();
}

async function testConcurrentJoinBurst(harness, metrics) {
  const label = 'channel_concurrent_join';
  const channelId = harness.defaultChannelId;
  if (!channelId) {
    console.log('  Skipping concurrent join: no default channel');
    return;
  }

  const progress = metrics.createProgress(0, 'Concurrent join burst');
  progress.start();

  const sockets = harness.getAllSockets();
  const burstStart = Date.now();

  const promises = sockets.map(async (socket) => {
    const start = Date.now();
    try {
      const historyPromise = waitForEvent(socket, 'channel:history', 10000);
      socket.emit('channel:join', {
        channelId,
        serverId: harness.serverId,
      });
      await historyPromise;
      metrics.record(label, Date.now() - start, true);
    } catch (err) {
      metrics.record(label, Date.now() - start, false);
      metrics.recordError(label, err.message?.slice(0, 50));
    }
    progress.tick();
  });

  await Promise.all(promises);
  const totalBurst = Date.now() - burstStart;
  console.log(`  Join burst total: ${totalBurst}ms for ${sockets.length} users`);
  progress.stop();
}

module.exports = { run };
