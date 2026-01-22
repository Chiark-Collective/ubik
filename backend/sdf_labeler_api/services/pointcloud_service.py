# ABOUTME: Point cloud processing service
# ABOUTME: Handles upload, octree building, and tile streaming

import uuid
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import UploadFile

from sdf_labeler_api.config import Settings
from sdf_labeler_api.models.point_cloud import (
    OctreeMetadata,
    OctreeNodeInfo,
    PointCloudStats,
    PointCloudUploadResponse,
    TileData,
)


class PointCloudService:
    """Service for point cloud loading, processing, and streaming."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.data_dir = settings.data_dir

    async def upload_and_process(
        self,
        project_id: str,
        file: UploadFile,
        estimate_normals: bool = True,
        normal_k: int = 16,
    ) -> PointCloudUploadResponse:
        """Upload and process a point cloud file."""
        # Detect format from filename
        filename = file.filename or "unknown"
        suffix = Path(filename).suffix.lower()
        format_name = self._detect_format(suffix)

        # Read file content
        content = await file.read()

        # Parse point cloud based on format
        xyz, normals = self._load_points(content, format_name)

        # Estimate normals if needed
        if normals is None and estimate_normals:
            normals = self._estimate_normals(xyz, k=normal_k)

        # Compute bounds
        bounds_low = tuple(xyz.min(axis=0).tolist())
        bounds_high = tuple(xyz.max(axis=0).tolist())

        # Generate point cloud ID
        pc_id = str(uuid.uuid4())

        # Save raw point cloud
        pc_dir = self._pointcloud_dir(project_id)
        pc_dir.mkdir(parents=True, exist_ok=True)

        np.savez_compressed(
            pc_dir / "points.npz",
            xyz=xyz,
            normals=normals if normals is not None else np.array([]),
        )

        # Build octree for LOD streaming
        self._build_octree(project_id, xyz, normals)

        return PointCloudUploadResponse(
            id=pc_id,
            filename=filename,
            point_count=len(xyz),
            has_normals=normals is not None,
            bounds_low=bounds_low,
            bounds_high=bounds_high,
            format=format_name,
        )

    def get_stats(self, project_id: str) -> PointCloudStats | None:
        """Get statistics for a loaded point cloud."""
        pc_dir = self._pointcloud_dir(project_id)
        points_path = pc_dir / "points.npz"

        if not points_path.exists():
            return None

        data = np.load(points_path)
        xyz = data["xyz"]
        normals = data["normals"]
        has_normals = normals.size > 0

        bounds_low = tuple(xyz.min(axis=0).tolist())
        bounds_high = tuple(xyz.max(axis=0).tolist())
        centroid = tuple(xyz.mean(axis=0).tolist())

        # Estimate density
        volume = np.prod(np.array(bounds_high) - np.array(bounds_low))
        density = len(xyz) / max(volume, 1e-10)

        # Load octree metadata
        metadata = self.get_octree_metadata(project_id)
        octree_depth = metadata.max_depth if metadata else 0
        node_count = metadata.node_count if metadata else 0
        lod_levels = octree_depth + 1

        return PointCloudStats(
            point_count=len(xyz),
            has_normals=has_normals,
            bounds_low=bounds_low,
            bounds_high=bounds_high,
            centroid=centroid,
            estimated_density=density,
            octree_depth=octree_depth,
            octree_node_count=node_count,
            lod_levels=lod_levels,
        )

    def get_tile(
        self, project_id: str, level: int, x: int, y: int, z: int
    ) -> dict[str, Any] | None:
        """Get point data for a specific octree tile."""
        node_id = self._coords_to_node_id(level, x, y, z)
        tile_path = self._pointcloud_dir(project_id) / "tiles" / f"{node_id}.npz"

        if not tile_path.exists():
            return None

        data = np.load(tile_path)
        positions = data["positions"].flatten().tolist()
        normals = data["normals"].flatten().tolist() if "normals" in data else None
        labels = data["labels"].tolist() if "labels" in data else None

        return {
            "node_id": node_id,
            "point_count": len(positions) // 3,
            "positions": positions,
            "normals": normals,
            "labels": labels,
        }

    def get_octree_metadata(self, project_id: str) -> OctreeMetadata | None:
        """Get octree metadata for LOD streaming."""
        metadata_path = self._pointcloud_dir(project_id) / "octree_metadata.json"

        if not metadata_path.exists():
            return None

        import json

        with open(metadata_path) as f:
            data = json.load(f)

        return OctreeMetadata(**data)

    def _pointcloud_dir(self, project_id: str) -> Path:
        """Get directory for point cloud data."""
        return self.data_dir / "projects" / project_id / "pointcloud"

    def _detect_format(self, suffix: str) -> str:
        """Detect point cloud format from file extension."""
        formats = {
            ".ply": "ply",
            ".las": "las",
            ".laz": "laz",
            ".csv": "csv",
            ".txt": "csv",
            ".npy": "npy",
            ".npz": "npz",
            ".parquet": "parquet",
        }
        return formats.get(suffix, "unknown")

    def _load_points(
        self, content: bytes, format_name: str
    ) -> tuple[np.ndarray, np.ndarray | None]:
        """Load points from file content."""
        import io

        if format_name == "ply":
            import trimesh

            mesh = trimesh.load(io.BytesIO(content), file_type="ply")
            if hasattr(mesh, "vertices"):
                xyz = np.asarray(mesh.vertices)
                # Check for vertex normals
                normals = None
                if hasattr(mesh, "vertex_normals") and mesh.vertex_normals is not None:
                    normals = np.asarray(mesh.vertex_normals)
                return xyz, normals
            raise ValueError("PLY file does not contain vertices")

        elif format_name in ("las", "laz"):
            import laspy

            las = laspy.read(io.BytesIO(content))
            xyz = np.column_stack([las.x, las.y, las.z])
            # Check for normals in LAS attributes
            normals = None
            if hasattr(las, "NormalX") and hasattr(las, "NormalY") and hasattr(las, "NormalZ"):
                normals = np.column_stack([las.NormalX, las.NormalY, las.NormalZ])
            return xyz, normals

        elif format_name == "csv":
            import pandas as pd

            df = pd.read_csv(io.BytesIO(content))
            # Assume x, y, z columns
            xyz = df[["x", "y", "z"]].values
            normals = None
            if all(c in df.columns for c in ["nx", "ny", "nz"]):
                normals = df[["nx", "ny", "nz"]].values
            return xyz, normals

        elif format_name == "npy":
            arr = np.load(io.BytesIO(content))
            if arr.shape[1] >= 6:
                return arr[:, :3], arr[:, 3:6]
            return arr[:, :3], None

        elif format_name == "npz":
            data = np.load(io.BytesIO(content))
            xyz = data["points"] if "points" in data else data["xyz"]
            normals = data.get("normals")
            return xyz, normals

        elif format_name == "parquet":
            import pandas as pd

            df = pd.read_parquet(io.BytesIO(content))
            xyz = df[["x", "y", "z"]].values
            normals = None
            if all(c in df.columns for c in ["nx", "ny", "nz"]):
                normals = df[["nx", "ny", "nz"]].values
            return xyz, normals

        else:
            raise ValueError(f"Unsupported format: {format_name}")

    def _estimate_normals(self, xyz: np.ndarray, k: int = 16) -> np.ndarray:
        """Estimate normals using PCA on k-nearest neighbors."""
        from scipy.spatial import cKDTree

        tree = cKDTree(xyz)
        normals = np.zeros_like(xyz)

        for i in range(len(xyz)):
            # Find k nearest neighbors
            _, indices = tree.query(xyz[i], k=k)
            neighbors = xyz[indices]

            # PCA to find normal
            centered = neighbors - neighbors.mean(axis=0)
            cov = centered.T @ centered
            _, _, vh = np.linalg.svd(cov)
            normal = vh[-1]  # Smallest eigenvector

            # Consistent orientation (pointing "up" on average)
            if normal[2] < 0:
                normal = -normal

            normals[i] = normal

        return normals

    def _build_octree(self, project_id: str, xyz: np.ndarray, normals: np.ndarray | None) -> None:
        """Build octree for LOD streaming."""
        import json

        pc_dir = self._pointcloud_dir(project_id)
        tiles_dir = pc_dir / "tiles"
        tiles_dir.mkdir(parents=True, exist_ok=True)

        bounds_low = xyz.min(axis=0)
        bounds_high = xyz.max(axis=0)

        # Target points per node
        target_points = self.settings.octree_node_target
        max_depth = self.settings.octree_max_depth

        # Build octree recursively
        nodes: dict[str, OctreeNodeInfo] = {}
        self._build_octree_recursive(
            node_id="r",
            xyz=xyz,
            normals=normals,
            indices=np.arange(len(xyz)),
            bounds_low=bounds_low,
            bounds_high=bounds_high,
            level=0,
            target_points=target_points,
            max_depth=max_depth,
            tiles_dir=tiles_dir,
            nodes=nodes,
        )

        # Save metadata
        metadata = OctreeMetadata(
            root_id="r",
            bounds_low=tuple(bounds_low.tolist()),
            bounds_high=tuple(bounds_high.tolist()),
            total_points=len(xyz),
            max_depth=max(n.level for n in nodes.values()) if nodes else 0,
            node_count=len(nodes),
            nodes=nodes,
        )

        with open(pc_dir / "octree_metadata.json", "w") as f:
            json.dump(metadata.model_dump(), f, indent=2)

    def _build_octree_recursive(
        self,
        node_id: str,
        xyz: np.ndarray,
        normals: np.ndarray | None,
        indices: np.ndarray,
        bounds_low: np.ndarray,
        bounds_high: np.ndarray,
        level: int,
        target_points: int,
        max_depth: int,
        tiles_dir: Path,
        nodes: dict[str, OctreeNodeInfo],
    ) -> None:
        """Recursively build octree nodes."""
        point_count = len(indices)

        # Create node info
        node_info = OctreeNodeInfo(
            node_id=node_id,
            level=level,
            bounds_low=tuple(bounds_low.tolist()),
            bounds_high=tuple(bounds_high.tolist()),
            point_count=point_count,
            children=[],
        )

        # Save tile data (subsample for non-leaf nodes)
        if point_count > 0:
            if point_count <= target_points or level >= max_depth:
                # Leaf node: save all points
                tile_indices = indices
            else:
                # Non-leaf: save subsample
                subsample_count = min(target_points // 2, point_count)
                tile_indices = np.random.choice(indices, subsample_count, replace=False)

            tile_xyz = xyz[tile_indices]
            tile_data = {"positions": tile_xyz.astype(np.float32)}
            if normals is not None:
                tile_data["normals"] = normals[tile_indices].astype(np.float32)

            np.savez_compressed(tiles_dir / f"{node_id}.npz", **tile_data)

        # Check if we should subdivide
        if point_count > target_points and level < max_depth:
            center = (bounds_low + bounds_high) / 2

            for octant in range(8):
                # Compute child bounds
                child_low = bounds_low.copy()
                child_high = bounds_high.copy()

                if octant & 1:
                    child_low[0] = center[0]
                else:
                    child_high[0] = center[0]

                if octant & 2:
                    child_low[1] = center[1]
                else:
                    child_high[1] = center[1]

                if octant & 4:
                    child_low[2] = center[2]
                else:
                    child_high[2] = center[2]

                # Filter points in this octant
                mask = (
                    (xyz[indices, 0] >= child_low[0])
                    & (xyz[indices, 0] < child_high[0])
                    & (xyz[indices, 1] >= child_low[1])
                    & (xyz[indices, 1] < child_high[1])
                    & (xyz[indices, 2] >= child_low[2])
                    & (xyz[indices, 2] < child_high[2])
                )
                child_indices = indices[mask]

                if len(child_indices) > 0:
                    child_id = f"{node_id}{octant}"
                    node_info.children.append(child_id)

                    self._build_octree_recursive(
                        node_id=child_id,
                        xyz=xyz,
                        normals=normals,
                        indices=child_indices,
                        bounds_low=child_low,
                        bounds_high=child_high,
                        level=level + 1,
                        target_points=target_points,
                        max_depth=max_depth,
                        tiles_dir=tiles_dir,
                        nodes=nodes,
                    )

        nodes[node_id] = node_info

    def _coords_to_node_id(self, level: int, x: int, y: int, z: int) -> str:
        """Convert tile coordinates to node ID."""
        if level == 0:
            return "r"

        node_id = "r"
        for l in range(level):
            # Compute octant at this level
            shift = level - l - 1
            octant = ((x >> shift) & 1) | (((y >> shift) & 1) << 1) | (((z >> shift) & 1) << 2)
            node_id += str(octant)

        return node_id

    async def store_dataframe(
        self,
        project_id: str,
        df: "pd.DataFrame",
        source_name: str = "dataframe",
        mesh: "trimesh.Trimesh | None" = None,
        estimate_normals: bool = True,
        normal_k: int = 16,
    ) -> PointCloudUploadResponse:
        """Store a point cloud from a pandas DataFrame.

        This is used by scenario loaders to store pre-loaded point clouds.

        Args:
            project_id: Project to store point cloud in
            df: DataFrame with columns x, y, z (and optionally nx, ny, nz)
            source_name: Name to record as the source
            mesh: Optional mesh to store alongside point cloud
            estimate_normals: Whether to estimate normals if not present
            normal_k: Number of neighbors for normal estimation

        Returns:
            PointCloudUploadResponse with point cloud metadata
        """
        import pandas as pd
        import trimesh

        # Extract coordinates
        xyz = df[["x", "y", "z"]].values.astype(np.float64)

        # Extract or estimate normals
        normals = None
        if all(c in df.columns for c in ["nx", "ny", "nz"]):
            normals = df[["nx", "ny", "nz"]].values.astype(np.float64)
        elif estimate_normals:
            normals = self._estimate_normals(xyz, k=normal_k)

        # Compute bounds
        bounds_low = tuple(xyz.min(axis=0).tolist())
        bounds_high = tuple(xyz.max(axis=0).tolist())

        # Generate point cloud ID
        pc_id = str(uuid.uuid4())

        # Save raw point cloud
        pc_dir = self._pointcloud_dir(project_id)
        pc_dir.mkdir(parents=True, exist_ok=True)

        np.savez_compressed(
            pc_dir / "points.npz",
            xyz=xyz,
            normals=normals if normals is not None else np.array([]),
        )

        # Save mesh if provided
        if mesh is not None:
            mesh.export(pc_dir / "mesh.obj")

        # Build octree for LOD streaming
        self._build_octree(project_id, xyz, normals)

        return PointCloudUploadResponse(
            id=pc_id,
            filename=source_name,
            point_count=len(xyz),
            has_normals=normals is not None,
            bounds_low=bounds_low,
            bounds_high=bounds_high,
            format="dataframe",
        )
