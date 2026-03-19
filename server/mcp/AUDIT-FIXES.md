# MCP Audit Fixes Tracker

## CRITICAL

- [ ] **C1** — `mcp/auth.js:38` — No scope validation on REST token creation. Filter scopes against `VALID_SCOPES`.
- [ ] **C2** — `mcp/auth.js:178-184` — User JWT auto-granted admin scope. Should get contextual scopes based on actual permissions, not blanket admin.
- [ ] **C3** — `mcp/tools.js:397` — `search_messages` passes wrong args to `db.searchMessages`. Fix to `(serverId, { query, channelId, limit })`.

## HIGH

- [ ] **H1** — `mcp/index.js:218-224` — Bot tokens can create/delete other tokens via `requireUserAuth`. Block bot tokens from token management.
- [ ] **H2** — `mcp/tools.js:668,710` — `kick_member`/`ban_member` use global `io.emit`. Change to `io.to(server_id).emit`.
- [ ] **H3** — `mcp/tools.js:515` — `create_channel` uses global `io.emit`. Change to `io.to(server_id).emit`.
- [ ] **H4** — `mcp/tools.js:645-753` — No role hierarchy check on kick/ban/timeout. Add hierarchy check like regular handlers.
- [ ] **H5** — `mcp/tools.js:730-753` — `timeout_member` doesn't protect server owner. Add owner check.
- [ ] **H6** — `mcp/tools.js:345` — `delete_message` requires `moderate` scope even for own messages. Allow `write` scope for own-message deletion.
- [ ] **H7** — `handlers/mcp.js:262` — `mcp:connection:list` no permission check. Require server membership + manageServer.
- [ ] **H8** — `handlers/mcp.js:350` — `mcp:agent:list` no permission check. Require server membership + manageServer.
- [ ] **H9** — `handlers/mcp.js:150` — `mcp:bot:list` with serverId no membership check. Add membership check.
- [ ] **H10** — `handlers/mcp.js:444` — `mcp:stream:start` accepts client-supplied messageId. Always generate server-side UUID.
- [ ] **H11** — migration + `mcp/client.js` — `auth_config` JSONB column stores encrypted string. Change column to TEXT.
- [ ] **H12** — `mcp/resources.js:237` — User resource has no access control. Require shared server membership.
- [ ] **H13** — `mcp/resources.js:142` — Server members resource returns all members with no pagination. Add limit.
- [ ] **H14** — `mcp/client.js:17` — SSRF bypass via DNS rebinding. Validate resolved IP, not just hostname.
- [ ] **H15** — `mcp/events.js:40` — `io.emit` monkey-patch no double-registration guard. Add guard flag.
- [ ] **H16** — `mcp/events.js:73-78` — Non-message/channel SSE events skip server access check. Require serverId on all events.
- [ ] **H17** — `mcp/auth.js:20` — SHA-256 token hashing without salt. Use HMAC-SHA256 with server key.
- [ ] **H18** — `mcp/auth.js:196` — Encryption key falls back to static `'nexus-dev-secret'`. Fail if JWT_SECRET missing.
- [ ] **H19** — `mcp/auth.js:111` — `hasServerAccess` relies on in-memory state. Add DB fallback for membership check.

## MEDIUM

- [ ] **M1** — `mcp/events.js` — No SSE connection limit per token/account. Add max 5 per token.
- [ ] **M2** — `mcp/index.js:103` — No request body size limit on `/message`. Add 100KB limit.
- [ ] **M3** — `mcp/index.js:132-138` — JSON-RPC error codes from handlers not forwarded. Preserve `err.code`.
- [ ] **M4** — `mcp/tools.js:780-803` — `react_to_message` silently succeeds when message not in memory. Fetch from DB or return error.
- [ ] **M5** — `mcp/tools.js:98-110` — No validation on embed URLs. Block `javascript:` and `data:` URIs.
- [ ] **M6** — `handlers/mcp.js:462-478` — Stream chunks have no size limit. Cap at 4KB per chunk.
- [ ] **M7** — `mcp/resources.js` — No scope check on resource reads. Require `read` scope.
- [ ] **M8** — `handlers/mcp.js:94` — `[BOT]` username suffix can be impersonated. Reserve suffix in validation.
- [ ] **M9** — `mcp/auth.js` — No token count limit per account. Cap at 25.
- [ ] **M10** — `mcp/tools.js:932-953` — `create_automod_rule` no config validation. Add schema check.
- [ ] **M11** — `mcp/tools.js:494` — `create_channel` always sets position 0. Compute next position.
- [ ] **M12** — `mcp/tools.js:90` — `send_message` doesn't check if account exists (null crash). Add null check.
- [ ] **M13** — `mcp/tools.js:275-277` — `edit_message` doesn't verify message belongs to channel_id. Add cross-channel check.
- [ ] **M14** — `mcp/index.js:105` — Rate limiter key lets attackers multiply buckets by creating tokens. Use accountId always.
- [ ] **M15** — `mcp/index.js:46-57,162-169` — Duplicate capability declarations. Extract constant.
- [ ] **M16** — `mcp/auth.js:67` — `last_used_at` update silently swallows errors. Add minimal logging.
- [ ] **M17** — `mcp/auth.js:125-153` — `manage` scope is dead/unused in getBotPermissions. Wire it up or remove.
- [ ] **M18** — `mcp/client.js:119-125` — External MCP tool responses not sanitized. Sanitize before forwarding.
- [ ] **M19** — `mcp/client.js:199-203` — `enabled_tools` parsing inconsistent (string check for JSONB). Clean up.
- [ ] **M20** — `handlers/mcp.js:380-399` — Dynamic SQL construction in agent update. Acceptable but add comment.
- [ ] **M21** — `handlers/mcp.js:492` — `mcp:stream:end` truncates to 2000 silently. Reject like tools do.
- [ ] **M22** — `mcp/resources.js:73` — Resource URI regex overly permissive. Tighten pattern.
- [ ] **M23** — `mcp/resources.js:156-168` — Role permissions exposed to any server member. Consider filtering.
- [ ] **M24** — migration — No index on `bot_tokens.expires_at`. Add index.
- [ ] **M25** — migration — `server_id` is VARCHAR(64) not UUID. Acceptable but inconsistent.

## LOW

- [ ] **L1** — `mcp/client.js:106,149` — `Date.now()` as JSON-RPC ID. Use counter or UUID.
- [ ] **L2** — `mcp/client.js:59-75` — Timeout not in try/finally. Add cleanup.
- [ ] **L3** — `mcp/tools.js` — Inconsistent error return patterns. Standardize.
- [ ] **L4** — `mcp/events.js:16,127` — connectionCounter integer overflow (theoretical). Use BigInt or wrap.
- [ ] **L5** — `mcp/events.js:115-116` — SSE subscription filters not validated. Add basic validation.
- [ ] **L6** — `mcp/agent-engine.js:209-210` — Activity log truncates to 200 chars. Increase to 500.
- [ ] **L7** — `handlers/mcp.js:49` — Token list response uses same event name as request. Rename to `mcp:token:listed`.
- [ ] **L8** — `handlers/mcp.js:202` — `mcp:bot:delete` cascades everything. Add confirmation or soft-delete.
- [ ] **L9** — `mcp/tools.js:494` — `create_channel` always position 0. Already covered by M11.
- [ ] **L10** — migration:23-26 — Token rename migration deletes all existing tokens. Document better.
