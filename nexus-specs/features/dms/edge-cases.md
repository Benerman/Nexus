# DMs Edge Cases

- DM between blocked users — server must reject
- Message from non-friend goes to requests, not direct delivery
- DM with self — should be blocked or handled gracefully
- Group DM over participant limit
- DM call to offline user — should not crash, rings and times out
