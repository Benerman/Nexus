# Servers Feature Context

Servers are the top-level organizational unit. Server create uses an explicit DB transaction to ensure atomicity (server + default channel + everyone role must all succeed or none persist).

Member management (kick/ban/timeout) is the primary moderation surface. These operations must verify caller permissions and must not allow self-targeting in ways that could destabilize the server.
