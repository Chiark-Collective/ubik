# ABOUTME: Training sample related Pydantic models
# ABOUTME: Defines sample generation requests and results

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class SamplingStrategy(str, Enum):
    """Sampling strategy for generating training samples from constraints."""

    CONSTANT = "constant"  # Fixed samples per constraint
    DENSITY = "density"  # Samples proportional to constraint volume
    INVERSE_SQUARE = "inverse_square"  # More samples near surface, fewer far away


class SampleGenerationRequest(BaseModel):
    """Request to generate training samples from constraints."""

    total_samples: int = Field(default=10000, ge=100, le=1000000)

    # Sampling strategy
    strategy: SamplingStrategy = Field(
        default=SamplingStrategy.CONSTANT,
        description="Sampling strategy: constant (fixed per constraint), density (proportional to volume), inverse_square (more near surface)",
    )

    # CONSTANT strategy parameters
    samples_per_primitive: int = Field(
        default=100,
        ge=10,
        le=10000,
        description="[constant] Number of samples per primitive constraint",
    )

    # DENSITY strategy parameters
    samples_per_cubic_meter: float = Field(
        default=10000.0,
        ge=100.0,
        le=1000000.0,
        description="[density] Sample density per cubic meter of constraint volume",
    )

    # INVERSE_SQUARE strategy parameters
    inverse_square_base_samples: int = Field(
        default=100,
        ge=10,
        le=10000,
        description="[inverse_square] Base samples at surface, falling off with distance²",
    )
    inverse_square_falloff: float = Field(
        default=2.0,
        ge=0.5,
        le=4.0,
        description="[inverse_square] Falloff exponent (higher = faster falloff)",
    )

    include_surface: bool = Field(default=True, description="Include surface anchor points")
    far_direction: Literal["outward", "inward", "bidirectional"] = Field(
        default="bidirectional", description="Direction for far-field sampling"
    )
    apply_clipping: bool = Field(default=True, description="Apply TSDF clipping")
    seed: int = Field(default=0, description="Random seed for reproducibility")


class TrainingSample(BaseModel):
    """Single training sample with SDF value."""

    x: float
    y: float
    z: float
    phi: float = Field(..., description="Signed distance value")
    nx: float | None = None
    ny: float | None = None
    nz: float | None = None
    weight: float = 1.0
    source: str = Field(..., description="Sample source (e.g., 'surface_anchor', 'near_band')")
    is_surface: bool = False
    is_free: bool = False


class TrainingSampleSet(BaseModel):
    """Complete training sample set."""

    samples: list[TrainingSample]
    sample_count: int
    source_breakdown: dict[str, int] = Field(
        default_factory=dict, description="Sample counts by source type"
    )


class SamplePreview(BaseModel):
    """Preview of sample distribution before generation."""

    surface_anchor_count: int
    near_band_count: int
    far_field_count: int
    constraint_sample_count: int = Field(default=0, description="Samples from user constraints")
    total_count: int

    # Subset of samples for visualization
    preview_samples: list[TrainingSample] = Field(
        default_factory=list, description="Subset for 3D preview"
    )


class ExportConfig(BaseModel):
    """SDFTaskSpec-compatible export configuration."""

    bounds_low: tuple[float, float, float]
    bounds_high: tuple[float, float, float]
    tsdf_trunc: float
    near_band: float
    tangential_jitter: float
    far_field_ratio: float
    surface_anchor_ratio: float
    knn: int
    orientation: str

    # Metadata
    project_id: str
    project_name: str
    sample_count: int
    constraint_count: int


class SamplePoint(BaseModel):
    """Minimal sample point for visualization (x, y, z, phi only)."""

    x: float
    y: float
    z: float
    phi: float


class SampleVisualizationResponse(BaseModel):
    """Response for sample visualization endpoint."""

    samples: list[SamplePoint]
    total_count: int
    returned_count: int
    phi_min: float = Field(description="Minimum phi value in dataset")
    phi_max: float = Field(description="Maximum phi value in dataset")
