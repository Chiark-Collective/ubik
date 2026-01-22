# ABOUTME: Training sample related Pydantic models
# ABOUTME: Defines sample generation requests and results

from typing import Literal

from pydantic import BaseModel, Field


class SampleGenerationRequest(BaseModel):
    """Request to generate training samples from constraints."""

    total_samples: int = Field(default=10000, ge=100, le=1000000)
    samples_per_primitive: int = Field(
        default=100,
        ge=10,
        le=10000,
        description="Number of samples to generate per primitive constraint (box, sphere, cylinder, halfspace)",
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
