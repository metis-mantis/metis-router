# Metis Backend - FastAPI AI Agent

The Metis backend is a FastAPI-based AI agent service that provides intelligent conversation capabilities with access to MCP (Model Context Protocol) servers through the Metis router. It serves as the bridge between the frontend web interface and the MCP ecosystem, handling AI agent sessions, streaming responses, and tool orchestration.

## Architecture Overview

```
Frontend (Next.js) ←→ Backend (FastAPI) ←→ MCP Router (Node.js)
Port: 3000           Port: 8000          Port: 9999
```

The backend component:
- Manages AI agent sessions with OpenAI Agents SDK
- Connects to the Metis MCP router for tool access
- Provides streaming responses via Server-Sent Events (SSE)
- Handles session lifecycle and resource cleanup
- Exposes REST API endpoints for frontend integration

## Docker Setup

### Prerequisites

- Docker and Docker Compose installed
- OpenAI API key
- Shared `.env` file configured in project root

### Quick Start with Docker Compose

The backend is designed to run as part of the complete Metis stack:

```bash
# Production deployment
docker-compose up backend

# Development with hot reloading
docker-compose -f docker-compose.dev.yml up backend
```

### Standalone Backend Container

For testing or development of just the backend component:

```bash
# Build the backend image
docker build -t metis-backend ./client/backend

# Run standalone container
docker run -p 8000:8000 \
  --env-file ../../.env \
  -e SERVER_URL=http://host.docker.internal:9999 \
  metis-backend
```

## Dockerfile Structure

The backend uses a multi-stage Dockerfile optimized for Python applications:

### Build Stages

1. **Dependencies Stage**: Installs Python dependencies with virtual environment isolation
2. **Runtime Stage**: Minimal production image with security optimizations
3. **Development Stage**: Extends runtime with development tools and hot reloading

### Key Features

- **Multi-stage build** for optimized image size
- **Virtual environment** for dependency isolation
- **Non-root user** for security
- **Health checks** for container monitoring
- **Development target** with hot reloading support

### Build Targets

```bash
# Production build (default)
docker build -t metis-backend ./client/backend

# Development build with hot reloading
docker build --target development -t metis-backend-dev ./client/backend

# Dependencies only (for caching)
docker build --target dependencies -t metis-backend-deps ./client/backend
```

## Environment Configuration

The backend reads configuration from the shared `.env` file in the project root. Key variables:

### Required Variables

```bash
# OpenAI API key for AI agent functionality
OPENAI_API_KEY=sk-your_openai_api_key_here

# Connection to MCP router
SERVER_URL=http://localhost:9999  # or http://server:9999 in Docker
```

### Optional Variables

```bash
# Backend configuration
BACKEND_PORT=8000
PYTHON_ENV=development
OPENAI_MODEL=gpt-4o

# Session management
SESSION_TIMEOUT_MINUTES=30
CLEANUP_INTERVAL_SECONDS=300

# CORS configuration
CORS_ORIGINS=http://localhost:3000
```

## API Endpoints

### Session Management

- `POST /connect` - Initialize new AI agent session
- `DELETE /sessions/{session_id}` - Cleanup session resources
- `GET /sessions/{session_id}/status` - Get session metadata

### Conversation

- `POST /sessions/{session_id}/message` - Send message to agent
- `GET /sessions/{session_id}/stream` - SSE stream for agent responses

### Tools and Monitoring

- `GET /sessions/{session_id}/tools` - List available MCP tools
- `GET /health` - Health check endpoint

### Example Usage

```bash
# Initialize session
curl -X POST http://localhost:8000/connect \
  -H "Content-Type: application/json" \
  -d '{"chat_history": []}'

# Send message
curl -X POST http://localhost:8000/sessions/{session_id}/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, what tools do you have access to?"}'

# Stream response (SSE)
curl -N http://localhost:8000/sessions/{session_id}/stream
```

## Development Workflow

### Local Development with Docker

1. **Start with hot reloading**:
   ```bash
   docker-compose -f docker-compose.dev.yml up backend
   ```

2. **Code changes** are automatically reflected due to volume mounting
3. **Debug with Python debugger** on port 5678
4. **View logs** in real-time

### Development Features

- **Hot reloading** with uvicorn --reload
- **Source code mounting** for instant updates
- **Python debugging** support (debugpy on port 5678)
- **Enhanced logging** with debug information
- **Development dependencies** (pytest, etc.)

### Testing

```bash
# Run tests in development container
docker-compose -f docker-compose.dev.yml exec backend python -m pytest

# Run specific test file
docker-compose -f docker-compose.dev.yml exec backend python -m pytest test_app.py

# Run with coverage
docker-compose -f docker-compose.dev.yml exec backend python -m pytest --cov=app
```

## Health Checks

The backend includes comprehensive health monitoring:

### Container Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
```

### Health Endpoint Response

```json
{
  "status": "healthy",
  "active_sessions": 2,
  "active_sse_connections": 1
}
```

### Monitoring

- **Active sessions**: Number of AI agent sessions
- **SSE connections**: Real-time streaming connections
- **Resource usage**: Memory and CPU metrics
- **MCP connectivity**: Connection status to router

## Service Connectivity

### Dependencies

The backend requires the MCP router to be running and healthy:

```yaml
depends_on:
  server:
    condition: service_healthy
```

### Network Communication

- **Internal**: Communicates with MCP router via Docker network
- **External**: Exposes port 8000 for frontend connections
- **Service discovery**: Uses container names for internal routing

### Connection Flow

1. Frontend sends request to backend (port 8000)
2. Backend initializes MCP connection to router (port 9999)
3. Backend streams AI responses back to frontend via SSE
4. MCP tools are executed through router connection

## Troubleshooting

### Common Issues

**Backend won't start**:
- Check OPENAI_API_KEY is set in .env file
- Verify MCP router is running and healthy
- Check port 8000 is not in use

**Connection refused to MCP router**:
- Ensure SERVER_URL points to correct router address
- In Docker: use `http://server:9999`
- In local dev: use `http://localhost:9999`

**SSE stream not working**:
- Check CORS configuration allows frontend origin
- Verify session was created successfully
- Check browser developer tools for connection errors

**Session cleanup issues**:
- Sessions auto-cleanup after 30 minutes
- Manual cleanup via DELETE /sessions/{session_id}
- Check logs for cleanup task errors

### Debug Commands

```bash
# Check container logs
docker-compose logs backend

# Follow logs in real-time
docker-compose logs -f backend

# Execute commands in running container
docker-compose exec backend bash

# Check health status
curl http://localhost:8000/health

# List active sessions
docker-compose exec backend python -c "
import json
from app import agent_sessions
print(json.dumps(list(agent_sessions.keys()), indent=2))
"
```

### Performance Tuning

**Memory optimization**:
- Adjust SESSION_TIMEOUT_MINUTES for faster cleanup
- Monitor active_sessions in health endpoint
- Use single worker in production for session consistency

**Response speed**:
- Ensure MCP router has required servers cached
- Use faster OpenAI models for development
- Monitor network latency between services

## Security Considerations

### Container Security

- **Non-root user**: Runs as `appuser` for security
- **Minimal base image**: Python 3.11 slim reduces attack surface
- **Virtual environment**: Isolated Python dependencies
- **Health checks**: Automatic restart on failures

### API Security

- **CORS configuration**: Restricts frontend origins
- **Session isolation**: Each session has unique ID and resources
- **Environment variables**: Sensitive data via .env file
- **No credential storage**: API keys handled via environment

### Production Recommendations

- Use secrets management for OPENAI_API_KEY
- Configure proper CORS_ORIGINS for production domains
- Enable rate limiting and request validation
- Monitor and log security events
- Regular security updates for base images

## Production Deployment

### Build Optimization

```bash
# Multi-stage production build
docker build --target runtime -t metis-backend:latest ./client/backend

# Build with specific Python version
docker build --build-arg PYTHON_VERSION=3.11 -t metis-backend ./client/backend
```

### Production Configuration

```bash
# Production environment variables
PYTHON_ENV=production
LOG_LEVEL=warn
LOG_FORMAT=json
CORS_ORIGINS=https://your-domain.com
```

### Scaling Considerations

- **Single worker**: Required for session consistency
- **Horizontal scaling**: Use load balancer with session affinity
- **Resource limits**: Set memory/CPU limits in docker-compose
- **Health monitoring**: Integrate with monitoring systems

## Contributing

When modifying the backend:

1. **Test locally** with development container
2. **Update health checks** if adding new dependencies
3. **Document API changes** in this README
4. **Test Docker builds** for both development and production
5. **Verify integration** with frontend and MCP router

## Related Documentation

- [Main Project README](../../README.md) - Complete setup instructions
- [MCP Router Documentation](../../server/README.md) - Router configuration
- [Frontend Documentation](../frontend/README.md) - Frontend integration
- [Docker Compose Guide](../../docker-compose.yml) - Full stack deployment