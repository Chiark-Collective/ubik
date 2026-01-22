# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SDF Labeler is an interactive web application for generating SDF (Signed Distance Field) training hints from point clouds. Users mark regions as "solid" (inside/negative SDF) or "empty" (outside/positive SDF) to generate training data for SDF regression models.

## Commands

### Development
```bash
make dev              # Run both backend (8001) and frontend (5173)
make dev-backend      # Backend only
make dev-frontend     # Frontend only
```

### Testing
```bash
make test             # All unit tests
make test-backend     # Backend tests: cd backend && uv run pytest tests/ -v
make test-frontend    # Frontend tests: cd frontend && npm test -- --run
make test-e2e         # E2E tests (headless)
make test-e2e-headed  # E2E tests with browser visible
```

Single test files:
```bash
cd backend && uv run pytest tests/test_file.py -v
cd frontend && npm test -- --run src/stores/labelStore.test.ts
```

### Code Quality
```bash
make lint             # Lint both (ruff for backend, eslint for frontend)
make format           # Format both (ruff format, prettier)
```

## Architecture

### Backend (FastAPI)
- `sdf_labeler_api/app.py` - FastAPI app with all route definitions
- `sdf_labeler_api/models/` - Pydantic schemas (constraints, projects, samples)
- `sdf_labeler_api/services/` - Business logic (pointcloud processing, constraint handling, sampling)
- `sdf_labeler_api/survi_bridge/` - Integration with survi SDF training

Key model: `constraints.py` defines `SignConvention` (solid/empty/surface) and constraint types (box, sphere, halfspace, cylinder, brush_stroke, seed_propagation, ml_import).

### Frontend (React + Three.js)
- `src/App.tsx` - Main app layout and mode switching
- `src/stores/` - Zustand state stores (per-feature: labelStore, brushStore, seedStore, etc.)
- `src/components/canvas/` - R3F 3D rendering (PointCloudViewer, BrushPainter, PrimitivePlacer, etc.)
- `src/components/modes/` - UI panels for each interaction mode
- `src/components/ui/` - Shared UI components
- `src/services/` - API client

### State Management
Each labeling feature has its own Zustand store with the pattern `*Store.ts` + `*Store.test.ts`. The `labelStore.ts` is central, managing all constraints with undo/redo.

### Constraint Types
The constraint model is shared between frontend (`labelStore.ts`) and backend (`models/constraints.py`). When adding new constraint types, update both locations.

## Supported File Formats
Point clouds: PLY, LAS/LAZ, CSV, NPZ, Parquet
Export: Parquet (survi-compatible with columns: x, y, z, phi, nx, ny, nz, weight, source, is_surface, is_free)
