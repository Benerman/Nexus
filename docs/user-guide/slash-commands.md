# Slash Commands

Nexus includes built-in slash commands for quick actions.

## Available Commands

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/roll` | `[d{sides}]` | Roll dice. Default: d6. Range: d6–d1000. Example: `/roll d20` |
| `/coinflip` or `/flip` | — | Flip a coin (heads or tails) |
| `/8ball` | `<question>` | Ask the Magic 8-Ball a question |
| `/choose` | `option1 \| option2 \| ...` | Randomly choose from 2+ pipe-separated options |
| `/rps` | `rock`, `paper`, or `scissors` | Play Rock-Paper-Scissors against the bot |
| `/serverinfo` | — | Display server statistics (members, channels, creation date) |
| `/remindme` | `<duration> <message>` | Set a reminder. Max duration: 1 week |
| `/quack` | — | Get a random duck image |
| `/criticize` | `<target>` | Start (or stop) daily roasts for a target (max 100 chars) |
| `/poll` | — | Opens the poll creation modal (handled client-side) |
| `/summarize` | `[count]` | Summarize recent channel messages (requires MCP connection) |
| `/mcp` | `<tool_name> [JSON_args]` | Execute an MCP tool |
| `/mcp-tools` | — | List available MCP tools |

## Duration Format (for `/remindme`)

| Unit | Meaning |
|------|---------|
| `s` | Seconds |
| `m` | Minutes |
| `h` | Hours |
| `d` | Days |
| `w` | Weeks |

Examples: `30m`, `2h`, `1d`, `1w`

Maximum reminder duration: 1 week (604,800,000 ms).

## Rate Limits

| Commands | Limit |
|----------|-------|
| `/roll`, `/coinflip`, `/8ball`, `/choose`, `/rps`, `/serverinfo`, `/quack` | 30 per 10 seconds |
| `/remindme`, `/criticize`, `/poll` | 20 per 60 seconds |

## Related

- [Messaging](messaging.md) — Sending messages
- [MCP Connections](../bots-and-integrations/mcp-connections.md) — MCP integration
