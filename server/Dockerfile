# Multi-stage Dockerfile for MCP Server
# Stage 1: Dependencies - Install and cache dependencies
FROM node:18-alpine AS deps

# Set working directory
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files for dependency installation
COPY package*.json ./

# Install only production dependencies, skip prepare script
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Stage 2: Builder - Build the TypeScript application
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy source code first (needed for prepare script)
COPY src/ ./src/

# Install all dependencies (including devDependencies for build)
# The prepare script will run automatically and build the project
RUN npm ci && npm cache clean --force

# Stage 3: Development - Create development image with dev dependencies
FROM node:18-alpine AS development

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy package files and source code
COPY --chown=mcp:nodejs package*.json ./
COPY --chown=mcp:nodejs tsconfig.json ./
COPY --chown=mcp:nodejs src/ ./src/

# Install all dependencies (including devDependencies)
RUN npm ci && npm cache clean --force

# Create directories for persistent data with proper permissions
RUN mkdir -p /app/generated && \
    chown -R mcp:nodejs /app/generated

# Switch to non-root user
USER mcp

# Expose the server port and debug port
EXPOSE 9999 9229

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:9999/health || exit 1

# Set environment variables
ENV NODE_ENV=development
ENV PORT=9999

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command for development (can be overridden)
CMD ["npx", "nodemon", "--watch", "src/**", "--ext", "ts,json", "--ignore", "src/**/*.spec.ts", "--exec", "npx tsx src/http-streaming.ts"]

# Stage 4: Runtime - Create the final production image
FROM node:18-alpine AS runtime

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy production dependencies from deps stage
COPY --from=deps --chown=mcp:nodejs /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder --chown=mcp:nodejs /app/build ./build

# Copy package.json for runtime metadata
COPY --chown=mcp:nodejs package*.json ./

# Create directories for persistent data with proper permissions
RUN mkdir -p /app/generated && \
    chown -R mcp:nodejs /app/generated

# Switch to non-root user
USER mcp

# Expose the server port
EXPOSE 9999

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:9999/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=9999

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["node", "build/http-streaming.js"]