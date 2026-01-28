# ABOUTME: Project-related Pydantic models
# ABOUTME: Defines project metadata, configuration, and state

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ProjectConfig(BaseModel):
    """Configurable project parameters for SDF sampling."""

    # Sampling parameters
    near_band: float = Field(default=0.02, description="Width of near-surface band")
    tangential_jitter: float = Field(default=0.005, description="Jitter perpendicular to normals")
    tsdf_trunc: float = Field(default=0.05, description="TSDF truncation distance")
    surface_anchor_ratio: float = Field(default=0.3, description="Fraction of surface anchors")
    far_field_ratio: float = Field(default=0.2, description="Fraction of far-field samples")

    # Normal estimation
    knn_neighbors: int = Field(default=16, description="K for normal estimation")
    normal_orientation: Literal["mst", "visibility", "mixed"] = Field(
        default="mst", description="Normal orientation method"
    )

    # Coordinate system
    units: Literal["meters", "millimeters", "feet"] = Field(
        default="meters", description="Distance units"
    )


class ProjectCreate(BaseModel):
    """Request model for creating a new project."""

    name: str = Field(..., min_length=1, max_length=100, description="Project name")
    description: str | None = Field(default=None, description="Optional description")
    config: ProjectConfig = Field(default_factory=ProjectConfig)


class Project(BaseModel):
    """Complete project state."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str | None = None
    config: ProjectConfig = Field(default_factory=ProjectConfig)

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Point cloud reference
    point_cloud_id: str | None = None
    bounds_low: tuple[float, float, float] | None = None
    bounds_high: tuple[float, float, float] | None = None

    # Statistics
    constraint_count: int = 0
    sample_count: int = 0


class ProjectList(BaseModel):
    """Response model for listing projects."""

    projects: list[Project]
    total: int
