#!/bin/bash

# Docker Development Script for Metis - Intelligent MCP Router & Web Client
# This script provides development workflow with containers including hot reloading

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEV_COMPOSE_FILE="docker-compose.dev.yml"
PROD_COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
DETACHED=false
REBUILD=false
SERVICE=""

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
    
    if [ ! -f "${DEV_COMPOSE_FILE}" ]; then
        log_error "Development Docker Compose file '${DEV_COMPOSE_FILE}' not found"
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

# Setup development environment
setup_dev_environment() {
    log_info "Setting up development environment..."
    
    # Ensure NODE_ENV is set to development
    if ! grep -q "NODE_ENV=development" "${ENV_FILE}"; then
        if grep -q "NODE_ENV=" "${ENV_FILE}"; then
            sed -i.bak 's/NODE_ENV=.*/NODE_ENV=development/' "${ENV_FILE}"
        else
            echo "NODE_ENV=development" >> "${ENV_FILE}"
        fi
        log_info "Set NODE_ENV=development in ${ENV_FILE}"
    fi
    
    # Ensure PYTHON_ENV is set to development
    if ! grep -q "PYTHON_ENV=development" "${ENV_FILE}"; then
        if grep -q "PYTHON_ENV=" "${ENV_FILE}"; then
            sed -i.bak 's/PYTHON_ENV=.*/PYTHON_ENV=development/' "${ENV_FILE}"
        else
            echo "PYTHON_ENV=development" >> "${ENV_FILE}"
        fi
        log_info "Set PYTHON_ENV=development in ${ENV_FILE}"
    fi
    
    log_success "Development environment configured"
}

# Start development services
start_dev_services() {
    log_info "Starting Metis development services..."
    
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null; then
        compose_cmd="docker compose"
    fi
    
    local args="-f ${DEV_COMPOSE_FILE}"
    if [ "$DETACHED" = true ]; then
        args="$args -d"
    fi
    
    if [ -n "$SERVICE" ]; then
        args="$args $SERVICE"
        log_info "Starting only service: $SERVICE"
    fi
    
    if [ "$REBUILD" = true ]; then
        log_info "Rebuilding development images..."
        $compose_cmd -f ${DEV_COMPOSE_FILE} build --no-cache $SERVICE
    fi
    
    $compose_cmd $args up
    
    if [ "$DETACHED" = true ]; then
        log_success "Development services started in detached mode"
        log_info "Services running with hot reloading enabled:"
        log_info "  Frontend: http://localhost:3000 (Next.js dev server)"
        log_info "  Backend:  http://localhost:8000 (FastAPI with reload)"
        log_info "  Server:   http://localhost:9999 (Node.js with tsx)"
        log_info ""
        log_info "Development features:"
        log_info "  • Hot reloading for all services"
        log_info "  • Source code mounted as volumes"
        log_info "  • Development dependencies included"
        log_info "  • Debug logging enabled"
        log_info ""
        log_info "To view logs: docker-compose -f ${DEV_COMPOSE_FILE} logs -f"
        log_info "To stop services: docker-compose -f ${DEV_COMPOSE_FILE} down"
    fi
}

# Show development logs
show_dev_logs() {
    log_info "Showing development service logs..."
    
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null; then
        compose_cmd="docker compose"
    fi
    
    local args="-f ${DEV_COMPOSE_FILE}"
    if [ -n "$SERVICE" ]; then
        args="$args $SERVICE"
    fi
    
    $compose_cmd $args logs -f
}

# Stop development services
stop_dev_services() {
    log_info "Stopping development services..."
    
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null; then
        compose_cmd="docker compose"
    fi
    
    $compose_cmd -f ${DEV_COMPOSE_FILE} down
    log_success "Development services stopped"
}

# Show development status
show_dev_status() {
    log_info "Development service status:"
    
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null; then
        compose_cmd="docker compose"
    fi
    
    $compose_cmd -f ${DEV_COMPOSE_FILE} ps
    
    echo ""
    log_info "Development environment info:"
    echo "  • Hot reloading: Enabled"
    echo "  • Source mounting: Enabled"
    echo "  • Debug mode: Enabled"
    echo "  • Environment: Development"
}

# Clean development environment
clean_dev_environment() {
    log_info "Cleaning development environment..."
    
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null; then
        compose_cmd="docker compose"
    fi
    
    # Stop and remove containers
    $compose_cmd -f ${DEV_COMPOSE_FILE} down --volumes --remove-orphans
    
    # Remove development images
    log_info "Removing development images..."
    docker images | grep -E "metis.*dev" | awk '{print $3}' | xargs -r docker rmi -f
    
    # Clean up dangling images and volumes
    docker system prune -f
    
    log_success "Development environment cleaned"
}

# Shell into service
shell_into_service() {
    local service=${1:-"server"}
    
    log_info "Opening shell in $service container..."
    
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null; then
        compose_cmd="docker compose"
    fi
    
    $compose_cmd -f ${DEV_COMPOSE_FILE} exec $service /bin/sh
}

# Main function
main() {
    check_prerequisites
    setup_dev_environment
    start_dev_services
}

# Help function
show_help() {
    echo "Usage: $0 [OPTIONS] [COMMAND] [SERVICE]"
    echo ""
    echo "Development workflow for Metis containerized application"
    echo ""
    echo "Commands:"
    echo "  start     Start development services (default)"
    echo "  stop      Stop development services"
    echo "  restart   Restart development services"
    echo "  status    Show development service status"
    echo "  logs      Show development service logs"
    echo "  clean     Clean development environment"
    echo "  shell     Open shell in service container"
    echo ""
    echo "Services:"
    echo "  server    MCP Router (Node.js)"
    echo "  backend   FastAPI Backend (Python)"
    echo "  frontend  Next.js Frontend (Node.js)"
    echo ""
    echo "Options:"
    echo "  -d, --detach      Run in detached mode"
    echo "  -r, --rebuild     Rebuild images before starting"
    echo "  -s, --service     Target specific service"
    echo "  -h, --help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                    # Start all dev services"
    echo "  $0 -d                 # Start in background"
    echo "  $0 -s server          # Start only server service"
    echo "  $0 logs frontend      # Show frontend logs"
    echo "  $0 shell backend      # Open shell in backend"
    echo "  $0 clean              # Clean dev environment"
    echo ""
    echo "Development Features:"
    echo "  • Hot reloading for all services"
    echo "  • Source code mounted as volumes"
    echo "  • Development dependencies included"
    echo "  • Debug logging enabled"
    echo "  • Fast rebuild with layer caching"
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
        -s|--service)
            SERVICE="$2"
            shift 2
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
            stop_dev_services
            exit 0
            ;;
        restart)
            stop_dev_services
            sleep 2
            main
            exit 0
            ;;
        status)
            show_dev_status
            exit 0
            ;;
        logs)
            SERVICE="$2"
            show_dev_logs
            exit 0
            ;;
        clean)
            clean_dev_environment
            exit 0
            ;;
        shell)
            SERVICE="$2"
            shell_into_service "$SERVICE"
            exit 0
            ;;
        server|backend|frontend)
            SERVICE="$1"
            shift
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