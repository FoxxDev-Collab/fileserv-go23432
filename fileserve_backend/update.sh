#!/bin/bash
#
# FileServ Update Script
# Updates an existing FileServ installation
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# Default paths
INSTALL_DIR="/opt/fileserv"
SERVICE_NAME="fileserv"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${BOLD}${CYAN}▶ $1${NC}"; }

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                    FileServ Updater                           ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

find_binary() {
    log_step "Locating New Binary"

    BINARY_PATH=""

    if [ -f "$SCRIPT_DIR/fileserv" ]; then
        BINARY_PATH="$SCRIPT_DIR/fileserv"
    elif [ -f "./fileserv" ]; then
        BINARY_PATH="./fileserv"
    fi

    if [ -z "$BINARY_PATH" ]; then
        log_error "New fileserv binary not found!"
        log_info "Place the new binary in the same directory as this script"
        exit 1
    fi

    log_success "Found: $BINARY_PATH"
}

check_installation() {
    log_step "Checking Existing Installation"

    if [ ! -f "$INSTALL_DIR/fileserv" ]; then
        log_error "No existing installation found at $INSTALL_DIR"
        log_info "Run install.sh for a fresh installation"
        exit 1
    fi

    log_success "Found installation at $INSTALL_DIR"

    # Get current version info if available
    if [ -x "$INSTALL_DIR/fileserv" ]; then
        CURRENT_VERSION=$("$INSTALL_DIR/fileserv" --version 2>/dev/null || echo "unknown")
        log_info "Current version: $CURRENT_VERSION"
    fi
}

stop_service() {
    log_step "Stopping Service"

    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        systemctl stop "$SERVICE_NAME"
        log_success "Service stopped"
    else
        log_info "Service was not running"
    fi
}

backup_binary() {
    log_step "Creating Backup"

    BACKUP_FILE="$INSTALL_DIR/fileserv.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$INSTALL_DIR/fileserv" "$BACKUP_FILE"
    log_success "Backed up to: $BACKUP_FILE"
}

install_new_binary() {
    log_step "Installing New Binary"

    cp "$BINARY_PATH" "$INSTALL_DIR/fileserv"
    chmod 755 "$INSTALL_DIR/fileserv"
    chown root:root "$INSTALL_DIR/fileserv"
    log_success "New binary installed"
}

update_service_file() {
    log_step "Updating Service File"

    SERVICE_FILE="/etc/systemd/system/fileserv.service"

    # Check if service file needs updating (running as root)
    if grep -q "^User=fileserv" "$SERVICE_FILE" 2>/dev/null; then
        log_info "Updating service to run as root (required for PAM auth)"

        # Get current settings
        CURRENT_PORT=$(grep "Environment=\"PORT=" "$SERVICE_FILE" | sed 's/.*PORT=\([^"]*\).*/\1/' || echo "8080")
        CURRENT_DATA_DIR=$(grep "Environment=\"DATA_DIR=" "$SERVICE_FILE" | sed 's/.*DATA_DIR=\([^"]*\).*/\1/' || echo "/var/lib/fileserv/data")
        CURRENT_WORKDIR=$(grep "WorkingDirectory=" "$SERVICE_FILE" | sed 's/WorkingDirectory=//' || echo "/opt/fileserv")

        cat > "$SERVICE_FILE" << EOF
[Unit]
Description=FileServ - File Server with Authentication
Documentation=https://github.com/your-org/fileserv
After=network.target

[Service]
Type=simple
# Run as root for PAM authentication and system management
User=root
Group=root
WorkingDirectory=${CURRENT_WORKDIR}
ExecStart=${CURRENT_WORKDIR}/fileserv
Restart=on-failure
RestartSec=5s

# Environment (minimal - most config is in database)
Environment="PORT=${CURRENT_PORT}"
Environment="DATA_DIR=${CURRENT_DATA_DIR}"

# Graceful shutdown
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30s

# Resource limits
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

        systemctl daemon-reload
        log_success "Service file updated to run as root"
    else
        log_info "Service file already configured correctly"
    fi
}

start_service() {
    log_step "Starting Service"

    systemctl daemon-reload
    systemctl start "$SERVICE_NAME"
    sleep 2

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "Service started successfully"
    else
        log_error "Failed to start service"
        log_info "Check logs: journalctl -u fileserv -n 50"
        exit 1
    fi
}

print_completion() {
    echo ""
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                    Update Complete!                           ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # Show new version if available
    if [ -x "$INSTALL_DIR/fileserv" ]; then
        NEW_VERSION=$("$INSTALL_DIR/fileserv" --version 2>/dev/null || echo "unknown")
        log_info "New version: $NEW_VERSION"
    fi

    echo ""
    log_info "Service status:"
    systemctl status "$SERVICE_NAME" --no-pager -l | head -10
    echo ""
}

main() {
    print_banner
    check_root
    find_binary
    check_installation
    stop_service
    backup_binary
    install_new_binary
    update_service_file
    start_service
    print_completion
}

case "${1:-}" in
    -h|--help)
        echo "FileServ Update Script"
        echo ""
        echo "Usage: sudo ./update.sh"
        echo ""
        echo "This script updates an existing FileServ installation."
        echo "Place the new 'fileserv' binary in the same directory as this script."
        echo ""
        echo "The script will:"
        echo "  1. Stop the running service"
        echo "  2. Backup the current binary"
        echo "  3. Install the new binary"
        echo "  4. Update the service file if needed"
        echo "  5. Start the service"
        exit 0
        ;;
    "")
        main
        ;;
    *)
        log_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac
