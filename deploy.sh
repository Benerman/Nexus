#!/bin/bash
set -e

echo "⬡ Deploying Nexus..."
echo ""

cd "$(dirname "$0")"

# Pre-build: show current disk usage
DISK_BEFORE=$(df -h / | awk 'NR==2 {print $4}')
echo "💾 Disk space available: $DISK_BEFORE"

# Stop existing containers
echo "⏹  Stopping containers..."
docker-compose down

# Build and start
echo "🔨 Building and starting..."
docker-compose up -d --build

# Clean up dangling images left from the build
echo "🧹 Cleaning up old build layers..."
PRUNED=$(docker image prune -f 2>&1)
RECLAIMED=$(echo "$PRUNED" | grep "reclaimed" || echo "nothing to clean")
echo "   $RECLAIMED"

# Post-build disk usage
DISK_AFTER=$(df -h / | awk 'NR==2 {print $4}')
echo "💾 Disk space available: $DISK_AFTER"

# Extract domain from docker-compose CLIENT_URL
DOMAIN_URL=$(grep 'CLIENT_URL=' docker-compose.yml | head -1 | sed 's/.*CLIENT_URL=//' | tr -d ' ')

echo ""
echo "✅ Nexus deployed successfully!"
echo ""
if [ -n "$DOMAIN_URL" ]; then
    echo "   Public:  $DOMAIN_URL"
fi
echo "   Local:   http://localhost:3000"
echo ""
echo "📋 Commands:"
echo "   Logs:    docker-compose logs -f"
echo "   Stop:    docker-compose down"
echo "   Redeploy: ./deploy.sh"
echo ""
