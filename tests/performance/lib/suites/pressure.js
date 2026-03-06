'use strict';

const { waitForEvent, emitAndWait, sleep } = require('../harness');

async function run(harness, metrics, duration) {
  console.log('\n=== Pressure Tests ===\n');

  await testMessageFloodAndPagination(harness, metrics);
  await testThreadOps(harness, metrics);
  await testDataRefreshUnderLoad(harness, metrics);
}

async function testMessageFloodAndPagination(harness, metrics) {
  const channelId = harness.defaultChannelId;
  if (!channelId) return;

  await harness.joinChannel(channelId);
  await sleep(500);

  // Phase 1: Flood messages to build deep history
  const floodLabel = 'pressure_message_flood';
  const progress1 = metrics.createProgress(0, 'Message flood (100 msgs)');
  progress1.start();

  const socket = harness.getSocket(0);
  for (let i = 0; i < 100; i++) {
    const start = Date.now();
    try {
      const newMsgPromise = waitForEvent(socket, 'message:new', 10000);
      socket.emit('message:send', {
        serverId: harness.serverId,
        channelId,
        content: `flood-msg-${i}-${Date.now()}`,
      });
      await newMsgPromise;
      metrics.record(floodLabel, Date.now() - start, true);
    } catch (err) {
      const errMsg = err.message || '';
      if (errMsg.includes('rate') || errMsg.includes('Rate')) {
        metrics.record(floodLabel, Date.now() - start, false, true);
        // Wait for rate limit to clear
        await sleep(5000);
      } else {
        metrics.record(floodLabel, Date.now() - start, false);
      }
    }
    progress1.tick();
    await sleep(350); // Stay under rate limit
  }
  progress1.stop();

  // Phase 2: Pagination performance
  const paginationLabel = 'pressure_pagination';
  const progress2 = metrics.createProgress(0, 'Pagination (fetch-older)');
  progress2.start();

  let before = Date.now();
  for (let page = 0; page < 5; page++) {
    const start = Date.now();
    try {
      const result = await emitAndWait(socket, 'messages:fetch-older', {
        serverId: harness.serverId,
        channelId,
        before,
        limit: 50,
      }, 10000);

      metrics.record(paginationLabel, Date.now() - start, true);

      // Update cursor for next page
      if (result && result.messages && result.messages.length > 0) {
        const oldest = result.messages[result.messages.length - 1];
        before = new Date(oldest.timestamp || oldest.createdAt).getTime();
      } else {
        break; // No more messages
      }
    } catch (err) {
      metrics.record(paginationLabel, Date.now() - start, false);
      metrics.recordError(paginationLabel, err.message?.slice(0, 50));
    }
    progress2.tick();
  }
  progress2.stop();
}

async function testThreadOps(harness, metrics) {
  const channelId = harness.defaultChannelId;
  if (!channelId) return;

  const progress = metrics.createProgress(0, 'Thread operations');
  progress.start();

  const socket = harness.getSocket(0);

  // Send a message to thread on
  let parentMessageId = null;
  try {
    const newMsgPromise = waitForEvent(socket, 'message:new', 10000);
    socket.emit('message:send', {
      serverId: harness.serverId,
      channelId,
      content: 'thread-parent-' + Date.now(),
    });
    const msg = await newMsgPromise;
    parentMessageId = msg.id;
  } catch {
    console.log('  Could not create parent message for thread test');
    progress.stop();
    return;
  }

  await sleep(500);

  // Create thread
  const threadCreateLabel = 'pressure_thread_create';
  let threadId = null;
  {
    const start = Date.now();
    try {
      const result = await emitAndWait(socket, 'thread:create', {
        serverId: harness.serverId,
        channelId,
        messageId: parentMessageId,
        name: 'perf-thread-' + Date.now(),
      }, 10000);
      metrics.record(threadCreateLabel, Date.now() - start, true);
      threadId = result?.thread?.id || result?.threadId;
      progress.tick();
    } catch (err) {
      metrics.record(threadCreateLabel, Date.now() - start, false);
      metrics.recordError(threadCreateLabel, err.message?.slice(0, 50));
      progress.tick();
    }
  }

  if (!threadId) {
    console.log('  Thread creation returned no ID, skipping replies');
    progress.stop();
    return;
  }

  // Post 10 replies
  const threadReplyLabel = 'pressure_thread_reply';
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    try {
      const result = await emitAndWait(socket, 'thread:reply', {
        serverId: harness.serverId,
        channelId,
        threadId,
        content: `thread-reply-${i}`,
      }, 10000);
      metrics.record(threadReplyLabel, Date.now() - start, true);
    } catch (err) {
      const errMsg = err.message || '';
      if (errMsg.includes('rate') || errMsg.includes('Rate')) {
        metrics.record(threadReplyLabel, Date.now() - start, false, true);
        await sleep(3000);
      } else {
        metrics.record(threadReplyLabel, Date.now() - start, false);
      }
    }
    progress.tick();
    await sleep(400);
  }

  // Retrieve thread
  const threadGetLabel = 'pressure_thread_get';
  {
    const start = Date.now();
    try {
      const result = await emitAndWait(socket, 'thread:get', {
        serverId: harness.serverId,
        channelId,
        threadId,
      }, 10000);
      metrics.record(threadGetLabel, Date.now() - start, true);
    } catch (err) {
      metrics.record(threadGetLabel, Date.now() - start, false);
      metrics.recordError(threadGetLabel, err.message?.slice(0, 50));
    }
    progress.tick();
  }

  progress.stop();
}

async function testDataRefreshUnderLoad(harness, metrics) {
  const label = 'pressure_data_refresh';
  const progress = metrics.createProgress(0, 'Data refresh under load');
  progress.start();

  const sockets = harness.getAllSockets();
  const rounds = 3;

  for (let round = 0; round < rounds; round++) {
    // All users refresh simultaneously
    const promises = sockets.map(async (socket) => {
      const start = Date.now();
      try {
        const refreshPromise = waitForEvent(socket, 'data:refreshed', 15000);
        socket.emit('data:refresh');
        await refreshPromise;
        metrics.record(label, Date.now() - start, true);
      } catch (err) {
        metrics.record(label, Date.now() - start, false);
        metrics.recordError(label, err.message?.slice(0, 50));
      }
      progress.tick();
    });

    await Promise.all(promises);
    await sleep(2000);
  }

  progress.stop();
}

module.exports = { run };
