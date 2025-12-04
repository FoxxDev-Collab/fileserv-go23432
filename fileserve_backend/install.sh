#!/bin/bash
#
# FileServ Interactive Installation Script
# Installs FileServ as a systemd service
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Default values
DEFAULT_INSTALL_DIR="/opt/fileserv"
DEFAULT_DATA_DIR="/var/lib/fileserv/data"
DEFAULT_PORT="8080"

# Installation variables
INSTALL_DIR=""
DATA_DIR=""
PORT=""

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

#------------------------------------------------------------------------------
# Helper Functions
#------------------------------------------------------------------------------

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                                                               ║"
    echo "║     ███████╗██╗██╗     ███████╗███████╗███████╗██████╗ ██╗   ║"
    echo "║     ██╔════╝██║██║     ██╔════╝██╔════╝██╔════╝██╔══██╗██║   ║"
    echo "║     █████╗  ██║██║     █████╗  ███████╗█████╗  ██████╔╝██║   ║"
    echo "║     ██╔══╝  ██║██║     ██╔══╝  ╚════██║██╔══╝  ██╔══██╗╚═╝   ║"
    echo "║     ██║     ██║███████╗███████╗███████║███████╗██║  ██║██╗   ║"
    echo "║     ╚═╝     ╚═╝╚══════╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝   ║"
    echo "║                                                               ║"
    echo "║              Interactive Installation Script                  ║"
    echo "║                                                               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${BOLD}${CYAN}▶ $1${NC}"
}

prompt() {
    local var_name="$1"
    local prompt_text="$2"
    local default_value="$3"
    local value

    if [ -n "$default_value" ]; then
        echo -en "${YELLOW}?${NC} ${prompt_text} [${default_value}]: "
    else
        echo -en "${YELLOW}?${NC} ${prompt_text}: "
    fi
    read -r value

    if [ -z "$value" ] && [ -n "$default_value" ]; then
        value="$default_value"
    fi

    eval "$var_name='$value'"
}

prompt_yes_no() {
    local prompt_text="$1"
    local default="$2"
    local response

    if [ "$default" = "y" ]; then
        echo -en "${YELLOW}?${NC} ${prompt_text} [Y/n]: "
    else
        echo -en "${YELLOW}?${NC} ${prompt_text} [y/N]: "
    fi
    read -r response

    if [ -z "$response" ]; then
        response="$default"
    fi

    case "$response" in
        [Yy]*) return 0 ;;
        *) return 1 ;;
    esac
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

#------------------------------------------------------------------------------
# System Checks
#------------------------------------------------------------------------------

check_system_requirements() {
    log_step "Checking System Requirements"

    # Check OS
    if [ ! -f /etc/os-release ]; then
        log_error "Cannot detect OS. This script requires Linux."
        exit 1
    fi

    source /etc/os-release
    log_info "Detected OS: ${PRETTY_NAME:-$ID}"

    # Check architecture
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64|amd64)
            log_success "Architecture: x86_64"
            ;;
        aarch64|arm64)
            log_success "Architecture: ARM64"
            ;;
        *)
            log_error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac

    # Check systemd
    if ! command -v systemctl &> /dev/null; then
        log_error "systemd is required but not found"
        exit 1
    fi
    log_success "systemd detected"

    # Check available disk space (minimum 100MB)
    AVAILABLE_SPACE=$(df -m / | awk 'NR==2 {print $4}')
    if [ "$AVAILABLE_SPACE" -lt 100 ]; then
        log_error "Insufficient disk space. At least 100MB required."
        exit 1
    fi
    log_success "Disk space: ${AVAILABLE_SPACE}MB available"

    # Check memory (minimum 512MB)
    TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
    if [ "$TOTAL_MEM" -lt 512 ]; then
        log_warn "Low memory: ${TOTAL_MEM}MB (512MB recommended)"
    else
        log_success "Memory: ${TOTAL_MEM}MB available"
    fi
}

check_existing_installation() {
    log_step "Checking for Existing Installation"

    if systemctl is-active --quiet fileserv 2>/dev/null; then
        log_warn "FileServ service is currently running"
        if prompt_yes_no "Stop the service and continue with installation?" "y"; then
            systemctl stop fileserv
            log_success "Service stopped"
        else
            log_error "Installation cancelled"
            exit 1
        fi
    fi

    if [ -f /opt/fileserv/fileserv ]; then
        log_warn "Existing installation found at /opt/fileserv"
        if prompt_yes_no "This will upgrade the existing installation. Continue?" "y"; then
            log_info "Upgrading existing installation..."
        else
            log_error "Installation cancelled"
            exit 1
        fi
    fi
}

#------------------------------------------------------------------------------
# Interactive Configuration
#------------------------------------------------------------------------------

configure_installation() {
    log_step "Installation Configuration"
    echo -e "${NC}Please answer the following questions to configure FileServ.\n"

    # Installation directory
    prompt INSTALL_DIR "Installation directory" "$DEFAULT_INSTALL_DIR"

    # Data directory
    prompt DATA_DIR "Data storage directory" "$DEFAULT_DATA_DIR"

    # Port
    prompt PORT "Server port" "$DEFAULT_PORT"

    # Summary
    echo ""
    log_step "Configuration Summary"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  Installation directory: ${CYAN}$INSTALL_DIR${NC}"
    echo -e "  Data directory:         ${CYAN}$DATA_DIR${NC}"
    echo -e "  Server port:            ${CYAN}$PORT${NC}"
    echo -e "  Service user:           ${CYAN}root${NC} (required for PAM auth)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "  ${YELLOW}Note:${NC} Additional settings (authentication, admin groups, etc.)"
    echo -e "        will be configured through the web-based setup wizard."
    echo ""

    if ! prompt_yes_no "Proceed with installation?" "y"; then
        log_error "Installation cancelled"
        exit 1
    fi
}

#------------------------------------------------------------------------------
# Installation Steps
#------------------------------------------------------------------------------


create_directories() {
    log_step "Creating Directories"

    # Installation directory
    mkdir -p "$INSTALL_DIR"
    log_success "Created $INSTALL_DIR"

    # Data directory
    mkdir -p "$DATA_DIR"
    mkdir -p "$DATA_DIR/chunked_uploads"
    log_success "Created $DATA_DIR"
}

install_binary() {
    log_step "Installing FileServ Binary"

    # Check if binary exists in script directory
    BINARY_PATH=""

    if [ -f "$SCRIPT_DIR/fileserv" ]; then
        BINARY_PATH="$SCRIPT_DIR/fileserv"
    elif [ -f "$SCRIPT_DIR/../fileserv" ]; then
        BINARY_PATH="$SCRIPT_DIR/../fileserv"
    elif [ -f "./fileserv" ]; then
        BINARY_PATH="./fileserv"
    fi

    if [ -z "$BINARY_PATH" ]; then
        log_error "FileServ binary not found!"
        log_info "Expected location: $SCRIPT_DIR/fileserv"
        log_info "Please build the binary first with: make build"
        exit 1
    fi

    cp "$BINARY_PATH" "$INSTALL_DIR/fileserv"
    chmod 755 "$INSTALL_DIR/fileserv"
    log_success "Installed binary to $INSTALL_DIR/fileserv"
}

create_systemd_service() {
    log_step "Creating Systemd Service"

    SERVICE_FILE="/etc/systemd/system/fileserv.service"

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
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/fileserv
Restart=on-failure
RestartSec=5s

# Environment (minimal - most config is in database)
Environment="PORT=${PORT}"
Environment="DATA_DIR=${DATA_DIR}"

# Graceful shutdown
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30s

# Resource limits
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

    log_success "Created systemd service: $SERVICE_FILE"
}

set_permissions() {
    log_step "Setting Permissions"

    # Installation directory
    chown -R root:root "$INSTALL_DIR"
    chmod 755 "$INSTALL_DIR"

    # Data directory
    chown -R root:root "$DATA_DIR"
    chmod 750 "$DATA_DIR"

    log_success "Permissions configured"
}

enable_service() {
    log_step "Enabling Service"

    systemctl daemon-reload
    log_success "Systemd daemon reloaded"

    if prompt_yes_no "Enable FileServ to start on boot?" "y"; then
        systemctl enable fileserv
        log_success "Service enabled for autostart"
    fi

    if prompt_yes_no "Start FileServ now?" "y"; then
        systemctl start fileserv
        sleep 2

        if systemctl is-active --quiet fileserv; then
            log_success "FileServ is running"
        else
            log_error "Failed to start FileServ"
            log_info "Check logs with: journalctl -u fileserv -f"
            return 1
        fi
    fi
}

print_completion() {
    echo ""
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                                                               ║"
    echo "║              Installation Complete!                           ║"
    echo "║                                                               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    echo -e "${BOLD}Next Steps:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "  ${CYAN}1. Open the Setup Wizard:${NC}"
    echo "     http://your-server:${PORT}/setup"
    echo ""
    echo -e "  ${CYAN}2. Complete the wizard to configure:${NC}"
    echo "     • Server name"
    echo "     • Authentication settings"
    echo "     • Admin groups"
    echo "     • Session duration"
    echo ""
    echo -e "  ${CYAN}3. Log in with your system credentials${NC}"
    echo "     Users in admin groups will have full access."
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "${BOLD}Service Management:${NC}"
    echo "    Start:   sudo systemctl start fileserv"
    echo "    Stop:    sudo systemctl stop fileserv"
    echo "    Restart: sudo systemctl restart fileserv"
    echo "    Status:  sudo systemctl status fileserv"
    echo "    Logs:    sudo journalctl -u fileserv -f"
    echo ""
    echo -e "${BOLD}File Locations:${NC}"
    echo "    Binary:  ${INSTALL_DIR}/fileserv"
    echo "    Data:    ${DATA_DIR}"
    echo "    Service: /etc/systemd/system/fileserv.service"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    log_warn "For production, set up a reverse proxy with HTTPS."
    echo ""
}

#------------------------------------------------------------------------------
# Main Installation Flow
#------------------------------------------------------------------------------

main() {
    print_banner

    # Pre-flight checks
    check_root
    check_system_requirements
    check_existing_installation

    # Interactive configuration
    configure_installation

    # Installation steps
    create_directories
    install_binary
    create_systemd_service
    set_permissions
    enable_service

    # Complete
    print_completion
}

# Handle command line arguments
case "${1:-}" in
    -h|--help)
        echo "FileServ Installation Script"
        echo ""
        echo "Usage: sudo ./install.sh [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  -h, --help     Show this help message"
        echo "  --uninstall    Remove FileServ from the system"
        echo ""
        echo "This script installs FileServ as a systemd service."
        echo "Configuration is done through the web-based setup wizard."
        exit 0
        ;;
    --uninstall)
        check_root
        log_step "Uninstalling FileServ"

        if prompt_yes_no "This will remove FileServ. Data in ${DEFAULT_DATA_DIR} will be preserved. Continue?" "n"; then
            systemctl stop fileserv 2>/dev/null || true
            systemctl disable fileserv 2>/dev/null || true
            rm -f /etc/systemd/system/fileserv.service
            rm -rf /opt/fileserv
            systemctl daemon-reload
            log_success "FileServ has been uninstalled"
            log_info "Data preserved in: ${DEFAULT_DATA_DIR}"
            log_info "To remove data: sudo rm -rf ${DEFAULT_DATA_DIR}"
        else
            log_info "Uninstall cancelled"
        fi
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
