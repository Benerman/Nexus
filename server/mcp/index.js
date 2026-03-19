/**
 * MCP Server Router — Main entry point for the MCP API.
 *
 * Implements a subset of the Model Context Protocol over HTTP+SSE transport:
 *   - POST /api/mcp/message      — JSON-RPC 2.0 message handler
 *   - GET  /api/mcp/events       — SSE event stream
 *   - GET  /api/mcp/info         — Server capabilities (public)
 *   - POST /api/mcp/tokens       — Create bot token
 *   - GET  /api/mcp/tokens       — List bot tokens
 *   - DELETE /api/mcp/tokens/:id — Delete bot token
 *
 * MCP JSON-RPC methods:
 *   - initialize           — Client handshake
 *   - tools/list           — List available tools
 *   - tools/call           — Execute a tool
 *   - resources/list       — List resource templates
 *   - resources/read       — Read a resource
 *   - ping                 — Health check
 */

const express = require('express');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { requireMcpAuth, createBotToken, getBotTokens, deleteBotToken, validateBotToken } = require('./auth');
const { getToolDefinitions, executeTool } = require('./tools');
const { resourceTemplates, readResource } = require('./resources');
const { handleSSEConnection, registerEventBridge, getSSEConnectionCount } = require('./events');

// Per-token rate limiter for REST MCP message endpoint
const mcpRestLimiter = new RateLimiterMemory({ points: 30, duration: 10 });

const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'nexus-mcp';
const SERVER_VERSION = '1.0.0';

/**
 * Create the MCP Express router
 * @param {import('socket.io').Server} io - Socket.IO server instance
 */
function createMcpRouter(io) {
  const router = express.Router();

  // Register SSE event bridge with Socket.IO
  registerEventBridge(io);

  // ─── Public: Server info/capabilities ──────────────────────────────────
  router.get('/info', (req, res) => {
    res.json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        logging: {},
      },
      instructions: 'Nexus MCP Server — interact with channels, messages, members, and moderation via MCP tools. Authenticate with a bot token (Bearer nxbot_...).'
    });
  });

  // ─── Bot Token Management (requires user auth, not bot token) ─────────
  router.post('/tokens', requireUserAuth, async (req, res) => {
    try {
      const { name, scopes, serverIds, expiresInDays } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Token name is required' });
      }

      const token = await createBotToken({
        accountId: req.accountId,
        name: name.slice(0, 64),
        scopes: Array.isArray(scopes) ? scopes : ['read', 'write'],
        serverIds: Array.isArray(serverIds) ? serverIds : [],
        expiresInDays: expiresInDays || null
      });

      res.json(token);
    } catch (err) {
      console.error('[MCP] Token creation error:', err.message);
      res.status(500).json({ error: 'Failed to create token' });
    }
  });

  router.get('/tokens', requireUserAuth, async (req, res) => {
    try {
      const tokens = await getBotTokens(req.accountId);
      res.json({ tokens });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list tokens' });
    }
  });

  router.delete('/tokens/:tokenId', requireUserAuth, async (req, res) => {
    try {
      const deleted = await deleteBotToken(req.params.tokenId, req.accountId);
      if (!deleted) return res.status(404).json({ error: 'Token not found' });
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete token' });
    }
  });

  // ─── MCP JSON-RPC Message Handler (requires bot token) ────────────────
  router.post('/message', requireMcpAuth, async (req, res) => {
    // Per-token rate limiting
    const rateLimitKey = req.mcpAuth.tokenId || req.mcpAuth.accountId;
    try {
      await mcpRestLimiter.consume(rateLimitKey);
    } catch {
      return res.status(429).json({
        jsonrpc: '2.0', id: req.body?.id || null,
        error: { code: -32000, message: 'Rate limit exceeded' }
      });
    }

    const { jsonrpc, id, method, params } = req.body;

    if (jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0', id: id || null,
        error: { code: -32600, message: 'Invalid JSON-RPC version' }
      });
    }

    const context = {
      tokenData: req.mcpAuth,
      io
    };

    try {
      const result = await handleMethod(method, params || {}, context);
      res.json({ jsonrpc: '2.0', id: id || null, result });
    } catch (err) {
      console.error(`[MCP] Method error (${method}):`, err.message);
      res.json({
        jsonrpc: '2.0', id: id || null,
        error: { code: -32603, message: err.message }
      });
    }
  });

  // ─── SSE Event Stream (requires bot token) ────────────────────────────
  router.get('/events', requireMcpAuth, handleSSEConnection);

  // ─── SSE Metrics ──────────────────────────────────────────────────────
  router.get('/status', requireMcpAuth, (req, res) => {
    res.json({
      sseConnections: getSSEConnectionCount(),
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverName: SERVER_NAME,
      serverVersion: SERVER_VERSION
    });
  });

  return router;
}

/**
 * Handle MCP JSON-RPC methods
 */
async function handleMethod(method, params, context) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          logging: {},
        },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: 'Nexus MCP Server — interact with channels, messages, members, and moderation. Use tools/list to see available tools, resources/list for readable data.'
      };

    case 'ping':
      return {};

    case 'tools/list':
      return { tools: getToolDefinitions() };

    case 'tools/call': {
      const { name, arguments: args } = params;
      if (!name) throw new Error('Tool name is required');
      return executeTool(name, args || {}, context);
    }

    case 'resources/list':
      return { resourceTemplates };

    case 'resources/read': {
      const { uri } = params;
      if (!uri) throw new Error('Resource URI is required');
      return readResource(uri, context.tokenData);
    }

    case 'resources/templates/list':
      return { resourceTemplates };

    case 'logging/setLevel':
      // Acknowledge but don't change server log level
      return {};

    default:
      throw Object.assign(new Error(`Unknown method: ${method}`), { code: -32601 });
  }
}

/**
 * Middleware: authenticate via user JWT token (for token management endpoints)
 */
async function requireUserAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const token = authHeader.slice(7);

  // If it's a bot token, use the bot's account
  if (token.startsWith('nxbot_')) {
    const tokenData = await validateBotToken(token);
    if (!tokenData) return res.status(401).json({ error: 'Invalid bot token' });
    req.accountId = tokenData.accountId;
    return next();
  }

  // Otherwise, validate as user JWT token
  const db = require('../db');
  const accountId = await db.validateToken(token);
  if (!accountId) return res.status(401).json({ error: 'Invalid or expired token' });
  req.accountId = accountId;
  next();
}

module.exports = { createMcpRouter };
