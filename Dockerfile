# ABOUTME: Multi-stage Dockerfile for SDF Labeler
# ABOUTME: Supports webapp (default), api-only, and pipeline modes

# =============================================================================
# Stage 1: Build Frontend
# =============================================================================
FROM node:20-slim AS frontend-builder

WORKDIR /build

# Install dependencies first (better layer caching)
COPY frontend/package*.json ./
RUN npm ci

# Build frontend
COPY frontend/ ./
RUN npm run build

# =============================================================================
# Stage 2: Install Python Backend
# =============================================================================
FROM python:3.13-slim AS backend-builder

# Install uv for fast Python package management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /build

# Copy backend
COPY backend/ ./backend/

# Create virtual environment and install dependencies
RUN uv venv /opt/venv && \
    . /opt/venv/bin/activate && \
    cd backend && \
    uv pip install .

# =============================================================================
# Stage 3: Production Image
# =============================================================================
FROM python:3.13-slim AS production

# Labels
LABEL org.opencontainers.image.title="SDF Labeler"
LABEL org.opencontainers.image.description="Interactive SDF training data generation"
LABEL org.opencontainers.image.source="https://github.com/chiark/sdf-labeler"

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser

# Copy virtual environment from builder
COPY --from=backend-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV VIRTUAL_ENV="/opt/venv"

# Copy backend source (for CLI module path resolution)
COPY --from=backend-builder /build/backend /app/backend

# Copy frontend build
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create data directory
RUN mkdir -p /data && chown appuser:appuser /data

# Set working directory
WORKDIR /app

# Environment variables
ENV SDF_LABELER_DATA_DIR=/data
ENV SDF_LABELER_HOST=0.0.0.0
ENV SDF_LABELER_PORT=8000
ENV SDF_LABELER_SERVE_FRONTEND=true
ENV SDF_LABELER_FRONTEND_DIST_PATH=/app/frontend/dist
ENV PYTHONUNBUFFERED=1

# Default to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Use tini as init system
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]

# Default command: webapp mode
CMD ["webapp"]
