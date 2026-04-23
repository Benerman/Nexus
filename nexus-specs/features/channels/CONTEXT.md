# Channels Feature Context

Channels are the organizing unit for all messaging and voice activity. Changes here affect how messages and voice events are scoped and permissioned.

The most important invariant: a user who lacks Read Messages permission for a channel must never receive messages from that channel — not via history load, not via real-time emit. The server joins sockets to Socket.IO rooms at join time based on permissions; this logic must stay consistent with the permission resolver.
