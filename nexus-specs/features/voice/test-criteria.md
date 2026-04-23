# Voice Test Criteria

- [ ] Voice join adds user to voiceChannels state and broadcasts presence
- [ ] Voice leave removes user from voiceChannels state
- [ ] Unclean disconnect cleans up voice and screen share state
- [ ] Screen share start adds to screenSharers; stop removes it
- [ ] User without View Channel permission cannot join voice
- [ ] Soundboard play is rate limited
- [ ] WebRTC signaling relay only reaches intended peer
