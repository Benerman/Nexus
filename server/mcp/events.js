/**
 * MCP Event Bridge — SSE stream that forwards Socket.IO events to MCP clients.
 *
 * Provides a Server-Sent Events endpoint so MCP clients can receive real-time
 * notifications (new messages, user joins, typing indicators, etc.) without
 * needing a full Socket.IO connection.
 *
 * Capture strategy:
 * - io.to(room).emit() broadcasts are intercepted via BroadcastOperator proxy
 * - io.emit() global broadcasts are intercepted via monkey-patch
 * - notifySSE() is called directly from MCP tool handlers
 */

const { state, channelToServer } = require('../state');
const { hasServerAccess } = require('./auth');
const { getUserPerms } = require('../helpers');

// Active SSE connections: Map<connectionId, { res, tokenData, subscriptions }>
const sseConnections = new Map();
let connectionCounter = 0;
let eventBridgeRegistered = false;

// Events we forward to SSE clients
const FORWARDED_EVENTS = new Set([
  'message:new', 'message:edited', 'message:deleted', 'message:reacted', 'message:pinned',
  'typing:start', 'typing:stop',
  'channel:created', 'channel:deleted', 'channel:updated',
  'server:updated', 'server:member-joined', 'server:member-left',
  'server:member-kicked', 'server:member-banned',
  'server:member-timeout', 'server:member-timeout-removed',
  'voice:channel:update',  // io.emit — full voice channel state on join/leave
  'user:joined', 'user:left',
  'thread:new-reply'
]);

/**
 * Register the SSE event bridge with Socket.IO
 * Intercepts io.to().emit() and io.emit() to forward events to SSE clients.
 */
function registerEventBridge(io) {
  // Guard against double registration (hot-reload, tests)
  if (eventBridgeRegistered) return;
  eventBridgeRegistered = true;

  // Intercept io.to(room).emit() — captures all room-targeted broadcasts
  const origTo = io.to.bind(io);
  io.to = function(room) {
    const chain = origTo(room);
    const origEmit = chain.emit.bind(chain);
    chain.emit = function(eventName, ...args) {
      if (FORWARDED_EVENTS.has(eventName)) {
        broadcastToSSE(eventName, args[0]);
      }
      return origEmit(eventName, ...args);
    };
    return chain;
  };

  // Also intercept io.in() which is an alias for io.to()
  const origIn = io.in.bind(io);
  io.in = function(room) {
    const chain = origIn(room);
    const origEmit = chain.emit.bind(chain);
    chain.emit = function(eventName, ...args) {
      if (FORWARDED_EVENTS.has(eventName)) {
        broadcastToSSE(eventName, args[0]);
      }
      return origEmit(eventName, ...args);
    };
    return chain;
  };

  // Intercept socket.to().emit() and socket.broadcast.emit() on each new connection
  // This captures per-socket room broadcasts (typing, peer events)
  io.on('connection', (socket) => {
    const patchChain = (chain) => {
      const origEmit = chain.emit.bind(chain);
      chain.emit = function(eventName, ...args) {
        if (FORWARDED_EVENTS.has(eventName)) {
          broadcastToSSE(eventName, args[0]);
        }
        return origEmit(eventName, ...args);
      };
      return chain;
    };

    const origSocketTo = socket.to.bind(socket);
    socket.to = function(room) { return patchChain(origSocketTo(room)); };

    // socket.broadcast is a getter that returns a NEW BroadcastOperator each access.
    // Override the getter to patch each new instance.
    const broadcastDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(socket), 'broadcast');
    if (broadcastDescriptor && broadcastDescriptor.get) {
      const origBroadcastGet = broadcastDescriptor.get;
      Object.defineProperty(socket, 'broadcast', {
        get: function() { return patchChain(origBroadcastGet.call(this)); },
        configurable: true
      });
    }
  });

  // Hook into server-level global broadcasts (io.emit)
  // io.emit delegates to io.sockets.emit — patch both to be safe
  const origIoEmit = io.emit.bind(io);
  io.emit = function(eventName, ...args) {
    if (FORWARDED_EVENTS.has(eventName)) {
      broadcastToSSE(eventName, args[0]);
    }
    return origIoEmit(eventName, ...args);
  };

  // Also patch the default namespace emit (io.sockets = io.of('/'))
  if (io.sockets && io.sockets.emit) {
    const origNsEmit = io.sockets.emit.bind(io.sockets);
    io.sockets.emit = function(eventName, ...args) {
      if (FORWARDED_EVENTS.has(eventName)) {
        broadcastToSSE(eventName, args[0]);
      }
      return origNsEmit(eventName, ...args);
    };
  }
}

/**
 * Notify SSE clients directly — call from MCP tool handlers
 * after broadcasting via io.to().emit()
 */
function notifySSE(eventName, data) {
  broadcastToSSE(eventName, data);
}

/**
 * Forward an event to all SSE clients that have matching subscriptions
 */
function broadcastToSSE(eventName, data) {
  // Temporary debug logging for voice events
  if (eventName === 'voice:channel:update') {
    const chId = data?._channelId || data?.channelId;
    console.log('[SSE DEBUG] voice:channel:update →', {
      sseClients: sseConnections.size,
      channelId: chId,
      serverId: data?.serverId,
      mapLookup: channelToServer.get(chId) || 'NOT_FOUND',
      mapSize: channelToServer.size
    });
  }
  if (sseConnections.size === 0) return;

  for (const [connId, conn] of sseConnections) {
    try {
      // Check if this client is subscribed to this event type
      // Empty events array = subscribe to all events (no filter)
      if (conn.subscriptions.events.length > 0 && !conn.subscriptions.events.includes(eventName)) {
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
      // Empty channels array = subscribe to all channels (no filter)
      if (conn.subscriptions.channels.length > 0) {
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
