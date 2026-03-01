const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { state } = require('../state');
const { getUserPerms, serializeServer } = require('../helpers');

module.exports = function(io, socket) {

  socket.on('webhook:create', async ({ serverId, channelId, name }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageChannels && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return;
    const ch = srv.channels.text.find(c => c.id === channelId);
    if (!ch) return;

    const webhookId = uuidv4();
    const token = crypto.randomBytes(32).toString('hex');
    const webhookName = (name||'Webhook').slice(0,32);

    try {
      await db.createWebhook({ id: webhookId, channelId, name: webhookName, avatar: null, token, createdBy: user.id });
    } catch (err) {
      console.error('[Webhook] Failed to save webhook to DB:', err.message);
      return socket.emit('error', { message: 'Failed to create webhook' });
    }

    const webhook = { id: webhookId, name: webhookName, channelId, createdBy: user.id, createdAt: Date.now() };
    if (!ch.webhooks) ch.webhooks = [];
    ch.webhooks.push(webhook);
    const url = `${config.client.url}/api/webhooks/${webhookId}/${token}`;
    socket.emit('webhook:created', { webhook: { ...webhook, url } });
    io.emit('channel:updated', { serverId, channel: ch, channels: srv.channels, categories: srv.categories });
  });

  socket.on('webhook:delete', async ({ serverId, channelId, webhookId }) => {
    const user = state.users[socket.id];
    if (!user) return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.manageChannels && !perms.admin) return socket.emit('error', { message: 'No permission' });
    const srv = state.servers[serverId];
    const ch = srv?.channels.text.find(c => c.id === channelId);
    if (!ch) return;

    try {
      await db.deleteWebhook(webhookId);
    } catch (err) {
      console.error('[Webhook] Failed to delete webhook from DB:', err.message);
    }

    ch.webhooks = (ch.webhooks||[]).filter(w => w.id !== webhookId);
    io.emit('channel:updated', { serverId, channel: ch, channels: srv.channels, categories: srv.categories });
  });

};
