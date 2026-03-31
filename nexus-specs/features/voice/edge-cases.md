# Voice Edge Cases

- Unclean disconnect — voice and screen share state must be cleaned up automatically
- Server restart — all voice state lost; clients must recover gracefully
- User joins channel they lack View Channel permission for
- Soundboard rate limit bypass attempt
- Screen sharer leaves abruptly (tab close) — must clean up screenSharers
- WebRTC signaling relay to wrong peer (targetId mismatch)
- Large channel > 8 peers — mesh degrades but should not crash
