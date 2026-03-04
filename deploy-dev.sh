#!/bin/bash
set -e

echo "⬡ Deploying Nexus (DEV)..."
echo ""

cd "$(dirname "$0")"

# Use .env.dev if it exists, otherwise fall back to .env
if [ -f .env.dev ]; then
    ENV_FILE=".env.dev"
elif [ -f .env ]; then
    ENV_FILE=".env"
else
    echo "ERROR: No .env.dev or .env file found."
    echo "Copy .env.dev.example to .env.dev and fill in values."
    exit 1
fi

echo "Using env file: $ENV_FILE"

# Pre-build: show current disk usage
DISK_BEFORE=$(df -h / | awk 'NR==2 {print $4}')
echo "Disk space available: $DISK_BEFORE"

# Detect compose command
if docker compose version > /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif docker-compose --version > /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    echo "ERROR: Neither 'docker compose' nor 'docker-compose' found."
    exit 1
fi

# Stop existing dev containers
echo "Stopping dev containers..."
$COMPOSE_CMD --env-file "$ENV_FILE" -f docker-compose.dev.yml down

# Build and start
echo "Building and starting dev stack..."
$COMPOSE_CMD --env-file "$ENV_FILE" -f docker-compose.dev.yml up -d --build

# Clean up dangling images
echo "Cleaning up old build layers..."
PRUNED=$(docker image prune -f 2>&1)
RECLAIMED=$(echo "$PRUNED" | grep "reclaimed" || echo "nothing to clean")
echo "   $RECLAIMED"

# Post-build disk usage
DISK_AFTER=$(df -h / | awk 'NR==2 {print $4}')
echo "Disk space available: $DISK_AFTER"

# Wait for server health
echo ""
echo "Waiting for dev server..."
for i in $(seq 1 20); do
    if curl -sf http://localhost:3003/health > /dev/null 2>&1; then
        echo "Dev server is responding on port 3003."
        break
    fi
    if [ "$i" -eq 20 ]; then
        echo "Dev server did not respond after 20 attempts."
        $COMPOSE_CMD --env-file "$ENV_FILE" -f docker-compose.dev.yml logs server
        exit 1
    fi
    echo "  Waiting... (attempt $i/20)"
    sleep 5
done

# Wait for client health
echo "Waiting for dev client..."
for i in $(seq 1 10); do
    if curl -sf http://localhost:3002 > /dev/null 2>&1; then
        echo "Dev client is responding on port 3002."
        break
    fi
    if [ "$i" -eq 10 ]; then
        echo "Dev client did not respond."
        $COMPOSE_CMD --env-file "$ENV_FILE" -f docker-compose.dev.yml logs client
        exit 1
    fi
    echo "  Waiting... (attempt $i/10)"
    sleep 3
done

echo ""
echo "========================================="
echo "  Nexus DEV deployed successfully!"
echo "========================================="
echo ""
echo "  Client:    http://localhost:3002"
echo "  Server:    http://localhost:3003"
echo "  Postgres:  localhost:5433"
echo "  Redis:     localhost:6380"
echo ""
echo "  Commands:"
echo "    Logs:    $COMPOSE_CMD -f docker-compose.dev.yml logs -f"
echo "    Stop:    $COMPOSE_CMD -f docker-compose.dev.yml down"
echo "    Redeploy: ./deploy-dev.sh"
echo ""
echo "  Production is unaffected (ports 3000/3001)."
echo ""
