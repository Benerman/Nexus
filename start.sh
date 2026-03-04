#!/bin/bash
set -e

echo "⬡ Starting Nexus..."
echo ""

# Check docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

if ! docker compose version > /dev/null 2>&1 && ! docker-compose --version > /dev/null 2>&1; then
    echo "❌ docker compose not found. Please install docker compose first."
    exit 1
fi

# Determine compose command
if docker compose version > /dev/null 2>&1; then
    COMPOSE="docker compose"
else
    COMPOSE="docker-compose"
fi

# Build and start production
echo "🔨 Building containers (this may take a few minutes the first time)..."
$COMPOSE -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml up --build -d

echo ""
echo "✅ Nexus is running!"
echo ""
echo "   Local:   http://localhost:3000"

# Try to get LAN IP
if command -v ip &> /dev/null; then
    LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')
elif command -v ipconfig &> /dev/null; then
    LAN_IP="(run ipconfig to find your IP)"
else
    LAN_IP="(run ifconfig to find your IP)"
fi

if [ -n "$LAN_IP" ] && [ "$LAN_IP" != "(run ipconfig to find your IP)" ]; then
    echo "   Network: http://$LAN_IP:3000"
fi

echo ""
echo "📋 Commands:"
echo "   Stop:    $COMPOSE -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml down"
echo "   Logs:    $COMPOSE -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml logs -f"
echo "   Restart: $COMPOSE -p nexus-prod -f docker-compose.yml -f docker-compose.prod.yml restart"
echo ""
