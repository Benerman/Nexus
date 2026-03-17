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

/**
 * Register the SSE event bridge with Socket.IO
 * Listens to io events and forwards them to subscribed SSE clients.
 */
function registerEventBridge(io) {
  // Intercept outgoing Socket.IO events and forward to SSE clients
  const originalEmit = io.emit.bind(io);

  // We monkey-patch io.to().emit() by intercepting at the room level
  // Instead, we hook into the message pipeline directly
  io.use((socket, next) => {
    const origSocketEmit = socket.emit.bind(socket);
    // We don't patch individual socket emits — SSE clients subscribe at the server level
    next();
  });

  // Periodically check for relevant events to forward
  // More efficient: hook into specific event broadcasts

  // Listen to internal events on the io instance
  io.on('connection', (socket) => {
    // Forward key events from this socket to SSE clients
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

  // Also hook into server-level broadcasts
  const origIoEmit = io.emit.bind(io);
  io.emit = function(eventName, ...args) {
    broadcastToSSE(eventName, args[0]);
    return origIoEmit(eventName, ...args);
  };

  // Hook into room-level broadcasts (io.to('text:channelId').emit(...))
  const origTo = io.to.bind(io);
  io.to = function(room) {
    const broadcaster = origTo(room);
    const origBroadcastEmit = broadcaster.emit.bind(broadcaster);
    broadcaster.emit = function(eventName, ...args) {
      // Extract channelId from room name (format: "text:channelId")
      const channelId = room.startsWith('text:') ? room.slice(5) : null;
      if (channelId) {
        broadcastToSSE(eventName, { ...args[0], _channelId: channelId });
      }
      return origBroadcastEmit(eventName, ...args);
    };
    return broadcaster;
  };
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

      if (serverId && !hasServerAccess(conn.tokenData, serverId)) {
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
};
