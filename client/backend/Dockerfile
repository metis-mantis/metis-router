# Multi-stage Dockerfile for FastAPI Backend with Python optimization
# Base image: Python 3.11 slim for minimal footprint and security

# =============================================================================
# DEPENDENCIES STAGE - Install Python dependencies with caching optimization
# =============================================================================
FROM python:3.11-slim AS dependencies

# Set working directory
WORKDIR /app

# Install system dependencies required for Python packages
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create virtual environment for dependency isolation
RUN python -m venv /opt/venv

# Activate virtual environment
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements first for better Docker layer caching
COPY requirements.txt .

# Install Python dependencies with pip caching optimization
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# =============================================================================
# RUNTIME STAGE - Minimal production image
# =============================================================================
FROM python:3.11-slim AS runtime

# Set working directory
WORKDIR /app

# Install only runtime system dependencies (curl for health checks)
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy virtual environment from dependencies stage
COPY --from=dependencies /opt/venv /opt/venv

# Activate virtual environment
ENV PATH="/opt/venv/bin:$PATH"

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy application code
COPY --chown=appuser:appuser . .

# Switch to non-root user
USER appuser

# Expose backend port
EXPOSE 8000

# Add health check endpoint for container monitoring
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Configure uvicorn server for FastAPI application
# Environment variables will be injected from shared .env file via docker-compose
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

# =============================================================================
# DEVELOPMENT STAGE - Development-specific optimizations
# =============================================================================
FROM runtime AS development

# Switch back to root for development tools installation
USER root

# Install development dependencies
RUN pip install --no-cache-dir pytest pytest-asyncio

# Switch back to appuser
USER appuser

# Enable hot reloading for development
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--workers", "1"]