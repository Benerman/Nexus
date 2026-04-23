# Messaging Test Criteria

- [ ] Send message stores in DB and broadcasts to channel room
- [ ] Message content > 4000 chars is rejected
- [ ] Edit updates content; only author can edit
- [ ] Delete removes message from channel; author and mods can delete
- [ ] Reaction toggle: add reaction, add same reaction again removes it
- [ ] Pin requires Manage Messages permission
- [ ] Search returns messages matching query within the channel
- [ ] URL preview does not fetch private/internal IPs (SSRF blocked)
- [ ] XSS payload in message content is escaped on render, not executed
- [ ] Thread create links reply to parent message
- [ ] Unauthenticated send is rejected
- [ ] Non-member of channel cannot send or read messages
