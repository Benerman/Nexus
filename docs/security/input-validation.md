# Input Validation

All user input is validated and sanitized on the server.

## Validation Rules

| Field | Min | Max | Pattern |
|-------|-----|-----|---------|
| Username | 3 | 32 | `^[a-zA-Z0-9_-]+$` (alphanumeric, underscore, hyphen) |
| Password | 8 | 128 | Printable ASCII (0x20–0x7E) |
| Message content | 1 | 2,000 | Max 20 newlines |
| Server name | 3 | 32 | Any characters |
| Channel name | 2 | 32 | `^[a-z0-9_-]+$` (lowercase alphanumeric, hyphen, underscore) |
| Role name | 2 | 32 | Any characters |
| Server description | — | 256 | Any characters |
| Channel topic | — | 256 | Any characters |
| Channel description | — | 128 | Any characters |
| Bio | — | 128 | Any characters |
| Color | 6 | 6 | `^#[0-9A-F]{6}$` (hex color) |
| Group DM name | 1 | 100 | Must contain alphanumeric characters |
| Group DM participants | 2 | 50 | Array of valid UUIDs, no duplicates |
| Attachment URL | — | — | Must start with `http`, `https`, or `data:` |

## Sanitization

All user text input is sanitized to prevent XSS attacks. HTML entities are escaped before storage and rendering.

## SSRF Protection

The URL preview endpoint (`GET /api/og`) includes SSRF protection to prevent the server from making requests to internal network resources.

## Related

- [Rate Limiting](rate-limiting.md) — Rate limit protection
- [CORS & Headers](cors-and-headers.md) — Security headers
