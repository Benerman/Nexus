# Social Feature Spec

## Source Files

- `server/handlers/social.js` — friends, blocks, reports, invites

## Behaviors

- `friend:request` — send friend request. Cannot request a blocked user.
- `friend:accept`, `friend:decline` — accept/decline incoming request.
- `friend:remove` — unfriend.
- `user:block` — block a user. Removes any existing friendship. Prevents DMs.
- `user:unblock` — unblock.
- `user:report` — report a user for platform admin review.

## Edge Cases

- Friend request to blocked user — must be rejected
- Accepting already-accepted request — idempotent
- Block a user you have an active DM with — DM messaging must be blocked afterward
- Self-friend or self-block — must be rejected
