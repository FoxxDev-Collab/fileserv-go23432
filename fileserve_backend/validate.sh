#!/bin/bash

# Validation script to check project structure and code

echo "==================================="
echo "FileServ Backend Validation"
echo "==================================="
echo ""

ERRORS=0

# Check required directories
echo "Checking directory structure..."
REQUIRED_DIRS=(
  "config"
  "handlers"
  "middleware"
  "models"
  "storage"
  "internal/auth"
  "internal/fileops"
  "static"
)

for dir in "${REQUIRED_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    echo "  ✓ $dir"
  else
    echo "  ✗ $dir - MISSING"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "Checking required files..."
REQUIRED_FILES=(
  "main.go"
  "go.mod"
  "README.md"
  "INSTALL.md"
  "API.md"
  "Makefile"
  "setup.sh"
  "fileserv.service"
  ".env.example"
  ".gitignore"
  "config/config.go"
  "handlers/auth.go"
  "handlers/users.go"
  "handlers/files.go"
  "handlers/admin.go"
  "handlers/static.go"
  "middleware/auth.go"
  "middleware/logging.go"
  "middleware/cors.go"
  "models/user.go"
  "models/permission.go"
  "models/session.go"
  "storage/store.go"
  "internal/auth/jwt.go"
  "internal/fileops/fileops.go"
  "static/.gitkeep"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file - MISSING"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "Checking Go syntax..."
if command -v go &> /dev/null; then
  if go fmt ./... > /dev/null 2>&1; then
    echo "  ✓ Go formatting check passed"
  else
    echo "  ✗ Go formatting check failed"
    ERRORS=$((ERRORS + 1))
  fi

  if go vet ./... > /dev/null 2>&1; then
    echo "  ✓ Go vet check passed"
  else
    echo "  ⚠ Go vet check had warnings (may need dependencies)"
  fi
else
  echo "  ⚠ Go not installed - skipping syntax checks"
fi

echo ""
echo "==================================="
if [ $ERRORS -eq 0 ]; then
  echo "✓ Validation PASSED"
  echo "==================================="
  echo ""
  echo "Project structure is complete!"
  echo ""
  echo "Next steps:"
  echo "1. Run ./setup.sh to install Go and build"
  echo "2. Or manually: go mod tidy && go build"
  echo ""
  exit 0
else
  echo "✗ Validation FAILED with $ERRORS error(s)"
  echo "==================================="
  exit 1
fi
