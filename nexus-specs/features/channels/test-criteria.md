# Channels Test Criteria

- [ ] Channel create requires Manage Channels permission
- [ ] Channel delete cascades messages and permission overrides
- [ ] Category delete does not delete channels in it
- [ ] User without Read Messages cannot receive message history
- [ ] User without Read Messages is not emitted real-time messages
- [ ] Channel permission override stores allow/deny bits correctly
- [ ] Channel name > 100 chars is rejected
