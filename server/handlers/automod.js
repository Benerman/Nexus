const db = require('../db');
const { state } = require('../state');
const { getUserPerms } = require('../helpers');
const { evaluateMessage, normalizeText } = require('../automod');

const VALID_RULE_TYPES = ['keyword', 'spam', 'invite_link', 'mention_spam'];
const VALID_ACTIONS = ['block', 'delete', 'warn', 'timeout'];

module.exports = function(io, socket) {

  socket.on('automod:get-rules', async ({ serverId }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    if (typeof callback !== 'function') return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin && !perms.manageServer && !perms.manageMessages) return callback({ error: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return callback({ error: 'Server not found' });

    callback({ rules: srv.automodRules || [] });
  });

  socket.on('automod:create-rule', async ({ serverId, name, ruleType, action, config, exemptRoles, exemptChannels, timeoutDuration }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    if (typeof callback !== 'function') return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin && !perms.manageServer && !perms.manageMessages) return callback({ error: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return callback({ error: 'Server not found' });

    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      return callback({ error: 'Invalid rule name' });
    }
    if (!VALID_RULE_TYPES.includes(ruleType)) {
      return callback({ error: 'Invalid rule type' });
    }
    if (action && !VALID_ACTIONS.includes(action)) {
      return callback({ error: 'Invalid action' });
    }

    try {
      const rule = await db.createAutomodRule(serverId, {
        name: name.trim(),
        ruleType,
        action: action || 'block',
        config: config || {},
        exemptRoles: exemptRoles || [],
        exemptChannels: exemptChannels || [],
        timeoutDuration: action === 'timeout' ? (timeoutDuration || 60) : null
      });

      if (!srv.automodRules) srv.automodRules = [];
      srv.automodRules.push(rule);

      try { await db.createAuditLog(serverId, 'automod_rule_create', user.id, null, { ruleName: name, ruleType }); } catch(e) {}

      callback({ rule });
    } catch (err) {
      console.error('[AutoMod] Error creating rule:', err.message);
      callback({ error: 'Failed to create rule' });
    }
  });

  socket.on('automod:update-rule', async ({ serverId, ruleId, updates }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    if (typeof callback !== 'function') return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin && !perms.manageServer && !perms.manageMessages) return callback({ error: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return callback({ error: 'Server not found' });

    if (updates.action && !VALID_ACTIONS.includes(updates.action)) {
      return callback({ error: 'Invalid action' });
    }

    try {
      const updated = await db.updateAutomodRule(ruleId, updates);
      if (!updated) return callback({ error: 'Rule not found' });

      // Update in-memory
      const idx = (srv.automodRules || []).findIndex(r => r.id === ruleId);
      if (idx !== -1) {
        srv.automodRules[idx] = updated;
      }

      try { await db.createAuditLog(serverId, 'automod_rule_update', user.id, null, { ruleId, changes: Object.keys(updates) }); } catch(e) {}

      callback({ rule: updated });
    } catch (err) {
      console.error('[AutoMod] Error updating rule:', err.message);
      callback({ error: 'Failed to update rule' });
    }
  });

  socket.on('automod:delete-rule', async ({ serverId, ruleId }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    if (typeof callback !== 'function') return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin && !perms.manageServer && !perms.manageMessages) return callback({ error: 'No permission' });
    const srv = state.servers[serverId];
    if (!srv) return callback({ error: 'Server not found' });

    try {
      await db.deleteAutomodRule(ruleId);
      srv.automodRules = (srv.automodRules || []).filter(r => r.id !== ruleId);

      try { await db.createAuditLog(serverId, 'automod_rule_delete', user.id, null, { ruleId }); } catch(e) {}

      callback({ success: true });
    } catch (err) {
      console.error('[AutoMod] Error deleting rule:', err.message);
      callback({ error: 'Failed to delete rule' });
    }
  });

  socket.on('automod:test-rule', async ({ serverId, ruleType, config, testContent }, callback) => {
    const user = state.users[socket.id];
    if (!user) return;
    if (typeof callback !== 'function') return;
    const perms = getUserPerms(user.id, serverId);
    if (!perms.admin && !perms.manageServer && !perms.manageMessages) return callback({ error: 'No permission' });

    if (!testContent || typeof testContent !== 'string') {
      return callback({ error: 'No test content provided' });
    }

    // Create a temporary rule for testing
    const testRule = {
      id: 'test', rule_type: ruleType, enabled: true, action: 'block',
      config: config || {}, exempt_roles: [], exempt_channels: []
    };

    const result = evaluateMessage({
      content: testContent,
      userId: 'test-user',
      serverId,
      channelId: 'test-channel',
      mentions: { users: [], roles: [], everyone: false },
      userRoles: [],
      rules: [testRule]
    });

    callback({
      matched: result.blocked,
      reason: result.reason,
      normalized: normalizeText(testContent)
    });
  });

};
