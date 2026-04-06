# MCP Connections

Nexus supports Model Context Protocol (MCP) server integration.

## Overview

MCP connections allow AI agents and tools to interact with Nexus channels. Connected MCP servers can:
- Receive channel messages
- Send responses
- Execute tools via `/mcp` slash commands
- List available tools via `/mcp-tools`

## Managing Connections

MCP connections are managed through server settings. Enable or disable connections per server.

## Slash Commands

| Command | Description |
|---------|-------------|
| `/mcp <tool_name> [JSON_args]` | Execute an MCP tool |
| `/mcp-tools` | List available MCP tools |
| `/summarize [count]` | Summarize channel messages (requires MCP) |

## Rate Limits

| Operation | Limit | Window |
|-----------|-------|--------|
| MCP messages | 30 | 10 seconds |
| MCP streaming | 30 | 10 seconds |
| MCP token creation | 5 | 60 seconds |
| MCP bot creation | 3 | 60 seconds |

## Related

- [Bot Accounts](bot-accounts.md) — Bot creation
- [Slash Commands](../user-guide/slash-commands.md) — All slash commands
