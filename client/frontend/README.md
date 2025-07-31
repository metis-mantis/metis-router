# Metis Frontend - Next.js Web Interface

The Metis frontend is a modern Next.js web application that provides an intuitive chat interface for interacting with AI agents and MCP (Model Context Protocol) servers. Built with React 18, TypeScript, and Tailwind CSS, it offers real-time streaming conversations, tool visualization, and a responsive user experience.

## Architecture Overview

```
Frontend (Next.js) ←→ Backend (FastAPI) ←→ MCP Router (Node.js)
Port: 3000           Port: 8000          Port: 9999
```

The frontend component:

- Provides a modern chat interface with real-time streaming
- Manages conversation state with Zustand
- Visualizes MCP tool calls and responses
- Handles authentication and session management
- Offers responsive design for desktop and mobile

## Docker Setup

### Prerequisites

- Docker and Docker Compose installed
- Shared `.env` file configured in project root
- Backend and MCP router services running

### Quick Start with Docker Compose

The frontend is designed to run as part of the complete Metis stack:

```bash
# Production deployment
docker-compose up frontend

# Development with hot reloading
docker-compose -f docker-compose.dev.yml up frontend
```

### Standalone Frontend Container

For testing or development of just the frontend component:

```bash
# Build the frontend image
docker build -t metis-frontend ./client/frontend

# Run standalone container (production)
docker run -p 3000:3000 \
  --env-file ../../.env \
  -e NEXT_PUBLIC_API_URL=http://localhost:8000 \
  metis-frontend

# Run standalone container (development)
docker run -p 3000:3000 \
  --env-file ../../.env \
  -e NEXT_PUBLIC_API_URL=http://localhost:8000 \
  -v $(pwd)/client/frontend:/app \
  -v /app/node_modules \
  --target development \
  metis-frontend
```

## Dockerfile Structure

The frontend uses a sophisticated multi-stage Dockerfile optimized for Next.js applications:

### Build Stages

1. **Dependencies Stage**: Installs all npm dependencies with caching optimization
2. **Development Stage**: Provides hot reloading and development tools
3. **Builder Stage**: Compiles and optimizes the Next.js application
4. **Production Stage**: Minimal runtime image with security optimizations

### Key Features

- **Multi-stage build** for optimized image size and build speed
- **Layer caching** for faster rebuilds during development
- **Non-root user** for enhanced security
- **Health checks** for container monitoring
- **Development target** with hot reloading support
- **Production optimization** with standalone output

### Build Targets

```bash
# Production build (default)
docker build -t metis-frontend ./client/frontend

# Development build with hot reloading
docker build --target development -t metis-frontend-dev ./client/frontend

# Dependencies only (for caching)
docker build --target deps -t metis-frontend-deps ./client/frontend

# Builder stage (for debugging builds)
docker build --target builder -t metis-frontend-builder ./client/frontend
```

## Production vs Development Configurations

### Production Configuration

**Optimizations:**
- Standalone output for minimal runtime dependencies
- Static asset optimization and compression
- Tree shaking and code splitting
- Non-root user execution for security
- Minimal Alpine Linux base image

**Build Process:**
```bash
# Production build creates optimized bundle
npm run build

# Generates standalone server.js for container
# Static assets are optimized and compressed
# Source maps are excluded for security
```

**Runtime:**
- Runs on Node.js server with standalone output
- Serves pre-built static assets
- Minimal memory footprint
- Fast startup time

### Development Configuration

**Features:**
- Hot module replacement (HMR) for instant updates
- Source maps for debugging
- Development error overlay
- Unoptimized builds for faster compilation
- Volume mounting for live code changes

**Build Process:**
```bash
# Development server with hot reloading
npm run dev

# Watches for file changes
# Provides detailed error messages
# Includes development tools
```

**Runtime:**
- Next.js development server
- Real-time file watching
- Enhanced debugging capabilities
- Development middleware enabled

## Environment Configuration

The frontend uses environment variables for runtime configuration:

### Build-time Variables (NEXT_PUBLIC_*)

```bash
# API connection (required)
NEXT_PUBLIC_API_URL=http://localhost:8000

# Optional configuration
NEXT_PUBLIC_APP_NAME=Metis
NEXT_PUBLIC_VERSION=1.0.0
NEXT_PUBLIC_ENVIRONMENT=production
```

### Runtime Variables

```bash
# Server configuration
PORT=3000
HOSTNAME=0.0.0.0
NODE_ENV=production

# Next.js configuration
NEXT_TELEMETRY_DISABLED=1
```

### Environment Variable Injection

**Development:**
```bash
# Variables are loaded from .env files
# Hot reloading applies environment changes
# Available in browser and server contexts
```

**Production:**
```bash
# Variables are baked into the build
# NEXT_PUBLIC_* variables are client-accessible
# Server-only variables remain secure
```

## Hot Reloading Setup

### Development Workflow with Docker

1. **Start development container:**
   ```bash
   docker-compose -f docker-compose.dev.yml up frontend
   ```

2. **Volume mounting configuration:**
   ```yaml
   volumes:
     - ./client/frontend:/app          # Source code
     - /app/node_modules              # Preserve node_modules
     - /app/.next                     # Preserve Next.js cache
   ```

3. **Hot reloading features:**
   - Instant component updates
   - State preservation during updates
   - CSS hot reloading
   - Error overlay for debugging

### Development Commands

```bash
# Start with hot reloading
npm run dev

# Build for production testing
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

### File Watching

The development setup watches for changes in:
- React components (`.tsx`, `.jsx`)
- TypeScript files (`.ts`)
- CSS and Tailwind classes
- Configuration files
- Public assets

## Standalone Frontend Testing

### Build and Test Locally

```bash
# Build the Docker image
docker build -t metis-frontend-test ./client/frontend

# Test production build
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://host.docker.internal:8000 \
  metis-frontend-test

# Test development build
docker run -p 3000:3000 \
  -v $(pwd)/client/frontend:/app \
  -v /app/node_modules \
  --target development \
  metis-frontend-test
```

### Testing Without Backend

```bash
# Run frontend with mock API
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://mockapi.example.com \
  -e NODE_ENV=development \
  metis-frontend-test
```

### Health Check Testing

```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "metis-frontend"
}
```

## API Integration

### Backend Connection

The frontend connects to the FastAPI backend for:

- **Session Management**: Creating and managing chat sessions
- **Message Streaming**: Real-time conversation updates via SSE
- **Tool Visualization**: Displaying MCP tool calls and results
- **Authentication**: Handling user sessions and permissions

### API Endpoints Used

```typescript
// Session management
POST /connect                          // Initialize session
DELETE /sessions/{session_id}          // Cleanup session

// Messaging
POST /sessions/{session_id}/message    // Send message
GET /sessions/{session_id}/stream      // SSE stream

// Tools and status
GET /sessions/{session_id}/tools       // Available tools
GET /health                           // Backend health
```

### Error Handling

```typescript
// Connection error handling
if (response.status === 503) {
  // Backend unavailable - show offline mode
}

// Stream error recovery
eventSource.onerror = () => {
  // Reconnect with exponential backoff
}
```

## Component Architecture

### Key Components

```
components/
├── ui/
│   ├── chat/
│   │   ├── MetisChat.tsx        # Main chat interface
│   │   ├── ChatArea.tsx         # Message display area
│   │   ├── ChatComposer.tsx     # Message input
│   │   ├── MessageBubble.tsx    # Individual messages
│   │   └── ToolList.tsx         # Tool visualization
│   └── [component].tsx          # Radix UI wrappers
```

### State Management

```typescript
// Zustand store for chat state
interface ChatStore {
  sessions: Session[]
  currentSession: string | null
  messages: Message[]
  isStreaming: boolean
  tools: Tool[]
}
```

### Styling System

- **Tailwind CSS**: Utility-first styling
- **Radix UI**: Accessible component primitives
- **CSS Variables**: Theme customization
- **Responsive Design**: Mobile-first approach

## Health Checks

The frontend includes comprehensive health monitoring:

### Container Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
```

### Health Endpoint

```typescript
// /app/api/health/route.ts
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'metis-frontend'
  });
}
```

### Monitoring Metrics

- **Response time**: Health endpoint latency
- **Build status**: Successful compilation
- **Asset loading**: Static resource availability
- **API connectivity**: Backend connection status

## Service Dependencies

### Required Services

The frontend depends on:

```yaml
depends_on:
  backend:
    condition: service_healthy
```

### Network Communication

- **External**: Exposes port 3000 for user access
- **Internal**: Connects to backend via Docker network
- **Service discovery**: Uses container names for internal routing

### Connection Flow

1. User accesses frontend (port 3000)
2. Frontend initializes session with backend (port 8000)
3. Real-time updates via Server-Sent Events
4. Tool calls visualized in real-time

## Troubleshooting

### Common Issues

**Frontend won't start:**

- Check NEXT_PUBLIC_API_URL is set correctly
- Verify port 3000 is not in use
- Check Docker container logs for build errors
- Ensure Node.js version compatibility

**Hot reloading not working:**

- Verify volume mounts are configured correctly
- Check file permissions in mounted directories
- Restart development container
- Clear Next.js cache: `rm -rf .next`

**API connection failed:**

- Verify backend is running and healthy
- Check NEXT_PUBLIC_API_URL points to correct backend
- In Docker: use `http://backend:8000`
- In local dev: use `http://localhost:8000`

**Build failures:**

- Check TypeScript compilation errors
- Verify all dependencies are installed
- Clear node_modules and reinstall
- Check for conflicting package versions

### Debug Commands

```bash
# Check container logs
docker-compose logs frontend

# Follow logs in real-time
docker-compose logs -f frontend

# Execute commands in running container
docker-compose exec frontend bash

# Check health status
curl http://localhost:3000/api/health

# Inspect Next.js build
docker-compose exec frontend npm run build

# Check environment variables
docker-compose exec frontend printenv | grep NEXT_PUBLIC
```

### Performance Optimization

**Build optimization:**

- Use multi-stage builds for smaller images
- Leverage Docker layer caching
- Optimize package.json for better caching
- Use .dockerignore to exclude unnecessary files

**Runtime optimization:**

- Enable Next.js standalone output
- Use production builds for deployment
- Implement proper caching headers
- Optimize bundle size with tree shaking

## Security Considerations

### Container Security

- **Non-root user**: Runs as `nextjs` user for security
- **Minimal base image**: Alpine Linux reduces attack surface
- **Read-only filesystem**: Where possible for additional security
- **Health checks**: Automatic restart on failures

### Application Security

- **Environment variables**: Sensitive data via build-time injection
- **CORS handling**: Backend manages cross-origin requests
- **XSS protection**: React's built-in XSS prevention
- **Content Security Policy**: Configured for production

### Production Recommendations

- Use HTTPS in production environments
- Configure proper Content Security Policy headers
- Enable security headers via Next.js configuration
- Regular security updates for dependencies
- Monitor and log security events

## Production Deployment

### Build Optimization

```bash
# Optimized production build
docker build --target production -t metis-frontend:latest ./client/frontend

# Build with specific Node.js version
docker build --build-arg NODE_VERSION=18 -t metis-frontend ./client/frontend

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t metis-frontend ./client/frontend
```

### Production Configuration

```bash
# Production environment variables
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
NEXT_PUBLIC_API_URL=https://api.your-domain.com
```

### Scaling Considerations

- **Static assets**: Serve via CDN for better performance
- **Horizontal scaling**: Multiple container instances behind load balancer
- **Resource limits**: Set memory/CPU limits in docker-compose
- **Caching**: Implement proper HTTP caching strategies

## Contributing

When modifying the frontend:

1. **Test locally** with development container
2. **Update health checks** if adding new dependencies
3. **Document component changes** in this README
4. **Test Docker builds** for both development and production
5. **Verify integration** with backend API
6. **Update TypeScript types** for new features

## Related Documentation

- [Main Project README](../../README.md) - Complete setup instructions
- [Backend Documentation](../backend/README.md) - API integration details
- [MCP Router Documentation](../../server/README.md) - Router configuration
- [Docker Compose Guide](../../docker-compose.yml) - Full stack deployment