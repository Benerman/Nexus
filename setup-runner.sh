#!/bin/bash
set -e

# ============================================================
#  GitHub Actions Self-Hosted Runner Setup for Nexus
# ============================================================
#
#  This script installs and configures a GitHub Actions
#  self-hosted runner on your local machine so that pushes
#  to main/master automatically deploy Nexus via Docker Compose.
#
#  Prerequisites:
#    - Linux (x64 or arm64) or macOS
#    - Docker and Docker Compose installed
#    - curl installed
#    - A GitHub personal access token or repo admin access
#
#  Usage:
#    chmod +x setup-runner.sh
#    ./setup-runner.sh
#
# ============================================================

RUNNER_VERSION="2.321.0"
RUNNER_DIR="$HOME/actions-runner"
REPO_OWNER="Benerman"
REPO_NAME="Nexus"

echo ""
echo "========================================="
echo "  GitHub Actions Self-Hosted Runner Setup"
echo "  Repository: $REPO_OWNER/$REPO_NAME"
echo "========================================="
echo ""

# ---- Step 0: Check prerequisites ----
echo "[1/6] Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed."
    echo "Install Docker: https://docs.docker.com/engine/install/"
    exit 1
fi
echo "  Docker: $(docker --version)"

if command -v docker compose &> /dev/null; then
    echo "  Docker Compose: $(docker compose version)"
elif command -v docker-compose &> /dev/null; then
    echo "  Docker Compose: $(docker-compose --version)"
else
    echo "ERROR: Docker Compose is not installed."
    echo "Install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo "ERROR: curl is not installed."
    exit 1
fi

# Check Docker daemon is running
if ! docker info &> /dev/null; then
    echo "ERROR: Docker daemon is not running. Start Docker first."
    exit 1
fi
echo "  Docker daemon: running"

echo ""

# ---- Step 1: Detect architecture ----
echo "[2/6] Detecting system architecture..."

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
    linux)  RUNNER_OS="linux" ;;
    darwin) RUNNER_OS="osx" ;;
    *)
        echo "ERROR: Unsupported OS: $OS"
        echo "Self-hosted runners support Linux and macOS."
        echo "For Windows, see: https://docs.github.com/en/actions/hosting-your-own-runners"
        exit 1
        ;;
esac

case "$ARCH" in
    x86_64|amd64)   RUNNER_ARCH="x64" ;;
    aarch64|arm64)   RUNNER_ARCH="arm64" ;;
    *)
        echo "ERROR: Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

echo "  OS: $RUNNER_OS"
echo "  Architecture: $RUNNER_ARCH"
echo ""

# ---- Step 2: Create runner directory ----
echo "[3/6] Setting up runner directory at $RUNNER_DIR..."

if [ -d "$RUNNER_DIR" ]; then
    echo "  Runner directory already exists."
    if [ -f "$RUNNER_DIR/.runner" ]; then
        echo "  A runner is already configured here."
        echo ""
        read -p "  Remove existing runner and reconfigure? (y/N): " RECONFIGURE
        if [ "$RECONFIGURE" = "y" ] || [ "$RECONFIGURE" = "Y" ]; then
            echo "  Removing existing runner..."
            cd "$RUNNER_DIR"
            sudo ./svc.sh stop 2>/dev/null || true
            sudo ./svc.sh uninstall 2>/dev/null || true
            ./config.sh remove --token "PLACEHOLDER" 2>/dev/null || true
            cd "$HOME"
            rm -rf "$RUNNER_DIR"
        else
            echo "  Keeping existing runner. Exiting."
            exit 0
        fi
    fi
fi

mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

# ---- Step 3: Download runner ----
echo "[4/6] Downloading GitHub Actions runner v${RUNNER_VERSION}..."

RUNNER_FILE="actions-runner-${RUNNER_OS}-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_FILE}"

if [ ! -f "$RUNNER_FILE" ]; then
    curl -fSL -o "$RUNNER_FILE" "$RUNNER_URL"
else
    echo "  Runner archive already downloaded."
fi

echo "  Extracting..."
tar xzf "$RUNNER_FILE"
echo "  Done."
echo ""

# ---- Step 4: Get registration token ----
echo "[5/6] Runner configuration"
echo ""
echo "  You need a registration token from GitHub."
echo "  To get one:"
echo ""
echo "    1. Go to: https://github.com/$REPO_OWNER/$REPO_NAME/settings/actions/runners/new"
echo "    2. Copy the token shown in the 'Configure' section"
echo "       (it starts with 'A' and is a long alphanumeric string)"
echo ""
echo "  Alternatively, generate one via the GitHub CLI:"
echo "    gh api repos/$REPO_OWNER/$REPO_NAME/actions/runners/registration-token -f | jq -r '.token'"
echo ""

read -p "  Paste your registration token: " RUNNER_TOKEN

if [ -z "$RUNNER_TOKEN" ]; then
    echo "ERROR: No token provided. Cannot configure runner."
    echo ""
    echo "You can finish setup manually:"
    echo "  cd $RUNNER_DIR"
    echo "  ./config.sh --url https://github.com/$REPO_OWNER/$REPO_NAME --token YOUR_TOKEN"
    echo "  sudo ./svc.sh install"
    echo "  sudo ./svc.sh start"
    exit 1
fi

echo ""
echo "  Configuring runner..."

./config.sh \
    --url "https://github.com/$REPO_OWNER/$REPO_NAME" \
    --token "$RUNNER_TOKEN" \
    --name "$(hostname)-nexus-runner" \
    --labels "self-hosted,nexus-deploy,$RUNNER_OS,$RUNNER_ARCH" \
    --work "_work" \
    --unattended \
    --replace

echo ""

# ---- Step 5: Install and start as a service ----
echo "[6/6] Installing runner as a system service..."

if [ "$RUNNER_OS" = "linux" ]; then
    sudo ./svc.sh install
    sudo ./svc.sh start
    sudo ./svc.sh status
elif [ "$RUNNER_OS" = "osx" ]; then
    ./svc.sh install
    ./svc.sh start
    ./svc.sh status
fi

echo ""
echo "========================================="
echo "  Runner setup complete!"
echo "========================================="
echo ""
echo "  Runner name:   $(hostname)-nexus-runner"
echo "  Runner dir:    $RUNNER_DIR"
echo "  Repository:    https://github.com/$REPO_OWNER/$REPO_NAME"
echo ""
echo "  The runner is now listening for jobs."
echo "  Push to main/master to trigger a deployment."
echo ""
echo "  Service commands:"
echo "    Status:    sudo $RUNNER_DIR/svc.sh status"
echo "    Stop:      sudo $RUNNER_DIR/svc.sh stop"
echo "    Start:     sudo $RUNNER_DIR/svc.sh start"
echo "    Uninstall: sudo $RUNNER_DIR/svc.sh uninstall"
echo ""
echo "  View runner in GitHub:"
echo "    https://github.com/$REPO_OWNER/$REPO_NAME/settings/actions/runners"
echo ""
echo "  IMPORTANT: Make sure your .env file exists in the Nexus"
echo "  project directory with proper secrets before the first deploy."
echo "  Minimum required: JWT_SECRET, POSTGRES_PASSWORD"
echo ""
