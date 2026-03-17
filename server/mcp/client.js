/**
 * MCP Client — Connects to external MCP servers and executes tools.
 *
 * Used when Nexus acts as an MCP client, connecting to external
 * MCP servers (GitHub, Jira, etc.) to make tools available in channels.
 */

const { state, channelToServer } = require('../state');

// Active MCP client connections: Map<connectionId, { config, toolCache, lastRefresh }>
const activeConnections = new Map();

/**
 * Discover tools from an external MCP server
 */
async function discoverTools(connection) {
  const { server_url, transport } = connection;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${server_url}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(connection.auth_config?.token ? { 'Authorization': `Bearer ${connection.auth_config.token}` } : {})
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'tools/list', params: {}
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

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

    const response = await fetch(`${server_url}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(connection.auth_config?.token ? { 'Authorization': `Bearer ${connection.auth_config.token}` } : {})
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args }
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { error: `MCP server returned ${response.status}` };
    }

    const data = await response.json();

    if (data.error) {
      return { error: data.error.message || 'Tool execution failed' };
    }

    return data.result || {};
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

    const response = await fetch(`${server_url}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(connection.auth_config?.token ? { 'Authorization': `Bearer ${connection.auth_config.token}` } : {})
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: Date.now(),
        method: 'resources/read',
        params: { uri }
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

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
    const enabledTools = typeof conn.enabled_tools === 'string'
      ? JSON.parse(conn.enabled_tools) : (conn.enabled_tools || []);

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
