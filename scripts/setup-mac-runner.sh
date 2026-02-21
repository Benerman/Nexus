#!/bin/bash
# =============================================================================
# Nexus - GitHub Actions Self-Hosted Mac Runner Setup
# =============================================================================
# This script sets up a GitHub Actions self-hosted runner on your Mac.
# The runner will automatically start on boot and poll for build jobs.
# When your laptop is off, jobs queue up. When it comes back on, they run.
#
# Prerequisites:
#   - macOS with Xcode installed (xcode-select --install)
#   - A GitHub Personal Access Token with 'repo' scope
#   - Homebrew (optional, for dependency management)
#
# Usage:
#   chmod +x scripts/setup-mac-runner.sh
#   ./scripts/setup-mac-runner.sh
# =============================================================================

set -euo pipefail

# Resolve script directory early, before any cd changes the working directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Configuration ---
RUNNER_DIR="$HOME/actions-runner"
RUNNER_VERSION="2.321.0"
REPO_URL=""
RUNNER_TOKEN=""
RUNNER_NAME=""
RUNNER_LABELS="self-hosted,macOS,ARM64"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# --- Pre-flight checks ---
check_prerequisites() {
    print_step "Checking prerequisites..."

    # Must be macOS
    if [[ "$(uname)" != "Darwin" ]]; then
        print_error "This script must be run on macOS."
        exit 1
    fi
    print_success "Running on macOS $(sw_vers -productVersion)"

    # Check architecture
    ARCH=$(uname -m)
    if [[ "$ARCH" == "arm64" ]]; then
        RUNNER_ARCH="osx-arm64"
        RUNNER_LABELS="self-hosted,macOS,ARM64"
        print_success "Apple Silicon (ARM64) detected"
    elif [[ "$ARCH" == "x86_64" ]]; then
        RUNNER_ARCH="osx-x64"
        RUNNER_LABELS="self-hosted,macOS,X64"
        print_success "Intel (x86_64) detected"
    else
        print_error "Unknown architecture: $ARCH"
        exit 1
    fi

    # Check Xcode
    if ! xcode-select -p &>/dev/null; then
        print_warning "Xcode Command Line Tools not found. Installing..."
        xcode-select --install
        echo "Please re-run this script after Xcode CLT installation completes."
        exit 1
    fi
    XCODE_PATH=$(xcode-select -p)
    print_success "Xcode tools found at $XCODE_PATH"

    # Check for full Xcode (needed for iOS builds)
    if [[ "$XCODE_PATH" != *"Xcode.app"* ]]; then
        print_warning "Full Xcode.app not detected (only Command Line Tools)."
        print_warning "iOS builds require full Xcode from the App Store."
        echo ""
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        XCODE_VERSION=$(xcodebuild -version | head -1)
        print_success "$XCODE_VERSION detected"
    fi

    # Check Node.js
    if command -v node &>/dev/null; then
        print_success "Node.js $(node --version) found"
    else
        print_warning "Node.js not found. Install it via: brew install node@20"
    fi

    # Check Rust
    if command -v rustc &>/dev/null; then
        print_success "Rust $(rustc --version | awk '{print $2}') found"
    else
        print_warning "Rust not found. Install it via: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    fi

    # Check CocoaPods (needed for Capacitor iOS)
    if command -v pod &>/dev/null; then
        print_success "CocoaPods $(pod --version) found"
    else
        print_warning "CocoaPods not found. Install it via: sudo gem install cocoapods"
    fi
}

# --- Gather configuration ---
gather_config() {
    print_step "Configuration"
    echo ""

    # Repository URL
    if [[ -z "$REPO_URL" ]]; then
        # Try to detect from git remote
        if git remote get-url origin &>/dev/null; then
            DETECTED_URL=$(git remote get-url origin | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')
            echo "Detected repository: $DETECTED_URL"
            read -p "Use this URL? (y/n) " -n 1 -r
            echo ""
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                REPO_URL="$DETECTED_URL"
            fi
        fi

        if [[ -z "$REPO_URL" ]]; then
            read -p "Enter your GitHub repository URL (e.g., https://github.com/user/Nexus): " REPO_URL
        fi
    fi

    # Runner token
    if [[ -z "$RUNNER_TOKEN" ]]; then
        echo ""
        echo "You need a runner registration token from GitHub."
        echo "Get it from: $REPO_URL/settings/actions/runners/new"
        echo ""
        read -p "Enter the runner registration token: " RUNNER_TOKEN
    fi

    # Runner name
    if [[ -z "$RUNNER_NAME" ]]; then
        DEFAULT_NAME="$(hostname)-nexus"
        read -p "Enter a name for this runner [$DEFAULT_NAME]: " RUNNER_NAME
        RUNNER_NAME="${RUNNER_NAME:-$DEFAULT_NAME}"
    fi

    echo ""
    print_success "Repository: $REPO_URL"
    print_success "Runner name: $RUNNER_NAME"
    print_success "Labels: $RUNNER_LABELS"
}

# --- Install runner ---
install_runner() {
    print_step "Installing GitHub Actions runner..."

    # Create runner directory
    mkdir -p "$RUNNER_DIR"
    cd "$RUNNER_DIR"

    # Download runner
    RUNNER_TAR="actions-runner-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
    if [[ ! -f "$RUNNER_TAR" ]]; then
        print_step "Downloading runner v${RUNNER_VERSION}..."
        curl -o "$RUNNER_TAR" -L \
            "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_TAR}"
        print_success "Downloaded runner"
    else
        print_success "Runner archive already exists, skipping download"
    fi

    # Extract
    print_step "Extracting runner..."
    tar xzf "$RUNNER_TAR"
    print_success "Extracted runner to $RUNNER_DIR"

    # Configure
    print_step "Configuring runner..."
    ./config.sh \
        --url "$REPO_URL" \
        --token "$RUNNER_TOKEN" \
        --name "$RUNNER_NAME" \
        --labels "$RUNNER_LABELS" \
        --work "_work" \
        --replace

    print_success "Runner configured"
}

# --- Install LaunchAgent for auto-start ---
install_launch_agent() {
    print_step "Setting up auto-start via LaunchAgent..."

    PLIST_NAME="com.github.actions-runner.nexus.plist"
    PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"

    # Copy the plist template (SCRIPT_DIR resolved at top of script)
    if [[ -f "$SCRIPT_DIR/com.github.actions-runner.nexus.plist" ]]; then
        # Use the template and substitute paths
        sed "s|__RUNNER_DIR__|$RUNNER_DIR|g; s|__USER__|$(whoami)|g; s|__HOME__|$HOME|g" \
            "$SCRIPT_DIR/com.github.actions-runner.nexus.plist" > "$PLIST_PATH"
    else
        # Generate plist inline
        cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.github.actions-runner.nexus</string>

    <key>ProgramArguments</key>
    <array>
        <string>${RUNNER_DIR}/run.sh</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${RUNNER_DIR}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>${HOME}/Library/Logs/github-actions-runner.log</string>

    <key>StandardErrorPath</key>
    <string>${HOME}/Library/Logs/github-actions-runner.error.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/opt/ruby/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>${HOME}</string>
    </dict>

    <key>ProcessType</key>
    <string>Background</string>

    <key>ThrottleInterval</key>
    <integer>30</integer>
</dict>
</plist>
PLIST
    fi

    # Load the agent
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    launchctl load "$PLIST_PATH"

    print_success "LaunchAgent installed at $PLIST_PATH"
    print_success "Runner will auto-start on login"
}

# --- Verify ---
verify_installation() {
    print_step "Verifying installation..."

    # Check runner is listening
    sleep 3
    if launchctl list | grep -q "com.github.actions-runner.nexus"; then
        print_success "Runner service is loaded"
    else
        print_warning "Runner service may not have started yet. Check logs at:"
        echo "  $HOME/Library/Logs/github-actions-runner.log"
    fi

    echo ""
    echo "============================================="
    echo "  Setup Complete!"
    echo "============================================="
    echo ""
    echo "Your self-hosted runner is now configured."
    echo ""
    echo "How it works:"
    echo "  - The runner starts automatically when you log in"
    echo "  - It polls GitHub for pending build jobs"
    echo "  - When your laptop is off, jobs queue up"
    echo "  - When you come back online, queued jobs run"
    echo ""
    echo "Useful commands:"
    echo "  Start runner:   launchctl load ~/Library/LaunchAgents/com.github.actions-runner.nexus.plist"
    echo "  Stop runner:    launchctl unload ~/Library/LaunchAgents/com.github.actions-runner.nexus.plist"
    echo "  View logs:      tail -f ~/Library/Logs/github-actions-runner.log"
    echo "  Runner status:  cd $RUNNER_DIR && ./run.sh --check"
    echo ""
    echo "Runner labels: $RUNNER_LABELS"
    echo "These labels are used in your GitHub Actions workflows"
    echo "to target this specific runner."
    echo ""
}

# --- Main ---
main() {
    echo ""
    echo "============================================="
    echo "  Nexus - GitHub Actions Mac Runner Setup"
    echo "============================================="
    echo ""

    check_prerequisites
    echo ""
    gather_config
    echo ""
    install_runner
    echo ""
    install_launch_agent
    echo ""
    verify_installation
}

main "$@"
