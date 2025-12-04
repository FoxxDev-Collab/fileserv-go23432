#!/bin/bash
#
# FileServ Uninstall Script
# Removes FileServ from the system while preserving data by default
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

# Default paths (can be overridden)
INSTALL_DIR="${INSTALL_DIR:-/opt/fileserv}"
DATA_DIR="${DATA_DIR:-/var/lib/fileserv}"
SERVICE_USER="${SERVICE_USER:-fileserv}"
SERVICE_NAME="fileserv"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${BOLD}${CYAN}▶ $1${NC}"; }

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

print_banner() {
    echo -e "${YELLOW}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                  FileServ Uninstaller                         ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

detect_installation() {
    log_step "Detecting Installation"

    FOUND_INSTALLATION=false

    # Check for systemd service
    if [ -f /etc/systemd/system/${SERVICE_NAME}.service ]; then
        log_info "Found systemd service"
        FOUND_INSTALLATION=true

        # Try to read actual paths from service file
        if grep -q "WorkingDirectory=" /etc/systemd/system/${SERVICE_NAME}.service; then
            INSTALL_DIR=$(grep "WorkingDirectory=" /etc/systemd/system/${SERVICE_NAME}.service | cut -d'=' -f2)
            log_info "Install directory: $INSTALL_DIR"
        fi

        if grep -q "EnvironmentFile=" /etc/systemd/system/${SERVICE_NAME}.service; then
            ENV_FILE=$(grep "EnvironmentFile=" /etc/systemd/system/${SERVICE_NAME}.service | cut -d'=' -f2)
            if [ -f "$ENV_FILE" ]; then
                source "$ENV_FILE" 2>/dev/null || true
                log_info "Data directory: ${DATA_DIR:-/var/lib/fileserv}"
            fi
        fi
    fi

    # Check for binary
    if [ -f "$INSTALL_DIR/fileserv" ]; then
        log_info "Found binary at $INSTALL_DIR/fileserv"
        FOUND_INSTALLATION=true
    fi

    # Check for data directory
    if [ -d "$DATA_DIR" ]; then
        DATA_SIZE=$(du -sh "$DATA_DIR" 2>/dev/null | cut -f1)
        log_info "Found data directory: $DATA_DIR ($DATA_SIZE)"
    fi

    if [ "$FOUND_INSTALLATION" = "false" ]; then
        log_warn "No FileServ installation detected"
        exit 0
    fi
}

confirm_uninstall() {
    echo ""
    echo -e "${BOLD}The following will be removed:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  - Systemd service: /etc/systemd/system/${SERVICE_NAME}.service"
    echo "  - Installation:    $INSTALL_DIR"
    echo ""
    echo -e "${BOLD}The following will be PRESERVED:${NC}"
    echo "  - Data directory:  $DATA_DIR"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    if ! prompt_yes_no "Proceed with uninstall?" "n"; then
        log_info "Uninstall cancelled"
        exit 0
    fi
}

stop_service() {
    log_step "Stopping Service"

    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        systemctl stop "$SERVICE_NAME"
        log_success "Service stopped"
    else
        log_info "Service not running"
    fi

    if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        systemctl disable "$SERVICE_NAME"
        log_success "Service disabled"
    fi
}

remove_service() {
    log_step "Removing Systemd Service"

    if [ -f /etc/systemd/system/${SERVICE_NAME}.service ]; then
        rm -f /etc/systemd/system/${SERVICE_NAME}.service
        systemctl daemon-reload
        log_success "Removed systemd service"
    else
        log_info "Service file not found"
    fi
}

remove_installation() {
    log_step "Removing Installation Directory"

    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
        log_success "Removed $INSTALL_DIR"
    else
        log_info "Installation directory not found"
    fi
}

handle_user() {
    log_step "Service User"

    if id "$SERVICE_USER" &>/dev/null; then
        if prompt_yes_no "Remove service user '$SERVICE_USER'?" "n"; then
            userdel "$SERVICE_USER" 2>/dev/null || true
            log_success "Removed user '$SERVICE_USER'"
        else
            log_info "User preserved"
        fi
    fi
}

handle_data() {
    log_step "Data Directory"

    if [ -d "$DATA_DIR" ]; then
        DATA_SIZE=$(du -sh "$DATA_DIR" 2>/dev/null | cut -f1)
        echo ""
        log_warn "Data directory contains $DATA_SIZE of data"

        if prompt_yes_no "PERMANENTLY DELETE all data in $DATA_DIR?" "n"; then
            if prompt_yes_no "Are you ABSOLUTELY SURE? This cannot be undone!" "n"; then
                rm -rf "$DATA_DIR"
                log_success "Deleted data directory"
            else
                log_info "Data preserved"
            fi
        else
            log_info "Data preserved at: $DATA_DIR"
        fi
    fi
}

print_summary() {
    echo ""
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                 Uninstall Complete                            ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    if [ -d "$DATA_DIR" ]; then
        echo -e "${BOLD}Data Preserved:${NC}"
        echo "  Location: $DATA_DIR"
        echo ""
        echo "  To manually remove data:"
        echo -e "    ${CYAN}sudo rm -rf $DATA_DIR${NC}"
        echo ""
    fi

    echo "FileServ has been uninstalled from your system."
}

main() {
    print_banner
    check_root
    detect_installation
    confirm_uninstall
    stop_service
    remove_service
    remove_installation
    handle_user
    handle_data
    print_summary
}

# Handle arguments
case "${1:-}" in
    -h|--help)
        echo "FileServ Uninstall Script"
        echo ""
        echo "Usage: sudo ./uninstall.sh [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  -h, --help      Show this help message"
        echo "  --purge         Remove everything including data (no prompts)"
        echo "  --keep-data     Keep data directory (no prompts)"
        echo ""
        echo "Environment Variables:"
        echo "  INSTALL_DIR     Override installation directory"
        echo "  DATA_DIR        Override data directory"
        echo "  SERVICE_USER    Override service user name"
        exit 0
        ;;
    --purge)
        check_root
        print_banner
        detect_installation
        log_warn "PURGE MODE: Removing everything including data!"
        stop_service
        remove_service
        remove_installation
        if id "$SERVICE_USER" &>/dev/null; then
            userdel "$SERVICE_USER" 2>/dev/null || true
            log_success "Removed user '$SERVICE_USER'"
        fi
        if [ -d "$DATA_DIR" ]; then
            rm -rf "$DATA_DIR"
            log_success "Deleted data directory"
        fi
        echo ""
        log_success "FileServ completely removed from system"
        exit 0
        ;;
    --keep-data)
        check_root
        print_banner
        detect_installation
        stop_service
        remove_service
        remove_installation
        log_info "Data preserved at: $DATA_DIR"
        echo ""
        log_success "FileServ uninstalled (data preserved)"
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
