# ABOUTME: FastAPI application entry point for SDF Labeler API
# ABOUTME: Defines routes for project management, point cloud handling, and sample generation

from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from sdf_labeler_api.config import settings
from sdf_labeler_api.models.constraints import Constraint, ConstraintSet
from sdf_labeler_api.models.project import (
    Project,
    ProjectConfig,
    ProjectCreate,
    ProjectList,
)
from sdf_labeler_api.models.point_cloud import (
    PointCloudStats,
    PointCloudUploadResponse,
)
from sdf_labeler_api.models.samples import (
    SampleGenerationRequest,
    SamplePreview,
    SampleVisualizationResponse,
    TrainingSampleSet,
)
from sdf_labeler_api.services.project_service import ProjectService
from sdf_labeler_api.services.pointcloud_service import PointCloudService
from sdf_labeler_api.services.constraint_service import ConstraintService
from sdf_labeler_api.services.sampling_service import SamplingService
from sdf_labeler_api.services.pocket_service import PocketService
from sdf_labeler_api.services.auto_analysis_service import AutoAnalysisService
from sdf_labeler_api.services import scenarios_service
from sdf_labeler_api.models.pockets import PocketAnalysis
from sdf_labeler_api.models.constraints import SignConvention
from sdf_labeler_api.models.auto_analysis import (
    ApplyConstraintsRequest,
    AutoAnalysisResult,
    AutoAnalyzeRequest,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    # Startup: ensure data directory exists
    settings.ensure_data_dir()
    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title="SDF Labeler API",
    description="Backend API for interactive SDF training data generation",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
project_service = ProjectService(settings.data_dir)
pointcloud_service = PointCloudService(settings)
constraint_service = ConstraintService()
sampling_service = SamplingService()
pocket_service = PocketService(settings)
auto_analysis_service = AutoAnalysisService(settings)


# =============================================================================
# Health Check
# =============================================================================


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "0.1.0"}


# =============================================================================
# Project Management
# =============================================================================


@app.post("/v1/projects", response_model=Project)
async def create_project(project: ProjectCreate):
    """Create a new labeling project."""
    return project_service.create(project)


@app.get("/v1/projects", response_model=ProjectList)
async def list_projects():
    """List all projects."""
    projects = project_service.list_all()
    return ProjectList(projects=projects, total=len(projects))


@app.get("/v1/projects/{project_id}", response_model=Project)
async def get_project(project_id: str):
    """Get project details."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.patch("/v1/projects/{project_id}", response_model=Project)
async def update_project(project_id: str, config: ProjectConfig):
    """Update project configuration."""
    project = project_service.update_config(project_id, config)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.delete("/v1/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project and all associated data."""
    success = project_service.delete(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "deleted", "project_id": project_id}


# =============================================================================
# Point Cloud Management
# =============================================================================


@app.post("/v1/projects/{project_id}/pointcloud", response_model=PointCloudUploadResponse)
async def upload_pointcloud(
    project_id: str,
    file: UploadFile = File(...),
    estimate_normals: bool = True,
    normal_k: int = 16,
):
    """Upload and process a point cloud file.

    Supports: PLY, LAS/LAZ, CSV, Parquet, NPY, NPZ
    """
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        result = await pointcloud_service.upload_and_process(
            project_id=project_id,
            file=file,
            estimate_normals=estimate_normals,
            normal_k=normal_k,
        )
        # Update project with point cloud reference
        project_service.set_pointcloud(project_id, result.id, result.bounds_low, result.bounds_high)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/v1/projects/{project_id}/pointcloud", response_model=PointCloudStats)
async def get_pointcloud_stats(project_id: str):
    """Get point cloud statistics."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.point_cloud_id is None:
        raise HTTPException(status_code=404, detail="No point cloud uploaded")

    stats = pointcloud_service.get_stats(project_id)
    if stats is None:
        raise HTTPException(status_code=404, detail="Point cloud not found")
    return stats


@app.get("/v1/projects/{project_id}/pointcloud/tiles/{level}/{x}/{y}/{z}")
async def get_pointcloud_tile(
    project_id: str,
    level: int,
    x: int,
    y: int,
    z: int,
):
    """Get a specific octree tile for LOD rendering."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    tile_data = pointcloud_service.get_tile(project_id, level, x, y, z)
    if tile_data is None:
        raise HTTPException(status_code=404, detail="Tile not found")

    return JSONResponse(content=tile_data)


@app.get("/v1/projects/{project_id}/pointcloud/metadata")
async def get_pointcloud_metadata(project_id: str):
    """Get octree metadata for LOD streaming."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    metadata = pointcloud_service.get_octree_metadata(project_id)
    if metadata is None:
        raise HTTPException(status_code=404, detail="Point cloud not found")

    return metadata


# =============================================================================
# Constraint Management
# =============================================================================


@app.post("/v1/projects/{project_id}/constraints", response_model=Constraint)
async def add_constraint(project_id: str, constraint: Constraint):
    """Add a constraint to the project."""
    print(f"[DEBUG] add_constraint: type={constraint.type}", flush=True)
    if constraint.type == "ray_carve":
        print(f"[DEBUG] back_buffer_coefficient={constraint.back_buffer_coefficient}", flush=True)  # type: ignore[union-attr]
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return constraint_service.add(project_id, constraint)


@app.get("/v1/projects/{project_id}/constraints", response_model=ConstraintSet)
async def list_constraints(project_id: str):
    """List all constraints in a project."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return constraint_service.list_all(project_id)


@app.delete("/v1/projects/{project_id}/constraints/{constraint_id}")
async def delete_constraint(project_id: str, constraint_id: str):
    """Delete a constraint."""
    success = constraint_service.delete(project_id, constraint_id)
    if not success:
        raise HTTPException(status_code=404, detail="Constraint not found")
    return {"status": "deleted", "constraint_id": constraint_id}


@app.delete("/v1/projects/{project_id}/constraints")
async def clear_constraints(project_id: str):
    """Delete all constraints for a project."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    constraint_service.clear(project_id)
    return {"status": "cleared", "project_id": project_id}


# =============================================================================
# Pocket Detection
# =============================================================================


@app.post("/v1/projects/{project_id}/pockets/analyze", response_model=PocketAnalysis)
async def analyze_pockets(
    project_id: str,
    voxel_target: int = Query(default=256, ge=64, le=512),
    recompute: bool = Query(default=False),
):
    """Analyze point cloud for pockets (disconnected cavities).

    This is a potentially expensive operation. Results are cached.
    """
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.point_cloud_id is None:
        raise HTTPException(status_code=400, detail="No point cloud uploaded")

    try:
        return await pocket_service.analyze_pockets(
            project_id, voxel_target=voxel_target, recompute=recompute
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/v1/projects/{project_id}/pockets", response_model=PocketAnalysis | None)
async def get_pockets(project_id: str):
    """Get cached pocket analysis for a project."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return pocket_service.get_cached_analysis(project_id)


@app.get("/v1/projects/{project_id}/pockets/{pocket_id}/voxels")
async def get_pocket_voxels(project_id: str, pocket_id: int):
    """Get voxel coordinates for visualization of a specific pocket."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    voxels = pocket_service.get_pocket_voxels(project_id, pocket_id)
    if voxels is None:
        raise HTTPException(status_code=404, detail="Pocket not found")

    return {
        "pocket_id": pocket_id,
        "voxel_count": len(voxels),
        "positions": voxels.flatten().tolist(),
    }


@app.post("/v1/projects/{project_id}/pockets/{pocket_id}/toggle", response_model=Constraint)
async def toggle_pocket(
    project_id: str,
    pocket_id: int,
    sign: SignConvention = Query(...),
):
    """Toggle a pocket's sign and create/update constraint.

    SOLID = fill the pocket (negative SDF)
    EMPTY = leave as void (positive SDF, default)
    """
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        pocket_constraint = pocket_service.create_pocket_constraint(project_id, pocket_id, sign)
        return constraint_service.add(project_id, pocket_constraint)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# Auto Analysis
# =============================================================================


@app.post("/v1/projects/{project_id}/auto/analyze", response_model=AutoAnalysisResult)
async def auto_analyze(
    project_id: str,
    request: AutoAnalyzeRequest | None = None,
):
    """Run automatic SDF region detection using multiple algorithms.

    Generates spatial constraints (boxes, halfspaces, pockets) that define
    regions of 3D space around the surface for SOLID/EMPTY labeling.
    Returns generated constraints for user review and approval.

    Request body:
        algorithms: List of algorithms to run (default: all)
        recompute: Force recomputation even if cached
        options: Tunable hyperparameters for algorithms
    """
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.point_cloud_id is None:
        raise HTTPException(status_code=400, detail="No point cloud uploaded")

    # Use default request if none provided
    if request is None:
        request = AutoAnalyzeRequest()

    try:
        return await auto_analysis_service.analyze(
            project_id,
            algorithms=request.algorithms,
            recompute=request.recompute,
            options=request.options,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/v1/projects/{project_id}/auto/result", response_model=AutoAnalysisResult | None)
async def get_auto_result(project_id: str):
    """Get cached auto-analysis result with generated constraints."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return auto_analysis_service.get_cached_result(project_id)


@app.post("/v1/projects/{project_id}/auto/apply")
async def apply_auto_constraints(
    project_id: str,
    request: ApplyConstraintsRequest,
):
    """Apply selected generated constraints to the project.

    Takes indices of constraints from the auto-analysis result and adds
    them to the project's constraint set.
    """
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get cached analysis
    result = auto_analysis_service.get_cached_result(project_id)
    if result is None:
        raise HTTPException(status_code=400, detail="No auto-analysis results available")

    # Validate indices
    if not request.constraint_indices:
        raise HTTPException(status_code=400, detail="No constraints selected")

    max_idx = len(result.generated_constraints) - 1
    invalid_indices = [i for i in request.constraint_indices if i < 0 or i > max_idx]
    if invalid_indices:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid constraint indices: {invalid_indices}. Valid range: 0-{max_idx}",
        )

    # Add selected constraints to project
    added_constraints = []
    for idx in request.constraint_indices:
        gen_constraint = result.generated_constraints[idx]
        # Create constraint from the dict
        constraint_data = gen_constraint.constraint.copy()
        added = constraint_service.add_from_dict(project_id, constraint_data)
        added_constraints.append(added)

    return {
        "status": "applied",
        "constraints_added": len(added_constraints),
        "constraint_ids": [c.id for c in added_constraints],
    }


@app.delete("/v1/projects/{project_id}/auto")
async def clear_auto_analysis(project_id: str):
    """Clear cached auto-analysis for a project."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    auto_analysis_service.clear_cache(project_id)
    return {"status": "cleared", "project_id": project_id}


# =============================================================================
# Sample Generation
# =============================================================================


@app.post("/v1/projects/{project_id}/samples/preview", response_model=SamplePreview)
async def preview_samples(project_id: str, request: SampleGenerationRequest):
    """Preview what training samples will be generated."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return sampling_service.preview(project_id, request)


@app.post("/v1/projects/{project_id}/samples/generate", response_model=TrainingSampleSet)
async def generate_samples(project_id: str, request: SampleGenerationRequest):
    """Generate training samples from constraints."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return sampling_service.generate(project_id, request)


@app.get("/v1/projects/{project_id}/samples", response_model=SampleVisualizationResponse)
async def get_samples(
    project_id: str,
    limit: int = Query(default=10000, ge=100, le=100000),
    subsample: bool = Query(default=True),
):
    """Get samples for 3D visualization."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return sampling_service.get_samples_for_visualization(project_id, limit, subsample)


# =============================================================================
# Export
# =============================================================================


@app.get("/v1/projects/{project_id}/export/parquet")
async def export_parquet(project_id: str):
    """Export training data as Parquet file (survi-compatible)."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    path = sampling_service.export_parquet(project_id)
    if path is None:
        raise HTTPException(status_code=404, detail="No samples generated")

    return FileResponse(
        path=path,
        media_type="application/octet-stream",
        filename=f"{project_id}_samples.parquet",
    )


@app.get("/v1/projects/{project_id}/export/config")
async def export_config(project_id: str):
    """Export SDFTaskSpec as JSON for survi CLI."""
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    config = sampling_service.export_config(project_id, project)
    return config


# =============================================================================
# Scenario Datasets
# =============================================================================


@app.get("/v1/scenarios")
async def list_scenarios(category: str | None = None):
    """List available scenario datasets.

    Args:
        category: Filter by category ("trenchfoot", "sdf", or None for all)
    """
    scenarios = []

    if category is None or category == "trenchfoot":
        scenarios.extend(scenarios_service.list_trenchfoot_scenarios())

    if category is None or category == "sdf":
        scenarios.extend(scenarios_service.list_sdf_scenarios())

    return {
        "scenarios": [
            {
                "name": s.name,
                "description": s.description,
                "category": s.category,
                "preview_url": s.preview_url,
            }
            for s in scenarios
        ],
        "total": len(scenarios),
    }


@app.post("/v1/projects/{project_id}/load-scenario")
async def load_scenario(
    project_id: str,
    scenario_name: str = Query(..., description="Name of the scenario to load"),
    category: str = Query("trenchfoot", description="Category: 'trenchfoot' or 'sdf'"),
    variant: str = Query("culled", description="Point cloud variant (for trenchfoot)"),
):
    """Load a scenario dataset into the project.

    This replaces any existing point cloud in the project.
    """
    project = project_service.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        if category == "trenchfoot":
            loaded = scenarios_service.load_trenchfoot_scenario(scenario_name, variant=variant)
        elif category == "sdf":
            loaded = scenarios_service.load_sdf_scenario(scenario_name)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown category: {category}")

        # Store the point cloud using pointcloud service
        result = await pointcloud_service.store_dataframe(
            project_id=project_id,
            df=loaded.points,
            source_name=f"{category}:{scenario_name}",
            mesh=loaded.mesh,
        )

        # Update project with point cloud reference
        project_service.set_pointcloud(
            project_id,
            result.id,
            result.bounds_low,
            result.bounds_high,
        )

        return {
            "status": "loaded",
            "scenario": scenario_name,
            "category": category,
            "point_count": len(loaded.points),
            "has_mesh": loaded.mesh is not None,
            "bounds": {
                "low": loaded.bounds[0].tolist(),
                "high": loaded.bounds[1].tolist(),
            },
            "metadata": loaded.metadata,
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load scenario: {e}")
