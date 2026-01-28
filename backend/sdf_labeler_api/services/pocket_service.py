# ABOUTME: Pocket detection service using voxel occupancy analysis
# ABOUTME: Provides flood-fill based cavity detection for click-pocket annotation

import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from scipy import ndimage

from sdf_labeler_api.config import Settings
from sdf_labeler_api.models.constraints import PocketConstraint, SignConvention
from sdf_labeler_api.models.pockets import (
    PocketAnalysis,
    PocketInfo,
    VoxelGridMetadata,
    VoxelState,
)


class PocketService:
    """Service for detecting and managing pockets (cavities) in point clouds."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.data_dir = settings.data_dir

    def _project_dir(self, project_id: str) -> Path:
        """Get project directory path."""
        return self.data_dir / "projects" / project_id

    def _pointcloud_dir(self, project_id: str) -> Path:
        """Get point cloud directory path."""
        return self._project_dir(project_id) / "pointcloud"

    def _pockets_dir(self, project_id: str) -> Path:
        """Get pockets cache directory path."""
        pockets_dir = self._project_dir(project_id) / "pockets"
        pockets_dir.mkdir(parents=True, exist_ok=True)
        return pockets_dir

    def _load_points(self, project_id: str) -> np.ndarray | None:
        """Load point cloud positions."""
        points_path = self._pointcloud_dir(project_id) / "points.npz"
        if not points_path.exists():
            return None
        data = np.load(points_path)
        return data["xyz"]

    def compute_voxel_resolution(
        self,
        bounds_low: np.ndarray,
        bounds_high: np.ndarray,
        target_voxels: int | None = None,
    ) -> float:
        """Compute adaptive voxel size based on point cloud extent."""
        target = target_voxels or self.settings.pocket_voxel_target
        extent = bounds_high - bounds_low
        longest_axis = np.max(extent)
        voxel_size = longest_axis / target

        # Enforce minimum voxel size
        voxel_size = max(voxel_size, self.settings.pocket_min_voxel_size)

        return float(voxel_size)

    def _build_occupancy_grid(
        self,
        xyz: np.ndarray,
        bounds_low: np.ndarray,
        bounds_high: np.ndarray,
        voxel_size: float,
        dilation: int | None = None,
    ) -> np.ndarray:
        """Build voxel occupancy grid from point cloud.

        Args:
            xyz: Point positions (N, 3)
            bounds_low: Minimum bounds
            bounds_high: Maximum bounds
            voxel_size: Size of each voxel
            dilation: Number of voxels to dilate around each point

        Returns:
            3D uint8 array with VoxelState values
        """
        dilation = dilation if dilation is not None else self.settings.pocket_occupancy_dilation

        # Compute grid resolution
        extent = bounds_high - bounds_low
        resolution = np.ceil(extent / voxel_size).astype(int)

        # Clamp to max resolution
        max_res = self.settings.pocket_max_voxels_per_axis
        resolution = np.minimum(resolution, max_res)

        # Initialize grid as EMPTY
        grid = np.full(tuple(resolution), VoxelState.EMPTY, dtype=np.uint8)

        # Bin points to voxels
        voxel_indices = ((xyz - bounds_low) / voxel_size).astype(int)
        voxel_indices = np.clip(voxel_indices, 0, resolution - 1)

        # Mark occupied voxels
        if dilation == 0:
            # Simple: mark only voxel containing point
            grid[voxel_indices[:, 0], voxel_indices[:, 1], voxel_indices[:, 2]] = (
                VoxelState.OCCUPIED
            )
        else:
            # Create a binary mask and dilate
            occupied_mask = np.zeros_like(grid, dtype=bool)
            occupied_mask[voxel_indices[:, 0], voxel_indices[:, 1], voxel_indices[:, 2]] = True

            # Dilate the occupied region
            struct = ndimage.generate_binary_structure(3, 1)  # 6-connectivity
            dilated = ndimage.binary_dilation(occupied_mask, structure=struct, iterations=dilation)
            grid[dilated] = VoxelState.OCCUPIED

        return grid

    def _flood_fill_outside(self, grid: np.ndarray) -> np.ndarray:
        """Flood-fill from boundary to mark outside air.

        Uses scipy.ndimage for efficient 3D flood fill.
        """
        # Create boundary seed mask (empty voxels on grid boundary)
        boundary_mask = np.zeros_like(grid, dtype=bool)
        boundary_mask[0, :, :] = True
        boundary_mask[-1, :, :] = True
        boundary_mask[:, 0, :] = True
        boundary_mask[:, -1, :] = True
        boundary_mask[:, :, 0] = True
        boundary_mask[:, :, -1] = True

        # Seed: boundary voxels that are empty
        seed = boundary_mask & (grid == VoxelState.EMPTY)

        # Traversable: empty voxels only
        traversable = grid == VoxelState.EMPTY

        # Flood fill using binary_dilation with constraint
        struct = ndimage.generate_binary_structure(3, 1)  # 6-connectivity
        outside = ndimage.binary_dilation(
            seed,
            mask=traversable,
            iterations=-1,
            structure=struct,  # Until no change
        )

        # Mark outside voxels
        result = grid.copy()
        result[outside] = VoxelState.OUTSIDE

        return result

    def _label_pockets(self, grid: np.ndarray) -> tuple[np.ndarray, int]:
        """Label disconnected pocket regions.

        Returns:
            (labeled_grid, pocket_count) where labeled_grid has integer labels
        """
        # Pockets are EMPTY voxels that weren't marked as OUTSIDE
        pocket_mask = grid == VoxelState.EMPTY

        # Label connected components with 6-connectivity
        struct = ndimage.generate_binary_structure(3, 1)
        labeled, num_features = ndimage.label(pocket_mask, structure=struct)

        return labeled, num_features

    def _extract_pocket_info(
        self,
        labeled: np.ndarray,
        pocket_id: int,
        voxel_size: float,
        bounds_low: np.ndarray,
    ) -> PocketInfo:
        """Extract metadata for a single pocket."""
        mask = labeled == pocket_id
        voxel_coords = np.argwhere(mask)

        if len(voxel_coords) == 0:
            raise ValueError(f"Pocket {pocket_id} has no voxels")

        # Convert to world coordinates (voxel centers)
        world_coords = voxel_coords * voxel_size + bounds_low + voxel_size / 2

        centroid = tuple(world_coords.mean(axis=0).tolist())
        pocket_bounds_low = tuple((voxel_coords.min(axis=0) * voxel_size + bounds_low).tolist())
        pocket_bounds_high = tuple(
            ((voxel_coords.max(axis=0) + 1) * voxel_size + bounds_low).tolist()
        )

        voxel_count = len(voxel_coords)
        volume = voxel_count * (voxel_size**3)

        return PocketInfo(
            pocket_id=pocket_id,
            voxel_count=voxel_count,
            centroid=centroid,
            bounds_low=pocket_bounds_low,
            bounds_high=pocket_bounds_high,
            volume_estimate=volume,
            is_toggled_solid=False,
        )

    async def analyze_pockets(
        self,
        project_id: str,
        voxel_target: int | None = None,
        recompute: bool = False,
    ) -> PocketAnalysis:
        """Analyze point cloud for pockets (disconnected cavities).

        This is a potentially expensive operation. Results are cached.
        """
        # Check cache first
        if not recompute:
            cached = self.get_cached_analysis(project_id)
            if cached is not None:
                return cached

        # Load points
        xyz = self._load_points(project_id)
        if xyz is None:
            raise ValueError(f"No point cloud for project {project_id}")

        # Compute bounds
        bounds_low = xyz.min(axis=0)
        bounds_high = xyz.max(axis=0)

        # Compute voxel size
        voxel_size = self.compute_voxel_resolution(bounds_low, bounds_high, voxel_target)

        # Build occupancy grid
        grid = self._build_occupancy_grid(xyz, bounds_low, bounds_high, voxel_size)

        # Flood fill from boundary
        grid = self._flood_fill_outside(grid)

        # Label pockets
        labeled, num_pockets = self._label_pockets(grid)

        # Extract pocket info for significant pockets
        pockets = []
        min_voxels = self.settings.pocket_min_volume_voxels
        for pocket_id in range(1, num_pockets + 1):
            voxel_count = np.sum(labeled == pocket_id)
            if voxel_count >= min_voxels:
                info = self._extract_pocket_info(labeled, pocket_id, voxel_size, bounds_low)
                pockets.append(info)

        # Compute grid statistics
        resolution = tuple(grid.shape)
        occupied_count = int(np.sum(grid == VoxelState.OCCUPIED))
        outside_count = int(np.sum(grid == VoxelState.OUTSIDE))
        empty_count = int(np.sum(grid == VoxelState.EMPTY))

        grid_metadata = VoxelGridMetadata(
            resolution=resolution,
            voxel_size=voxel_size,
            bounds_low=tuple(bounds_low.tolist()),
            bounds_high=tuple(bounds_high.tolist()),
            occupied_count=occupied_count,
            empty_count=empty_count,
            outside_count=outside_count,
            pocket_count=len(pockets),
        )

        analysis = PocketAnalysis(
            grid_metadata=grid_metadata,
            pockets=pockets,
            computed_at=datetime.now(UTC),
        )

        # Cache results
        self._save_analysis(project_id, analysis, grid, labeled, voxel_size, bounds_low)

        return analysis

    def _save_analysis(
        self,
        project_id: str,
        analysis: PocketAnalysis,
        grid: np.ndarray,
        labeled: np.ndarray,
        voxel_size: float,
        bounds_low: np.ndarray,
    ) -> None:
        """Save pocket analysis to cache."""
        pockets_dir = self._pockets_dir(project_id)

        # Save analysis JSON
        with open(pockets_dir / "analysis.json", "w") as f:
            json.dump(analysis.model_dump(mode="json"), f, indent=2, default=str)

        # Save grid data for visualization and sampling
        np.savez_compressed(
            pockets_dir / "grid.npz",
            grid=grid,
            labeled=labeled,
            voxel_size=np.array([voxel_size]),
            bounds_low=bounds_low,
        )

    def get_cached_analysis(self, project_id: str) -> PocketAnalysis | None:
        """Get cached pocket analysis if available."""
        analysis_path = self._pockets_dir(project_id) / "analysis.json"
        if not analysis_path.exists():
            return None

        with open(analysis_path) as f:
            data = json.load(f)

        return PocketAnalysis.model_validate(data)

    def get_pocket_voxels(self, project_id: str, pocket_id: int) -> np.ndarray | None:
        """Get voxel world coordinates for a specific pocket.

        Returns:
            (N, 3) array of voxel center positions, or None if not found
        """
        grid_path = self._pockets_dir(project_id) / "grid.npz"
        if not grid_path.exists():
            return None

        data = np.load(grid_path)
        labeled = data["labeled"]
        voxel_size = float(data["voxel_size"][0])
        bounds_low = data["bounds_low"]

        mask = labeled == pocket_id
        if not np.any(mask):
            return None

        voxel_coords = np.argwhere(mask)
        world_coords = voxel_coords * voxel_size + bounds_low + voxel_size / 2

        return world_coords

    def create_pocket_constraint(
        self,
        project_id: str,
        pocket_id: int,
        sign: SignConvention,
    ) -> PocketConstraint:
        """Create a PocketConstraint for a detected pocket."""
        analysis = self.get_cached_analysis(project_id)
        if analysis is None:
            raise ValueError(f"No pocket analysis for project {project_id}")

        pocket_info = None
        for p in analysis.pockets:
            if p.pocket_id == pocket_id:
                pocket_info = p
                break

        if pocket_info is None:
            raise ValueError(f"Pocket {pocket_id} not found")

        return PocketConstraint(
            sign=sign,
            pocket_id=pocket_info.pocket_id,
            voxel_count=pocket_info.voxel_count,
            centroid=pocket_info.centroid,
            bounds_low=pocket_info.bounds_low,
            bounds_high=pocket_info.bounds_high,
            volume_estimate=pocket_info.volume_estimate,
        )

    def clear_cache(self, project_id: str) -> None:
        """Clear cached pocket analysis for a project."""
        pockets_dir = self._pockets_dir(project_id)
        for f in pockets_dir.glob("*"):
            f.unlink()
