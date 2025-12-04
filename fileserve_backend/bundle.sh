#!/bin/bash
#
# FileServ Bundle Creation Script
# Creates a distributable package with all required files
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

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$SCRIPT_DIR"
FRONTEND_DIR="$PROJECT_ROOT/fileserve_frontend"

# Version (can be overridden)
VERSION="${VERSION:-$(date +%Y%m%d)}"
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Output
OUTPUT_DIR="${OUTPUT_DIR:-$PROJECT_ROOT/dist}"
BUNDLE_NAME="fileserv-${VERSION}"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${BOLD}${CYAN}▶ $1${NC}"; }

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║               FileServ Bundle Creator                         ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo -e "  Version:    ${YELLOW}${VERSION}${NC}"
    echo -e "  Build Date: ${YELLOW}${BUILD_DATE}${NC}"
    echo ""
}

check_dependencies() {
    log_step "Checking Build Dependencies"

    # Check Go
    if ! command -v go &> /dev/null; then
        log_error "Go is not installed. Please install Go 1.21+ first."
        exit 1
    fi

    GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
    log_success "Go version: $GO_VERSION"

    # Check npm (optional, for frontend rebuild)
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        log_success "npm version: $NPM_VERSION"
        HAS_NPM=true
    else
        log_warn "npm not found - will use existing frontend build"
        HAS_NPM=false
    fi

    # Check tar
    if ! command -v tar &> /dev/null; then
        log_error "tar is required but not found"
        exit 1
    fi
    log_success "tar available"
}

build_frontend() {
    log_step "Building Frontend"

    if [ ! -d "$FRONTEND_DIR" ]; then
        log_warn "Frontend directory not found: $FRONTEND_DIR"
        log_info "Skipping frontend build - using existing static files"
        return
    fi

    if [ "$HAS_NPM" = "true" ] && [ "$SKIP_FRONTEND" != "true" ]; then
        log_info "Installing frontend dependencies..."
        cd "$FRONTEND_DIR"
        npm install --silent

        log_info "Building frontend..."
        npm run build

        log_info "Copying built frontend to backend static directory..."
        rm -rf "$BACKEND_DIR/static"/*
        cp -r "$FRONTEND_DIR/out/"* "$BACKEND_DIR/static/"

        cd "$BACKEND_DIR"
        log_success "Frontend built and copied"
    else
        if [ -d "$BACKEND_DIR/static" ] && [ "$(ls -A "$BACKEND_DIR/static" 2>/dev/null)" ]; then
            log_info "Using existing static files in backend"
        else
            log_error "No frontend build found and npm unavailable"
            exit 1
        fi
    fi
}

build_backend() {
    log_step "Building Backend"

    cd "$BACKEND_DIR"

    # Vendor dependencies
    log_info "Vendoring dependencies..."
    go mod download
    go mod tidy
    go mod vendor

    # Detect architecture
    GOOS=$(go env GOOS)
    GOARCH=$(go env GOARCH)

    log_info "Building for ${GOOS}/${GOARCH}..."

    # Build with version info
    LDFLAGS="-s -w -X main.Version=${VERSION} -X main.BuildDate=${BUILD_DATE}"

    go build -ldflags="$LDFLAGS" -o fileserv

    BINARY_SIZE=$(du -h fileserv | cut -f1)
    log_success "Built binary: fileserv (${BINARY_SIZE})"

    # Optionally build for multiple architectures
    if [ "$BUILD_ALL_ARCH" = "true" ]; then
        log_info "Building additional architectures..."

        mkdir -p "$OUTPUT_DIR/binaries"

        for target in "linux/amd64" "linux/arm64"; do
            os=$(echo "$target" | cut -d'/' -f1)
            arch=$(echo "$target" | cut -d'/' -f2)
            output="$OUTPUT_DIR/binaries/fileserv-${os}-${arch}"

            log_info "  Building ${os}/${arch}..."
            GOOS=$os GOARCH=$arch go build -ldflags="$LDFLAGS" -o "$output"

            log_success "  Created: $output"
        done
    fi
}

create_bundle() {
    log_step "Creating Distribution Bundle"

    # Create output directory
    mkdir -p "$OUTPUT_DIR"
    BUNDLE_DIR="$OUTPUT_DIR/$BUNDLE_NAME"
    rm -rf "$BUNDLE_DIR"
    mkdir -p "$BUNDLE_DIR"

    log_info "Bundle directory: $BUNDLE_DIR"

    # Copy binary
    cp "$BACKEND_DIR/fileserv" "$BUNDLE_DIR/"
    log_success "Copied binary"

    # Copy installation scripts
    cp "$BACKEND_DIR/install.sh" "$BUNDLE_DIR/"
    chmod +x "$BUNDLE_DIR/install.sh"
    log_success "Copied install.sh"

    cp "$BACKEND_DIR/update.sh" "$BUNDLE_DIR/"
    chmod +x "$BUNDLE_DIR/update.sh"
    log_success "Copied update.sh"

    if [ -f "$BACKEND_DIR/uninstall.sh" ]; then
        cp "$BACKEND_DIR/uninstall.sh" "$BUNDLE_DIR/"
        chmod +x "$BUNDLE_DIR/uninstall.sh"
        log_success "Copied uninstall.sh"
    fi

    # Copy systemd service template
    cp "$BACKEND_DIR/fileserv.service" "$BUNDLE_DIR/"
    log_success "Copied systemd service template"

    # Copy documentation
    if [ -f "$BACKEND_DIR/README.md" ]; then
        cp "$BACKEND_DIR/README.md" "$BUNDLE_DIR/"
    fi
    if [ -f "$BACKEND_DIR/INSTALL.md" ]; then
        cp "$BACKEND_DIR/INSTALL.md" "$BUNDLE_DIR/"
    fi
    log_success "Copied documentation"


    # Create version file
    cat > "$BUNDLE_DIR/VERSION" << EOF
FileServ Version: ${VERSION}
Build Date: ${BUILD_DATE}
Go Version: $(go version | awk '{print $3}')
Platform: $(go env GOOS)/$(go env GOARCH)
EOF
    log_success "Created VERSION file"

    # Create checksums
    log_info "Generating checksums..."
    cd "$BUNDLE_DIR"
    sha256sum fileserv > checksums.sha256
    if [ -d "$OUTPUT_DIR/binaries" ]; then
        for bin in "$OUTPUT_DIR/binaries"/fileserv-*; do
            if [ -f "$bin" ]; then
                sha256sum "$(basename "$bin")" >> checksums.sha256 2>/dev/null || true
            fi
        done
    fi
    cd "$OUTPUT_DIR"
    log_success "Created checksums.sha256"

    # Create tarball
    log_info "Creating tarball..."
    TARBALL="${BUNDLE_NAME}.tar.gz"
    tar -czf "$TARBALL" "$BUNDLE_NAME"
    log_success "Created: $OUTPUT_DIR/$TARBALL"

    # Calculate tarball checksum
    sha256sum "$TARBALL" > "${TARBALL}.sha256"
    log_success "Created: $OUTPUT_DIR/${TARBALL}.sha256"

    # Print bundle contents
    echo ""
    log_info "Bundle contents:"
    tar -tzf "$TARBALL" | sed 's/^/    /'
}

print_summary() {
    TARBALL_SIZE=$(du -h "$OUTPUT_DIR/${BUNDLE_NAME}.tar.gz" | cut -f1)

    echo ""
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                    Bundle Created Successfully                ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    echo -e "${BOLD}Output:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  Bundle:   ${CYAN}$OUTPUT_DIR/${BUNDLE_NAME}.tar.gz${NC} (${TARBALL_SIZE})"
    echo -e "  Checksum: ${CYAN}$OUTPUT_DIR/${BUNDLE_NAME}.tar.gz.sha256${NC}"
    echo ""

    if [ "$BUILD_ALL_ARCH" = "true" ] && [ -d "$OUTPUT_DIR/binaries" ]; then
        echo -e "${BOLD}Additional Binaries:${NC}"
        for bin in "$OUTPUT_DIR/binaries"/fileserv-*; do
            if [ -f "$bin" ]; then
                size=$(du -h "$bin" | cut -f1)
                echo -e "  $(basename "$bin") (${size})"
            fi
        done
        echo ""
    fi

    echo -e "${BOLD}Installation:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  1. Copy bundle to target server:"
    echo -e "     ${CYAN}scp $OUTPUT_DIR/${BUNDLE_NAME}.tar.gz user@server:~/${NC}"
    echo ""
    echo "  2. Extract and run installer:"
    echo -e "     ${CYAN}tar -xzf ${BUNDLE_NAME}.tar.gz${NC}"
    echo -e "     ${CYAN}cd ${BUNDLE_NAME}${NC}"
    echo -e "     ${CYAN}sudo ./install.sh${NC}"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

cleanup() {
    if [ "$KEEP_BUILD_DIR" != "true" ]; then
        rm -rf "$OUTPUT_DIR/$BUNDLE_NAME"
    fi
}

show_help() {
    echo "FileServ Bundle Creator"
    echo ""
    echo "Usage: ./bundle.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help         Show this help message"
    echo "  -v, --version VER  Set version string (default: YYYYMMDD)"
    echo "  -o, --output DIR   Output directory (default: ../dist)"
    echo "  --skip-frontend    Skip frontend rebuild"
    echo "  --all-arch         Build for all architectures (amd64, arm64)"
    echo "  --keep-dir         Keep unpacked bundle directory"
    echo ""
    echo "Environment Variables:"
    echo "  VERSION            Override version string"
    echo "  OUTPUT_DIR         Override output directory"
    echo "  SKIP_FRONTEND      Set to 'true' to skip frontend build"
    echo "  BUILD_ALL_ARCH     Set to 'true' for multi-arch builds"
    echo ""
    echo "Examples:"
    echo "  ./bundle.sh                    # Basic bundle"
    echo "  ./bundle.sh -v 1.0.0           # With specific version"
    echo "  ./bundle.sh --all-arch         # Multi-architecture build"
    echo ""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--version)
            VERSION="$2"
            BUNDLE_NAME="fileserv-${VERSION}"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --skip-frontend)
            SKIP_FRONTEND=true
            shift
            ;;
        --all-arch)
            BUILD_ALL_ARCH=true
            shift
            ;;
        --keep-dir)
            KEEP_BUILD_DIR=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
main() {
    print_banner
    check_dependencies
    build_frontend
    build_backend
    create_bundle
    cleanup
    print_summary
}

main
