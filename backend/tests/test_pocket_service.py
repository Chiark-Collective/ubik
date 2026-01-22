# ABOUTME: Unit tests for PocketService
# ABOUTME: Tests voxel grid construction, flood fill, and pocket detection

from pathlib import Path

import numpy as np
import pytest

from sdf_labeler_api.config import Settings
from sdf_labeler_api.models.constraints import SignConvention
from sdf_labeler_api.models.pockets import VoxelState
from sdf_labeler_api.services.pocket_service import PocketService


@pytest.fixture
def pocket_service(temp_data_dir: Path) -> PocketService:
    """Create a PocketService with test settings."""
    settings = Settings(data_dir=temp_data_dir)
    # Use settings that work well for test cases
    settings.pocket_voxel_target = 32
    settings.pocket_min_volume_voxels = 4  # Require more voxels to filter noise
    settings.pocket_occupancy_dilation = 2  # More dilation to connect sparse points
    return PocketService(settings)


@pytest.fixture
def cube_shell_pointcloud(temp_data_dir: Path, sample_project) -> np.ndarray:
    """Create a hollow cube shell point cloud for pocket detection testing.

    This creates a cube with points on all 6 faces, enclosing an empty pocket.
    Uses very dense sampling on a larger cube to ensure the pocket is detectable.
    """
    np.random.seed(42)

    # Generate points on cube faces - need dense sampling for pocket detection
    n_per_face = 500  # Much denser sampling
    points = []

    # Use a 2x2x2 cube (faces at 0 and 2) - larger to have detectable interior
    for face in range(6):
        for _ in range(n_per_face):
            u = np.random.uniform(0, 2)
            v = np.random.uniform(0, 2)

            if face == 0:  # -X face
                points.append([0, u, v])
            elif face == 1:  # +X face
                points.append([2, u, v])
            elif face == 2:  # -Y face
                points.append([u, 0, v])
            elif face == 3:  # +Y face
                points.append([u, 2, v])
            elif face == 4:  # -Z face
                points.append([u, v, 0])
            elif face == 5:  # +Z face
                points.append([u, v, 2])

    xyz = np.array(points, dtype=np.float32)

    # Save to project directory
    pc_dir = temp_data_dir / "projects" / sample_project.id / "pointcloud"
    pc_dir.mkdir(parents=True, exist_ok=True)
    np.savez(pc_dir / "points.npz", xyz=xyz, normals=np.zeros_like(xyz))

    return xyz


@pytest.fixture
def solid_cube_pointcloud(temp_data_dir: Path, sample_project) -> np.ndarray:
    """Create a solid cube point cloud with very dense sampling (no pocket expected).

    Uses dense regular grid to ensure no gaps appear as pockets.
    """
    # Create a dense regular grid
    n_per_axis = 10
    x = np.linspace(0, 1, n_per_axis)
    y = np.linspace(0, 1, n_per_axis)
    z = np.linspace(0, 1, n_per_axis)
    xx, yy, zz = np.meshgrid(x, y, z)
    xyz = np.stack([xx.ravel(), yy.ravel(), zz.ravel()], axis=1).astype(np.float32)

    pc_dir = temp_data_dir / "projects" / sample_project.id / "pointcloud"
    pc_dir.mkdir(parents=True, exist_ok=True)
    np.savez(pc_dir / "points.npz", xyz=xyz, normals=np.zeros_like(xyz))

    return xyz


class TestVoxelResolution:
    """Tests for voxel size computation."""

    def test_compute_voxel_resolution_default(self, pocket_service: PocketService):
        """Should compute voxel size based on target voxels."""
        bounds_low = np.array([0, 0, 0])
        bounds_high = np.array([1, 1, 1])

        voxel_size = pocket_service.compute_voxel_resolution(bounds_low, bounds_high)

        # With target=32 and extent=1, voxel_size should be 1/32
        assert voxel_size == pytest.approx(1 / 32, rel=0.01)

    def test_compute_voxel_resolution_custom_target(self, pocket_service: PocketService):
        """Should use custom target if provided."""
        bounds_low = np.array([0, 0, 0])
        bounds_high = np.array([1, 1, 1])

        voxel_size = pocket_service.compute_voxel_resolution(
            bounds_low, bounds_high, target_voxels=64
        )

        assert voxel_size == pytest.approx(1 / 64, rel=0.01)

    def test_compute_voxel_resolution_non_cubic(self, pocket_service: PocketService):
        """Should use longest axis for voxel size."""
        bounds_low = np.array([0, 0, 0])
        bounds_high = np.array([2, 1, 1])  # X is longest

        voxel_size = pocket_service.compute_voxel_resolution(bounds_low, bounds_high)

        # Longest axis is 2, so voxel_size = 2/32
        assert voxel_size == pytest.approx(2 / 32, rel=0.01)

    def test_compute_voxel_resolution_min_size(self, pocket_service: PocketService):
        """Should enforce minimum voxel size."""
        # Very small bounds
        bounds_low = np.array([0, 0, 0])
        bounds_high = np.array([0.01, 0.01, 0.01])

        voxel_size = pocket_service.compute_voxel_resolution(bounds_low, bounds_high)

        # Should be at least min_voxel_size
        assert voxel_size >= pocket_service.settings.pocket_min_voxel_size


class TestOccupancyGrid:
    """Tests for voxel occupancy grid construction."""

    def test_build_occupancy_grid_marks_occupied(self, pocket_service: PocketService):
        """Points should create OCCUPIED voxels."""
        xyz = np.array([[0.5, 0.5, 0.5]], dtype=np.float32)
        bounds_low = np.array([0, 0, 0])
        bounds_high = np.array([1, 1, 1])
        voxel_size = 0.1

        grid = pocket_service._build_occupancy_grid(
            xyz, bounds_low, bounds_high, voxel_size, dilation=0
        )

        # Should have at least one OCCUPIED voxel
        assert np.any(grid == VoxelState.OCCUPIED)

    def test_build_occupancy_grid_empty_default(self, pocket_service: PocketService):
        """Empty space should be EMPTY voxels."""
        xyz = np.array([[0.5, 0.5, 0.5]], dtype=np.float32)
        bounds_low = np.array([0, 0, 0])
        bounds_high = np.array([1, 1, 1])
        voxel_size = 0.1

        grid = pocket_service._build_occupancy_grid(
            xyz, bounds_low, bounds_high, voxel_size, dilation=0
        )

        # Most voxels should be EMPTY
        empty_count = np.sum(grid == VoxelState.EMPTY)
        total_count = grid.size
        assert empty_count > total_count * 0.9  # At least 90% empty

    def test_build_occupancy_grid_dilation(self, pocket_service: PocketService):
        """Dilation should expand OCCUPIED region."""
        xyz = np.array([[0.5, 0.5, 0.5]], dtype=np.float32)
        bounds_low = np.array([0, 0, 0])
        bounds_high = np.array([1, 1, 1])
        voxel_size = 0.1

        grid_no_dilation = pocket_service._build_occupancy_grid(
            xyz, bounds_low, bounds_high, voxel_size, dilation=0
        )
        grid_with_dilation = pocket_service._build_occupancy_grid(
            xyz, bounds_low, bounds_high, voxel_size, dilation=2
        )

        occupied_no_dilation = np.sum(grid_no_dilation == VoxelState.OCCUPIED)
        occupied_with_dilation = np.sum(grid_with_dilation == VoxelState.OCCUPIED)

        # Dilated should have more occupied voxels
        assert occupied_with_dilation > occupied_no_dilation


class TestFloodFill:
    """Tests for flood-fill outside marking."""

    def test_flood_fill_marks_boundary_connected(self, pocket_service: PocketService):
        """Voxels connected to boundary should be marked OUTSIDE."""
        # Create a small grid with a center point occupied
        grid = np.full((5, 5, 5), VoxelState.EMPTY, dtype=np.uint8)
        grid[2, 2, 2] = VoxelState.OCCUPIED

        result = pocket_service._flood_fill_outside(grid)

        # Boundary voxels should be OUTSIDE
        assert result[0, 0, 0] == VoxelState.OUTSIDE
        assert result[4, 4, 4] == VoxelState.OUTSIDE
        assert result[0, 2, 2] == VoxelState.OUTSIDE

    def test_flood_fill_preserves_occupied(self, pocket_service: PocketService):
        """OCCUPIED voxels should remain OCCUPIED."""
        grid = np.full((5, 5, 5), VoxelState.EMPTY, dtype=np.uint8)
        grid[2, 2, 2] = VoxelState.OCCUPIED

        result = pocket_service._flood_fill_outside(grid)

        assert result[2, 2, 2] == VoxelState.OCCUPIED

    def test_flood_fill_enclosed_pocket(self, pocket_service: PocketService):
        """Enclosed empty space should remain EMPTY (become pocket)."""
        # Create a hollow cube shell
        grid = np.full((5, 5, 5), VoxelState.EMPTY, dtype=np.uint8)

        # Occupy all boundary faces
        grid[0, :, :] = VoxelState.OCCUPIED
        grid[4, :, :] = VoxelState.OCCUPIED
        grid[:, 0, :] = VoxelState.OCCUPIED
        grid[:, 4, :] = VoxelState.OCCUPIED
        grid[:, :, 0] = VoxelState.OCCUPIED
        grid[:, :, 4] = VoxelState.OCCUPIED

        # Center should be EMPTY initially
        assert grid[2, 2, 2] == VoxelState.EMPTY

        result = pocket_service._flood_fill_outside(grid)

        # Center should still be EMPTY (not reachable from boundary)
        assert result[2, 2, 2] == VoxelState.EMPTY


class TestPocketLabeling:
    """Tests for pocket connected component labeling."""

    def test_label_pockets_single(self, pocket_service: PocketService):
        """Single enclosed region should get one label."""
        grid = np.full((5, 5, 5), VoxelState.OUTSIDE, dtype=np.uint8)
        # Single pocket at center
        grid[2, 2, 2] = VoxelState.EMPTY

        labeled, count = pocket_service._label_pockets(grid)

        assert count == 1
        assert labeled[2, 2, 2] == 1

    def test_label_pockets_multiple(self, pocket_service: PocketService):
        """Multiple separated regions should get different labels."""
        grid = np.full((7, 7, 7), VoxelState.OUTSIDE, dtype=np.uint8)
        # Two separate pockets
        grid[1, 1, 1] = VoxelState.EMPTY
        grid[5, 5, 5] = VoxelState.EMPTY

        labeled, count = pocket_service._label_pockets(grid)

        assert count == 2
        assert labeled[1, 1, 1] != labeled[5, 5, 5]

    def test_label_pockets_connected(self, pocket_service: PocketService):
        """Connected empty voxels should get same label."""
        grid = np.full((7, 7, 7), VoxelState.OUTSIDE, dtype=np.uint8)
        # Connected pocket region
        grid[2:5, 2:5, 2:5] = VoxelState.EMPTY

        labeled, count = pocket_service._label_pockets(grid)

        assert count == 1
        # All empty voxels should have label 1
        assert labeled[2, 2, 2] == 1
        assert labeled[4, 4, 4] == 1


class TestPocketInfoExtraction:
    """Tests for extracting pocket metadata."""

    def test_extract_pocket_info(self, pocket_service: PocketService):
        """Should extract correct pocket metadata."""
        labeled = np.zeros((10, 10, 10), dtype=np.int32)
        labeled[2:5, 2:5, 2:5] = 1  # 3x3x3 = 27 voxels

        voxel_size = 0.1
        bounds_low = np.array([0, 0, 0])

        info = pocket_service._extract_pocket_info(labeled, 1, voxel_size, bounds_low)

        assert info.pocket_id == 1
        assert info.voxel_count == 27

        # Volume should be 27 * 0.1^3 = 0.027
        assert info.volume_estimate == pytest.approx(0.027, rel=0.01)

        # Bounds should cover the pocket
        assert info.bounds_low[0] == pytest.approx(0.2, rel=0.01)
        assert info.bounds_high[0] == pytest.approx(0.5, rel=0.01)


class TestAnalyzePockets:
    """Integration tests for full pocket analysis."""

    @pytest.mark.asyncio
    async def test_analyze_pockets_hollow_cube(
        self,
        pocket_service: PocketService,
        sample_project,
        cube_shell_pointcloud: np.ndarray,
    ):
        """Hollow cube should detect interior pocket."""
        analysis = await pocket_service.analyze_pockets(
            sample_project.id, voxel_target=16, recompute=True
        )

        # Should find at least one pocket
        assert len(analysis.pockets) >= 1
        assert analysis.grid_metadata.pocket_count >= 1

    @pytest.mark.asyncio
    async def test_analyze_pockets_solid_no_pockets(
        self,
        pocket_service: PocketService,
        sample_project,
        solid_cube_pointcloud: np.ndarray,
    ):
        """Solid cube should detect no pockets."""
        analysis = await pocket_service.analyze_pockets(
            sample_project.id, voxel_target=16, recompute=True
        )

        # Should find no pockets (all empty space connects to outside)
        assert len(analysis.pockets) == 0

    @pytest.mark.asyncio
    async def test_analyze_pockets_caching(
        self,
        pocket_service: PocketService,
        sample_project,
        cube_shell_pointcloud: np.ndarray,
    ):
        """Results should be cached and reused."""
        # First analysis
        analysis1 = await pocket_service.analyze_pockets(
            sample_project.id, voxel_target=16, recompute=True
        )

        # Second should use cache
        analysis2 = await pocket_service.analyze_pockets(sample_project.id, recompute=False)

        assert analysis1.computed_at == analysis2.computed_at

    @pytest.mark.asyncio
    async def test_analyze_pockets_recompute_ignores_cache(
        self,
        pocket_service: PocketService,
        sample_project,
        cube_shell_pointcloud: np.ndarray,
    ):
        """recompute=True should ignore cache."""
        analysis1 = await pocket_service.analyze_pockets(
            sample_project.id, voxel_target=16, recompute=True
        )

        import time

        time.sleep(0.01)  # Ensure different timestamp

        analysis2 = await pocket_service.analyze_pockets(
            sample_project.id, voxel_target=16, recompute=True
        )

        assert analysis1.computed_at != analysis2.computed_at


class TestConstraintCreation:
    """Tests for creating pocket constraints."""

    @pytest.mark.asyncio
    async def test_create_pocket_constraint(
        self,
        pocket_service: PocketService,
        sample_project,
        cube_shell_pointcloud: np.ndarray,
    ):
        """Should create valid pocket constraint."""
        # First analyze
        analysis = await pocket_service.analyze_pockets(
            sample_project.id, voxel_target=16, recompute=True
        )

        if len(analysis.pockets) == 0:
            pytest.skip("No pockets found in test data")

        pocket_id = analysis.pockets[0].pocket_id

        constraint = pocket_service.create_pocket_constraint(
            sample_project.id, pocket_id, SignConvention.SOLID
        )

        assert constraint.pocket_id == pocket_id
        assert constraint.sign == SignConvention.SOLID
        assert constraint.voxel_count > 0

    @pytest.mark.asyncio
    async def test_create_pocket_constraint_empty_sign(
        self,
        pocket_service: PocketService,
        sample_project,
        cube_shell_pointcloud: np.ndarray,
    ):
        """Should create constraint with EMPTY sign."""
        analysis = await pocket_service.analyze_pockets(
            sample_project.id, voxel_target=16, recompute=True
        )

        if len(analysis.pockets) == 0:
            pytest.skip("No pockets found in test data")

        pocket_id = analysis.pockets[0].pocket_id

        constraint = pocket_service.create_pocket_constraint(
            sample_project.id, pocket_id, SignConvention.EMPTY
        )

        assert constraint.sign == SignConvention.EMPTY

    def test_create_pocket_constraint_no_analysis(
        self, pocket_service: PocketService, sample_project
    ):
        """Should raise error when no analysis exists."""
        with pytest.raises(ValueError, match="No pocket analysis"):
            pocket_service.create_pocket_constraint(sample_project.id, 1, SignConvention.SOLID)

    @pytest.mark.asyncio
    async def test_create_pocket_constraint_invalid_pocket(
        self,
        pocket_service: PocketService,
        sample_project,
        cube_shell_pointcloud: np.ndarray,
    ):
        """Should raise error for non-existent pocket."""
        await pocket_service.analyze_pockets(sample_project.id, voxel_target=16, recompute=True)

        with pytest.raises(ValueError, match="Pocket 9999 not found"):
            pocket_service.create_pocket_constraint(sample_project.id, 9999, SignConvention.SOLID)


class TestCacheManagement:
    """Tests for cache operations."""

    @pytest.mark.asyncio
    async def test_clear_cache(
        self,
        pocket_service: PocketService,
        sample_project,
        cube_shell_pointcloud: np.ndarray,
    ):
        """clear_cache should remove cached analysis."""
        await pocket_service.analyze_pockets(sample_project.id, voxel_target=16, recompute=True)

        # Verify cache exists
        cached = pocket_service.get_cached_analysis(sample_project.id)
        assert cached is not None

        # Clear cache
        pocket_service.clear_cache(sample_project.id)

        # Verify cache is gone
        cached = pocket_service.get_cached_analysis(sample_project.id)
        assert cached is None

    def test_get_cached_analysis_no_cache(self, pocket_service: PocketService, sample_project):
        """Should return None when no cache exists."""
        cached = pocket_service.get_cached_analysis(sample_project.id)
        assert cached is None

    @pytest.mark.asyncio
    async def test_get_pocket_voxels(
        self,
        pocket_service: PocketService,
        sample_project,
        cube_shell_pointcloud: np.ndarray,
    ):
        """Should return voxel coordinates for a pocket."""
        analysis = await pocket_service.analyze_pockets(
            sample_project.id, voxel_target=16, recompute=True
        )

        if len(analysis.pockets) == 0:
            pytest.skip("No pockets found in test data")

        pocket_id = analysis.pockets[0].pocket_id

        voxels = pocket_service.get_pocket_voxels(sample_project.id, pocket_id)

        assert voxels is not None
        assert voxels.shape[1] == 3  # (N, 3)
        assert len(voxels) == analysis.pockets[0].voxel_count
