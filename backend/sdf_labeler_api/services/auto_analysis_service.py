# ABOUTME: Auto-analysis service for constraint-based SDF region detection
# ABOUTME: Generates spatial constraints (boxes, halfspaces, pockets) from point cloud analysis

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from scipy.ndimage import binary_dilation
from scipy.spatial import ConvexHull, Delaunay, KDTree

from sdf_labeler_api.config import Settings
from sdf_labeler_api.models.auto_analysis import (
    ALL_ALGORITHMS,
    AlgorithmStats,
    AlgorithmType,
    AnalysisSummary,
    AutoAnalysisResult,
    GeneratedConstraint,
)
from sdf_labeler_api.models.constraints import SignConvention
from sdf_labeler_api.services.pocket_service import PocketService


class AutoAnalysisService:
    """Service for automatic SDF region detection using ray propagation.

    Generates spatial constraints (boxes) that define SOLID (underground) and
    EMPTY (sky-reachable) regions for outdoor scenes with trenches and pipes.

    ## Algorithm Overview

    The core algorithm uses a voxel grid with ray propagation and flood fill:

    1. **Voxelization**: Point cloud → 3D boolean grid (max 200³)
       - Voxel size = min(mean_spacing * 1.5, min_gap_size / 3)
       - Adapts to both point density AND minimum gap requirements
       - Grid extends +Z for sky space, +5 voxels in -Z for underground

    2. **Surface Dilation**: 3x3x3 binary dilation creates flood-fill barriers
       - Prevents EMPTY/SOLID from bleeding through thin surfaces

    3. **EMPTY Detection** (sky-reachable air):
       - Cast rays from +Z (sky) downward in a 15° cone (9 directions)
       - Rays stop when hitting dilated surface voxels
       - Flood-fill from ray seeds to reach all connected air
       - This correctly fills trench interiors (open to sky)

    4. **SOLID Detection** (underground):
       - Cast rays from -Z (underground) upward in a 15° cone
       - Only within 2D convex hull of point cloud XY extent
       - Flood-fill from seeds, but NEVER overwrite EMPTY (EMPTY wins)
       - This fills underground while avoiding trench interiors

    5. **Box Generation**: Per-Z-slice greedy 2D meshing
       - Each Z-slice decomposed into axis-aligned rectangles
       - Vertically adjacent rectangles with same XY extent merged
       - Results in fewer, larger box constraints

    ## Key Parameters

    - `voxel_size`: min(mean_spacing * 1.5, min_gap_size / 3)
    - `min_gap_size`: 0.10m default - smallest gap flood fill should traverse
    - `max_dim`: 200 (caps grid at 200³ = 8M voxels for memory/speed)
    - `cone_angle`: 15° (allows rays to reach under pipes/overhangs)
    - `dilation`: 3x3x3 structure, 1 iteration (blocks thin gaps)

    ## Scene Model

    Designed for outdoor scenes where:
    - +Z = sky (source of EMPTY)
    - -Z = underground (source of SOLID)
    - Surface separates air from ground
    - Trenches are open to sky (EMPTY reaches in)
    - Pipes may occlude direct rays (cone angle helps)
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self.data_dir = settings.data_dir
        self.pocket_service = PocketService(settings)

    def _project_dir(self, project_id: str) -> Path:
        """Get project directory path."""
        return self.data_dir / "projects" / project_id

    def _pointcloud_dir(self, project_id: str) -> Path:
        """Get point cloud directory path."""
        return self._project_dir(project_id) / "pointcloud"

    def _auto_dir(self, project_id: str) -> Path:
        """Get auto-analysis cache directory path."""
        auto_dir = self._project_dir(project_id) / "auto"
        auto_dir.mkdir(parents=True, exist_ok=True)
        return auto_dir

    def _load_points(self, project_id: str) -> tuple[np.ndarray, np.ndarray | None]:
        """Load point cloud positions and normals."""
        points_path = self._pointcloud_dir(project_id) / "points.npz"
        if not points_path.exists():
            raise ValueError(f"No point cloud for project {project_id}")

        data = np.load(points_path)
        xyz = data["xyz"]
        normals = data["normals"] if "normals" in data and data["normals"].size > 0 else None
        return xyz, normals

    async def analyze(
        self,
        project_id: str,
        algorithms: list[str] | None = None,
        recompute: bool = False,
    ) -> AutoAnalysisResult:
        """Run analysis algorithms and generate constraints.

        Args:
            project_id: Project identifier
            algorithms: List of algorithms to run (default: all)
            recompute: Force recomputation even if cached

        Returns:
            Analysis result with generated constraints
        """
        # Check cache first
        if not recompute:
            cached = self.get_cached_result(project_id)
            if cached is not None:
                return cached

        # Load point cloud
        xyz, normals = self._load_points(project_id)

        # Determine which algorithms to run
        algo_list = algorithms if algorithms else [a.value for a in ALL_ALGORITHMS]
        algo_list = [a for a in algo_list if a in [alg.value for alg in ALL_ALGORITHMS]]

        # Run algorithms and collect constraints
        all_constraints: list[GeneratedConstraint] = []
        algorithm_stats: dict[str, AlgorithmStats] = {}
        algorithms_run: list[str] = []

        for algo_name in algo_list:
            constraints = self._run_algorithm(algo_name, xyz, normals, project_id)
            if constraints:
                all_constraints.extend(constraints)
                algorithms_run.append(algo_name)
                algorithm_stats[algo_name] = AlgorithmStats(
                    constraints_generated=len(constraints),
                    coverage_description=self._get_algorithm_description(algo_name, len(constraints)),
                )

        # Compute summary
        summary = self._compute_summary(all_constraints, len(algorithm_stats))

        # Create result
        analysis_id = str(uuid.uuid4())
        result = AutoAnalysisResult(
            analysis_id=analysis_id,
            computed_at=datetime.now(UTC),
            algorithms_run=algorithms_run,
            summary=summary,
            algorithm_stats=algorithm_stats,
            generated_constraints=all_constraints,
        )

        # Save results
        self._save_results(project_id, result)

        return result

    def _run_algorithm(
        self,
        name: str,
        xyz: np.ndarray,
        normals: np.ndarray | None,
        project_id: str,
    ) -> list[GeneratedConstraint]:
        """Run a single analysis algorithm."""
        if name == AlgorithmType.POCKET.value:
            return self._generate_pocket_constraints(project_id)
        elif name == AlgorithmType.NORMAL_OFFSET.value:
            return self._generate_normal_offset_boxes(xyz, normals)
        elif name == AlgorithmType.FLOOD_FILL.value:
            return self._generate_flood_fill_constraints(xyz, normals)
        elif name == AlgorithmType.VOXEL_REGIONS.value:
            return self._generate_voxel_region_constraints(xyz, normals)
        return []

    def _generate_pocket_constraints(self, project_id: str) -> list[GeneratedConstraint]:
        """Generate PocketConstraints from detected cavities.

        Pockets (disconnected empty voxels) indicate interior cavities
        that should be marked as SOLID.
        """
        constraints: list[GeneratedConstraint] = []

        # Get or compute pocket analysis
        analysis = self.pocket_service.get_cached_analysis(project_id)
        if analysis is None:
            return constraints

        for pocket in analysis.pockets:
            # Create pocket constraint marked as SOLID
            pocket_constraint = {
                "type": "pocket",
                "sign": SignConvention.SOLID.value,
                "pocket_id": pocket.pocket_id,
                "voxel_count": pocket.voxel_count,
                "centroid": pocket.centroid,
                "bounds_low": pocket.bounds_low,
                "bounds_high": pocket.bounds_high,
                "volume_estimate": pocket.volume_estimate,
            }

            constraints.append(GeneratedConstraint(
                constraint=pocket_constraint,
                algorithm=AlgorithmType.POCKET,
                confidence=0.95,  # Pockets are highly reliable
                description=f"Interior cavity at ({pocket.centroid[0]:.2f}, {pocket.centroid[1]:.2f}, {pocket.centroid[2]:.2f}), {pocket.voxel_count} voxels",
            ))

        return constraints

    def _generate_normal_offset_boxes(
        self, xyz: np.ndarray, normals: np.ndarray | None, n_pairs: int = 40
    ) -> list[GeneratedConstraint]:
        """Generate paired SOLID/EMPTY boxes offset along surface normals.

        For a surface point with normal N:
        - Box offset in +N direction (outward) → EMPTY
        - Box offset in -N direction (inward) → SOLID

        This provides complementary constraints where the surface is well-defined.
        """
        constraints: list[GeneratedConstraint] = []

        if normals is None or len(normals) != len(xyz):
            return constraints

        # Sample representative points with good normal coverage
        tree = KDTree(xyz)
        mean_spacing = self._estimate_mean_spacing(xyz, tree)

        # Select points that are well-distributed (farthest point sampling)
        sample_indices = self._farthest_point_sample(xyz, n_pairs)
        # Larger offset and box sizes for better coverage
        offset_distance = mean_spacing * 3
        box_size = mean_spacing * 2.5

        for idx in sample_indices:
            point = xyz[idx]
            normal = normals[idx]
            normal_norm = np.linalg.norm(normal)

            if normal_norm < 0.1:
                continue

            normal = normal / normal_norm

            # Create EMPTY box in +normal direction (outward)
            empty_center = point + normal * offset_distance
            box_constraint_empty = {
                "type": "box",
                "sign": SignConvention.EMPTY.value,
                "center": tuple(empty_center.tolist()),
                "half_extents": (box_size, box_size, box_size),
            }

            constraints.append(GeneratedConstraint(
                constraint=box_constraint_empty,
                algorithm=AlgorithmType.NORMAL_OFFSET,
                confidence=0.75,
                description=f"Exterior offset from surface at ({point[0]:.2f}, {point[1]:.2f}, {point[2]:.2f})",
            ))

            # Create SOLID box in -normal direction (inward)
            solid_center = point - normal * offset_distance
            box_constraint_solid = {
                "type": "box",
                "sign": SignConvention.SOLID.value,
                "center": tuple(solid_center.tolist()),
                "half_extents": (box_size, box_size, box_size),
            }

            constraints.append(GeneratedConstraint(
                constraint=box_constraint_solid,
                algorithm=AlgorithmType.NORMAL_OFFSET,
                confidence=0.75,
                description=f"Interior offset from surface at ({point[0]:.2f}, {point[1]:.2f}, {point[2]:.2f})",
            ))

        return constraints

    def _find_dominant_ground_z(
        self, xyz: np.ndarray, normals: np.ndarray | None
    ) -> float | None:
        """Find dominant ground Z by maximum XY footprint of horizontal surfaces.

        For outdoor scenes with trenches/hollows, the surrounding ground covers
        a larger XY area than trench floors. We find the Z level with the largest
        horizontal footprint, which gives us the true "ground" level.

        Returns:
            Z coordinate of dominant ground level, or None if not detectable.
        """
        if normals is None or len(normals) != len(xyz):
            return None

        # Filter to upward-facing points (horizontal surfaces)
        up_vector = np.array([0, 0, 1])
        dot_products = np.dot(normals, up_vector)
        upward_mask = dot_products > 0.7
        upward_pts = xyz[upward_mask]

        if len(upward_pts) < 20:
            return None

        z_values = upward_pts[:, 2]
        z_min, z_max = z_values.min(), z_values.max()
        z_range = z_max - z_min

        if z_range < 0.01:
            # All at same level - that's the ground
            return float(z_values.mean())

        # Bin by Z level
        n_bins = min(20, max(5, int(z_range / 0.1)))  # ~10cm bins
        z_bins = np.linspace(z_min, z_max, n_bins + 1)

        # For each bin, compute XY convex hull area
        best_z, best_area = None, 0.0

        for i in range(len(z_bins) - 1):
            # Include upper edge for last bin
            if i == len(z_bins) - 2:
                bin_mask = (z_values >= z_bins[i]) & (z_values <= z_bins[i + 1])
            else:
                bin_mask = (z_values >= z_bins[i]) & (z_values < z_bins[i + 1])
            if bin_mask.sum() < 10:
                continue

            pts_2d = upward_pts[bin_mask, :2]  # XY coordinates only

            try:
                hull = ConvexHull(pts_2d)
                # In 2D, hull.volume is actually the area
                if hull.volume > best_area:
                    best_area = hull.volume
                    best_z = (z_bins[i] + z_bins[i + 1]) / 2
            except Exception:
                # ConvexHull can fail for degenerate point sets
                pass

        return best_z

    # Default minimum gap size (meters) - gaps smaller than this may be blocked
    MIN_GAP_SIZE_DEFAULT = 0.10  # 10cm, typical pipe clearance

    def _build_voxel_grid(
        self,
        xyz: np.ndarray,
        voxel_size: float | None = None,
        z_extension: float | None = None,
        min_gap_size: float | None = None,
    ) -> tuple[np.ndarray, np.ndarray, float, tuple[int, int, int]] | None:
        """Build a voxel grid from point cloud data.

        Args:
            xyz: Point cloud coordinates
            voxel_size: Optional voxel size (auto-computed if None)
            z_extension: How much to extend the grid above the point cloud in +Z.
                         For outdoor scenes, this creates "sky" space above ground.
                         If None, defaults to 50% of scene Z range (min 5 voxels).
            min_gap_size: Minimum physical gap (meters) that flood fill should pass through.
                          Voxel size is constrained to ensure gaps this size span ≥3 voxels.
                          Default: 0.10m (10cm).

        Returns:
            Tuple of (occupied grid, bbox_min, voxel_size, grid_shape) or None if invalid.
        """
        if len(xyz) < 10:
            return None

        if min_gap_size is None:
            min_gap_size = self.MIN_GAP_SIZE_DEFAULT

        # Determine voxel size based on point cloud density
        tree = KDTree(xyz)
        mean_spacing = self._estimate_mean_spacing(xyz, tree)

        if voxel_size is None:
            # Voxel size based on point density, but constrained by min_gap_size
            # Gap must span ≥3 voxels for flood fill to pass (1 voxel dilation each side)
            density_based = mean_spacing * 1.5
            gap_based = min_gap_size / 3.0
            voxel_size = min(density_based, gap_based)

        # Ensure voxel_size is a valid float
        voxel_size_float: float = float(voxel_size)
        if voxel_size_float <= 0 or not np.isfinite(voxel_size_float):
            return None

        # Use validated float for all operations
        voxel_size = voxel_size_float

        # Compute bounding box with padding
        bbox_min = xyz.min(axis=0) - voxel_size
        bbox_max = xyz.max(axis=0) + voxel_size

        # Extend in +Z direction for sky space (outdoor scenes)
        # and a small amount in -Z for underground SOLID regions
        if z_extension is None:
            z_range = xyz[:, 2].max() - xyz[:, 2].min()
            z_extension = max(z_range * 0.5, voxel_size * 5)  # At least 5 voxels worth
        bbox_max[2] += z_extension
        bbox_min[2] -= voxel_size * 5  # Small extension for underground (5 voxels)
        bbox_size = bbox_max - bbox_min

        if np.any(bbox_size <= 0) or not np.all(np.isfinite(bbox_size)):
            return None

        grid_shape = np.ceil(bbox_size / voxel_size).astype(int)

        if np.any(grid_shape <= 0):
            return None

        # Cap grid size for performance (200³ = 8M voxels, reasonable for modern hardware)
        max_dim = 200
        vs: float = voxel_size  # Local float variable for type safety
        if grid_shape.max() > max_dim:
            scale = float(max_dim / grid_shape.max())
            vs = vs / scale
            grid_shape = np.ceil(bbox_size / vs).astype(int)
            grid_shape = np.minimum(grid_shape, max_dim)

        # Mark occupied voxels
        point_voxel_indices = ((xyz - bbox_min) / vs).astype(int)
        point_voxel_indices = np.clip(point_voxel_indices, 0, grid_shape - 1)

        occupied = np.zeros(tuple(grid_shape), dtype=bool)
        for idx in point_voxel_indices:
            occupied[tuple(idx)] = True

        # Dilate to ensure surface blocks flood fill
        structure = np.ones((3, 3, 3), dtype=bool)
        occupied = binary_dilation(occupied, structure, iterations=1)

        # Convert grid_shape to proper tuple type
        shape_tuple: tuple[int, int, int] = (int(grid_shape[0]), int(grid_shape[1]), int(grid_shape[2]))
        return occupied, bbox_min, vs, shape_tuple

    def _compute_hull_mask(
        self, xyz: np.ndarray, bbox_min: np.ndarray, voxel_size: float, grid_shape: tuple[int, int, int]
    ) -> np.ndarray:
        """Compute a 2D mask of which XY voxel positions are inside the convex hull.

        Returns:
            2D boolean array (nx, ny) where True = inside the XY convex hull of points.
        """
        nx, ny, _nz = grid_shape

        # Compute 2D convex hull of XY coordinates
        xy_points = xyz[:, :2]

        try:
            hull = ConvexHull(xy_points)
            # Create Delaunay triangulation for fast point-in-hull testing
            hull_delaunay = Delaunay(xy_points[hull.vertices])
        except Exception:
            # If hull computation fails, assume all voxels are inside
            return np.ones((nx, ny), dtype=bool)

        # Test each voxel center
        inside_hull = np.zeros((nx, ny), dtype=bool)
        for ix in range(nx):
            for iy in range(ny):
                # Voxel center in world coordinates
                world_x = bbox_min[0] + (ix + 0.5) * voxel_size
                world_y = bbox_min[1] + (iy + 0.5) * voxel_size
                # Test if inside hull
                inside_hull[ix, iy] = hull_delaunay.find_simplex([world_x, world_y]) >= 0

        return inside_hull

    def _ray_propagation_with_bounces(
        self,
        occupied: np.ndarray,
        grid_shape: tuple[int, int, int],
        inside_hull: np.ndarray,
        cone_angle_degrees: float = 15.0,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Propagate EMPTY/SOLID using ray model with cone angles and flood fill.

        Physical model:
        1. EMPTY rays shine from +Z (sky) in a cone, then flood-fill from seeds
        2. SOLID rays shine from -Z (underground) in a cone, then flood-fill
        3. EMPTY has priority - SOLID flood-fill never overwrites EMPTY

        The cone angle allows rays to reach under overhangs and pipes that
        would shadow areas from straight-down rays.

        Args:
            cone_angle_degrees: Half-angle of the cone (0 = straight only, 15 = typical)

        Returns:
            Tuple of (empty_mask, solid_mask) boolean arrays.
        """
        nx, ny, nz = grid_shape
        empty = np.zeros(grid_shape, dtype=bool)
        solid = np.zeros(grid_shape, dtype=bool)

        # Phase 1: Rays from multiple angles within cone
        tan_angle = np.tan(np.radians(cone_angle_degrees))
        diag = tan_angle * 0.707  # For 45° diagonal directions

        # 9 directions: straight + 4 cardinal + 4 diagonal
        ray_tilts = [
            (0.0, 0.0),          # straight
            (tan_angle, 0.0),    # +X
            (-tan_angle, 0.0),   # -X
            (0.0, tan_angle),    # +Y
            (0.0, -tan_angle),   # -Y
            (diag, diag),        # +X+Y
            (diag, -diag),       # +X-Y
            (-diag, diag),       # -X+Y
            (-diag, -diag),      # -X-Y
        ]

        # EMPTY rays from sky (top-down with cone)
        for dx_rate, dy_rate in ray_tilts:
            for start_ix in range(nx):
                for start_iy in range(ny):
                    fx, fy = float(start_ix), float(start_iy)
                    for iz in range(nz - 1, -1, -1):
                        ix, iy = int(round(fx)), int(round(fy))
                        if ix < 0 or ix >= nx or iy < 0 or iy >= ny:
                            break  # Ray exited grid
                        if occupied[ix, iy, iz]:
                            break  # Hit surface
                        empty[ix, iy, iz] = True
                        fx += dx_rate
                        fy += dy_rate

        # SOLID rays from underground (bottom-up with cone), only inside hull
        for dx_rate, dy_rate in ray_tilts:
            for start_ix in range(nx):
                for start_iy in range(ny):
                    if not inside_hull[start_ix, start_iy]:
                        continue
                    fx, fy = float(start_ix), float(start_iy)
                    for iz in range(nz):
                        ix, iy = int(round(fx)), int(round(fy))
                        if ix < 0 or ix >= nx or iy < 0 or iy >= ny:
                            break
                        if occupied[ix, iy, iz]:
                            break
                        if not empty[ix, iy, iz]:
                            solid[ix, iy, iz] = True
                        fx += dx_rate
                        fy += dy_rate

        # Phase 2: Full flood fill from seeds
        # EMPTY flood fills from initial EMPTY voxels (any connected air = EMPTY)
        # SOLID flood fills from initial SOLID voxels (any connected underground = SOLID)
        # Both are blocked by occupied voxels (surface)
        directions = [
            (1, 0, 0), (-1, 0, 0),
            (0, 1, 0), (0, -1, 0),
            (0, 0, 1), (0, 0, -1),
        ]

        # Flood fill EMPTY (all air connected to sky becomes EMPTY)
        empty_stack = [tuple(coord) for coord in np.argwhere(empty)]
        while empty_stack:
            ix, iy, iz = empty_stack.pop()
            for dx, dy, dz in directions:
                nx_, ny_, nz_ = ix + dx, iy + dy, iz + dz
                if 0 <= nx_ < nx and 0 <= ny_ < ny and 0 <= nz_ < nz:
                    if not occupied[nx_, ny_, nz_] and not empty[nx_, ny_, nz_]:
                        empty[nx_, ny_, nz_] = True
                        empty_stack.append((nx_, ny_, nz_))

        # Flood fill SOLID (all underground connected to bottom becomes SOLID)
        # But don't overwrite EMPTY
        solid_stack = [tuple(coord) for coord in np.argwhere(solid)]
        while solid_stack:
            ix, iy, iz = solid_stack.pop()
            for dx, dy, dz in directions:
                nx_, ny_, nz_ = ix + dx, iy + dy, iz + dz
                if 0 <= nx_ < nx and 0 <= ny_ < ny and 0 <= nz_ < nz:
                    if (not occupied[nx_, ny_, nz_] and
                        not empty[nx_, ny_, nz_] and
                        not solid[nx_, ny_, nz_]):
                        solid[nx_, ny_, nz_] = True
                        solid_stack.append((nx_, ny_, nz_))

        return empty, solid

    def _greedy_2d_mesh(self, mask_2d: np.ndarray) -> list[tuple[int, int, int, int]]:
        """Decompose a 2D boolean mask into axis-aligned rectangles.

        Uses a greedy algorithm: find the first True voxel, expand as far as
        possible in X, then in Y, record the rectangle, clear those voxels,
        repeat.

        Returns:
            List of (x_min, x_max, y_min, y_max) rectangles (exclusive max).
        """
        mask = mask_2d.copy()
        boxes: list[tuple[int, int, int, int]] = []

        while mask.any():
            # Find first True voxel (scanning in row-major order)
            coords = np.argwhere(mask)
            if len(coords) == 0:
                break
            x, y = coords[0]

            # Expand in X direction while staying True
            x_max = x
            while x_max + 1 < mask.shape[0] and mask[x_max + 1, y]:
                x_max += 1

            # Expand in Y direction, maintaining the full X range
            y_max = y
            while y_max + 1 < mask.shape[1]:
                # Check if entire X range is True at y_max + 1
                if mask[x : x_max + 1, y_max + 1].all():
                    y_max += 1
                else:
                    break

            # Record box (exclusive max indices)
            boxes.append((x, x_max + 1, y, y_max + 1))

            # Clear the voxels we just covered
            mask[x : x_max + 1, y : y_max + 1] = False

        return boxes

    def _generate_flood_fill_constraints(
        self, xyz: np.ndarray, _normals: np.ndarray | None
    ) -> list[GeneratedConstraint]:
        """Generate EMPTY box constraints using ray propagation with bouncing.

        Uses the ray model:
        1. EMPTY rays shine down from +Z (sky)
        2. Rays bounce to fill occluded areas (trenches, overhangs)
        3. Per-Z-slice greedy meshing creates boxes that follow the EMPTY shape

        This correctly handles trenches: rays enter from above and bounce
        to fill the interior, creating EMPTY boxes that extend into the trench.
        """
        constraints: list[GeneratedConstraint] = []

        grid_result = self._build_voxel_grid(xyz)
        if grid_result is None:
            return constraints

        occupied, bbox_min, voxel_size, grid_shape = grid_result
        _nx, _ny, nz = grid_shape

        # Compute hull mask
        inside_hull = self._compute_hull_mask(xyz, bbox_min, voxel_size, grid_shape)

        # Use ray propagation with bouncing
        empty_mask, _ = self._ray_propagation_with_bounces(
            occupied, grid_shape, inside_hull
        )

        # Decompose each Z-slice into rectangles using greedy meshing
        all_boxes: list[tuple[int, int, int, int, int, int]] = []

        for iz in range(nz):
            slice_2d = empty_mask[:, :, iz]
            if not slice_2d.any():
                continue

            rectangles = self._greedy_2d_mesh(slice_2d)
            for x_min, x_max, y_min, y_max in rectangles:
                all_boxes.append((iz, iz + 1, x_min, x_max, y_min, y_max))

        if not all_boxes:
            return constraints

        # Sort by XY extent, then by Z to facilitate merging
        all_boxes.sort(key=lambda b: (b[2], b[3], b[4], b[5], b[0]))

        # Merge boxes that are adjacent in Z and have identical XY extent
        merged_boxes: list[tuple[int, int, int, int, int, int]] = []
        current = all_boxes[0]

        for box in all_boxes[1:]:
            z_start, z_end, x_min, x_max, y_min, y_max = box
            cz_start, cz_end, cx_min, cx_max, cy_min, cy_max = current

            if (
                x_min == cx_min
                and x_max == cx_max
                and y_min == cy_min
                and y_max == cy_max
                and z_start == cz_end
            ):
                current = (cz_start, z_end, cx_min, cx_max, cy_min, cy_max)
            else:
                merged_boxes.append(current)
                current = box

        merged_boxes.append(current)

        # Cap the number of boxes
        max_boxes = 30
        if len(merged_boxes) > max_boxes:
            merged_boxes.sort(
                key=lambda b: (b[1] - b[0]) * (b[3] - b[2]) * (b[5] - b[4]),
                reverse=True,
            )
            merged_boxes = merged_boxes[:max_boxes]

        # Convert to world coordinates
        for z_start, z_end, x_min, x_max, y_min, y_max in merged_boxes:
            world_min = bbox_min + np.array([x_min, y_min, z_start]) * voxel_size
            world_max = bbox_min + np.array([x_max, y_max, z_end]) * voxel_size

            center = (world_min + world_max) / 2
            half_extents = (world_max - world_min) / 2

            box_constraint = {
                "type": "box",
                "sign": SignConvention.EMPTY.value,
                "center": tuple(center.tolist()),
                "half_extents": tuple(half_extents.tolist()),
            }

            volume = float(np.prod(half_extents * 2))
            n_voxels = (z_end - z_start) * (x_max - x_min) * (y_max - y_min)
            constraints.append(
                GeneratedConstraint(
                    constraint=box_constraint,
                    algorithm=AlgorithmType.FLOOD_FILL,
                    confidence=0.85,
                    description=f"Sky-reachable region ({n_voxels} voxels, {volume:.2f}m³)",
                )
            )

        return constraints

    def _generate_voxel_region_constraints(
        self, xyz: np.ndarray, _normals: np.ndarray | None
    ) -> list[GeneratedConstraint]:
        """Generate SOLID box constraints for underground regions.

        Uses directional Z-ray propagation: SOLID propagates up from Z_min
        until hitting the surface. Only voxels inside the 2D convex hull
        are marked SOLID (exterior columns remain unmarked).

        Uses per-Z-slice greedy meshing to create boxes that correctly
        avoid trench interiors (which are marked EMPTY, not SOLID).
        """
        constraints: list[GeneratedConstraint] = []

        grid_result = self._build_voxel_grid(xyz)
        if grid_result is None:
            return constraints

        occupied, bbox_min, voxel_size, grid_shape = grid_result
        _nx, _ny, nz = grid_shape

        # Compute hull mask for limiting SOLID propagation
        inside_hull = self._compute_hull_mask(xyz, bbox_min, voxel_size, grid_shape)

        # Use directional Z-propagation
        _, solid_mask = self._ray_propagation_with_bounces(
            occupied, grid_shape, inside_hull
        )

        # Decompose each Z-slice into rectangles using greedy meshing
        # This creates boxes that avoid trench interiors
        all_boxes: list[tuple[int, int, int, int, int, int]] = []

        for iz in range(nz):
            slice_2d = solid_mask[:, :, iz]
            if not slice_2d.any():
                continue

            rectangles = self._greedy_2d_mesh(slice_2d)
            for x_min, x_max, y_min, y_max in rectangles:
                all_boxes.append((iz, iz + 1, x_min, x_max, y_min, y_max))

        if not all_boxes:
            return constraints

        # Sort by XY extent, then by Z to facilitate merging
        all_boxes.sort(key=lambda b: (b[2], b[3], b[4], b[5], b[0]))

        # Merge boxes that are adjacent in Z and have identical XY extent
        merged_boxes: list[tuple[int, int, int, int, int, int]] = []
        current = all_boxes[0]

        for box in all_boxes[1:]:
            z_start, z_end, x_min, x_max, y_min, y_max = box
            cz_start, cz_end, cx_min, cx_max, cy_min, cy_max = current

            if (
                x_min == cx_min
                and x_max == cx_max
                and y_min == cy_min
                and y_max == cy_max
                and z_start == cz_end
            ):
                current = (cz_start, z_end, cx_min, cx_max, cy_min, cy_max)
            else:
                merged_boxes.append(current)
                current = box

        merged_boxes.append(current)

        # Cap the number of boxes
        max_boxes = 30
        if len(merged_boxes) > max_boxes:
            merged_boxes.sort(
                key=lambda b: (b[1] - b[0]) * (b[3] - b[2]) * (b[5] - b[4]),
                reverse=True,
            )
            merged_boxes = merged_boxes[:max_boxes]

        # Convert to world coordinates
        for z_start, z_end, x_min, x_max, y_min, y_max in merged_boxes:
            world_min = bbox_min + np.array([x_min, y_min, z_start]) * voxel_size
            world_max = bbox_min + np.array([x_max, y_max, z_end]) * voxel_size

            center = (world_min + world_max) / 2
            half_extents = (world_max - world_min) / 2

            box_constraint = {
                "type": "box",
                "sign": SignConvention.SOLID.value,
                "center": tuple(center.tolist()),
                "half_extents": tuple(half_extents.tolist()),
            }

            volume = float(np.prod(half_extents * 2))
            n_voxels = (z_end - z_start) * (x_max - x_min) * (y_max - y_min)
            constraints.append(GeneratedConstraint(
                constraint=box_constraint,
                algorithm=AlgorithmType.VOXEL_REGIONS,
                confidence=0.85,
                description=f"Underground region ({n_voxels} voxels, {volume:.2f}m³)",
            ))

        return constraints

    def _farthest_point_sample(self, xyz: np.ndarray, n_samples: int) -> list[int]:
        """Select well-distributed points using farthest point sampling."""
        n_points = len(xyz)
        if n_samples >= n_points:
            return list(range(n_points))

        # Start with a random point
        selected: list[int] = [int(np.random.randint(n_points))]
        min_distances = np.full(n_points, np.inf)

        for _ in range(n_samples - 1):
            # Update distances to selected set
            last_selected = xyz[selected[-1]]
            distances = np.linalg.norm(xyz - last_selected, axis=1)
            min_distances = np.minimum(min_distances, distances)

            # Exclude already selected
            min_distances[selected] = -1

            # Select point with maximum distance
            next_idx = int(np.argmax(min_distances))
            selected.append(next_idx)

        return selected

    def _estimate_mean_spacing(
        self, xyz: np.ndarray, tree: KDTree | None = None, k: int = 8
    ) -> float:
        """Estimate mean point spacing using k-NN."""
        if tree is None:
            tree = KDTree(xyz)

        # Sample a subset of points
        n_sample = min(1000, len(xyz))
        sample_indices = np.random.choice(len(xyz), n_sample, replace=False)

        distances = []
        for idx in sample_indices:
            dists, _ = tree.query(xyz[idx], k=k + 1)  # +1 for self
            distances.extend(dists[1:])  # Exclude self (distance 0)

        return float(np.mean(distances))

    def _get_algorithm_description(self, algo_name: str, count: int) -> str:
        """Get human-readable description for algorithm results."""
        descriptions = {
            AlgorithmType.POCKET.value: f"Detected {count} interior cavities",
            AlgorithmType.NORMAL_OFFSET.value: f"Generated {count} surface offset constraints",
            AlgorithmType.FLOOD_FILL.value: f"Found {count} sky-reachable exterior regions",
            AlgorithmType.VOXEL_REGIONS.value: f"Found {count} underground solid regions",
        }
        return descriptions.get(algo_name, f"Generated {count} constraints")

    def _compute_summary(
        self, constraints: list[GeneratedConstraint], algorithms_contributing: int
    ) -> AnalysisSummary:
        """Compute summary statistics from generated constraints."""
        solid_count = sum(1 for c in constraints if c.constraint.get("sign") == SignConvention.SOLID.value)
        empty_count = sum(1 for c in constraints if c.constraint.get("sign") == SignConvention.EMPTY.value)

        return AnalysisSummary(
            total_constraints=len(constraints),
            solid_constraints=solid_count,
            empty_constraints=empty_count,
            algorithms_contributing=algorithms_contributing,
        )

    def _save_results(self, project_id: str, result: AutoAnalysisResult) -> None:
        """Save analysis results to cache."""
        auto_dir = self._auto_dir(project_id)

        # Save as JSON
        with open(auto_dir / "analysis.json", "w") as f:
            json.dump(result.model_dump(mode="json"), f, indent=2, default=str)

    def get_cached_result(self, project_id: str) -> AutoAnalysisResult | None:
        """Get cached analysis result if available."""
        analysis_path = self._auto_dir(project_id) / "analysis.json"
        if not analysis_path.exists():
            return None

        with open(analysis_path) as f:
            data = json.load(f)

        return AutoAnalysisResult.model_validate(data)

    def clear_cache(self, project_id: str) -> None:
        """Clear cached auto-analysis for a project."""
        auto_dir = self._auto_dir(project_id)
        for f in auto_dir.glob("*"):
            f.unlink()
