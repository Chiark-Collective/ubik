# Changelog

All notable changes to SDF Labeler will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Docker Packaging**: Multi-mode containerization for deployment flexibility
  - Webapp mode: Full interactive UI (frontend + backend) on port 8000
  - API mode: Backend-only REST API for programmatic access
  - Pipeline mode: CLI fire-and-forget execution from YAML definitions
  - Multi-stage Dockerfile (Node + Python build stages)
  - docker-compose files for different deployment scenarios
- **CLI Pipeline System**: Automated batch processing via YAML configuration
  - Step types: load_pointcloud, auto_analyze, apply_constraints, generate_samples, export
  - Pydantic schema validation for pipeline definitions
  - Dry-run mode for pipeline validation without execution
  - Project management commands (list, get, delete)
- **Auto Mode**: Automatic SDF region detection via ray propagation algorithm
  - Voxel-based approach with adaptive resolution (max 150³ grid)
  - EMPTY detection: Rays from sky (+Z) in 15° cone, flood-fill to reach trenches
  - SOLID detection: Rays from underground (-Z), limited to point cloud XY hull
  - Per-Z-slice greedy meshing converts voxel regions to box constraints
  - Handles outdoor scenes with trenches, pipes, and overhangs
- Toast notification system with success/error/info/warning variants
- Error boundary component for graceful React error recovery
- Loading button component with spinner overlay
- Upload progress bar showing percentage and MB transferred
- Comprehensive test suite: 82 backend tests, 151 frontend tests

### Changed

- Integrated toast notifications throughout UI (project create/delete, upload, sample generation)
- Upload API now uses XMLHttpRequest for progress tracking (fetch lacks upload progress support)
- All mutation buttons now show loading state during operations

## [0.1.0] - 2025-12-22

### Added

- Initial project scaffolding with Makefile, frontend, and backend structure
- FastAPI backend with project, point cloud, constraint, and sampling endpoints
- React + React Three Fiber frontend with LOD point cloud viewer
- Octree-based point cloud streaming for million-point scale performance
- Zustand stores for project and label state management
- Constraint models: box, sphere, halfspace, cylinder, painted region, seed propagation
- User-friendly label terminology: "solid" (inside), "empty" (outside), "surface"
- Basic UI: toolbar with mode selection, project panel, label panel, status bar
- Undo/redo support for constraint operations
- Survi integration bridge for sampling functions
- Support for multiple point cloud formats: PLY, LAS/LAZ, CSV, NPZ, Parquet
- Automatic normal estimation using PCA on k-nearest neighbors
- Training sample generation with surface anchors, near-band, and far-field sampling
- Export to survi-compatible Parquet format

### Technical Details

- Backend: FastAPI 0.109+, Pydantic 2.5+, numpy, pandas, trimesh, laspy
- Frontend: React 18, @react-three/fiber 8.15, Three.js 0.160, Zustand, TanStack Query
- Point cloud LOD: Octree with 65k points per node target, screen-space error selection
- Storage: Local filesystem with JSON metadata and NPZ point data
