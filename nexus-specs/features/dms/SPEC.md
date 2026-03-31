# DMs Feature Spec

## Source Files

- `server/handlers/dms.js` — DM create/list/message, group DMs, message requests, calls

## Behaviors

- `dm:create` — open a DM with a user. Blocked users cannot DM each other.
- `dm:send` — send message in DM. Non-friends go to message requests.
- `dm:accept-request`, `dm:decline-request` — accept/decline message request from non-friend.
- `dm:group-create` — create a group DM with multiple users. Max ~10 participants.
- Group DM: `dm:group-add`, `dm:group-remove`.
- DM history is persistent — unlike voice, persisted in DB.
- DM calls: `dm:call-start`, `dm:call-accept`, `dm:call-decline`, `dm:call-end` — 1:1 voice/video via WebRTC.

## Edge Cases

- DM with blocked user — must be blocked at server
- Message request from non-friend — goes to pending, not delivered directly
- Group DM with > max participants
- DM call while recipient is offline — call rings, not answered
