# Servers Test Criteria

- [ ] Server create is atomic — all or nothing (server + channel + role)
- [ ] Server owner cannot leave server
- [ ] Kick requires Kick Members permission
- [ ] Ban requires Ban Members permission; banned user cannot rejoin
- [ ] Timeout requires Moderate Members permission
- [ ] Double-ban is idempotent (no error on second ban)
- [ ] Server delete cascades to channels, roles, members
