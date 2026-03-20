/**
 * MCP Event Bridge — SSE stream that forwards Socket.IO events to MCP clients.
 *
 * Provides a Server-Sent Events endpoint so MCP clients can receive real-time
 * notifications (new messages, user joins, typing indicators, etc.) without
 * needing a full Socket.IO connection.
 *
 * Capture strategy:
 * - io.to(room).emit() and io.in(room).emit() are intercepted via proxy.
 *   Room name is parsed to inject _channelId for server-access resolution.
 * - socket.to(room).emit() and socket.broadcast are intercepted per-connection.
 * - io.emit() global broadcasts are intercepted via monkey-patch.
 * - No direct notifySSE() calls needed — all events are captured automatically.
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
  'voice:channel:update',
  'user:joined', 'user:left',
  'thread:new-reply'
]);

/**
 * Extract channel/server context from a Socket.IO room name.
 * Room names follow patterns like "text:{channelId}", "voice:{channelId}", or "{serverId}".
 * Returns enriched data with _channelId injected if extractable.
 */
function enrichWithRoomContext(room, data) {
  if (!data || typeof data !== 'object') return data || {};
  // Already has location info — no enrichment needed
  if (data.channelId || data._channelId || data.serverId) return data;
  if (typeof room !== 'string') return data;

  const enriched = { ...data };
  if (room.startsWith('text:') || room.startsWith('voice:')) {
    enriched._channelId = room.slice(room.indexOf(':') + 1);
  } else if (room.match(/^[0-9a-f-]{36}$/) || room === 'nexus-main') {
    // Looks like a serverId (UUID or default server)
    enriched.serverId = room;
  }
  return enriched;
}

/**
 * Register the SSE event bridge with Socket.IO.
 * Intercepts all emission patterns to forward events to SSE clients.
 */
function registerEventBridge(io) {
  if (eventBridgeRegistered) return;
  eventBridgeRegistered = true;

  // Helper: patch a BroadcastOperator chain's emit to forward to SSE
  function patchChainEmit(chain, room) {
    const origEmit = chain.emit.bind(chain);
    chain.emit = function(eventName, ...args) {
      if (FORWARDED_EVENTS.has(eventName)) {
        broadcastToSSE(eventName, enrichWithRoomContext(room, args[0]));
      }
      return origEmit(eventName, ...args);
    };
    return chain;
  }

  // Intercept io.to(room).emit()
  const origTo = io.to.bind(io);
  io.to = function(room) {
    return patchChainEmit(origTo(room), room);
  };

  // Intercept io.in(room).emit() — alias for io.to()
  const origIn = io.in.bind(io);
  io.in = function(room) {
    return patchChainEmit(origIn(room), room);
  };

  // Intercept socket.to() and socket.broadcast per connection
  io.on('connection', (socket) => {
    const origSocketTo = socket.to.bind(socket);
    socket.to = function(room) {
      return patchChainEmit(origSocketTo(room), room);
    };

    // socket.broadcast is a getter returning a NEW BroadcastOperator each access
    const broadcastDescriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(socket), 'broadcast'
    );
    if (broadcastDescriptor && broadcastDescriptor.get) {
      const origBroadcastGet = broadcastDescriptor.get;
      Object.defineProperty(socket, 'broadcast', {
        get: function() {
          const chain = origBroadcastGet.call(this);
          const origEmit = chain.emit.bind(chain);
          chain.emit = function(eventName, ...args) {
            if (FORWARDED_EVENTS.has(eventName)) {
              broadcastToSSE(eventName, args[0]);
            }
            return origEmit(eventName, ...args);
          };
          return chain;
        },
        configurable: true
      });
    }
  });

  // Intercept io.emit() — global broadcasts (e.g., voice:channel:update)
  // io.emit delegates to io.sockets.emit internally, so only patch io.emit
  const origIoEmit = io.emit.bind(io);
  io.emit = function(eventName, ...args) {
    if (FORWARDED_EVENTS.has(eventName)) {
      broadcastToSSE(eventName, args[0]);
    }
    return origIoEmit(eventName, ...args);
  };
}

/**
 * Notify SSE clients directly — for cases where events are emitted
 * outside of Socket.IO (e.g., direct HTTP-triggered notifications).
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
      if (conn.subscriptions.events.length > 0 && !conn.subscriptions.events.includes(eventName)) {
        continue;
      }

      // Resolve channel/server location from data fields
      const channelId = data?._channelId || data?.channelId;
      const serverId = data?.serverId || (channelId ? channelToServer.get(channelId) : null);

      // Skip events with no determinable serverId — can't verify access
      if (!serverId) continue;

      if (!hasServerAccess(conn.tokenData, serverId)) {
        continue;
      }

      // Check channel subscription filter
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

      conn.res.write(`event: ${eventName}\ndata: ${JSON.stringify(cleanData)}\n\n`);
    } catch (err) {
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

  const channels = req.query.channels ? req.query.channels.split(',').filter(Boolean) : [];
  const events = req.query.events ? req.query.events.split(',').filter(Boolean) : [];

  // Limit connections per account (max 5)
  const MAX_SSE_PER_TOKEN = 5;
  let tokenConnCount = 0;
  for (const [, conn] of sseConnections) {
    if (conn.tokenData.accountId === tokenData.accountId) tokenConnCount++;
  }
  if (tokenConnCount >= MAX_SSE_PER_TOKEN) {
    return res.status(429).json({ error: 'Too many SSE connections (max 5 per account)' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const connId = ++connectionCounter;
  res.write(`event: connected\ndata: ${JSON.stringify({ connectionId: connId, subscriptions: { channels, events } })}\n\n`);

  sseConnections.set(connId, {
    res,
    tokenData,
    subscriptions: { channels, events }
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      sseConnections.delete(connId);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseConnections.delete(connId);
  });
}

function getSSEConnectionCount() {
  return sseConnections.size;
}

module.exports = {
  registerEventBridge,
  handleSSEConnection,
  getSSEConnectionCount,
  notifySSE,
};
