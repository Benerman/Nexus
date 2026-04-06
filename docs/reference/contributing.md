# Contributing

## Development Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and configure
3. Start the dev environment:

```bash
docker compose -p nexus-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

### Server Development

```bash
cd server
npm install
npm run dev     # Starts with nodemon (auto-restart on changes)
```

### Client Development

```bash
cd client
npm install
npm start       # React dev server with hot reload
```

## Git Workflow

- **`develop`** — Primary development branch. Feature branches merge here via PR.
- **`main`** — Production branch. Merge `develop` into `main` for releases.
- Never commit directly to `main` or `develop`.

### Branch Naming

Create feature branches from `develop`:

```bash
git checkout develop
git checkout -b feature/my-feature
```

## Commit Conventions

- Use imperative mood: "Add feature" not "Added feature"
- Keep messages concise

## Testing

### Automated Tests

```bash
cd server
npm test    # 299 Jest tests
```

Tests cover: validation, utils, permissions, config, and security. They run without the full server stack.

### Manual Tests

40 test cases in `tests/manual/` across 8 categories:
- Authentication
- Messaging
- Channels
- Emoji
- Voice & soundboard
- Social
- Moderation
- UI

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `deploy-prod.yml` | Push to `main` | Auto-deploy production |
| `deploy-dev.yml` | Push to `develop` | Auto-deploy development |
| `dev.yml` | Manual | Pre-release builds (Tauri, Electron, Capacitor) |
| `release.yml` | Manual | Versioned releases |
| `unit-tests.yml` | PR | npm audit + test coverage (90% threshold) |

## Code Style

- No strict linting configuration (ESLint via React Scripts)
- `exhaustive-deps` rule is disabled
- No Prettier configuration
- Permissions must be checked on both client and server side

## Related

- [Quick Start](../getting-started/quick-start.md) — Installation
- [Docker Deployment](../deployment/docker.md) — Container setup
