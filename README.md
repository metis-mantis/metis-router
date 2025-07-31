# Metis - Intelligent MCP Router & Web Based MCP Client

Metis is an advanced AI agent platform with an intelligent MCP (Model Context Protocol) router that dynamically manages up to 1,000+ MCP servers. The router uses an LRU cache system to maintain only the most relevant servers active at any time, preventing context overwhelm while providing access to a vast ecosystem of tools and services. We wanted to create this so you can add additional features while not having to deal with context overload from having over 40 tools enabled! We also provide a modular web based MCP client that anyone can modify! Our goal for this is to help others build cool applications using MCPs.

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │  MCP Router     │
│   (Next.js)     │◄──►│   (FastAPI)     │◄──►│   (Node.js)     │
│   Port: 3000    │    │   Port: 8000    │    │   Port: 9999    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       ▼
   User Interface         AI Agent Logic        Intelligent Router
   - Chat Interface       - OpenAI Agents       - 1000+ MCP Servers
   - Real-time UI         - Session Management  - LRU Cache System
                         - Streaming           - Dynamic Loading
                                              - Auto Server Selection
```
## 🖥️ Demo
![Demo](demo.gif)

## 🚀 Quick Start

**Choose Your Setup Method:**
- **Shell Scripts** (recommended for development): Follow steps below
- **Docker** (recommended for production): Jump to [Docker Setup](#-docker-setup-alternative-to-shell-scripts) section

### Step 1: Configure Your MCP Servers (Most Important!)

Add the MCP servers you want to `server/mcp-registry.json`. You can add up to **1,000+ servers**:

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.notion.com/sse"]
    },
    "linear": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.linear.app/sse"]
    },
    "hyperbrowser": {
      "command": "npx",
      "args": [
        "-y",
        "hyperbrowser-mcp"
      ],
      "env": {
        "HYPERBROWSER_API_KEY": "API_KEY_HERE"
      }
    }
}
```

### Step 2: Configure Router Cache Size

Edit `server/src/add-new-mcp.ts` and modify `MAX_ACTIVE_SERVERS` to set how many servers stay active simultaneously:

```typescript
// Only this many servers will be active at once (LRU cache)
const MAX_ACTIVE_SERVERS = 3; // Adjust based on your needs
```
**NOTE:** All active MCP servers are in `server/config.json`, you can manually remove/add servers to the active queue of MCP servers here

### Step 3: Set Up Environment Variables

**Single shared .env file** (project root):
```bash
# Copy the template and configure
cp .env.example .env

# Edit .env with your configuration
OPENAI_API_KEY=your_openai_api_key_here
MAX_ACTIVE_SERVERS=3
NODE_ENV=development
```

**Note:** The Docker setup uses a single shared `.env` file in the project root instead of separate `.env` files in each component directory. This simplifies configuration management and ensures consistency across all services.

### Step 4: Authentication & Indexing

```bash
# Build all services and authenticate into remote auth servers
./setup.sh
```

**🚨 CRITICAL**: All *authentication* happens during indexing. Any time you:
- Add new servers to `mcp-registry.json`
- Want to re-authenticate existing servers
- Change server configurations

You **MUST** rerun the setup script:

```bash
./setup.sh
```

This will:
- Authenticate with all configured servers
- Store credentials in `~/.mcp-auth`
- Index and embed all servers for AI-powered selection
- Generate the router configuration

### Step 5: Start the Application

```bash
# Start all services in background
./start.sh

# OR start in separate terminals (recommended for development)
./start.sh -s
```

### Step 6: Use the AI Agent

Open [http://localhost:3000](http://localhost:3000) and start chatting!

- **Automatic Server Selection**: The AI automatically selects the best MCP server/tools for your query
- **Manual Server Specification**: You can also specify which server to use
- **Dynamic Loading**: The router loads/unloads servers as needed using LRU cache
- **Real-time Tool Discovery**: Available tools update dynamically

## 🧠 How the Intelligent Router Works

### **LRU Cache System**
- **Registry**: Up to 1,000+ servers in `mcp-registry.json`
- **Active Cache**: Only `MAX_ACTIVE_SERVERS` are loaded simultaneously 
- **Dynamic Loading**: Servers are loaded/unloaded based on usage (Least Recently Used)
- **Current State**: `config.json` shows currently active servers in the cache

### **AI-Powered Server Selection**
1. User asks a question
2. AI analyzes the query using embeddings
3. Router selects the best MCP server(s) and tools
4. If server isn't in cache, it's loaded (LRU eviction if cache full)
5. Tools are executed and results returned

### **Authentication Management**
- **Storage**: Credentials stored in `~/.mcp-auth`
- **Timing**: Authentication happens during indexing (`./setup.sh`)
- **Re-auth**: Run `./setup.sh` to re-authenticate or add new servers
- **Cleanup**: Remove credentials with `rm -rf ~/.mcp-auth`

## 🔧 Components

### 1. **Intelligent MCP Router** (`/server`)
- **Purpose**: Manages 1000+ MCP servers with intelligent caching and AI-powered selection
- **Tech Stack**: Node.js, TypeScript, OpenAI API
- **Key Features**:
  - LRU cache system with configurable `MAX_ACTIVE_SERVERS`
  - AI-powered server selection using semantic embeddings
  - Dynamic server loading/unloading
  - Centralized authentication management
  - Real-time server status tracking

### 2. **AI Agent Backend** (`/client/backend`)
- **Purpose**: AI agent orchestration and API endpoints
- **Tech Stack**: FastAPI, Python, OpenAI Agents SDK
- **Key Features**:
  - Session management with streaming responses
  - Integration with intelligent MCP router
  - Tool execution and response handling
  - Real-time communication via SSE

### 3. **Interactive Frontend** (`/client/frontend`)
- **Purpose**: User interface for the AI agent playground
- **Tech Stack**: Next.js, React, TypeScript
- **Key Features**:
  - Real-time chat interface with tool visualization
  - Server selection transparency
  - Streaming response display
  - Modern, responsive design
 
### 4. Web Based MCP Client
- **Auto Refresh Tools**
- ****Modular, modify how you see fit**

## 🛠️ Advanced Configuration

### **Router Cache Configuration**

Edit `server/src/add-new-mcp.ts`:
```typescript
const MAX_ACTIVE_SERVERS = 5; // Increase for more concurrent servers, but there is more context overload
```

### **Environment Variables**

**Shared configuration in root `.env` file** (used by all services):
```bash
# Required
OPENAI_API_KEY=your_openai_api_key_here

# Optional (with defaults)
MAX_ACTIVE_SERVERS=3
NODE_ENV=development
SERVER_PORT=9999
BACKEND_PORT=8000
FRONTEND_PORT=3000
```

**Docker-specific variables:**
```bash
# Service URLs for container networking
SERVER_URL=http://server:9999
NEXT_PUBLIC_API_URL=http://localhost:8000

# Docker network and container names
DOCKER_NETWORK=metis-network
```

### **Prerequisites**
- **Node.js** 18+ 
- **Python** 3.8+
- **OpenAI API Key** (required for server selection and embeddings)

## 🐳 Docker Setup (Alternative to Shell Scripts)

Docker provides a containerized environment that ensures consistent deployment across different systems. This section provides comprehensive Docker setup instructions as an alternative to the shell scripts.

### Prerequisites

- **Docker** 20.10+ and **Docker Compose** 2.0+
- **OpenAI API Key** (required for server selection and embeddings)

### Step 1: Environment Configuration

Create a `.env` file in the project root using the provided template:

```bash
# Copy the environment template
cp .env.example .env

# Edit the .env file with your configuration
# At minimum, set your OpenAI API key:
OPENAI_API_KEY=sk-your_openai_api_key_here
```

**Key Environment Variables:**

```bash
# Required Configuration
OPENAI_API_KEY=sk-your_openai_api_key_here    # Required for AI-powered server selection
MAX_ACTIVE_SERVERS=3                          # Number of MCP servers to keep active
NODE_ENV=development                          # or 'production'

# Service Ports (default values)
SERVER_PORT=9999                              # MCP Router port
BACKEND_PORT=8000                             # FastAPI backend port  
FRONTEND_PORT=3000                            # Next.js frontend port

# Service URLs (for Docker networking)
SERVER_URL=http://server:9999                 # Backend -> Server connection
NEXT_PUBLIC_API_URL=http://localhost:8000     # Frontend -> Backend connection
```

### Step 2: Configure MCP Servers

Add your desired MCP servers to `server/mcp-registry.json`:

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.notion.com/sse"]
    },
    "github": {
      "command": "npx", 
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

### Step 3: Production Deployment

For production deployment with optimized builds:

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Production Features:**
- Multi-stage optimized Docker builds
- Automatic service restart policies
- Health checks and monitoring
- Persistent data volumes
- Production-ready configurations

### Step 4: Development Workflow

For development with hot reloading and debugging:

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# View logs for specific service
docker-compose -f docker-compose.dev.yml logs -f server
docker-compose -f docker-compose.dev.yml logs -f backend
docker-compose -f docker-compose.dev.yml logs -f frontend

# Stop development environment
docker-compose -f docker-compose.dev.yml down
```

**Development Features:**
- Source code hot reloading for all services
- Debug ports exposed (Node.js: 9229, Python: 5678)
- Development-optimized builds
- Enhanced logging and debugging tools

### Step 5: Authentication & Server Indexing

After starting the containers, you need to authenticate and index your MCP servers:

```bash
# Option 1: Run authentication inside the server container
docker-compose exec server npm run setup-registry

# Option 2: Use the setup script (if available)
./setup.sh
```

This will:
- Authenticate with all configured MCP servers
- Store credentials in the `~/.mcp-auth` volume
- Generate AI embeddings for intelligent server selection
- Create the active server configuration

### Volume Management

Docker uses several volume types for data persistence:

**Bind Mounts (Direct file access):**
```yaml
volumes:
  - ./server/mcp-registry.json:/app/mcp-registry.json    # Server registry
  - ./server/config.json:/app/config.json                # Active server cache
  - ./server/generated:/app/generated                    # AI embeddings
  - ~/.mcp-auth:/root/.mcp-auth                          # Authentication data
```

**Named Volumes (Docker-managed):**
```yaml
volumes:
  - metis-server-node-modules:/app/node_modules          # Node.js dependencies
  - metis-frontend-node-modules:/app/node_modules        # Frontend dependencies
```

### Service Architecture

The Docker setup creates a multi-container architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Host                              │
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │   Frontend      │    │   Backend       │    │  MCP Server     │ │
│  │   (Next.js)     │◄──►│   (FastAPI)     │◄──►│   (Node.js)     │ │
│  │   Port: 3000    │    │   Port: 8000    │    │   Port: 9999    │ │
│  │   nginx:alpine  │    │   python:3.11   │    │   node:18-alpine│ │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│           │                       │                       │        │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Docker Network: metis-network               │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Health Checks & Monitoring

All services include health checks for monitoring:

```bash
# Check service health
docker-compose ps

# View health check logs
docker inspect metis-server --format='{{.State.Health.Status}}'
docker inspect metis-backend --format='{{.State.Health.Status}}'
docker inspect metis-frontend --format='{{.State.Health.Status}}'
```

**Health Check Endpoints:**
- Server: `http://localhost:9999/health`
- Backend: `http://localhost:8000/health`
- Frontend: `http://localhost:3000/api/health`

### Docker Commands Reference

**Basic Operations:**
```bash
# Build images
docker-compose build

# Start services (detached)
docker-compose up -d

# View logs
docker-compose logs -f [service_name]

# Stop services
docker-compose down

# Remove volumes (caution: deletes data)
docker-compose down -v
```

**Development Operations:**
```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# Rebuild specific service
docker-compose -f docker-compose.dev.yml build server

# Execute commands in running container
docker-compose exec server npm run build
docker-compose exec backend python -c "import app; print('Backend loaded')"
```

**Maintenance Operations:**
```bash
# View container resource usage
docker stats

# Clean up unused images and containers
docker system prune

# View volume usage
docker volume ls
docker volume inspect metis-server-node-modules
```

### Troubleshooting Docker Issues

**Common Issues and Solutions:**

1. **Port Conflicts**
   ```bash
   # Check what's using the ports
   lsof -i :3000 -i :8000 -i :9999
   
   # Change ports in .env file
   FRONTEND_PORT=3001
   BACKEND_PORT=8001
   SERVER_PORT=9998
   ```

2. **Permission Issues with Volumes**
   ```bash
   # Fix ownership of bind-mounted directories
   sudo chown -R $USER:$USER ./server/generated
   sudo chown -R $USER:$USER ~/.mcp-auth
   ```

3. **Container Won't Start**
   ```bash
   # Check container logs
   docker-compose logs server
   
   # Check if environment variables are loaded
   docker-compose exec server env | grep OPENAI_API_KEY
   ```

4. **Authentication Failures**
   ```bash
   # Clear authentication data and re-authenticate
   docker-compose down
   rm -rf ~/.mcp-auth
   docker-compose up -d
   docker-compose exec server npm run setup-registry
   ```

5. **Build Failures**
   ```bash
   # Clean build cache and rebuild
   docker-compose build --no-cache
   
   # Remove all containers and volumes
   docker-compose down -v
   docker system prune -a
   ```

6. **Service Communication Issues**
   ```bash
   # Test inter-service connectivity
   docker-compose exec frontend curl http://backend:8000/health
   docker-compose exec backend curl http://server:9999/health
   
   # Check network configuration
   docker network inspect metis-network
   ```

7. **Hot Reloading Not Working (Development)**
   ```bash
   # Ensure proper volume mounting
   docker-compose -f docker-compose.dev.yml down
   docker-compose -f docker-compose.dev.yml up -d
   
   # Check if source code is properly mounted
   docker-compose exec server ls -la /app
   ```

8. **Memory/Performance Issues**
   ```bash
   # Monitor resource usage
   docker stats
   
   # Reduce MAX_ACTIVE_SERVERS in .env
   MAX_ACTIVE_SERVERS=2
   
   # Restart with new configuration
   docker-compose restart
   ```

**Log Analysis:**
```bash
# View all service logs
docker-compose logs

# Follow logs for specific service
docker-compose logs -f server

# View last 100 lines
docker-compose logs --tail=100 backend

# Filter logs by timestamp
docker-compose logs --since="2024-01-01T00:00:00Z"
```

**Environment Debugging:**
```bash
# Check environment variables in container
docker-compose exec server printenv | grep -E "(OPENAI|NODE_ENV|SERVER_PORT)"
docker-compose exec backend printenv | grep -E "(OPENAI|PYTHON_ENV|BACKEND_PORT)"

# Verify .env file is loaded
docker-compose config
```

## 🛠️ Development

### Manual Development Setup

If you prefer to run services individually without Docker:

```bash
# Terminal 1: MCP Server
cd server
npm run dev:http

# Terminal 2: Backend
cd client/backend  
uvicorn app:app --host localhost --port 8000 --log-level debug

# Terminal 3: Frontend
cd client/frontend
npm start
```

### Key Development Commands

**Server**:
```bash
cd server
npm run build          # Build TypeScript
npm run setup-registry  # Index servers + generate AI summaries (combined)
npm run dev:http        # Start development server

# Individual commands (if needed):
npm run index-servers   # Index MCP servers only
npm run generate-ai-summaries  # Generate AI summaries only
```

**Backend**:
```bash
cd client/backend
uvicorn app:app --reload  # Start with hot reload
```

**Frontend**:
```bash
cd client/frontend
npm run build          # Production build
npm start              # Start production server
```

## 📁 Project Structure

```
metis-router/
├── server/                    # 🧠 Intelligent MCP Router
│   ├── src/
│   │   ├── add-new-mcp.ts    # 🔧 Cache config (MAX_ACTIVE_SERVERS)
│   │   ├── mcp-proxy.ts      # 🌐 Router proxy server
│   │   ├── search-mcps.ts    # 🔍 AI-powered server selection
│   │   └── setup-registry.ts # 📦 Combined indexing & embedding
│   ├── mcp-registry.json     # 📋 ALL servers (up to 1000+)
│   ├── config.json          # ⚡ Currently active servers (cache)
│   ├── Dockerfile           # 🐳 Server container configuration
│   ├── .dockerignore        # 🚫 Docker build exclusions
│   └── generated/           # 🤖 AI embeddings & summaries
│
├── client/
│   ├── backend/             # 🤖 AI Agent Backend
│   │   ├── app.py          # 🎯 Main FastAPI application
│   │   ├── requirements.txt # 🐍 Python dependencies
│   │   ├── Dockerfile      # 🐳 Backend container configuration
│   │   └── .dockerignore   # 🚫 Docker build exclusions
│   │
│   └── frontend/           # 🖥️ Chat Interface
│       ├── app/            # ⚛️ Next.js application
│       ├── components/     # 🎨 UI components
│       ├── Dockerfile      # 🐳 Frontend container configuration
│       └── .dockerignore   # 🚫 Docker build exclusions
│
├── ~/.mcp-auth/            # 🔐 Authentication credentials (volume)
├── .env                    # 🔑 Shared environment configuration
├── .env.example           # 📝 Environment template
├── docker-compose.yml     # 🐳 Production container orchestration
├── docker-compose.dev.yml # 🛠️ Development container orchestration
├── setup.sh               # 🚀 Setup + Auth + Indexing
├── start.sh               # ▶️  Start all services
└── README.md              # 📖 This file

Key Files:
🔧 MAX_ACTIVE_SERVERS: server/src/add-new-mcp.ts or .env
📋 Server Registry: server/mcp-registry.json  
⚡ Active Cache: server/config.json
🔐 Credentials: ~/.mcp-auth/
🐳 Docker Config: docker-compose.yml, docker-compose.dev.yml
🔑 Environment: .env (shared by all services)
```

## 🚀 Key Features

### **🧠 Intelligent Router**
- **1000+ Server Support**: Manage massive MCP server ecosystems
- **LRU Caching**: Smart memory management with configurable cache size
- **AI-Powered Selection**: Automatic server/tool selection using embeddings
- **Dynamic Loading**: Servers load/unload based on demand
- **Authentication Management**: Centralized credential storage and handling

### **🤖 Advanced AI Agent**
- **Automatic Tool Discovery**: AI selects optimal servers and tools for any query
- **Real-time Streaming**: Live response generation with tool call visualization
- **Session Management**: Persistent conversations with context preservation
- **Flexible Interaction**: Use any server or let AI choose automatically

### **⚡ Performance & Reliability**
- **Context Optimization**: Never overwhelm the AI with too many servers
- **Graceful Fallbacks**: Robust error handling and recovery
- **Hot Reloading**: Add servers without system restart
- **Monitoring**: Real-time server status and performance tracking

## 🔄 Managing Your MCP Ecosystem

### **Adding New Servers**

1. **Add to Registry**: Edit `server/mcp-registry.json`
2. **Reindex & Authenticate**: Run `./setup.sh` (CRITICAL for auth!)
3. **Automatic Integration**: Router will discover and integrate new servers

### **Re-authentication**

```bash
# If you need to re-authenticate or add new credentials
./setup.sh

# To completely reset authentication
rm -rf ~/.mcp-auth
./setup.sh
```

### **Monitoring Active Servers**

Check `server/config.json` to see which servers are currently loaded in the cache.

## 🔧 Router Configuration Examples

### **Basic Server Configuration**

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/you/Documents"],
      "env": {}
    }
  }
}
```

### **Advanced Server Configuration**

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-token"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:pass@localhost:5432/db"],
      "env": {}
    },
    "custom-server": {
      "command": "python",
      "args": ["/path/to/your/custom/server.py"],
      "env": {
        "CUSTOM_API_KEY": "your_key",
        "CUSTOM_CONFIG": "value"
      }
    }
  }
}
```

## 🐛 Troubleshooting

### **Shell Script Setup Issues**

**Authentication Issues:**
```bash
# If servers fail to authenticate
rm -rf ~/.mcp-auth
./setup.sh

# Check what credentials are stored
ls -la ~/.mcp-auth/
```

**Router Cache Issues:**
```bash
# Check currently active servers
cat server/config.json

# Restart router to clear cache
cd server && npm run dev:http
```

**Common Issues:**
1. **Authentication Failures**: Run `./setup.sh` after adding new servers
2. **Server Selection Problems**: Ensure OpenAI API key is set in `.env` file
3. **Cache Overflow**: Reduce `MAX_ACTIVE_SERVERS` in `.env` or `server/src/add-new-mcp.ts`
4. **Port Conflicts**: Ensure ports 3000, 8000, and 9999 are available

### **Docker Setup Issues**

**Container Issues:**
```bash
# Check container status
docker-compose ps

# View container logs
docker-compose logs -f [service_name]

# Restart specific service
docker-compose restart [service_name]
```

**Environment Issues:**
```bash
# Verify environment variables are loaded
docker-compose exec server printenv | grep OPENAI_API_KEY

# Check shared .env file configuration
docker-compose config
```

**Volume and Data Issues:**
```bash
# Check volume mounts
docker-compose exec server ls -la /app
docker inspect metis-server | grep -A 10 "Mounts"

# Fix permission issues
sudo chown -R $USER:$USER ./server/generated
sudo chown -R $USER:$USER ~/.mcp-auth
```

**Network Issues:**
```bash
# Test inter-service connectivity
docker-compose exec frontend curl http://backend:8000/health
docker-compose exec backend curl http://server:9999/health

# Check Docker network
docker network inspect metis-network
```

### **General Debugging**

**Logs & Monitoring:**
- **Shell Scripts**: Check individual terminal outputs
- **Docker**: Use `docker-compose logs -f` for real-time logs
- **Authentication**: Watch for auth failures during setup
- **AI Selection**: Backend logs show which servers/tools are selected
- **Cache Status**: Monitor `config.json` for active server changes

**Performance Issues:**
- **Memory Usage**: Monitor with `docker stats` (Docker) or system monitor
- **Cache Size**: Reduce `MAX_ACTIVE_SERVERS` in `.env` file
- **Build Performance**: Use `docker-compose build --parallel` for faster builds

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

For more information or support, please refer to the individual component README files or open an issue. 
