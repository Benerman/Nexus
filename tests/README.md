# Nexus Test Suite

**Total: 88 tests** — 48 automated (Jest) + 40 manual test cases

## Setup

```bash
cd nexus/server
npm install
npm test
```

## Structure

```
tests/
├── README.md                           # This file
├── jest.config.js                      # Jest configuration
│
├── automated/                          # Jest unit tests (48 tests)
│   ├── validation.test.js              # 15 tests — input validation functions
│   ├── utils.test.js                   # 18 tests — utility functions (hash, token, duration, etc.)
│   └── permissions.test.js             # 15 tests — permission system + parsing
│
└── manual/                             # Manual test case documents (40 tests)
    ├── 01-authentication.md            # TC-001 to TC-005 (5 tests)
    ├── 02-messaging.md                 # TC-006 to TC-013 (8 tests)
    ├── 03-channels-and-servers.md      # TC-014 to TC-019 (6 tests)
    ├── 04-custom-emojis.md             # TC-020 to TC-024 (5 tests)
    ├── 05-voice-and-soundboard.md      # TC-025 to TC-028 (4 tests)
    ├── 06-social-and-dms.md            # TC-029 to TC-033 (5 tests)
    ├── 07-moderation.md                # TC-034 to TC-037 (4 tests)
    └── 08-ui-consistency.md            # TC-038 to TC-040 (3 tests)
```

## Automated Tests

Automated tests cover server-side logic that can be unit tested without a running server or database.

### validation.test.js (15 tests)
Tests the `server/validation.js` module:
- `validateUsername` — valid/invalid username formats
- `validatePassword` — password length requirements
- `validateMessage` — content length and newline limits
- `validateChannelName` — lowercase alphanumeric format
- `validateColor` — hex color code format
- `validateUUID` — UUID format validation
- `RateLimiter` — rate limiting within window and blocking when exceeded

### utils.test.js (18 tests)
Tests the `server/utils.js` module (extracted from index.js):
- `hashPassword` — deterministic hashing, salt differentiation
- `makeToken` — 64-char hex generation, uniqueness
- `parseDuration` — time string parsing (s/m/h/d/w)
- `getRandomRoast` — template replacement
- `DEFAULT_PERMS` — permission key completeness and defaults
- `makeCategory` — category object creation with UUID
- `parseMentions` — @username and @everyone detection
- `parseChannelLinks` — #channel-name detection

### permissions.test.js (15 tests)
Tests the permission system with mock server objects:
- `getUserPerms` — @everyone base, role merging, hierarchy, owner/admin override, channel overrides
- `getUserHighestRolePosition` — owner infinity, member positions, non-member fallback
- `parseMentions` — role mention detection
- `parseChannelLinks` — channel link detection in permission context

## Manual Tests

Manual tests cover end-to-end functionality that requires a running application. Each test case follows the format:

**ID | Title | Preconditions | Steps | Expected Result**

### Test Categories

| File | Tests | Coverage Area |
|------|-------|---------------|
| 01-authentication.md | TC-001 – TC-005 | Registration, login, session persistence |
| 02-messaging.md | TC-006 – TC-013 | Send, edit, delete, mentions, reactions, replies, polls |
| 03-channels-and-servers.md | TC-014 – TC-019 | Channel CRUD, server creation, invites |
| 04-custom-emojis.md | TC-020 – TC-024 | Upload, picker, inline render, delete, sharing toggle |
| 05-voice-and-soundboard.md | TC-025 – TC-028 | Voice join/leave, mute/deafen, soundboard playback |
| 06-social-and-dms.md | TC-029 – TC-033 | Friends, DMs, group DMs, blocking, webhooks |
| 07-moderation.md | TC-034 – TC-037 | Kick, ban, timeout, permission enforcement |
| 08-ui-consistency.md | TC-038 – TC-040 | Developer mode, state persistence, emoji picker behavior |

## Running Manual Tests

1. Start the application: `docker-compose up -d --build`
2. Open the client in a browser (default: http://localhost:3000)
3. Follow each test case step-by-step
4. For multi-user tests, open a second browser or incognito window
5. Record pass/fail results for each test case
