/**
 * MCP Event Bridge — SSE stream that forwards Socket.IO events to MCP clients.
 *
 * Provides a Server-Sent Events endpoint so MCP clients can receive real-time
 * notifications (new messages, user joins, typing indicators, etc.) without
 * needing a full Socket.IO connection.
 */

const { state, channelToServer } = require('../state');
const { hasServerAccess } = require('./auth');
const { getUserPerms } = require('../helpers');

// Active SSE connections: Map<connectionId, { res, tokenData, subscriptions }>
const sseConnections = new Map();
let connectionCounter = 0;
let eventBridgeRegistered = false;

/**
 * Register the SSE event bridge with Socket.IO
 * Listens to io events and forwards them to subscribed SSE clients.
 */
function registerEventBridge(io) {
  // Guard against double registration (hot-reload, tests)
  if (eventBridgeRegistered) return;
  eventBridgeRegistered = true;

  // Listen to internal events on connected sockets
  io.on('connection', (socket) => {
    const eventsToForward = [
      'message:new', 'message:edited', 'message:deleted', 'message:reacted',
      'user:joined', 'user:left', 'typing:start', 'typing:stop',
      'channel:created', 'channel:deleted', 'channel:updated',
      'server:member-joined', 'server:member-left',
      'voice:user-joined', 'voice:user-left'
    ];

    for (const eventName of eventsToForward) {
      socket.on(eventName, (data) => {
        broadcastToSSE(eventName, data);
      });
    }
  });

  // Hook into server-level global broadcasts (io.emit)
  const origIoEmit = io.emit.bind(io);
  io.emit = function(eventName, ...args) {
    broadcastToSSE(eventName, args[0]);
    return origIoEmit(eventName, ...args);
  };
}

/**
 * Notify SSE clients directly — use instead of monkey-patching io.to()
 * Call this from handlers after broadcasting via io.to().emit()
 */
function notifySSE(eventName, data) {
  broadcastToSSE(eventName, data);
}

/**
 * Forward an event to all SSE clients that have matching subscriptions
 */
function broadcastToSSE(eventName, data) {
  if (sseConnections.size === 0) return;

  for (const [connId, conn] of sseConnections) {
    try {
      // Check if this client is subscribed to this event type
      if (conn.subscriptions.events && !conn.subscriptions.events.includes(eventName)) {
        continue;
      }

      // Check channel/server access if event has location info
      const channelId = data?._channelId || data?.channelId;
      const serverId = data?.serverId || (channelId ? channelToServer.get(channelId) : null);

      // Skip all events with no determinable serverId — can't verify access
      if (!serverId) continue;

      if (!hasServerAccess(conn.tokenData, serverId)) {
        continue;
      }

      // Check channel subscription filter
      if (conn.subscriptions.channels && conn.subscriptions.channels.length > 0) {
        if (channelId && !conn.subscriptions.channels.includes(channelId)) {
          continue;
        }
      }

      // Check read permission for message events
      if (eventName.startsWith('message:') && channelId && serverId) {
        const perms = getUserPerms(conn.tokenData.accountId, serverId, channelId);
        if (!perms.readHistory) continue;
      }

      // Clean internal fields before sending
      const cleanData = { ...data };
      delete cleanData._channelId;

      // Send SSE event
      conn.res.write(`event: ${eventName}\ndata: ${JSON.stringify(cleanData)}\n\n`);
    } catch (err) {
      // Connection probably closed
      sseConnections.delete(connId);
    }
  }
}

/**
 * Express handler for SSE event stream
 * GET /api/mcp/events?channels=ch1,ch2&events=message:new,typing:start
 */
function handleSSEConnection(req, res) {
  const tokenData = req.mcpAuth;

  // Parse subscription filters from query params
  const channels = req.query.channels ? req.query.channels.split(',').filter(Boolean) : [];
  const events = req.query.events ? req.query.events.split(',').filter(Boolean) : [];

  // Limit connections per token/account (max 5)
  const MAX_SSE_PER_TOKEN = 5;
  let tokenConnCount = 0;
  for (const [, conn] of sseConnections) {
    if (conn.tokenData.accountId === tokenData.accountId) tokenConnCount++;
  }
  if (tokenConnCount >= MAX_SSE_PER_TOKEN) {
    return res.status(429).json({ error: 'Too many SSE connections (max 5 per account)' });
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable nginx buffering
  });

  // Send initial connection event
  const connId = ++connectionCounter;
  res.write(`event: connected\ndata: ${JSON.stringify({ connectionId: connId, subscriptions: { channels, events } })}\n\n`);

  // Store connection
  sseConnections.set(connId, {
    res,
    tokenData,
    subscriptions: { channels, events }
  });

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      sseConnections.delete(connId);
    }
  }, 30000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    sseConnections.delete(connId);
  });
}

/**
 * Get current SSE connection count (for metrics)
 */
function getSSEConnectionCount() {
  return sseConnections.size;
}

module.exports = {
  registerEventBridge,
  handleSSEConnection,
  getSSEConnectionCount,
  notifySSE,
};
