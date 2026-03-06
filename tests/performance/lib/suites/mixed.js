'use strict';

const { waitForEvent, emitAndWait, sleep } = require('../harness');

const ACTION_WEIGHTS = [
  { name: 'send_message', weight: 40 },
  { name: 'typing', weight: 20 },
  { name: 'channel_switch', weight: 15 },
  { name: 'react', weight: 10 },
  { name: 'fetch_older', weight: 5 },
  { name: 'data_refresh', weight: 5 },
  { name: 'user_search', weight: 5 },
];

function pickAction() {
  const total = ACTION_WEIGHTS.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const action of ACTION_WEIGHTS) {
    r -= action.weight;
    if (r <= 0) return action.name;
  }
  return ACTION_WEIGHTS[0].name;
}

function randomDelay() {
  return 300 + Math.random() * 500; // 300-800ms
}

async function run(harness, metrics, duration) {
  console.log('\n=== Mixed Workload Test ===\n');

  const channelIds = harness.getChannelIds();
  if (channelIds.length === 0) {
    console.log('  Skipping mixed: no channels available');
    return;
  }

  // Join all channels
  for (const chId of channelIds) {
    await harness.joinChannel(chId);
  }
  await sleep(500);

  const progress = metrics.createProgress(duration, 'Mixed workload');
  progress.start();

  const endTime = Date.now() + duration * 1000;
  const sockets = harness.getAllSockets();

  // Track message IDs per channel for reactions
  const channelMessages = {};

  const userPromises = sockets.map(async (socket, idx) => {
    let currentChannel = channelIds[idx % channelIds.length];
    let msgCount = 0;

    while (Date.now() < endTime) {
      const action = pickAction();
      const start = Date.now();

      try {
        switch (action) {
          case 'send_message': {
            const content = `mixed-${idx}-${msgCount++}`;
            const newMsgPromise = waitForEvent(socket, 'message:new', 10000);
            socket.emit('message:send', {
              serverId: harness.serverId,
              channelId: currentChannel,
              content,
            });
            const msg = await newMsgPromise;
            metrics.record('mixed_send_message', Date.now() - start, true);

            // Store for reactions
            if (!channelMessages[currentChannel]) channelMessages[currentChannel] = [];
            channelMessages[currentChannel].push(msg.id);
            if (channelMessages[currentChannel].length > 50) {
              channelMessages[currentChannel] = channelMessages[currentChannel].slice(-50);
            }
            break;
          }

          case 'typing': {
            socket.emit('typing:start', {
              serverId: harness.serverId,
              channelId: currentChannel,
            });
            metrics.record('mixed_typing', Date.now() - start, true);
            break;
          }

          case 'channel_switch': {
            const nextChannel = channelIds[Math.floor(Math.random() * channelIds.length)];
            const historyPromise = waitForEvent(socket, 'channel:history', 10000);
            socket.emit('channel:join', {
              channelId: nextChannel,
              serverId: harness.serverId,
            });
            await historyPromise;
            currentChannel = nextChannel;
            metrics.record('mixed_channel_switch', Date.now() - start, true);
            break;
          }

          case 'react': {
            const msgs = channelMessages[currentChannel];
            if (msgs && msgs.length > 0) {
              const targetId = msgs[Math.floor(Math.random() * msgs.length)];
              const emojis = ['👍', '❤️', '😂', '🎉', '🔥'];
              const emoji = emojis[Math.floor(Math.random() * emojis.length)];
              const reactPromise = waitForEvent(socket, 'message:reaction-added', 5000);
              socket.emit('message:react', {
                serverId: harness.serverId,
                channelId: currentChannel,
                messageId: targetId,
                emoji,
              });
              await reactPromise;
              metrics.record('mixed_react', Date.now() - start, true);
            }
            break;
          }

          case 'fetch_older': {
            const result = await emitAndWait(socket, 'messages:fetch-older', {
              serverId: harness.serverId,
              channelId: currentChannel,
              before: Date.now(),
              limit: 50,
            }, 10000);
            metrics.record('mixed_fetch_older', Date.now() - start, true);
            break;
          }

          case 'data_refresh': {
            const refreshPromise = waitForEvent(socket, 'data:refreshed', 10000);
            socket.emit('data:refresh');
            await refreshPromise;
            metrics.record('mixed_data_refresh', Date.now() - start, true);
            break;
          }

          case 'user_search': {
            const result = await emitAndWait(socket, 'user:search', {
              query: harness.prefix,
            }, 10000);
            metrics.record('mixed_user_search', Date.now() - start, true);
            break;
          }
        }
      } catch (err) {
        const errMsg = err.message || '';
        if (errMsg.includes('rate') || errMsg.includes('Rate')) {
          metrics.record(`mixed_${action}`, Date.now() - start, false, true);
        } else {
          metrics.record(`mixed_${action}`, Date.now() - start, false);
        }
      }

      progress.tick();
      await sleep(randomDelay());
    }
  });

  await Promise.all(userPromises);
  progress.stop();
}

module.exports = { run };
