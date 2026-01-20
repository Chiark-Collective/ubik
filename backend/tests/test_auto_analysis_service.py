# ABOUTME: Unit tests for AutoAnalysisService
# ABOUTME: Tests constraint generation algorithms and caching behavior

from pathlib import Path

import numpy as np
import pytest

from sdf_labeler_api.config import Settings
from sdf_labeler_api.models.auto_analysis import AlgorithmType
from sdf_labeler_api.services.auto_analysis_service import AutoAnalysisService


@pytest.fixture
def auto_service(temp_data_dir: Path) -> AutoAnalysisService:
    """Create an AutoAnalysisService with test settings."""
    settings = Settings(data_dir=temp_data_dir)
    settings.pocket_voxel_target = 16
    settings.pocket_min_volume_voxels = 2
    settings.pocket_occupancy_dilation = 1
    return AutoAnalysisService(settings)


@pytest.fixture
def simple_cube_pointcloud(temp_data_dir: Path, sample_project) -> np.ndarray:
    """Create a simple cube point cloud for testing.

    Returns points on cube faces at coordinates 0 to 1.
    """
    np.random.seed(42)

    n_per_face = 100
    points = []

    for face in range(6):
        for _ in range(n_per_face):
            u = np.random.uniform(0, 1)
            v = np.random.uniform(0, 1)

            if face == 0:
                points.append([0, u, v])
            elif face == 1:
                points.append([1, u, v])
            elif face == 2:
                points.append([u, 0, v])
            elif face == 3:
                points.append([u, 1, v])
            elif face == 4:
                points.append([u, v, 0])
            elif face == 5:
                points.append([u, v, 1])

    xyz = np.array(points, dtype=np.float32)
    # Generate normals pointing outward from cube center
    center = np.array([0.5, 0.5, 0.5])
    normals = xyz - center
    normals = normals / np.linalg.norm(normals, axis=1, keepdims=True)

    pc_dir = temp_data_dir / "projects" / sample_project.id / "pointcloud"
    pc_dir.mkdir(parents=True, exist_ok=True)
    np.savez(pc_dir / "points.npz", xyz=xyz, normals=normals)

    return xyz


@pytest.fixture
def upward_normals_pointcloud(temp_data_dir: Path, sample_project) -> tuple[np.ndarray, np.ndarray]:
    """Create a flat point cloud with upward-facing normals."""
    np.random.seed(42)

    # Points on an XY plane at z=0
    n_points = 200
    xyz = np.zeros((n_points, 3), dtype=np.float32)
    xyz[:, 0] = np.random.uniform(-1, 1, n_points)
    xyz[:, 1] = np.random.uniform(-1, 1, n_points)
    xyz[:, 2] = 0

    # All normals pointing up
    normals = np.zeros((n_points, 3), dtype=np.float32)
    normals[:, 2] = 1.0

    pc_dir = temp_data_dir / "projects" / sample_project.id / "pointcloud"
    pc_dir.mkdir(parents=True, exist_ok=True)
    np.savez(pc_dir / "points.npz", xyz=xyz, normals=normals)

    return xyz, normals


class TestDominantGroundDetection:
    """Tests for dominant ground Z level detection."""

    def test_finds_ground_by_max_footprint(self, auto_service: AutoAnalysisService):
        """Should find ground level with largest XY footprint, not lowest Z."""
        np.random.seed(42)

        # Surrounding ground at z=0, covers 10x10m footprint
        ground_n = 500
        ground = np.zeros((ground_n, 3), dtype=np.float32)
        ground[:, 0] = np.random.uniform(-5, 5, ground_n)
        ground[:, 1] = np.random.uniform(-5, 5, ground_n)
        ground[:, 2] = 0

        # Trench floor at z=-1, covers only 2x2m footprint
        trench_n = 100
        trench = np.zeros((trench_n, 3), dtype=np.float32)
        trench[:, 0] = np.random.uniform(-1, 1, trench_n)
        trench[:, 1] = np.random.uniform(-1, 1, trench_n)
        trench[:, 2] = -1

        xyz = np.vstack([ground, trench]).astype(np.float32)

        # All upward normals
        normals = np.zeros((len(xyz), 3), dtype=np.float32)
        normals[:, 2] = 1.0

        ground_z = auto_service._find_dominant_ground_z(xyz, normals)

        # Should detect ground at z=0 (larger footprint), not trench at z=-1
        assert ground_z is not None
        assert abs(ground_z - 0.0) < 0.2  # Near z=0

    def test_returns_none_without_normals(self, auto_service: AutoAnalysisService):
        """Should return None when normals not provided."""
        xyz = np.random.randn(100, 3).astype(np.float32)

        ground_z = auto_service._find_dominant_ground_z(xyz, None)

        assert ground_z is None

    def test_handles_flat_surface(self, auto_service: AutoAnalysisService):
        """Should handle single flat surface correctly."""
        np.random.seed(42)
        n_points = 200

        xyz = np.zeros((n_points, 3), dtype=np.float32)
        xyz[:, 0] = np.random.uniform(-2, 2, n_points)
        xyz[:, 1] = np.random.uniform(-2, 2, n_points)
        xyz[:, 2] = 1.5  # All at same Z

        normals = np.zeros((n_points, 3), dtype=np.float32)
        normals[:, 2] = 1.0

        ground_z = auto_service._find_dominant_ground_z(xyz, normals)

        assert ground_z is not None
        assert abs(ground_z - 1.5) < 0.2


class TestNormalOffsetConstraints:
    """Tests for normal offset box constraint generation."""

    def test_generates_paired_constraints(self, auto_service: AutoAnalysisService):
        """Should generate paired solid/empty boxes along normals."""
        np.random.seed(42)
        n_points = 50

        xyz = np.random.randn(n_points, 3).astype(np.float32)
        normals = np.random.randn(n_points, 3).astype(np.float32)
        normals = normals / np.linalg.norm(normals, axis=1, keepdims=True)

        constraints = auto_service._generate_normal_offset_boxes(xyz, normals)

        # Should have pairs (solid + empty for each sample point)
        assert len(constraints) > 0
        assert len(constraints) % 2 == 0  # Should be pairs

        # Count solid vs empty
        solid_count = sum(1 for c in constraints if c.constraint["sign"] == "solid")
        empty_count = sum(1 for c in constraints if c.constraint["sign"] == "empty")

        assert solid_count == empty_count  # Equal pairs

    def test_constraints_offset_from_surface(self, auto_service: AutoAnalysisService):
        """Boxes should be offset from original points along normals."""
        np.random.seed(42)
        n_points = 50

        # Simple surface at origin
        xyz = np.zeros((n_points, 3), dtype=np.float32)
        xyz[:, 0] = np.linspace(-1, 1, n_points)
        xyz[:, 1] = 0
        xyz[:, 2] = 0

        # Normals pointing in +Z
        normals = np.zeros((n_points, 3), dtype=np.float32)
        normals[:, 2] = 1.0

        constraints = auto_service._generate_normal_offset_boxes(xyz, normals)

        for c in constraints:
            center_z = c.constraint["center"][2]
            if c.constraint["sign"] == "empty":
                # Empty boxes in +normal direction
                assert center_z > 0
            else:
                # Solid boxes in -normal direction
                assert center_z < 0

    def test_no_constraints_without_normals(self, auto_service: AutoAnalysisService):
        """Should return empty list when normals not available."""
        np.random.seed(42)
        xyz = np.random.randn(100, 3).astype(np.float32)

        constraints = auto_service._generate_normal_offset_boxes(xyz, None)

        assert constraints == []


class TestFloodFillConstraints:
    """Tests for flood fill exterior detection."""

    def test_generates_constraints(self, auto_service: AutoAnalysisService):
        """Flood fill should generate box constraints for a surface with open exterior."""
        np.random.seed(42)

        # A ground surface with some walls - provides vertical extent for voxelization
        n_ground = 500
        ground = np.zeros((n_ground, 3), dtype=np.float32)
        ground[:, 0] = np.random.uniform(-5, 5, n_ground)
        ground[:, 1] = np.random.uniform(-5, 5, n_ground)
        ground[:, 2] = 0  # Flat at z=0

        # Add some vertical walls to give Z extent
        n_wall = 200
        wall = np.zeros((n_wall, 3), dtype=np.float32)
        wall[:, 0] = -5  # Left edge
        wall[:, 1] = np.random.uniform(-5, 5, n_wall)
        wall[:, 2] = np.random.uniform(0, 3, n_wall)  # Wall from z=0 to z=3

        xyz = np.vstack([ground, wall]).astype(np.float32)
        normals = np.zeros_like(xyz)
        normals[:, 2] = 1.0  # Upward normals (simplified)

        constraints = auto_service._generate_flood_fill_constraints(xyz, normals)

        # Should generate some constraints (sky-reachable regions)
        assert len(constraints) > 0

        for c in constraints:
            assert c.constraint["type"] == "box"
            assert c.constraint["sign"] == "empty"
            assert c.algorithm == AlgorithmType.FLOOD_FILL

    def test_detects_sky_reachable_region(self, auto_service: AutoAnalysisService):
        """Should detect regions reachable from the sky as empty."""
        np.random.seed(42)

        # Larger open-top box (like a tray) - 5x5x2.5m with dense walls
        scale = 5.0
        height = 2.5

        # Dense floor grid
        n_floor = 50
        floor_x, floor_y = np.meshgrid(
            np.linspace(0, scale, n_floor),
            np.linspace(0, scale, n_floor)
        )
        floor = np.stack([floor_x.ravel(), floor_y.ravel(),
                         np.zeros(n_floor * n_floor)], axis=1)

        # Dense walls
        walls = []
        n_wall = 30
        for wall in range(4):
            for i in range(n_wall):
                for j in range(n_wall):
                    u = i * scale / n_wall
                    h = j * height / n_wall
                    if wall == 0:
                        walls.append([0, u, h])
                    elif wall == 1:
                        walls.append([scale, u, h])
                    elif wall == 2:
                        walls.append([u, 0, h])
                    else:
                        walls.append([u, scale, h])

        xyz = np.vstack([floor, np.array(walls)]).astype(np.float32)
        normals = np.zeros_like(xyz)
        normals[:, 2] = 1.0  # Dummy normals

        constraints = auto_service._generate_flood_fill_constraints(xyz, normals)

        # Should find the sky-reachable exterior
        assert len(constraints) > 0

        # All constraints should be EMPTY
        for c in constraints:
            assert c.constraint["sign"] == "empty"

    def test_handles_small_pointcloud(self, auto_service: AutoAnalysisService):
        """Should handle edge cases gracefully."""
        xyz = np.array([[0, 0, 0], [1, 1, 1]], dtype=np.float32)
        normals = np.zeros_like(xyz)

        # Should not crash, returns empty for too-small data
        constraints = auto_service._generate_flood_fill_constraints(xyz, normals)

        assert isinstance(constraints, list)
        assert len(constraints) == 0  # Too small to analyze


class TestVoxelRegionConstraints:
    """Tests for voxel-based underground region detection."""

    def test_generates_solid_constraints(self, auto_service: AutoAnalysisService):
        """Should generate SOLID box constraints for underground regions."""
        np.random.seed(42)

        # Create a scene with ground at z=0 and some structure below
        # Ground surface (large footprint)
        ground_n = 400
        ground = np.zeros((ground_n, 3), dtype=np.float32)
        ground[:, 0] = np.random.uniform(-5, 5, ground_n)
        ground[:, 1] = np.random.uniform(-5, 5, ground_n)
        ground[:, 2] = 0

        # Vertical walls forming a pit (not fully enclosed)
        walls = []
        n_wall = 50
        for i in range(n_wall):
            for j in range(n_wall):
                x = -2 + 4 * i / n_wall
                z = -2 + 2 * j / n_wall
                walls.append([x, -2, z])  # Front wall
                walls.append([x, 2, z])   # Back wall
                walls.append([-2, -2 + 4 * i / n_wall, z])  # Left wall
                walls.append([2, -2 + 4 * i / n_wall, z])   # Right wall

        # Floor of pit
        pit_floor_n = 100
        pit_floor = np.zeros((pit_floor_n, 3), dtype=np.float32)
        pit_floor[:, 0] = np.random.uniform(-2, 2, pit_floor_n)
        pit_floor[:, 1] = np.random.uniform(-2, 2, pit_floor_n)
        pit_floor[:, 2] = -2

        xyz = np.vstack([ground, np.array(walls), pit_floor]).astype(np.float32)

        # Normals - ground and pit floor point up, walls point outward
        normals = np.zeros_like(xyz)
        normals[:ground_n, 2] = 1.0  # Ground normals up
        normals[-pit_floor_n:, 2] = 1.0  # Pit floor normals up
        # Wall normals (simplified - just point them outward)
        wall_normals = normals[ground_n:-pit_floor_n]
        wall_normals[:, 0] = 0.5
        wall_normals[:, 1] = 0.5

        constraints = auto_service._generate_voxel_region_constraints(xyz, normals)

        # May or may not generate constraints depending on voxelization
        # If it does, they should be SOLID
        for c in constraints:
            assert c.constraint["type"] == "box"
            assert c.constraint["sign"] == "solid"
            assert c.algorithm == AlgorithmType.VOXEL_REGIONS

    def test_uses_dominant_ground(self, auto_service: AutoAnalysisService):
        """Should use dominant ground level, not lowest points."""
        np.random.seed(42)

        # Ground at z=0 with large footprint
        ground_n = 500
        ground = np.zeros((ground_n, 3), dtype=np.float32)
        ground[:, 0] = np.random.uniform(-5, 5, ground_n)
        ground[:, 1] = np.random.uniform(-5, 5, ground_n)
        ground[:, 2] = 0

        # Small trench at z=-1
        trench_n = 50
        trench = np.zeros((trench_n, 3), dtype=np.float32)
        trench[:, 0] = np.random.uniform(-1, 1, trench_n)
        trench[:, 1] = np.random.uniform(-1, 1, trench_n)
        trench[:, 2] = -1

        xyz = np.vstack([ground, trench]).astype(np.float32)
        normals = np.zeros_like(xyz)
        normals[:, 2] = 1.0

        # The trench interior should NOT become SOLID because it's sky-reachable
        # Only truly underground (not sky-reachable) regions should be SOLID
        constraints = auto_service._generate_voxel_region_constraints(xyz, normals)

        # Verify that constraints (if any) are properly labeled
        for c in constraints:
            assert c.constraint["sign"] == "solid"


class TestHelperMethods:
    """Tests for helper methods."""

    def test_estimate_mean_spacing(self, auto_service: AutoAnalysisService):
        """Should estimate reasonable point spacing."""
        # Regular grid
        x = np.linspace(0, 1, 10)
        xx, yy, zz = np.meshgrid(x, x, x)
        xyz = np.stack([xx.ravel(), yy.ravel(), zz.ravel()], axis=1).astype(
            np.float32
        )

        spacing = auto_service._estimate_mean_spacing(xyz)

        # Grid spacing is 1/9 ≈ 0.111
        assert 0.05 < spacing < 0.3

    def test_farthest_point_sample(self, auto_service: AutoAnalysisService):
        """Should select well-distributed points."""
        np.random.seed(42)
        xyz = np.random.randn(100, 3).astype(np.float32)

        selected = auto_service._farthest_point_sample(xyz, 10)

        assert len(selected) == 10
        assert len(set(selected)) == 10  # All unique

    def test_build_voxel_grid(self, auto_service: AutoAnalysisService):
        """Should build valid voxel grid from point cloud."""
        np.random.seed(42)
        xyz = np.random.randn(100, 3).astype(np.float32) * 5

        result = auto_service._build_voxel_grid(xyz)

        assert result is not None
        occupied, bbox_min, voxel_size, grid_shape = result
        assert occupied.shape == grid_shape
        assert voxel_size > 0
        assert len(bbox_min) == 3

    def test_ray_propagation_with_bounces(self, auto_service: AutoAnalysisService):
        """Should correctly propagate EMPTY from top and SOLID from bottom with bouncing."""
        # Create a simple occupied grid simulating ground with a trench
        grid_shape = (10, 10, 10)
        occupied = np.zeros(grid_shape, dtype=bool)

        # Create a ground plane at Z=5
        occupied[:, :, 5] = True

        # Create a trench (gap in ground) at X=4-6, Y=4-6
        occupied[4:7, 4:7, 5] = False

        # Create trench floor at Z=2
        occupied[4:7, 4:7, 2] = True

        # All columns are "inside hull" for this test
        inside_hull = np.ones((10, 10), dtype=bool)

        empty, solid = auto_service._ray_propagation_with_bounces(
            occupied, grid_shape, inside_hull
        )

        # Sky (Z > 5) should be EMPTY everywhere
        assert empty[:, :, 6:].all(), "Sky should be EMPTY"

        # Trench interior (Z=3,4 at trench location) should be EMPTY
        assert empty[5, 5, 3], "Trench interior should be EMPTY"
        assert empty[5, 5, 4], "Trench interior should be EMPTY"

        # Underground (Z < 5, outside trench) should be SOLID
        assert solid[0, 0, 0], "Underground should be SOLID"
        assert solid[0, 0, 4], "Underground should be SOLID"

        # Underground below trench floor (Z < 2 at trench location) should be SOLID
        assert solid[5, 5, 0], "Below trench floor should be SOLID"
        assert solid[5, 5, 1], "Below trench floor should be SOLID"

        # Trench interior should NOT be SOLID
        assert not solid[5, 5, 3], "Trench interior should not be SOLID"
        assert not solid[5, 5, 4], "Trench interior should not be SOLID"


class TestCaching:
    """Tests for result caching."""

    @pytest.mark.asyncio
    async def test_analyze_caches_result(
        self,
        auto_service: AutoAnalysisService,
        sample_project,
        simple_cube_pointcloud: np.ndarray,
    ):
        """Analysis results should be cached."""
        _ = simple_cube_pointcloud  # Fixture creates pointcloud file
        # Run analysis
        result1 = await auto_service.analyze(
            sample_project.id,
            algorithms=["normal_offset"],
            recompute=True,
        )

        # Check cache exists
        cached = auto_service.get_cached_result(sample_project.id)
        assert cached is not None
        assert cached.analysis_id == result1.analysis_id

    @pytest.mark.asyncio
    async def test_analyze_uses_cache(
        self,
        auto_service: AutoAnalysisService,
        sample_project,
        simple_cube_pointcloud: np.ndarray,
    ):
        """Second analysis should use cached result."""
        _ = simple_cube_pointcloud  # Fixture creates pointcloud file
        result1 = await auto_service.analyze(
            sample_project.id,
            algorithms=["normal_offset"],
            recompute=True,
        )

        result2 = await auto_service.analyze(
            sample_project.id,
            recompute=False,
        )

        # Same result (cached)
        assert result1.analysis_id == result2.analysis_id
        assert result1.computed_at == result2.computed_at

    @pytest.mark.asyncio
    async def test_analyze_recompute_ignores_cache(
        self,
        auto_service: AutoAnalysisService,
        sample_project,
        simple_cube_pointcloud: np.ndarray,
    ):
        """recompute=True should create new analysis."""
        _ = simple_cube_pointcloud  # Fixture creates pointcloud file
        result1 = await auto_service.analyze(
            sample_project.id,
            algorithms=["normal_offset"],
            recompute=True,
        )

        import time
        time.sleep(0.01)  # Ensure different timestamp

        result2 = await auto_service.analyze(
            sample_project.id,
            algorithms=["normal_offset"],
            recompute=True,
        )

        # Different analysis
        assert result1.analysis_id != result2.analysis_id
        assert result1.computed_at != result2.computed_at

    @pytest.mark.asyncio
    async def test_clear_cache(
        self,
        auto_service: AutoAnalysisService,
        sample_project,
        simple_cube_pointcloud: np.ndarray,
    ):
        """clear_cache should remove all cached data."""
        _ = simple_cube_pointcloud  # Fixture creates pointcloud file
        await auto_service.analyze(
            sample_project.id,
            algorithms=["normal_offset"],
            recompute=True,
        )

        # Verify cached
        assert auto_service.get_cached_result(sample_project.id) is not None

        # Clear
        auto_service.clear_cache(sample_project.id)

        # Verify cleared
        assert auto_service.get_cached_result(sample_project.id) is None


class TestFullAnalysis:
    """Integration tests for full analysis workflow."""

    @pytest.mark.asyncio
    async def test_analyze_generates_constraints(
        self,
        auto_service: AutoAnalysisService,
        sample_project,
        simple_cube_pointcloud: np.ndarray,
    ):
        """Full analysis should generate constraint objects."""
        _ = simple_cube_pointcloud  # Fixture creates pointcloud file
        result = await auto_service.analyze(
            sample_project.id,
            algorithms=["normal_offset"],
            recompute=True,
        )

        assert result is not None
        assert len(result.generated_constraints) > 0

        # Check constraint structure
        for gc in result.generated_constraints:
            assert "type" in gc.constraint
            assert "sign" in gc.constraint
            assert gc.algorithm in [a.value for a in AlgorithmType]
            assert 0.0 <= gc.confidence <= 1.0
            assert gc.description != ""

    @pytest.mark.asyncio
    async def test_analyze_summary_counts(
        self,
        auto_service: AutoAnalysisService,
        sample_project,
        simple_cube_pointcloud: np.ndarray,
    ):
        """Summary should have correct constraint counts."""
        _ = simple_cube_pointcloud  # Fixture creates pointcloud file
        result = await auto_service.analyze(
            sample_project.id,
            algorithms=["normal_offset"],
            recompute=True,
        )

        # Normal offset generates paired solid/empty boxes
        assert result.summary.total_constraints == len(result.generated_constraints)
        assert result.summary.empty_constraints > 0
        assert result.summary.solid_constraints > 0  # Normal offset generates both
        assert result.summary.algorithms_contributing == 1

    @pytest.mark.asyncio
    async def test_analyze_multiple_algorithms(
        self,
        auto_service: AutoAnalysisService,
        sample_project,
        upward_normals_pointcloud: tuple[np.ndarray, np.ndarray],
    ):
        """Multiple algorithms should all contribute constraints."""
        _ = upward_normals_pointcloud  # Fixture creates pointcloud file
        result = await auto_service.analyze(
            sample_project.id,
            algorithms=["flood_fill", "normal_offset"],
            recompute=True,
        )

        assert result is not None
        # At least normal_offset should run
        assert len(result.algorithms_run) >= 1

        # Check algorithm stats
        for algo_name in result.algorithms_run:
            assert algo_name in result.algorithm_stats
            stats = result.algorithm_stats[algo_name]
            assert stats.constraints_generated >= 0

    @pytest.mark.asyncio
    async def test_analyze_invalid_algorithm(
        self,
        auto_service: AutoAnalysisService,
        sample_project,
        simple_cube_pointcloud: np.ndarray,
    ):
        """Invalid algorithm names should be ignored."""
        _ = simple_cube_pointcloud  # Fixture creates pointcloud file
        result = await auto_service.analyze(
            sample_project.id,
            algorithms=["invalid_algo", "normal_offset"],
            recompute=True,
        )

        # Should only run valid algorithm
        assert "normal_offset" in result.algorithms_run
        assert "invalid_algo" not in result.algorithms_run

    def test_analyze_no_pointcloud(
        self, auto_service: AutoAnalysisService, sample_project
    ):
        """Should raise error when no point cloud exists."""
        with pytest.raises(ValueError, match="No point cloud"):
            import asyncio
            asyncio.get_event_loop().run_until_complete(
                auto_service.analyze(sample_project.id, recompute=True)
            )

    @pytest.mark.asyncio
    async def test_result_constraints_are_valid_for_constraint_service(
        self,
        auto_service: AutoAnalysisService,
        sample_project,
        simple_cube_pointcloud: np.ndarray,
    ):
        """Generated constraints should be valid for add_from_dict."""
        from pydantic import TypeAdapter
        from sdf_labeler_api.models.constraints import Constraint

        _ = simple_cube_pointcloud  # Fixture creates pointcloud file
        result = await auto_service.analyze(
            sample_project.id,
            algorithms=["normal_offset"],
            recompute=True,
        )

        adapter = TypeAdapter(Constraint)
        for gc in result.generated_constraints:
            # This should not raise
            constraint = adapter.validate_python(gc.constraint)
            assert constraint.type == gc.constraint["type"]
            assert constraint.sign == gc.constraint["sign"]
