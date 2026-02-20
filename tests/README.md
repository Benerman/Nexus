# Nexus Test Suite

**Total: 225 unit tests + 86 Playwright UI tests + 40 manual test cases**

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
├── babel.config.js                     # Babel config for ES module transform
│
├── automated/                          # Jest unit tests (225 tests, ~96% coverage)
│   ├── validation.test.js              # 65 tests — all 17 validators + RateLimiter
│   ├── utils.test.js                   # 55 tests — hash, token, perms, mentions, SSRF
│   ├── permissions.test.js             # 15 tests — permission system + parsing
│   ├── security.test.js                # 25 tests — SSRF, tokens, bearer extraction
│   ├── config.test.js                  # 18 tests — server config defaults & env vars
│   ├── default-sounds.test.js          # 16 tests — WAV sound generation & structure
│   └── client/                         # Client-side module tests
│       ├── config.test.js              # 15 tests — server URL resolution & platform detection
│       └── socketTimeout.test.js       # 16 tests — socket emit wrappers & timeouts
│
├── e2e/                                # Playwright UI uptime tests (86 tests)
│   ├── playwright.config.js            # Playwright configuration
│   ├── package.json                    # E2E test dependencies
│   ├── helpers/                        # Test utilities and screenshot helpers
│   │   ├── test-utils.js               # Navigation, auth, viewport helpers
│   │   └── screenshots.js              # Screenshot capture utilities
│   ├── specs/                          # Test spec files
│   │   ├── 01-server-setup.spec.js     # Server setup screen (11 tests)
│   │   ├── 02-login-register.spec.js   # Login/register forms (18 tests)
│   │   ├── 03-app-layout-desktop.spec.js # Desktop layout (9 tests)
│   │   ├── 04-app-layout-mobile.spec.js  # Mobile layout (14 tests)
│   │   ├── 05-settings-modal.spec.js   # Settings modal (6 tests)
│   │   ├── 06-chat-area.spec.js        # Chat input area (8 tests)
│   │   ├── 07-accessibility.spec.js    # Accessibility & keyboard nav (8 tests)
│   │   └── 08-responsive-breakpoints.spec.js # Responsive breakpoints (12 tests)
│   └── screenshots/                    # Auto-captured screenshots (CI artifacts)
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

## Automated Unit Tests (Jest)

225 tests covering server-side and client-side logic. Run with coverage:

```bash
npx jest --config tests/jest.config.js --coverage
```

### Coverage Summary

| File | Statements | Branches | Functions | Lines |
|------|-----------|----------|-----------|-------|
| server/validation.js | 97.58% | 100% | 95.65% | 96.84% |
| server/utils.js | 94.82% | 85.41% | 91.3% | 98.91% |
| server/config.js | 35.71% | 88.63% | 50% | 38.46% |
| server/default-sounds.js | 98.55% | 58.13% | 100% | 99.47% |
| client/src/config.js | 100% | 95.83% | 100% | 100% |
| client/src/utils/socketTimeout.js | 100% | 100% | 100% | 100% |
| **Overall** | **95.78%** | **88.85%** | **95.34%** | **96.88%** |

### validation.test.js (65 tests)
Tests all 17 exported validators from `server/validation.js`:
- `validateUsername` — valid/invalid username formats, type checking
- `validatePassword` — password length requirements
- `validateMessage` — content length and newline limits
- `validateServerName` — server name length bounds
- `validateChannelName` — lowercase alphanumeric format
- `validateRoleName` — role name length bounds
- `validateEmail` — email format validation
- `sanitizeInput` — trim, truncation, non-string handling
- `validateColor` — hex color code format
- `validateUUID` — UUID format validation
- `validateAttachment` — HTTP/data URI validation
- `validateParticipantIds` — array validation, duplicate detection, UUID format
- `sanitizeGroupDMName` — XSS sanitization, length limits, empty handling
- `validateChannelId` — UUID channel ID validation
- `validateMessageId` — optional UUID message ID validation
- `requireAuth` — guest vs registered user authorization
- `RateLimiter` — rate limiting, cleanup, expiry

### utils.test.js (55 tests)
Tests all exports from `server/utils.js`:
- `hashPassword` — async bcrypt hashing
- `hashPasswordLegacy` — deterministic HMAC-SHA256 hashing
- `verifyPassword` — async bcrypt compare + legacy hash rejection
- `BCRYPT_ROUNDS` — constant validation
- `makeToken` — 64-char hex token generation, uniqueness
- `parseDuration` — time string parsing (s/m/h/d/w)
- `CRITICIZE_ROASTS` — template structure validation
- `getRandomRoast` — template replacement
- `DEFAULT_PERMS` — permission key completeness and defaults
- `makeCategory` — category object creation with UUID
- `getUserHighestRolePosition` — owner, member, non-member position
- `parseMentions` — @username, @everyone, @role detection
- `parseChannelLinks` — #channel-name and voice channel detection
- `isPrivateUrl` — SSRF protection (private IPs, localhost, metadata, IPv6)

### permissions.test.js (15 tests)
Tests the permission system with mock server objects:
- `getUserPerms` — @everyone base, role merging, hierarchy, owner/admin override, channel overrides
- `getUserHighestRolePosition` — owner infinity, member positions, non-member fallback
- `parseMentions` — role mention detection
- `parseChannelLinks` — channel link detection in permission context

### security.test.js (25 tests)
Security-focused tests:
- `isPrivateUrl` — SSRF protection across all private IP ranges and protocols
- Webhook token generation — crypto.randomBytes format validation
- Bearer token extraction — header parsing edge cases
- `makeToken` — token format and uniqueness

### config.test.js (18 tests)
Tests `server/config.js` default values and environment variable overrides:
- Server config (port, env, logLevel)
- Database config (url, ssl)
- Security config (jwtSecret, session/refresh expiry)
- Features config (message length, attachments, guest mode)
- Rate limit config
- WebRTC config (STUN/TURN)
- Redis and client URLs

### default-sounds.test.js (16 tests)
Tests `server/default-sounds.js` programmatic WAV generation:
- Sound count (16 sounds)
- Property structure validation
- WAV data URI format
- RIFF header binary validation (PCM, mono, 22050Hz, 16-bit)
- Sound metadata (names, emojis, pages, durations)

### client/config.test.js (15 tests)
Tests `client/src/config.js` with mocked window/localStorage:
- `getServerUrl` — 5-level priority chain (localStorage → Electron → Tauri → env → empty)
- `setServerUrl` — localStorage save/remove, trailing slash stripping
- `isStandaloneApp` — Electron, Tauri, Capacitor detection
- `hasServerUrl` / `needsServerSetup` — convenience wrappers

### client/socketTimeout.test.js (16 tests)
Tests `client/src/utils/socketTimeout.js` with mocked socket:
- `TIMEOUT_MSG` — constant validation
- `emitWithTimeout` — null socket, data/no-data emit, success/timeout callbacks
- `emitWithLoadingTimeout` — fire-and-forget with timer, clearable timeout

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

## Playwright UI Uptime Tests

End-to-end tests that verify all UI components, input fields, and responsive layouts using Playwright. Tests run across 5 browser/device configurations: Desktop Chrome, Desktop Firefox, Mobile Chrome (Pixel 5), Mobile Safari (iPhone 13), and Tablet (iPad).

### Running E2E Tests

```bash
cd tests/e2e
npm install
npx playwright install --with-deps

# Run all tests
npm test

# Run only desktop tests
npm run test:desktop

# Run only mobile tests
npm run test:mobile

# View the HTML report
npm run report
```

### Test Coverage

| Spec File | Tests | Coverage |
|-----------|-------|----------|
| 01-server-setup.spec.js | 11 | Server URL input, connect button, validation, loading states |
| 02-login-register.spec.js | 18 | Username/password inputs, mode switching, error handling |
| 03-app-layout-desktop.spec.js | 9 | Desktop layout, centering, flexbox, viewport resize |
| 04-app-layout-mobile.spec.js | 14 | Mobile layout, touch targets, nav bar, sidebar, landscape |
| 05-settings-modal.spec.js | 6 | Settings trigger, tabs, input fields, close behavior |
| 06-chat-area.spec.js | 8 | Chat textarea, actions, mobile input |
| 07-accessibility.spec.js | 8 | Keyboard navigation, labels, visual regression screenshots |
| 08-responsive-breakpoints.spec.js | 12 | Breakpoints at 320-1920px, dynamic resize |

### CI/CD

Playwright tests run automatically via GitHub Actions on every push and PR to `main`/`master`. Test results, screenshots, and HTML reports are uploaded as artifacts.

## Running Manual Tests

1. Start the application: `docker-compose up -d --build`
2. Open the client in a browser (default: http://localhost:3000)
3. Follow each test case step-by-step
4. For multi-user tests, open a second browser or incognito window
5. Record pass/fail results for each test case
