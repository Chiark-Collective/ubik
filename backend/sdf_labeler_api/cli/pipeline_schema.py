# ABOUTME: Pydantic models for pipeline YAML schema validation
# ABOUTME: Defines step types and their parameters for CLI pipeline execution

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, Field


class StepType(str, Enum):
    """Types of pipeline steps."""

    LOAD_POINTCLOUD = "load_pointcloud"
    AUTO_ANALYZE = "auto_analyze"
    APPLY_CONSTRAINTS = "apply_constraints"
    GENERATE_SAMPLES = "generate_samples"
    EXPORT = "export"


class BaseStep(BaseModel):
    """Base class for all pipeline steps."""

    name: str = Field(..., description="Human-readable name for this step")
    type: StepType = Field(..., description="Step type identifier")


class LoadPointcloudStep(BaseStep):
    """Load a point cloud file into the project."""

    type: Literal[StepType.LOAD_POINTCLOUD] = StepType.LOAD_POINTCLOUD
    source: str = Field(..., description="Path to point cloud file or scenario name")
    estimate_normals: bool = Field(default=True, description="Estimate normals if not present")
    normal_k: int = Field(default=16, description="K neighbors for normal estimation")
    scenario_category: str | None = Field(
        default=None, description="Scenario category ('trenchfoot' or 'sdf') if loading scenario"
    )
    scenario_variant: str = Field(
        default="culled", description="Variant for trenchfoot scenarios"
    )


class AutoAnalyzeOptions(BaseModel):
    """Options for auto-analysis algorithms."""

    min_gap_size: float | None = Field(default=None, description="Min gap size for flood fill")
    voxel_size: float | None = Field(default=None, description="Voxel size for voxel regions")
    idw_radius_multiplier: float | None = Field(default=None, description="Radius for normal IDW")
    flood_fill_sample_count: int = Field(
        default=500,
        ge=50,
        le=5000,
        description="Number of EMPTY sample points from flood_fill algorithm",
    )
    voxel_regions_sample_count: int = Field(
        default=500,
        ge=50,
        le=5000,
        description="Number of SOLID sample points from voxel_regions algorithm",
    )


class AutoAnalyzeStep(BaseStep):
    """Run automatic SDF region detection."""

    type: Literal[StepType.AUTO_ANALYZE] = StepType.AUTO_ANALYZE
    algorithms: list[str] = Field(
        default=["flood_fill", "voxel_regions", "normal_idw"],
        description="Algorithms to run",
    )
    options: AutoAnalyzeOptions = Field(
        default_factory=AutoAnalyzeOptions, description="Algorithm options"
    )
    apply_filter: str = Field(
        default="all",
        description="Filter for which constraints to apply: 'all', 'solid', 'empty', or 'none'",
    )


class ConstraintSpec(BaseModel):
    """Specification for a manual constraint."""

    type: str = Field(..., description="Constraint type (box, sphere, halfspace, etc.)")
    sign: str = Field(..., description="Sign convention: 'solid' or 'empty'")

    # Common fields for different constraint types
    center: list[float] | None = Field(default=None, description="Center point [x, y, z]")
    half_extents: list[float] | None = Field(
        default=None, description="Half extents for box [dx, dy, dz]"
    )
    radius: float | None = Field(default=None, description="Radius for sphere/cylinder")
    point: list[float] | None = Field(default=None, description="Point on halfspace plane")
    normal: list[float] | None = Field(default=None, description="Normal for halfspace/cylinder")
    height: float | None = Field(default=None, description="Height for cylinder")


class ApplyConstraintsStep(BaseStep):
    """Add manual constraints to the project."""

    type: Literal[StepType.APPLY_CONSTRAINTS] = StepType.APPLY_CONSTRAINTS
    constraints: list[ConstraintSpec] = Field(
        ..., description="List of constraints to add"
    )


class SamplingStrategy(str, Enum):
    """Sampling strategies for point generation."""

    UNIFORM = "uniform"
    INVERSE_SQUARE = "inverse_square"


class GenerateSamplesStep(BaseStep):
    """Generate training samples from constraints."""

    type: Literal[StepType.GENERATE_SAMPLES] = StepType.GENERATE_SAMPLES
    total_samples: int = Field(default=50000, description="Total number of samples to generate")
    strategy: SamplingStrategy = Field(
        default=SamplingStrategy.INVERSE_SQUARE, description="Sampling strategy"
    )
    falloff: float = Field(
        default=2.0,
        ge=0.5,
        le=4.0,
        description="Distance falloff exponent (2.0 = inverse-square, 1.5 = gentler falloff)",
    )


class ExportFormat(str, Enum):
    """Export file formats."""

    PARQUET = "parquet"
    CONFIG = "config"


class ExportStep(BaseStep):
    """Export training data."""

    type: Literal[StepType.EXPORT] = StepType.EXPORT
    format: ExportFormat = Field(default=ExportFormat.PARQUET, description="Export format")
    output_path: str = Field(..., description="Output directory path")
    filename: str | None = Field(default=None, description="Output filename (auto-generated if not set)")


# Union type for all steps
PipelineStep = Annotated[
    LoadPointcloudStep
    | AutoAnalyzeStep
    | ApplyConstraintsStep
    | GenerateSamplesStep
    | ExportStep,
    Field(discriminator="type"),
]


class Pipeline(BaseModel):
    """A complete pipeline definition."""

    name: str = Field(..., description="Pipeline name")
    description: str | None = Field(default=None, description="Optional description")
    project_name: str | None = Field(
        default=None, description="Project name (auto-generated if not set)"
    )
    steps: list[PipelineStep] = Field(..., description="List of pipeline steps to execute")
    cleanup: bool = Field(default=False, description="Delete project after successful run")

    def get_step_counts(self) -> dict[str, int]:
        """Count steps by type."""
        counts: dict[str, int] = {}
        for step in self.steps:
            step_type = step.type.value
            counts[step_type] = counts.get(step_type, 0) + 1
        return counts
