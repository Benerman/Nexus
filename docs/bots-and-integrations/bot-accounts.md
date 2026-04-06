# Bot Accounts

Create bot accounts for automated interactions in Nexus.

## Bot Features

- Bot accounts display a **BOT** badge next to their username
- Bots can send messages, react, and interact via Socket.IO
- Bot tokens are managed through the API

## Creating a Bot

Bot accounts are created through the server settings or API. Each bot gets a unique token for authentication.

## Bot Capabilities

Bots can:
- Send and receive messages in channels they have access to
- React to messages
- Respond to slash commands
- Post via webhooks

## Rate Limits

Bots are subject to the same rate limits as regular users:
- MCP bot creation: 3 per 60 seconds
- MCP token creation: 5 per 60 seconds

## Related

- [Webhooks](../server-admin/webhooks.md) — HTTP-based message posting
- [MCP Connections](mcp-connections.md) — MCP integration
