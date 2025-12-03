#!/bin/bash

# FileServ Setup Script
# This script helps install Go and build the fileserv application

set -e

echo "==================================="
echo "FileServ Backend Setup"
echo "==================================="
echo ""

# Check if Go is installed
if command -v go &> /dev/null; then
    GO_VERSION=$(go version | awk '{print $3}')
    echo "✓ Go is already installed: $GO_VERSION"
else
    echo "✗ Go is not installed"
    echo ""
    read -p "Would you like to install Go 1.21.5? (y/n) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Installing Go..."

        # Detect architecture
        ARCH=$(uname -m)
        if [ "$ARCH" = "x86_64" ]; then
            GO_ARCH="amd64"
        elif [ "$ARCH" = "aarch64" ]; then
            GO_ARCH="arm64"
        else
            echo "Unsupported architecture: $ARCH"
            exit 1
        fi

        # Download and install Go
        GO_VERSION="1.21.5"
        GO_TARBALL="go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"

        echo "Downloading Go ${GO_VERSION} for ${GO_ARCH}..."
        wget -q "https://go.dev/dl/${GO_TARBALL}" -O "/tmp/${GO_TARBALL}"

        echo "Installing Go to /usr/local/go..."
        sudo rm -rf /usr/local/go
        sudo tar -C /usr/local -xzf "/tmp/${GO_TARBALL}"
        rm "/tmp/${GO_TARBALL}"

        # Add to PATH
        export PATH=$PATH:/usr/local/go/bin

        # Add to profile
        if ! grep -q "/usr/local/go/bin" ~/.bashrc; then
            echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
            echo "Added Go to PATH in ~/.bashrc"
        fi

        echo "✓ Go installed successfully: $(go version)"
    else
        echo "Please install Go manually from https://go.dev/dl/"
        exit 1
    fi
fi

echo ""
echo "==================================="
echo "Building FileServ"
echo "==================================="
echo ""

# Install dependencies
echo "Installing dependencies..."
go mod download
go mod tidy

# Vendor dependencies
echo "Vendoring dependencies..."
go mod vendor

# Build binary
echo "Building binary..."
go build -ldflags="-s -w" -o fileserv

echo ""
echo "==================================="
echo "✓ Build Complete!"
echo "==================================="
echo ""
echo "Binary created: ./fileserv"
echo ""
echo "Next steps:"
echo "1. Configure environment variables (see .env.example)"
echo "2. Run in development: ./fileserv"
echo "3. Or install as systemd service: make install"
echo ""
echo "Authentication: Use system credentials (root and wheel users have admin access)"
echo ""
