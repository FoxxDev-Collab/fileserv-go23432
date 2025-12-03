.PHONY: build run clean install vendor test

# Binary name
BINARY=fileserv

# Build the application
build:
	go build -ldflags="-s -w" -o $(BINARY)

# Build with race detector (for development)
build-dev:
	go build -race -o $(BINARY)

# Run the application
run:
	go run main.go

# Install dependencies
vendor:
	go mod download
	go mod tidy
	go mod vendor

# Clean build artifacts
clean:
	rm -f $(BINARY)
	rm -rf vendor/

# Run tests
test:
	go test -v ./...

# Install to system (requires sudo)
install: build
	sudo mkdir -p /opt/fileserv
	sudo cp $(BINARY) /opt/fileserv/
	sudo cp fileserv.service /etc/systemd/system/
	sudo systemctl daemon-reload
	@echo "Installation complete. Configure and start with:"
	@echo "  sudo systemctl enable fileserv"
	@echo "  sudo systemctl start fileserv"

# Uninstall from system (requires sudo)
uninstall:
	sudo systemctl stop fileserv || true
	sudo systemctl disable fileserv || true
	sudo rm -f /etc/systemd/system/fileserv.service
	sudo rm -rf /opt/fileserv
	sudo systemctl daemon-reload
	@echo "Uninstall complete"

# Development server with auto-reload
dev:
	@if command -v air > /dev/null; then \
		air; \
	else \
		echo "air not found. Install with: go install github.com/cosmtrek/air@latest"; \
		go run main.go; \
	fi
