#!/bin/bash

# Docker Start Script for Metis - Intelligent MCP Router & Web Client
# This script starts the containerized application with proper configuration

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
DETACHED=false
REBUILD=false
LOGS=false

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
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    if [ ! -f "${COMPOSE_FILE}" ]; then
        log_error "Docker Compose file '${COMPOSE_FILE}' not found"
        exit 1
    fi
    
    if [ ! -f "${ENV_FILE}" ]; then
        log_warning "Environment file '${ENV_FILE}' not found"
        log_info "Creating .env file from .env.example..."
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_warning "Please edit .env file with your configuration before starting"
            log_warning "Especially set your OPENAI_API_KEY"
        else
            log_error ".env.example file not found. Cannot create .env file."
            exit 1
        fi
    fi
    
    log_success "Prerequisites check passed"
}

# Check environment variables
check_environment() {
    log_info "Checking environment configuration..."
    
    if ! grep -q "OPENAI_API_KEY=" "${ENV_FILE}" || grep -q "OPENAI_API_KEY=$" "${ENV_FILE}"; then
        log_warning "OPENAI_API_KEY is not set in ${ENV_FILE}"
        log_warning "The application may not work properly without it"
    fi
    
    log_success "Environment check completed"
}

# Start services
start_services() {
    log_info "Starting Metis services..."
    
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null; then
        compose_cmd="docker compose"
    fi
    
    local args=""
    if [ "$DETACHED" = true ]; then
        args="$args -d"
    fi
    
    if [ "$REBUILD" = true ]; then
        log_info "Rebuilding images..."
        $compose_cmd build --no-cache
    fi
    
    $compose_cmd up $args
    
    if [ "$DETACHED" = true ]; then
        log_success "Services started in detached mode"
        log_info "Access the application at: http://localhost:3000"
        log_info "Backend API available at: http://localhost:8000"
        log_info "MCP Server available at: http://localhost:9999"
        log_info ""
        log_info "To view logs: docker-compose logs -f"
        log_info "To stop services: docker-compose down"
    fi
}

# Show logs
show_logs() {
    log_info "Showing service logs..."
    
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null; then
        compose_cmd="docker compose"
    fi
    
    $compose_cmd logs -f
}

# Stop services
stop_services() {
    log_info "Stopping Metis services..."
    
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null; then
        compose_cmd="docker compose"
    fi
    
    $compose_cmd down
    log_success "Services stopped"
}

# Show status
show_status() {
    log_info "Service status:"
    
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null; then
        compose_cmd="docker compose"
    fi
    
    $compose_cmd ps
    
    echo ""
    log_info "Health checks:"
    
    # Check frontend
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health | grep -q "200"; then
        log_success "Frontend: Healthy (http://localhost:3000)"
    else
        log_warning "Frontend: Not responding (http://localhost:3000)"
    fi
    
    # Check backend
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health | grep -q "200"; then
        log_success "Backend: Healthy (http://localhost:8000)"
    else
        log_warning "Backend: Not responding (http://localhost:8000)"
    fi
    
    # Check server
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:9999/health | grep -q "200"; then
        log_success "Server: Healthy (http://localhost:9999)"
    else
        log_warning "Server: Not responding (http://localhost:9999)"
    fi
}

# Main function
main() {
    check_prerequisites
    check_environment
    start_services
}

# Help function
show_help() {
    echo "Usage: $0 [OPTIONS] [COMMAND]"
    echo ""
    echo "Start the Metis containerized application"
    echo ""
    echo "Commands:"
    echo "  start     Start services (default)"
    echo "  stop      Stop services"
    echo "  restart   Restart services"
    echo "  status    Show service status"
    echo "  logs      Show service logs"
    echo ""
    echo "Options:"
    echo "  -d, --detach      Run in detached mode"
    echo "  -r, --rebuild     Rebuild images before starting"
    echo "  -h, --help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                # Start services in foreground"
    echo "  $0 -d             # Start services in background"
    echo "  $0 -r             # Rebuild and start services"
    echo "  $0 stop           # Stop all services"
    echo "  $0 status         # Show service status"
    echo "  $0 logs           # Show service logs"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--detach)
            DETACHED=true
            shift
            ;;
        -r|--rebuild)
            REBUILD=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        start)
            # Default action
            shift
            ;;
        stop)
            stop_services
            exit 0
            ;;
        restart)
            stop_services
            sleep 2
            main
            exit 0
            ;;
        status)
            show_status
            exit 0
            ;;
        logs)
            show_logs
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Run main function
main