# ABOUTME: Unit tests for PointCloudService
# ABOUTME: Tests point cloud loading, octree building, and tile streaming

import io
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import numpy as np
import pytest

from sdf_labeler_api.config import Settings
from sdf_labeler_api.services.pointcloud_service import PointCloudService


@pytest.fixture
def pointcloud_service(temp_data_dir: Path) -> PointCloudService:
    """Create a PointCloudService with temporary storage."""
    settings = Settings()
    settings.data_dir = temp_data_dir
    return PointCloudService(settings)


class TestFormatDetection:
    """Tests for file format detection."""

    def test_detect_ply_format(self, pointcloud_service: PointCloudService):
        """Test detecting PLY format."""
        assert pointcloud_service._detect_format(".ply") == "ply"
        assert pointcloud_service._detect_format(".PLY") == "unknown"  # Case sensitive

    def test_detect_las_formats(self, pointcloud_service: PointCloudService):
        """Test detecting LAS/LAZ formats."""
        assert pointcloud_service._detect_format(".las") == "las"
        assert pointcloud_service._detect_format(".laz") == "laz"

    def test_detect_csv_formats(self, pointcloud_service: PointCloudService):
        """Test detecting CSV/TXT formats."""
        assert pointcloud_service._detect_format(".csv") == "csv"
        assert pointcloud_service._detect_format(".txt") == "csv"

    def test_detect_numpy_formats(self, pointcloud_service: PointCloudService):
        """Test detecting NPY/NPZ formats."""
        assert pointcloud_service._detect_format(".npy") == "npy"
        assert pointcloud_service._detect_format(".npz") == "npz"

    def test_detect_parquet_format(self, pointcloud_service: PointCloudService):
        """Test detecting Parquet format."""
        assert pointcloud_service._detect_format(".parquet") == "parquet"

    def test_detect_unknown_format(self, pointcloud_service: PointCloudService):
        """Test unknown format returns 'unknown'."""
        assert pointcloud_service._detect_format(".xyz") == "unknown"
        assert pointcloud_service._detect_format(".obj") == "unknown"
        assert pointcloud_service._detect_format("") == "unknown"


class TestCoordsToNodeId:
    """Tests for coordinate to node ID conversion."""

    def test_root_node(self, pointcloud_service: PointCloudService):
        """Test level 0 always returns root."""
        assert pointcloud_service._coords_to_node_id(0, 0, 0, 0) == "r"
        assert pointcloud_service._coords_to_node_id(0, 1, 1, 1) == "r"

    def test_level_1_nodes(self, pointcloud_service: PointCloudService):
        """Test level 1 node IDs (8 octants)."""
        # Octant ordering: x + 2*y + 4*z
        assert pointcloud_service._coords_to_node_id(1, 0, 0, 0) == "r0"
        assert pointcloud_service._coords_to_node_id(1, 1, 0, 0) == "r1"
        assert pointcloud_service._coords_to_node_id(1, 0, 1, 0) == "r2"
        assert pointcloud_service._coords_to_node_id(1, 1, 1, 0) == "r3"
        assert pointcloud_service._coords_to_node_id(1, 0, 0, 1) == "r4"
        assert pointcloud_service._coords_to_node_id(1, 1, 0, 1) == "r5"
        assert pointcloud_service._coords_to_node_id(1, 0, 1, 1) == "r6"
        assert pointcloud_service._coords_to_node_id(1, 1, 1, 1) == "r7"

    def test_level_2_nodes(self, pointcloud_service: PointCloudService):
        """Test level 2 node IDs."""
        # Origin octant subdivision
        assert pointcloud_service._coords_to_node_id(2, 0, 0, 0) == "r00"
        assert pointcloud_service._coords_to_node_id(2, 1, 0, 0) == "r01"
        # Far corner subdivision
        assert pointcloud_service._coords_to_node_id(2, 3, 3, 3) == "r77"


class TestLoadPoints:
    """Tests for loading points from different formats."""

    def test_load_csv_xyz_only(self, pointcloud_service: PointCloudService):
        """Test loading CSV with xyz columns only."""
        csv_content = b"x,y,z\n1.0,2.0,3.0\n4.0,5.0,6.0\n7.0,8.0,9.0"
        xyz, normals = pointcloud_service._load_points(csv_content, "csv")

        assert xyz.shape == (3, 3)
        assert normals is None
        np.testing.assert_array_almost_equal(xyz[0], [1.0, 2.0, 3.0])
        np.testing.assert_array_almost_equal(xyz[2], [7.0, 8.0, 9.0])

    def test_load_csv_with_normals(self, pointcloud_service: PointCloudService):
        """Test loading CSV with xyz and normal columns."""
        csv_content = b"x,y,z,nx,ny,nz\n1.0,2.0,3.0,0.0,0.0,1.0\n4.0,5.0,6.0,0.0,1.0,0.0"
        xyz, normals = pointcloud_service._load_points(csv_content, "csv")

        assert xyz.shape == (2, 3)
        assert normals.shape == (2, 3)
        np.testing.assert_array_almost_equal(normals[0], [0.0, 0.0, 1.0])

    def test_load_npz_with_xyz_key(self, pointcloud_service: PointCloudService):
        """Test loading NPZ file with 'xyz' key."""
        xyz_data = np.array([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])
        buffer = io.BytesIO()
        np.savez(buffer, xyz=xyz_data)
        buffer.seek(0)

        xyz, normals = pointcloud_service._load_points(buffer.read(), "npz")

        assert xyz.shape == (2, 3)
        assert normals is None
        np.testing.assert_array_almost_equal(xyz, xyz_data)

    def test_load_npz_with_points_key(self, pointcloud_service: PointCloudService):
        """Test loading NPZ file with 'points' key."""
        points_data = np.array([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])
        buffer = io.BytesIO()
        np.savez(buffer, points=points_data)
        buffer.seek(0)

        xyz, normals = pointcloud_service._load_points(buffer.read(), "npz")

        assert xyz.shape == (2, 3)
        np.testing.assert_array_almost_equal(xyz, points_data)

    def test_load_npz_with_normals(self, pointcloud_service: PointCloudService):
        """Test loading NPZ file with normals."""
        xyz_data = np.array([[1.0, 2.0, 3.0]])
        normals_data = np.array([[0.0, 0.0, 1.0]])
        buffer = io.BytesIO()
        np.savez(buffer, xyz=xyz_data, normals=normals_data)
        buffer.seek(0)

        xyz, normals = pointcloud_service._load_points(buffer.read(), "npz")

        assert xyz.shape == (1, 3)
        assert normals.shape == (1, 3)
        np.testing.assert_array_almost_equal(normals, normals_data)

    def test_load_npy_xyz_only(self, pointcloud_service: PointCloudService):
        """Test loading NPY file with xyz only."""
        arr = np.array([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])
        buffer = io.BytesIO()
        np.save(buffer, arr)
        buffer.seek(0)

        xyz, normals = pointcloud_service._load_points(buffer.read(), "npy")

        assert xyz.shape == (2, 3)
        assert normals is None

    def test_load_npy_with_normals(self, pointcloud_service: PointCloudService):
        """Test loading NPY file with xyz + normals (6 columns)."""
        arr = np.array([[1.0, 2.0, 3.0, 0.0, 0.0, 1.0], [4.0, 5.0, 6.0, 0.0, 1.0, 0.0]])
        buffer = io.BytesIO()
        np.save(buffer, arr)
        buffer.seek(0)

        xyz, normals = pointcloud_service._load_points(buffer.read(), "npy")

        assert xyz.shape == (2, 3)
        assert normals.shape == (2, 3)
        np.testing.assert_array_almost_equal(xyz[0], [1.0, 2.0, 3.0])
        np.testing.assert_array_almost_equal(normals[0], [0.0, 0.0, 1.0])

    def test_load_unsupported_format(self, pointcloud_service: PointCloudService):
        """Test loading unsupported format raises error."""
        with pytest.raises(ValueError, match="Unsupported format"):
            pointcloud_service._load_points(b"data", "unknown")


class TestEstimateNormals:
    """Tests for normal estimation."""

    def test_estimate_normals_planar_points(self, pointcloud_service: PointCloudService):
        """Test normal estimation on a planar set of points."""
        # Points on the XY plane (z=0)
        rng = np.random.default_rng(42)
        n_points = 100
        xyz = np.column_stack(
            [
                rng.uniform(0, 1, n_points),
                rng.uniform(0, 1, n_points),
                np.zeros(n_points),
            ]
        )

        normals = pointcloud_service._estimate_normals(xyz, k=16)

        assert normals.shape == (n_points, 3)
        # All normals should point in z direction (or -z, then flipped to +z)
        for normal in normals:
            assert abs(normal[2]) > 0.9  # Should be mostly in z direction

    def test_estimate_normals_returns_unit_vectors(self, pointcloud_service: PointCloudService):
        """Test that estimated normals are unit vectors."""
        rng = np.random.default_rng(42)
        xyz = rng.uniform(0, 1, (50, 3))

        normals = pointcloud_service._estimate_normals(xyz, k=10)

        # Check all normals are unit length
        lengths = np.linalg.norm(normals, axis=1)
        np.testing.assert_array_almost_equal(lengths, np.ones(50), decimal=5)


class TestOctreeOperations:
    """Tests for octree building and querying."""

    def test_build_and_get_metadata(
        self, pointcloud_service: PointCloudService, temp_data_dir: Path
    ):
        """Test building an octree and retrieving metadata."""
        project_id = "test-project"
        rng = np.random.default_rng(42)
        xyz = rng.uniform(0, 1, (500, 3)).astype(np.float32)

        # Build octree
        pointcloud_service._build_octree(project_id, xyz, normals=None)

        # Get metadata
        metadata = pointcloud_service.get_octree_metadata(project_id)

        assert metadata is not None
        assert metadata.root_id == "r"
        assert metadata.total_points == 500
        assert metadata.node_count > 0
        assert len(metadata.nodes) == metadata.node_count
        assert "r" in metadata.nodes

    def test_build_octree_with_normals(
        self, pointcloud_service: PointCloudService, temp_data_dir: Path
    ):
        """Test building an octree with normals included."""
        project_id = "test-project"
        rng = np.random.default_rng(42)
        xyz = rng.uniform(0, 1, (100, 3)).astype(np.float32)
        normals = rng.standard_normal((100, 3)).astype(np.float32)
        normals /= np.linalg.norm(normals, axis=1, keepdims=True)

        # Build octree
        pointcloud_service._build_octree(project_id, xyz, normals=normals)

        # Get root tile
        tile = pointcloud_service.get_tile(project_id, 0, 0, 0, 0)

        assert tile is not None
        assert tile["normals"] is not None
        assert len(tile["normals"]) > 0

    def test_get_tile_root(self, pointcloud_service: PointCloudService, temp_data_dir: Path):
        """Test getting root tile data."""
        project_id = "test-project"
        rng = np.random.default_rng(42)
        xyz = rng.uniform(0, 1, (100, 3)).astype(np.float32)

        # Build octree
        pointcloud_service._build_octree(project_id, xyz, normals=None)

        # Get root tile
        tile = pointcloud_service.get_tile(project_id, 0, 0, 0, 0)

        assert tile is not None
        assert tile["node_id"] == "r"
        assert tile["point_count"] > 0
        assert len(tile["positions"]) == tile["point_count"] * 3

    def test_get_tile_nonexistent(self, pointcloud_service: PointCloudService):
        """Test getting a nonexistent tile returns None."""
        tile = pointcloud_service.get_tile("nonexistent-project", 0, 0, 0, 0)
        assert tile is None

    def test_get_metadata_nonexistent(self, pointcloud_service: PointCloudService):
        """Test getting metadata for nonexistent project returns None."""
        metadata = pointcloud_service.get_octree_metadata("nonexistent-project")
        assert metadata is None


class TestGetStats:
    """Tests for point cloud statistics."""

    def test_get_stats_with_normals(
        self, pointcloud_service: PointCloudService, temp_data_dir: Path
    ):
        """Test getting stats for point cloud with normals."""
        project_id = "test-project"

        # Create point cloud directory and save data
        pc_dir = temp_data_dir / "projects" / project_id / "pointcloud"
        pc_dir.mkdir(parents=True)

        rng = np.random.default_rng(42)
        xyz = rng.uniform(0, 1, (100, 3)).astype(np.float32)
        normals = rng.standard_normal((100, 3)).astype(np.float32)
        normals /= np.linalg.norm(normals, axis=1, keepdims=True)

        np.savez(pc_dir / "points.npz", xyz=xyz, normals=normals)

        # Build octree for complete stats
        pointcloud_service._build_octree(project_id, xyz, normals)

        stats = pointcloud_service.get_stats(project_id)

        assert stats is not None
        assert stats.point_count == 100
        assert stats.has_normals is True
        assert len(stats.bounds_low) == 3
        assert len(stats.bounds_high) == 3
        assert len(stats.centroid) == 3
        assert stats.estimated_density > 0
        assert stats.octree_depth >= 0
        assert stats.lod_levels >= 1

    def test_get_stats_without_normals(
        self, pointcloud_service: PointCloudService, temp_data_dir: Path
    ):
        """Test getting stats for point cloud without normals."""
        project_id = "test-project"

        pc_dir = temp_data_dir / "projects" / project_id / "pointcloud"
        pc_dir.mkdir(parents=True)

        xyz = np.array([[0, 0, 0], [1, 1, 1]], dtype=np.float32)
        np.savez(pc_dir / "points.npz", xyz=xyz, normals=np.array([]))

        stats = pointcloud_service.get_stats(project_id)

        assert stats is not None
        assert stats.point_count == 2
        assert stats.has_normals is False

    def test_get_stats_nonexistent(self, pointcloud_service: PointCloudService):
        """Test getting stats for nonexistent project returns None."""
        stats = pointcloud_service.get_stats("nonexistent-project")
        assert stats is None


class TestUploadAndProcess:
    """Tests for the full upload workflow."""

    @pytest.mark.asyncio
    async def test_upload_csv_file(
        self, pointcloud_service: PointCloudService, temp_data_dir: Path
    ):
        """Test uploading a CSV point cloud file."""
        csv_content = b"x,y,z\n0.0,0.0,0.0\n1.0,0.0,0.0\n0.0,1.0,0.0\n0.0,0.0,1.0"

        # Create mock UploadFile
        mock_file = MagicMock()
        mock_file.filename = "test_points.csv"
        mock_file.read = AsyncMock(return_value=csv_content)

        result = await pointcloud_service.upload_and_process(
            project_id="test-project",
            file=mock_file,
            estimate_normals=True,
            normal_k=3,  # Small k for 4 points
        )

        assert result.filename == "test_points.csv"
        assert result.point_count == 4
        assert result.has_normals is True  # Normals were estimated
        assert result.format == "csv"
        assert len(result.bounds_low) == 3
        assert len(result.bounds_high) == 3

    @pytest.mark.asyncio
    async def test_upload_npz_with_normals(
        self, pointcloud_service: PointCloudService, temp_data_dir: Path
    ):
        """Test uploading NPZ file that already has normals."""
        xyz = np.array([[0, 0, 0], [1, 1, 1]], dtype=np.float32)
        normals = np.array([[0, 0, 1], [0, 0, 1]], dtype=np.float32)

        buffer = io.BytesIO()
        np.savez(buffer, xyz=xyz, normals=normals)
        buffer.seek(0)
        content = buffer.read()

        mock_file = MagicMock()
        mock_file.filename = "test_points.npz"
        mock_file.read = AsyncMock(return_value=content)

        result = await pointcloud_service.upload_and_process(
            project_id="test-project",
            file=mock_file,
            estimate_normals=False,  # Don't estimate, use existing
        )

        assert result.point_count == 2
        assert result.has_normals is True
        assert result.format == "npz"

    @pytest.mark.asyncio
    async def test_upload_creates_octree(
        self, pointcloud_service: PointCloudService, temp_data_dir: Path
    ):
        """Test that upload creates octree metadata."""
        csv_content = b"x,y,z\n" + b"\n".join(
            f"{i * 0.01},{i * 0.01},{i * 0.01}".encode() for i in range(100)
        )

        mock_file = MagicMock()
        mock_file.filename = "test.csv"
        mock_file.read = AsyncMock(return_value=csv_content)

        await pointcloud_service.upload_and_process(
            project_id="test-project",
            file=mock_file,
            estimate_normals=True,
            normal_k=10,
        )

        # Verify octree was created
        metadata = pointcloud_service.get_octree_metadata("test-project")
        assert metadata is not None
        assert metadata.total_points == 100

    @pytest.mark.asyncio
    async def test_upload_without_normal_estimation(
        self, pointcloud_service: PointCloudService, temp_data_dir: Path
    ):
        """Test upload without normal estimation."""
        xyz = np.array([[0, 0, 0], [1, 1, 1]], dtype=np.float32)

        buffer = io.BytesIO()
        np.savez(buffer, xyz=xyz)  # No normals
        buffer.seek(0)
        content = buffer.read()

        mock_file = MagicMock()
        mock_file.filename = "test.npz"
        mock_file.read = AsyncMock(return_value=content)

        result = await pointcloud_service.upload_and_process(
            project_id="test-project",
            file=mock_file,
            estimate_normals=False,
        )

        assert result.has_normals is False
