#!/bin/bash

# Docker Cleanup Script for Metis - Intelligent MCP Router & Web Client
# This script provides cleanup and maintenance for Docker resources

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="metis-router"
FORCE=false
ALL=false

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

# Confirm action
confirm_action() {
    local message="$1"
    if [ "$FORCE" = true ]; then
        return 0
    fi
    
    echo -e "${YELLOW}[CONFIRM]${NC} $message"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        return 0
    else
        return 1
    fi
}

# Stop all Metis services
stop_services() {
    log_info "Stopping Metis services..."
    
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null; then
        compose_cmd="docker compose"
    fi
    
    # Stop production services
    if [ -f "docker-compose.yml" ]; then
        $compose_cmd -f docker-compose.yml down --remove-orphans 2>/dev/null || true
    fi
    
    # Stop development services
    if [ -f "docker-compose.dev.yml" ]; then
        $compose_cmd -f docker-compose.dev.yml down --remove-orphans 2>/dev/null || true
    fi
    
    log_success "Services stopped"
}

# Remove Metis containers
remove_containers() {
    log_info "Removing Metis containers..."
    
    local containers=$(docker ps -a --filter "name=metis" --format "{{.Names}}" 2>/dev/null || true)
    
    if [ -n "$containers" ]; then
        if confirm_action "Remove containers: $containers"; then
            echo "$containers" | xargs -r docker rm -f
            log_success "Containers removed"
        else
            log_info "Container removal cancelled"
        fi
    else
        log_info "No Metis containers found"
    fi
}

# Remove Metis images
remove_images() {
    log_info "Removing Metis images..."
    
    local images=$(docker images --filter "reference=*${NAMESPACE}*" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)
    
    if [ -n "$images" ]; then
        if confirm_action "Remove images: $images"; then
            echo "$images" | xargs -r docker rmi -f
            log_success "Images removed"
        else
            log_info "Image removal cancelled"
        fi
    else
        log_info "No Metis images found"
    fi
}

# Remove Metis volumes
remove_volumes() {
    log_info "Removing Metis volumes..."
    
    local volumes=$(docker volume ls --filter "name=metis" --format "{{.Name}}" 2>/dev/null || true)
    
    if [ -n "$volumes" ]; then
        if confirm_action "Remove volumes: $volumes (This will delete persistent data!)"; then
            echo "$volumes" | xargs -r docker volume rm -f
            log_success "Volumes removed"
        else
            log_info "Volume removal cancelled"
        fi
    else
        log_info "No Metis volumes found"
    fi
}

# Remove Metis networks
remove_networks() {
    log_info "Removing Metis networks..."
    
    local networks=$(docker network ls --filter "name=metis" --format "{{.Name}}" 2>/dev/null || true)
    
    if [ -n "$networks" ]; then
        if confirm_action "Remove networks: $networks"; then
            echo "$networks" | xargs -r docker network rm
            log_success "Networks removed"
        else
            log_info "Network removal cancelled"
        fi
    else
        log_info "No Metis networks found"
    fi
}

# Clean Docker system
clean_system() {
    log_info "Cleaning Docker system..."
    
    if confirm_action "Clean unused Docker resources (images, containers, networks, build cache)"; then
        docker system prune -f
        log_success "Docker system cleaned"
    else
        log_info "System cleanup cancelled"
    fi
}

# Clean build cache
clean_build_cache() {
    log_info "Cleaning Docker build cache..."
    
    if confirm_action "Remove Docker build cache"; then
        docker builder prune -f
        log_success "Build cache cleaned"
    else
        log_info "Build cache cleanup cancelled"
    fi
}

# Show Docker resource usage
show_usage() {
    log_info "Docker resource usage:"
    echo ""
    
    echo "=== Images ==="
    docker images --filter "reference=*${NAMESPACE}*" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" 2>/dev/null || echo "No Metis images found"
    echo ""
    
    echo "=== Containers ==="
    docker ps -a --filter "name=metis" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.CreatedAt}}" 2>/dev/null || echo "No Metis containers found"
    echo ""
    
    echo "=== Volumes ==="
    docker volume ls --filter "name=metis" --format "table {{.Name}}\t{{.Driver}}\t{{.CreatedAt}}" 2>/dev/null || echo "No Metis volumes found"
    echo ""
    
    echo "=== Networks ==="
    docker network ls --filter "name=metis" --format "table {{.Name}}\t{{.Driver}}\t{{.CreatedAt}}" 2>/dev/null || echo "No Metis networks found"
    echo ""
    
    echo "=== System Usage ==="
    docker system df
}

# Full cleanup
full_cleanup() {
    log_warning "Performing full cleanup of all Metis Docker resources..."
    
    stop_services
    remove_containers
    remove_images
    remove_volumes
    remove_networks
    
    if [ "$ALL" = true ]; then
        clean_system
        clean_build_cache
    fi
    
    log_success "Full cleanup completed"
}

# Reset development environment
reset_dev() {
    log_info "Resetting development environment..."
    
    # Stop development services
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null; then
        compose_cmd="docker compose"
    fi
    
    if [ -f "docker-compose.dev.yml" ]; then
        $compose_cmd -f docker-compose.dev.yml down --volumes --remove-orphans 2>/dev/null || true
    fi
    
    # Remove development images
    local dev_images=$(docker images --filter "reference=*${NAMESPACE}*dev*" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)
    if [ -n "$dev_images" ]; then
        echo "$dev_images" | xargs -r docker rmi -f
    fi
    
    # Clean build cache
    docker builder prune -f
    
    log_success "Development environment reset"
}

# Help function
show_help() {
    echo "Usage: $0 [OPTIONS] [COMMAND]"
    echo ""
    echo "Cleanup and maintenance for Metis Docker resources"
    echo ""
    echo "Commands:"
    echo "  stop          Stop all Metis services"
    echo "  containers    Remove Metis containers"
    echo "  images        Remove Metis images"
    echo "  volumes       Remove Metis volumes (WARNING: deletes data)"
    echo "  networks      Remove Metis networks"
    echo "  system        Clean Docker system (unused resources)"
    echo "  cache         Clean Docker build cache"
    echo "  full          Full cleanup (all of the above)"
    echo "  reset-dev     Reset development environment"
    echo "  usage         Show Docker resource usage"
    echo ""
    echo "Options:"
    echo "  -f, --force   Skip confirmation prompts"
    echo "  -a, --all     Include system cleanup in full cleanup"
    echo "  -h, --help    Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 usage              # Show resource usage"
    echo "  $0 stop               # Stop all services"
    echo "  $0 containers         # Remove containers"
    echo "  $0 full -f            # Full cleanup without prompts"
    echo "  $0 reset-dev          # Reset dev environment"
    echo ""
    echo "WARNING: Some operations will delete persistent data!"
    echo "Always backup important data before running cleanup commands."
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--force)
            FORCE=true
            shift
            ;;
        -a|--all)
            ALL=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        stop)
            stop_services
            exit 0
            ;;
        containers)
            remove_containers
            exit 0
            ;;
        images)
            remove_images
            exit 0
            ;;
        volumes)
            remove_volumes
            exit 0
            ;;
        networks)
            remove_networks
            exit 0
            ;;
        system)
            clean_system
            exit 0
            ;;
        cache)
            clean_build_cache
            exit 0
            ;;
        full)
            full_cleanup
            exit 0
            ;;
        reset-dev)
            reset_dev
            exit 0
            ;;
        usage)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
done

# Default action
show_usage