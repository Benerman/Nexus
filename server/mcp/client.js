/**
 * MCP Client — Connects to external MCP servers and executes tools.
 *
 * Used when Nexus acts as an MCP client, connecting to external
 * MCP servers (GitHub, Jira, etc.) to make tools available in channels.
 */

const dns = require('dns').promises;
const { state, channelToServer } = require('../state');
const { isPrivateUrl } = require('../utils');

// Active MCP client connections: Map<connectionId, { config, toolCache, lastRefresh }>
const activeConnections = new Map();
let jsonRpcIdCounter = 0;

/**
 * Check if a resolved IP is private/internal
 */
function isPrivateIP(ip) {
  return /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.|::1|fe80:|fc00:|fd)/.test(ip);
}

/**
 * Safe fetch with SSRF protection, DNS rebinding guard, and redirect guarding
 */
async function safeFetch(url, options = {}) {
  if (isPrivateUrl(url)) {
    throw new Error('SSRF protection: private/internal URL blocked');
  }

  // Resolve DNS and check actual IP to prevent DNS rebinding
  const parsed = new URL(url);
  try {
    const { address } = await dns.lookup(parsed.hostname);
    if (isPrivateIP(address)) {
      throw new Error('SSRF protection: hostname resolves to private IP');
    }
  } catch (err) {
    if (err.message.includes('SSRF')) throw err;
    // DNS resolution failed — block to be safe
    throw new Error(`SSRF protection: DNS resolution failed for ${parsed.hostname}`);
  }

  const resp = await fetch(url, { ...options, redirect: 'manual' });
  if (resp.status < 300 || resp.status >= 400) return resp;
  const location = resp.headers.get('location');
  if (!location) return resp;
  const redirectUrl = new URL(location, url).toString();
  if (isPrivateUrl(redirectUrl)) {
    throw new Error('SSRF protection: redirect to private URL blocked');
  }
  // Check redirect target resolved IP too
  const redirectParsed = new URL(redirectUrl);
  try {
    const { address } = await dns.lookup(redirectParsed.hostname);
    if (isPrivateIP(address)) {
      throw new Error('SSRF protection: redirect resolves to private IP');
    }
  } catch (err) {
    if (err.message.includes('SSRF')) throw err;
    throw new Error(`SSRF protection: DNS resolution failed for redirect ${redirectParsed.hostname}`);
  }
  return fetch(redirectUrl, { ...options, redirect: 'manual' });
}

/**
 * Get auth headers from connection auth_config (decrypting if needed)
 */
function getAuthHeaders(connection) {
  let authConfig = connection.auth_config;
  if (typeof authConfig === 'string' && authConfig.length > 0 && authConfig !== '{}') {
    try {
      const { decryptJson } = require('./auth');
      authConfig = decryptJson(authConfig);
    } catch {
      // If decryption fails, try parsing as plain JSON (legacy)
      try { authConfig = JSON.parse(authConfig); } catch { authConfig = {}; }
    }
  }
  if (authConfig?.token) {
    return { 'Authorization': `Bearer ${authConfig.token}` };
  }
  return {};
}

/**
 * Discover tools from an external MCP server
 */
async function discoverTools(connection) {
  const { server_url } = connection;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await safeFetch(`${server_url}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(connection)
        },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'tools/list', params: {}
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}`);
    }

    const data = await response.json();
    return data.result?.tools || [];
  } catch (err) {
    console.error(`[MCP Client] Failed to discover tools from ${server_url}:`, err.message);
    return [];
  }
}

/**
 * Execute a tool on an external MCP server
 */
async function executeTool(connection, toolName, args) {
  const { server_url } = connection;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      response = await safeFetch(`${server_url}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(connection)
        },
        body: JSON.stringify({
          jsonrpc: '2.0', id: ++jsonRpcIdCounter,
          method: 'tools/call',
          params: { name: toolName, arguments: args }
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return { error: `MCP server returned ${response.status}` };
    }

    const data = await response.json();

    if (data.error) {
      // Sanitize error message — don't forward raw external errors
      const msg = typeof data.error.message === 'string'
        ? data.error.message.slice(0, 500) : 'Tool execution failed';
      return { error: msg };
    }

    // Sanitize response — strip any unexpected top-level fields
    const result = data.result || {};
    return {
      content: Array.isArray(result.content) ? result.content.map(c => ({
        type: typeof c.type === 'string' ? c.type : 'text',
        text: typeof c.text === 'string' ? c.text.slice(0, 50000) : ''
      })) : result.content,
      ...(result.isError && { isError: true })
    };
  } catch (err) {
    console.error(`[MCP Client] Tool execution error (${toolName}):`, err.message);
    return { error: err.message };
  }
}

/**
 * Read a resource from an external MCP server
 */
async function readResource(connection, uri) {
  const { server_url } = connection;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await safeFetch(`${server_url}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(connection)
        },
        body: JSON.stringify({
          jsonrpc: '2.0', id: ++jsonRpcIdCounter,
          method: 'resources/read',
          params: { uri }
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return { error: `MCP server returned ${response.status}` };
    }

    const data = await response.json();
    return data.result || {};
  } catch (err) {
    console.error(`[MCP Client] Resource read error (${uri}):`, err.message);
    return { error: err.message };
  }
}

/**
 * Get all available MCP tools for a server (from all active connections)
 */
async function getAvailableTools(serverId) {
  const db = require('../db');
  const result = await db.query(
    `SELECT * FROM mcp_connections WHERE server_id = $1 AND enabled = true`,
    [serverId]
  );

  const allTools = [];

  for (const conn of result.rows) {
    // Check LAN mode
    const srv = state.servers[serverId];
    if (srv?.lanMode) continue;

    // Use cached tools if recent (5 min)
    const cached = activeConnections.get(conn.id);
    if (cached && (Date.now() - cached.lastRefresh) < 5 * 60 * 1000) {
      allTools.push(...cached.toolCache.map(t => ({ ...t, connectionId: conn.id, connectionName: conn.name })));
      continue;
    }

    // Discover tools
    const tools = await discoverTools(conn);
    activeConnections.set(conn.id, { config: conn, toolCache: tools, lastRefresh: Date.now() });

    // Filter to enabled tools if whitelist is specified
    const enabledTools = Array.isArray(conn.enabled_tools) ? conn.enabled_tools : [];

    const filtered = enabledTools.length > 0
      ? tools.filter(t => enabledTools.includes(t.name))
      : tools;

    allTools.push(...filtered.map(t => ({ ...t, connectionId: conn.id, connectionName: conn.name })));
  }

  return allTools;
}

/**
 * Execute a tool from a specific connection
 */
async function executeConnectionTool(connectionId, toolName, args) {
  const cached = activeConnections.get(connectionId);
  if (cached) {
    return executeTool(cached.config, toolName, args);
  }

  // Load connection from DB
  const db = require('../db');
  const result = await db.query('SELECT * FROM mcp_connections WHERE id = $1', [connectionId]);
  if (result.rows.length === 0) return { error: 'Connection not found' };

  return executeTool(result.rows[0], toolName, args);
}

/**
 * Clear cached connections for a server
 */
function clearConnectionCache(serverId) {
  for (const [connId, conn] of activeConnections) {
    if (conn.config.server_id === serverId) {
      activeConnections.delete(connId);
    }
  }
}

module.exports = {
  discoverTools,
  executeTool,
  readResource,
  getAvailableTools,
  executeConnectionTool,
  clearConnectionCache,
};
