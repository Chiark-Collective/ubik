# Docker Deployment Guide

SDF Labeler can be deployed as a Docker container supporting three operating modes:
- **Webapp Mode** - Full interactive UI (frontend + backend)
- **API Mode** - Backend-only REST API for programmatic access
- **Pipeline Mode** - CLI fire-and-forget execution from YAML definitions

## Quick Start

```bash
# Build the image
docker build -t sdf-labeler:latest .

# Run webapp (default) - access at http://localhost:8000
docker run -p 8000:8000 sdf-labeler:latest

# Or use docker-compose
docker-compose up
```

## Operating Modes

### Webapp Mode (Default)

Full interactive application with React frontend and FastAPI backend.

```bash
# Using docker run
docker run -p 8000:8000 -v $(pwd)/data:/data sdf-labeler:latest webapp

# Using docker-compose
docker-compose up
```

**Features:**
- Interactive 3D point cloud viewer
- Manual constraint drawing tools
- Auto-analysis algorithms
- Sample generation and export
- Full UI at http://localhost:8000

**Environment Variables:**
| Variable | Default | Description |
|----------|---------|-------------|
| `SDF_LABELER_PORT` | `8000` | Server port |
| `SDF_LABELER_DATA_DIR` | `/data` | Data storage directory |

### API Mode

Backend-only mode for programmatic access. No frontend served.

```bash
# Using docker run
docker run -p 8001:8000 sdf-labeler:latest api

# Using docker-compose
docker-compose -f docker-compose.yml -f docker-compose.api.yml up
```

**Features:**
- RESTful API on all `/v1/*` endpoints
- CORS enabled for all origins
- OpenAPI docs at `/docs`
- Health check at `/health`

**Use Cases:**
- Integration with external tools
- Automated workflows
- Custom frontends
- Microservice architectures

**Example API Usage:**
```bash
# Create a project
curl -X POST http://localhost:8001/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "my-project"}'

# List projects
curl http://localhost:8001/v1/projects

# Health check
curl http://localhost:8001/health
```

### Pipeline Mode

Execute YAML pipeline definitions for batch processing.

```bash
# Run a pipeline
docker run -v $(pwd)/input:/data/input:ro \
           -v $(pwd)/output:/data/output \
           sdf-labeler:latest pipeline /data/input/my-pipeline.yml

# Dry run (validate without executing)
docker run -v $(pwd)/input:/data/input:ro \
           sdf-labeler:latest cli pipeline /data/input/my-pipeline.yml --dry-run
```

**Features:**
- Automated batch processing
- No manual intervention required
- Reproducible workflows
- YAML-based configuration

**Pipeline YAML Schema:**
```yaml
name: my-pipeline
description: Optional description
project_name: auto-generated-if-not-set

steps:
  - name: Load data
    type: load_pointcloud
    source: /data/input/scan.ply  # or scenario name
    estimate_normals: true

  - name: Auto-analyze
    type: auto_analyze
    algorithms: [flood_fill, voxel_regions, normal_idw]
    apply_filter: all  # or: solid, empty, none

  - name: Add constraints
    type: apply_constraints
    constraints:
      - type: halfspace
        sign: solid
        point: [0, 0, -0.5]
        normal: [0, 0, 1]

  - name: Generate samples
    type: generate_samples
    total_samples: 50000
    strategy: inverse_square

  - name: Export
    type: export
    format: parquet
    output_path: /data/output

cleanup: false  # Keep project after run
```

**Step Types:**
| Type | Purpose |
|------|---------|
| `load_pointcloud` | Load PLY/LAS/CSV/NPZ or built-in scenario |
| `auto_analyze` | Run automatic region detection |
| `apply_constraints` | Add manual box/sphere/halfspace constraints |
| `generate_samples` | Create training sample points |
| `export` | Export to parquet format |

### CLI Mode

Direct access to CLI commands for project management and debugging.

```bash
# Show help
docker run sdf-labeler:latest cli --help

# List projects
docker run -v sdf-data:/data sdf-labeler:latest cli project list

# Get project details
docker run -v sdf-data:/data sdf-labeler:latest cli project get <project-id>

# Delete a project
docker run -v sdf-data:/data sdf-labeler:latest cli project delete <project-id>

# Run analysis on existing project
docker run -v sdf-data:/data sdf-labeler:latest cli analyze <project-id> --apply
```

## Volume Mounts

| Path | Purpose |
|------|---------|
| `/data` | Main data directory (projects, cache) |
| `/data/input` | Input files for pipelines |
| `/data/output` | Output files from pipelines |

**Recommended Setup:**
```bash
# Create persistent volume
docker volume create sdf-labeler-data

# Run with volume
docker run -v sdf-labeler-data:/data \
           -v $(pwd)/input:/data/input:ro \
           -v $(pwd)/output:/data/output \
           sdf-labeler:latest
```

## Docker Compose Examples

### Basic Webapp

```yaml
# docker-compose.yml
services:
  sdf-labeler:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - sdf-data:/data

volumes:
  sdf-data:
```

### API Behind Reverse Proxy

```yaml
# docker-compose.api.yml (use with base compose)
services:
  sdf-labeler:
    command: ["api"]
    ports:
      - "8001:8000"
    environment:
      - SDF_LABELER_CORS_ALLOW_ALL=true
```

### Pipeline Runner

```yaml
# docker-compose.pipeline.yml
services:
  pipeline:
    build: .
    volumes:
      - ./input:/data/input:ro
      - ./output:/data/output
    entrypoint: ["/usr/bin/tini", "--", "/entrypoint.sh", "pipeline"]
    command: ["/data/input/pipeline.yml"]
```

## Health Checks

The container includes a built-in health check:

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' <container-id>

# Manual health check
curl http://localhost:8000/health
# Returns: {"status":"healthy","version":"0.1.0"}
```

## Building from Source

```bash
# Standard build
docker build -t sdf-labeler:latest .

# Build with specific platform
docker build --platform linux/amd64 -t sdf-labeler:amd64 .

# Multi-platform build (requires buildx)
docker buildx build --platform linux/amd64,linux/arm64 -t sdf-labeler:multi .
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker logs <container-id>

# Run interactively
docker run -it sdf-labeler:latest /bin/bash
```

### Pipeline fails
```bash
# Run with verbose output
docker run ... sdf-labeler:latest cli -v pipeline /data/input/pipeline.yml

# Check dry-run first
docker run ... sdf-labeler:latest cli pipeline /data/input/pipeline.yml --dry-run
```

### Permission issues
```bash
# Container runs as non-root user 'appuser'
# Ensure mounted volumes are accessible:
chmod -R 755 ./input ./output
```

## Environment Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SDF_LABELER_HOST` | `0.0.0.0` | Server bind address |
| `SDF_LABELER_PORT` | `8000` | Server port |
| `SDF_LABELER_DATA_DIR` | `/data` | Data storage path |
| `SDF_LABELER_SERVE_FRONTEND` | `true` | Enable frontend (webapp mode) |
| `SDF_LABELER_CORS_ALLOW_ALL` | `false` | Allow all CORS origins (API mode) |
| `SDF_LABELER_DEBUG` | `false` | Enable debug mode |
