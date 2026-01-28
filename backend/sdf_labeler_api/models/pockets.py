# ABOUTME: Pocket detection models for voxel-based cavity analysis
# ABOUTME: Defines voxel grid metadata and pocket region representations

from datetime import UTC, datetime
from enum import IntEnum

from pydantic import BaseModel, ConfigDict, Field


class VoxelState(IntEnum):
    """State of a voxel in the occupancy grid."""

    UNKNOWN = 0
    EMPTY = 1  # No points nearby
    OCCUPIED = 2  # Points present
    OUTSIDE = 3  # Connected to boundary (exterior air)
    POCKET = 4  # Empty but disconnected from outside (cavity)


class PocketInfo(BaseModel):
    """Information about a detected pocket (cavity)."""

    pocket_id: int = Field(..., description="Unique identifier for this pocket")
    voxel_count: int = Field(..., description="Number of voxels in the pocket")
    centroid: tuple[float, float, float] = Field(..., description="Pocket center of mass")
    bounds_low: tuple[float, float, float] = Field(..., description="AABB minimum corner")
    bounds_high: tuple[float, float, float] = Field(..., description="AABB maximum corner")
    volume_estimate: float = Field(..., description="Estimated volume in world units cubed")
    is_toggled_solid: bool = Field(default=False, description="Whether user marked this as solid")


class VoxelGridMetadata(BaseModel):
    """Metadata for the voxel occupancy grid."""

    resolution: tuple[int, int, int] = Field(..., description="Grid dimensions (x, y, z)")
    voxel_size: float = Field(..., description="Size of each voxel in world units")
    bounds_low: tuple[float, float, float] = Field(..., description="Grid origin in world space")
    bounds_high: tuple[float, float, float] = Field(..., description="Grid extent in world space")
    occupied_count: int = Field(..., description="Number of occupied voxels")
    empty_count: int = Field(..., description="Number of empty voxels (excluding outside)")
    outside_count: int = Field(..., description="Number of outside (exterior) voxels")
    pocket_count: int = Field(..., description="Number of detected pockets")


class PocketAnalysis(BaseModel):
    """Complete pocket analysis result for a project."""

    model_config = ConfigDict(ser_json_timedelta="iso8601")

    grid_metadata: VoxelGridMetadata = Field(..., description="Voxel grid info")
    pockets: list[PocketInfo] = Field(default_factory=list, description="Detected pockets")
    computed_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        description="When analysis was performed",
    )


class PocketToggleRequest(BaseModel):
    """Request to toggle a pocket's solid/empty state."""

    pocket_id: int = Field(..., description="Pocket to toggle")
    make_solid: bool = Field(..., description="True to mark as solid, False for empty")
