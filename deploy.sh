#!/bin/bash
set -e

echo "⬡ Deploying Nexus..."
echo ""

cd "$(dirname "$0")"

# Determine compose command
if docker compose version > /dev/null 2>&1; then
    COMPOSE="docker compose"
else
    COMPOSE="docker-compose"
fi

# Pre-build: show current disk usage
DISK_BEFORE=$(df -h / | awk 'NR==2 {print $4}')
echo "💾 Disk space available: $DISK_BEFORE"

# Stop existing containers
echo "⏹  Stopping containers..."
$COMPOSE -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml down

# Build and start
echo "🔨 Building and starting..."
$COMPOSE -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Clean up dangling images left from the build
echo "🧹 Cleaning up old build layers..."
PRUNED=$(docker image prune -f 2>&1)
RECLAIMED=$(echo "$PRUNED" | grep "reclaimed" || echo "nothing to clean")
echo "   $RECLAIMED"

# Post-build disk usage
DISK_AFTER=$(df -h / | awk 'NR==2 {print $4}')
echo "💾 Disk space available: $DISK_AFTER"

echo ""
echo "✅ Nexus deployed successfully!"
echo ""
echo "   Local:   http://localhost:3000"
echo ""
echo "📋 Commands:"
echo "   Logs:    $COMPOSE -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs -f"
echo "   Stop:    $COMPOSE -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml down"
echo "   Redeploy: ./deploy.sh"
echo ""
