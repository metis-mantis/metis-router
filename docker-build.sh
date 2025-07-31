#!/bin/bash

# Docker Build Script for Metis - Intelligent MCP Router & Web Client
# This script builds all Docker images with proper tagging and version management

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGISTRY="ghcr.io"
NAMESPACE="metis-router"
VERSION=${1:-"latest"}
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Image names
SERVER_IMAGE="${REGISTRY}/${NAMESPACE}/server"
BACKEND_IMAGE="${REGISTRY}/${NAMESPACE}/backend"
FRONTEND_IMAGE="${REGISTRY}/${NAMESPACE}/frontend"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Build function
build_image() {
    local service=$1
    local context=$2
    local image_name=$3
    local dockerfile=${4:-"Dockerfile"}
    
    log_info "Building ${service} image..."
    
    docker build \
        --file "${context}/${dockerfile}" \
        --tag "${image_name}:${VERSION}" \
        --tag "${image_name}:latest" \
        --label "org.opencontainers.image.created=${BUILD_DATE}" \
        --label "org.opencontainers.image.revision=${GIT_COMMIT}" \
        --label "org.opencontainers.image.version=${VERSION}" \
        --label "org.opencontainers.image.source=https://github.com/metis-router/metis" \
        --label "org.opencontainers.image.title=Metis ${service^}" \
        --label "org.opencontainers.image.description=Metis ${service} component" \
        "${context}"
    
    if [ $? -eq 0 ]; then
        log_success "${service} image built successfully"
    else
        log_error "Failed to build ${service} image"
        exit 1
    fi
}

# Main build process
main() {
    log_info "Starting Docker build process..."
    log_info "Version: ${VERSION}"
    log_info "Git Commit: ${GIT_COMMIT}"
    log_info "Build Date: ${BUILD_DATE}"
    
    check_prerequisites
    
    # Build server image
    build_image "server" "server" "${SERVER_IMAGE}"
    
    # Build backend image
    build_image "backend" "client/backend" "${BACKEND_IMAGE}"
    
    # Build frontend image
    build_image "frontend" "client/frontend" "${FRONTEND_IMAGE}"
    
    log_success "All images built successfully!"
    
    # Display built images
    log_info "Built images:"
    docker images | grep -E "(${NAMESPACE}|REPOSITORY)" | head -4
    
    log_info "Build completed successfully!"
    log_info "To push images to registry, run: docker push ${SERVER_IMAGE}:${VERSION}"
    log_info "To start the application, run: ./docker-start.sh"
}

# Help function
show_help() {
    echo "Usage: $0 [VERSION]"
    echo ""
    echo "Build all Docker images for Metis application"
    echo ""
    echo "Arguments:"
    echo "  VERSION    Version tag for the images (default: latest)"
    echo ""
    echo "Examples:"
    echo "  $0                 # Build with 'latest' tag"
    echo "  $0 v1.0.0         # Build with 'v1.0.0' tag"
    echo "  $0 dev            # Build with 'dev' tag"
    echo ""
    echo "Environment Variables:"
    echo "  REGISTRY          Container registry (default: ghcr.io)"
    echo "  NAMESPACE         Image namespace (default: metis-router)"
}

# Handle arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    *)
        main
        ;;
esac