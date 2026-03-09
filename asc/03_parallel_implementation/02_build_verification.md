# Build Verification

## Build Commands

### Server
```bash
cd server/
npm ci                    # Install dependencies (CI-safe)
npm start                 # Run production server
npm run dev               # Dev mode with nodemon
npm run migrate           # Run database migrations
npm test                  # Run 299 Jest tests
```

### Client
```bash
cd client/
npm ci                    # Install dependencies (CI-safe)
npm start                 # React dev server (port 3000)
npm run build             # Production build with sourcemaps
npm run build:web         # Production build without sourcemaps
npm run tauri:dev         # Tauri desktop dev
npm run electron:dev      # Electron desktop dev
```

### Docker (Full Stack)
```bash
# Production
docker compose -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Development
docker compose -p nexus-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

## CI Pipeline

### unit-tests.yml (PR Gate)
1. Checkout code
2. Setup Node.js 20
3. `npm ci` for server and client
4. `npm audit --audit-level=high` (blocking)
5. `jest --coverage --ci --forceExit` (fail if coverage < 90%)
6. Upload coverage artifacts

### deploy-prod.yml (Push to main)
1. Checkout with clean working directory
2. Symlink production .env
3. Stop existing containers
4. Build and start production stack
5. Health check: server (port 3001), client (port 3000)
6. Post-deploy metrics verification
7. Clean up old Docker images

### deploy-dev.yml (Push to develop)
1. Safety check: verify production is healthy
2. Checkout and symlink dev .env
3. Stop existing dev containers
4. Build and start dev stack
5. Health check: server (port 3003), client (port 3002)
6. Post-deploy metrics verification
7. Re-verify production still healthy
8. Clean up old Docker images

## Verification Checklist

Before merging any PR:
- [ ] `npm test` passes (299 tests)
- [ ] `npm audit --audit-level=high` clean
- [ ] Coverage ≥ 90%
- [ ] `npm run build` succeeds for client
- [ ] No new ESLint errors

Before production deploy:
- [ ] All CI gates pass
- [ ] Dev deployment tested
- [ ] Manual smoke test on dev instance
- [ ] Health endpoints responding after deploy
- [ ] Metrics endpoint collecting data
