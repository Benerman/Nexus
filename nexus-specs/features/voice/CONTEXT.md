# Voice Feature Context

Voice uses P2P WebRTC mesh — no SFU. All signaling goes through Socket.IO. Voice channel membership is purely in-memory state (`state.js`) and is lost on server restart.

`useWebRTC.js` (53KB) is the most complex client-side file. It manages multiple peer connections, handles reconnection, and coordinates audio processing (noise gate, AGC, RNNoise). Changes here require careful integration testing.

The main scalability limit: P2P mesh degrades above ~8 participants. This is a known architectural constraint, not a bug.

Screen share state is also in-memory. If a user disconnects uncleanly, the server must detect this and remove them from `screenSharers` to prevent stale state.
