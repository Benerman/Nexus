# Auth Feature Spec

## Source Files

- `server/handlers/auth.js` — Socket.IO auth events (join, disconnect, user updates, password change)
- `server/index.js` — REST auth routes (`/api/auth/register`, `/api/auth/login`, `/api/auth/logout`)
- `server/validation.js` — Input validation for auth inputs
- `server/config.js` — JWT_SECRET loading and validation

## Behaviors

### Registration

- POST `/api/auth/register` — accepts `{ username, email, password }`.
- Username: 3–32 chars, alphanumeric + underscore + hyphen. Must be unique (case-insensitive).
- Email: valid format, must be unique.
- Password: minimum 8 characters.
- Password stored as bcrypt hash (12 rounds). Plain text never persisted.
- Returns: `{ token, user: { id, username, email, avatar } }` on success.
- On duplicate username/email: 409 with specific error message.
- On validation failure: 400 with specific field error.

### Login

- POST `/api/auth/login` — accepts `{ username, password }`.
- Rate limited: 5 attempts per 15 minutes per IP.
- Returns: `{ token, user: { id, username, email, avatar } }` on success.
- On failure: 401 `{ "error": "Invalid credentials" }` — same message for both bad username and bad password (no enumeration).
- JWT contains: `{ userId, username }`. Signed with `JWT_SECRET`.

### Logout

- POST `/api/auth/logout` — invalidates session (client removes token).
- Server does not maintain a token blocklist — logout is client-side only.

### Socket.IO Auth

- Client sends JWT as query param on connect: `io({ query: { token } })`.
- Server validates JWT in `server:join` handler before emitting any state.
- Invalid/expired JWT: socket immediately disconnected.
- On connect: server emits initial state (servers, channels, DMs) to the authenticated socket.

### Password Change

- Socket.IO `user:change-password` — requires `{ currentPassword, newPassword }`.
- Validates current password before accepting new one.
- New password: minimum 8 characters.

## Edge Cases

See `edge-cases.md`.
