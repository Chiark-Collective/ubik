# Ubik

Spraypaint SDF (Signed Distance Field) far-field constraints onto your point clouds.

## Overview

Ubik marks point clouds as "solid" (inside) or "empty" (outside), generating training data for SDF regression models.

**Core Engine**: [sdf-sampler](https://github.com/Chiark-Collective/sdf-sampler) - the auto-analysis and sampling algorithms are available as a standalone PyPI package (`pip install sdf-sampler`) for use in your own pipelines. 

## Features

- **Million-point-scale visualization** with octree-based LOD streaming
- **Multiple labeling modes**:
  - Primitive placement (boxes, spheres, half-spaces)
  - 2D slice painting
  - 3D brush selection
  - Seed & propagate
  - ML model import
- **Beginner-friendly terminology**: "solid" vs "empty" instead of technical SDF notation
- **Direct survi integration**: Export training data in survi-compatible format
- **Undo/redo support** for all labeling operations

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Build and run
docker build -t sdf-labeler .
docker run -p 8000:8000 sdf-labeler

# Or use docker-compose
docker-compose up
```

Then open http://localhost:8000 in your browser.

See [Docker Deployment Guide](docs/docker.md) for:
- **Webapp Mode** - Full interactive UI
- **API Mode** - Backend-only for integrations
- **Pipeline Mode** - Batch processing from YAML

### Option 2: Local Development

#### Prerequisites

- Python 3.11+
- Node.js 18+
- uv (Python package manager)

#### Installation

```bash
# Install all dependencies
make install

# Or separately:
make install-backend   # Backend only
make install-frontend  # Frontend only
```

#### Running

```bash
# Start both backend and frontend
make dev

# Or separately:
make dev-backend   # Backend at http://localhost:8001
make dev-frontend  # Frontend at http://localhost:5173
```

Then open http://localhost:5173 in your browser.

## Usage

### 1. Create a Project

Click the + button in the left panel to create a new project.

### 2. Upload Point Cloud

Drag and drop a point cloud file (PLY, LAS/LAZ, CSV, NPZ, Parquet) onto the upload area.

### 3. Label Regions

Use the toolbar to select a labeling mode:

- **P** - Place primitives (boxes, spheres, half-spaces)
- **S** - Slice painting (2D orthogonal views)
- **B** - 3D brush selection
- **G** - Seed & propagate

Select the label type (Solid/Empty/Surface) in the right panel, then mark regions.

### 4. Generate & Export

Configure the **samples per primitive** setting to control how many training points are generated from each constraint (default: 100, range: 10-10000). Click "Generate Samples" to create training data, then export to Parquet for use with survi.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Esc | Navigate mode (orbit camera) |
| P | Primitive placement mode |
| S | Slice painting mode |
| B | 3D brush mode |
| G | Seed & propagate mode |
| I | Import ML model |
| Tab | Toggle label type (solid/empty) |
| [ / ] | Decrease/increase brush size |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Delete | Delete selected constraint |

## Project Structure

```
sdf-labeler/
├── frontend/          # React + Three.js frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── canvas/    # R3F 3D components
│   │   │   ├── modes/     # Interaction mode UIs
│   │   │   └── ui/        # General UI components
│   │   ├── stores/        # Zustand state management
│   │   └── services/      # API client
│   └── package.json
├── backend/           # FastAPI backend
│   ├── sdf_labeler_api/
│   │   ├── models/        # Pydantic schemas
│   │   ├── services/      # Business logic
│   │   └── survi_bridge/  # Survi integration
│   └── pyproject.toml
├── Makefile
└── README.md
```

## Survi Integration

SDF Labeler generates training data compatible with survi's SDF workflow:

```python
# After exporting from SDF Labeler:
import pandas as pd

df = pd.read_parquet("exported_samples.parquet")
# Columns: x, y, z, phi, nx, ny, nz, weight, source, is_surface, is_free
```

Use with survi CLI:

```bash
cd survi
python -m survi.cli sdf train --point-cloud path/to/exported_samples.parquet
```

## API Reference

### Projects

- `POST /v1/projects` - Create project
- `GET /v1/projects` - List projects
- `GET /v1/projects/{id}` - Get project
- `DELETE /v1/projects/{id}` - Delete project

### Point Clouds

- `POST /v1/projects/{id}/pointcloud` - Upload point cloud
- `GET /v1/projects/{id}/pointcloud/metadata` - Get octree metadata
- `GET /v1/projects/{id}/pointcloud/tiles/{l}/{x}/{y}/{z}` - Get tile data

### Constraints

- `POST /v1/projects/{id}/constraints` - Add constraint
- `GET /v1/projects/{id}/constraints` - List constraints
- `DELETE /v1/projects/{id}/constraints/{cid}` - Delete constraint

### Samples

- `POST /v1/projects/{id}/samples/preview` - Preview sample distribution
- `POST /v1/projects/{id}/samples/generate` - Generate training samples
- `GET /v1/projects/{id}/export/parquet` - Export as Parquet

## Batch Processing (Pipeline Mode)

For automated workflows, use YAML pipelines:

```yaml
# pipeline.yml
name: my-pipeline
steps:
  - name: Load data
    type: load_pointcloud
    source: /data/input/scan.ply

  - name: Auto-analyze
    type: auto_analyze
    algorithms: [flood_fill, voxel_regions]
    apply_filter: all

  - name: Generate samples
    type: generate_samples
    total_samples: 50000

  - name: Export
    type: export
    format: parquet
    output_path: /data/output
```

Run with Docker:
```bash
docker run -v $(pwd)/input:/data/input:ro \
           -v $(pwd)/output:/data/output \
           sdf-labeler pipeline /data/input/pipeline.yml
```

See [examples/](examples/) for more pipeline examples.

## Development

```bash
# Run backend tests
make test-backend

# Run frontend unit tests
make test-frontend

# Run frontend E2E tests
make test-e2e

# Run Docker E2E tests
make test-docker

# Lint code
make lint

# Format code
make format
```

## License

MIT
