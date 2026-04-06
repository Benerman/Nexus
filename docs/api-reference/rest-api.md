# REST API

Nexus uses REST endpoints for authentication, file uploads, and external integrations. All real-time communication goes through Socket.IO.

## Base URL

```
https://nexus.example.com/api
```

## Authentication

Most endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

## Endpoints

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | No | Create a new account |
| `POST` | `/api/auth/login` | No | Login and receive tokens |
| `POST` | `/api/auth/logout` | Yes | Invalidate current token |
| `POST` | `/api/auth/recover` | No | Account recovery |
| `DELETE` | `/api/auth/account` | Yes | Delete account |

### File Uploads

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/user/avatar` | Yes | Upload user avatar (base64) |
| `POST` | `/api/server/:serverId/icon` | Yes | Upload server icon (base64) |

### Webhooks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/webhooks/:webhookId/:token` | Token in URL | Post webhook message |

Rate limit: 10 requests per 10 seconds per webhook.

### Media & Content

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/gifs/search?q=...` | Yes | Search Giphy |
| `GET` | `/api/gifs/trending` | Yes | Trending GIFs |
| `GET` | `/api/og?url=...&serverId=...` | Yes | URL preview (Open Graph) |

### Administration

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/metrics` | Platform Admin | Server metrics |
| `POST` | `/api/client-logs` | Yes | Submit client-side logs |

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | No | API health check |
| `GET` | `/health` | No | Simple health check |

### Static Pages

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/delete-account` | No | Account deletion info page |
| `GET` | `/privacy` | No | Privacy policy page |

## Global Rate Limit

All `/api` routes are rate limited to **10 requests per 10 seconds per IP**.

## Error Responses

Errors return JSON with a message field:

```json
{
  "error": "Description of what went wrong"
}
```

Common HTTP status codes:
- `400` — Bad request (validation error)
- `401` — Unauthorized (missing or invalid token)
- `403` — Forbidden (insufficient permissions)
- `404` — Not found
- `429` — Rate limited
- `500` — Internal server error

## Related

- [Socket.IO Events](socket-events.md) — Real-time event reference
- [Webhook API](webhook-api.md) — Webhook details
- [Authentication](../security/authentication.md) — Token management
