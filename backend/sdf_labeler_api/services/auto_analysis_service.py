# ABOUTME: Auto-analysis service for constraint-based SDF region detection
# ABOUTME: Generates spatial constraints (boxes, halfspaces, pockets) from point cloud analysis

import json
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from scipy.ndimage import binary_dilation, label
from scipy.spatial import ConvexHull, Delaunay, KDTree

from sdf_labeler_api.config import Settings
from sdf_labeler_api.models.auto_analysis import (
    ALL_ALGORITHMS,
    AlgorithmStats,
    AlgorithmType,
    AnalysisSummary,
    AutoAnalysisOptions,
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
        options: AutoAnalysisOptions | None = None,
    ) -> AutoAnalysisResult:
        """Run analysis algorithms and generate constraints.

        Args:
            project_id: Project identifier
            algorithms: List of algorithms to run (default: all)
            recompute: Force recomputation even if cached
            options: Tunable hyperparameters for algorithms

        Returns:
            Analysis result with generated constraints
        """
        # Use default options if not provided
        if options is None:
            options = AutoAnalysisOptions()

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
            constraints = self._run_algorithm(algo_name, xyz, normals, project_id, options)
            if constraints:
                all_constraints.extend(constraints)
                algorithms_run.append(algo_name)
                algorithm_stats[algo_name] = AlgorithmStats(
                    constraints_generated=len(constraints),
                    coverage_description=self._get_algorithm_description(
                        algo_name, len(constraints)
                    ),
                )

        # Remove redundant contained boxes
        all_constraints = self._simplify_constraints(all_constraints, options.overlap_threshold)

        # Filter out constraints outside the X-Y alpha shape of point cloud
        if options.hull_filter_enabled:
            all_constraints = self._filter_outside_hull(all_constraints, xyz, options.hull_alpha)

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
        options: AutoAnalysisOptions,
    ) -> list[GeneratedConstraint]:
        """Run a single analysis algorithm."""
        if name == AlgorithmType.POCKET.value:
            return self._generate_pocket_constraints(project_id)
        elif name == AlgorithmType.NORMAL_OFFSET.value:
            return self._generate_normal_offset_boxes(xyz, normals, options)
        elif name == AlgorithmType.FLOOD_FILL.value:
            return self._generate_flood_fill_constraints(xyz, normals, options)
        elif name == AlgorithmType.VOXEL_REGIONS.value:
            return self._generate_voxel_region_constraints(xyz, normals, options)
        elif name == AlgorithmType.NORMAL_IDW.value:
            return self._generate_idw_normal_samples(xyz, normals, options)
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

            constraints.append(
                GeneratedConstraint(
                    constraint=pocket_constraint,
                    algorithm=AlgorithmType.POCKET,
                    confidence=0.95,  # Pockets are highly reliable
                    description=f"Interior cavity at ({pocket.centroid[0]:.2f}, {pocket.centroid[1]:.2f}, {pocket.centroid[2]:.2f}), {pocket.voxel_count} voxels",
                )
            )

        return constraints

    def _generate_normal_offset_boxes(
        self, xyz: np.ndarray, normals: np.ndarray | None, options: AutoAnalysisOptions
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
        sample_indices = self._farthest_point_sample(xyz, options.normal_offset_pairs)
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

            constraints.append(
                GeneratedConstraint(
                    constraint=box_constraint_empty,
                    algorithm=AlgorithmType.NORMAL_OFFSET,
                    confidence=0.75,
                    description=f"Exterior offset from surface at ({point[0]:.2f}, {point[1]:.2f}, {point[2]:.2f})",
                )
            )

            # Create SOLID box in -normal direction (inward)
            solid_center = point - normal * offset_distance
            box_constraint_solid = {
                "type": "box",
                "sign": SignConvention.SOLID.value,
                "center": tuple(solid_center.tolist()),
                "half_extents": (box_size, box_size, box_size),
            }

            constraints.append(
                GeneratedConstraint(
                    constraint=box_constraint_solid,
                    algorithm=AlgorithmType.NORMAL_OFFSET,
                    confidence=0.75,
                    description=f"Interior offset from surface at ({point[0]:.2f}, {point[1]:.2f}, {point[2]:.2f})",
                )
            )

        return constraints

    def _find_dominant_ground_z(self, xyz: np.ndarray, normals: np.ndarray | None) -> float | None:
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

    def _build_voxel_grid(
        self,
        xyz: np.ndarray,
        options: AutoAnalysisOptions,
        voxel_size: float | None = None,
        z_extension: float | None = None,
    ) -> tuple[np.ndarray, np.ndarray, float, tuple[int, int, int]] | None:
        """Build a voxel grid from point cloud data.

        Args:
            xyz: Point cloud coordinates
            options: Tunable hyperparameters including min_gap_size and max_grid_dim
            voxel_size: Optional voxel size (auto-computed if None)
            z_extension: How much to extend the grid above the point cloud in +Z.
                         For outdoor scenes, this creates "sky" space above ground.
                         If None, defaults to 50% of scene Z range (min 5 voxels).

        Returns:
            Tuple of (occupied grid, bbox_min, voxel_size, grid_shape) or None if invalid.
        """
        if len(xyz) < 10:
            return None

        min_gap_size = options.min_gap_size
        max_dim = options.max_grid_dim

        # Determine voxel size based on point cloud density
        tree = KDTree(xyz)
        mean_spacing = self._estimate_mean_spacing(xyz, tree)

        if voxel_size is None:
            # Voxel size based on point density, but constrained by min_gap_size
            # Gap must span ≥3 voxels for flood fill to pass (1 voxel dilation each side)
            # Using 2x mean_spacing helps close small surface gaps
            density_based = mean_spacing * 2.0
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

        # Cap grid size for performance
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
        shape_tuple: tuple[int, int, int] = (
            int(grid_shape[0]),
            int(grid_shape[1]),
            int(grid_shape[2]),
        )
        return occupied, bbox_min, vs, shape_tuple

    def _compute_hull_mask(
        self,
        xyz: np.ndarray,
        bbox_min: np.ndarray,
        voxel_size: float,
        grid_shape: tuple[int, int, int],
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
        cone_angle_degrees: float,
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
            (0.0, 0.0),  # straight
            (tan_angle, 0.0),  # +X
            (-tan_angle, 0.0),  # -X
            (0.0, tan_angle),  # +Y
            (0.0, -tan_angle),  # -Y
            (diag, diag),  # +X+Y
            (diag, -diag),  # +X-Y
            (-diag, diag),  # -X+Y
            (-diag, -diag),  # -X-Y
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
            (1, 0, 0),
            (-1, 0, 0),
            (0, 1, 0),
            (0, -1, 0),
            (0, 0, 1),
            (0, 0, -1),
        ]

        # Compute per-column floor: lowest occupied Z for each XY column
        # EMPTY cannot exist below this floor (it would be underground)
        column_floor = np.full((nx, ny), -1, dtype=int)
        for ix in range(nx):
            for iy in range(ny):
                occupied_z = np.where(occupied[ix, iy, :])[0]
                if len(occupied_z) > 0:
                    column_floor[ix, iy] = occupied_z.min()

        # Flood fill EMPTY (all air connected to sky becomes EMPTY)
        # But don't go below the column floor
        empty_stack = [tuple(coord) for coord in np.argwhere(empty)]
        while empty_stack:
            ix, iy, iz = empty_stack.pop()
            for dx, dy, dz in directions:
                nx_, ny_, nz_ = ix + dx, iy + dy, iz + dz
                if 0 <= nx_ < nx and 0 <= ny_ < ny and 0 <= nz_ < nz:
                    # Don't allow EMPTY below the surface floor in this column
                    floor_z = column_floor[nx_, ny_]
                    if floor_z >= 0 and nz_ < floor_z:
                        continue
                    if not occupied[nx_, ny_, nz_] and not empty[nx_, ny_, nz_]:
                        empty[nx_, ny_, nz_] = True
                        empty_stack.append((nx_, ny_, nz_))

        # Filter EMPTY by sky connectivity: only keep regions connected to top of grid
        # This removes small leak regions that got through tiny surface gaps
        labeled_empty, num_components = label(empty)
        if num_components > 0:
            # Find which component labels touch the sky (top Z slice)
            top_slice = labeled_empty[:, :, -1]
            sky_labels = set(top_slice[top_slice > 0])
            # Only keep voxels belonging to sky-connected components
            if sky_labels:
                sky_connected = np.isin(labeled_empty, list(sky_labels))
                empty = empty & sky_connected

        # Additional filter: remove small isolated EMPTY regions by volume
        # Small leaked regions have few voxels; legitimate regions (trenches) are larger
        labeled_empty, num_components = label(empty)
        if num_components > 0:
            # Count voxels in each component
            component_sizes = np.bincount(labeled_empty.ravel())
            # Keep only components with more than threshold voxels
            # Threshold scales with grid resolution: ~1% of a typical slice area
            min_component_voxels = max(10, (nx * ny) // 100)
            large_enough = component_sizes >= min_component_voxels
            # Component 0 is background (non-EMPTY), always exclude
            large_enough[0] = False
            # Build mask of voxels in large-enough components
            keep_mask = large_enough[labeled_empty]
            empty = empty & keep_mask

        # Flood fill SOLID (all underground connected to bottom becomes SOLID)
        # But don't overwrite EMPTY
        solid_stack = [tuple(coord) for coord in np.argwhere(solid)]
        while solid_stack:
            ix, iy, iz = solid_stack.pop()
            for dx, dy, dz in directions:
                nx_, ny_, nz_ = ix + dx, iy + dy, iz + dz
                if 0 <= nx_ < nx and 0 <= ny_ < ny and 0 <= nz_ < nz:
                    if (
                        not occupied[nx_, ny_, nz_]
                        and not empty[nx_, ny_, nz_]
                        and not solid[nx_, ny_, nz_]
                    ):
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
        self, xyz: np.ndarray, _normals: np.ndarray | None, options: AutoAnalysisOptions
    ) -> list[GeneratedConstraint]:
        """Generate EMPTY constraints using ray propagation with bouncing.

        Uses the ray model:
        1. EMPTY rays shine down from +Z (sky)
        2. Rays bounce to fill occluded areas (trenches, overhangs)
        3. Output depends on flood_fill_output option:
           - 'boxes': axis-aligned boxes via greedy meshing
           - 'samples': point samples uniformly distributed in empty voxels
           - 'both': both boxes and samples

        Sample-based output avoids axis-alignment bias and works better
        with diagonal/complex geometry.
        """
        constraints: list[GeneratedConstraint] = []

        grid_result = self._build_voxel_grid(xyz, options)
        if grid_result is None:
            return constraints

        occupied, bbox_min, voxel_size, grid_shape = grid_result
        _nx, _ny, nz = grid_shape

        # Compute hull mask
        inside_hull = self._compute_hull_mask(xyz, bbox_min, voxel_size, grid_shape)

        # Use ray propagation with bouncing
        empty_mask, _ = self._ray_propagation_with_bounces(
            occupied, grid_shape, inside_hull, options.cone_angle
        )

        output_mode = options.flood_fill_output.lower()

        # Generate sample points if requested
        if output_mode in ("samples", "both"):
            sample_constraints = self._generate_samples_from_mask(
                empty_mask,
                bbox_min,
                voxel_size,
                xyz,
                options.flood_fill_sample_count,
                SignConvention.EMPTY,
                AlgorithmType.FLOOD_FILL,
            )
            constraints.extend(sample_constraints)

        # Generate boxes if requested
        if output_mode in ("boxes", "both"):
            box_constraints = self._generate_boxes_from_mask(
                empty_mask, bbox_min, voxel_size, nz, options, SignConvention.EMPTY, AlgorithmType.FLOOD_FILL
            )
            constraints.extend(box_constraints)

        return constraints

    def _generate_samples_from_mask(
        self,
        mask: np.ndarray,
        bbox_min: np.ndarray,
        voxel_size: float,
        xyz: np.ndarray,
        n_samples: int,
        sign: SignConvention,
        algorithm: AlgorithmType,
    ) -> list[GeneratedConstraint]:
        """Generate sample_point constraints from a voxel mask.

        Uniformly samples points within marked voxels, computing distance
        to the nearest surface point for each sample.
        """
        from scipy.spatial import KDTree

        constraints: list[GeneratedConstraint] = []

        # Get indices of marked voxels
        marked_indices = np.argwhere(mask)
        if len(marked_indices) == 0:
            return constraints

        # Build KD-tree for distance computation
        tree = KDTree(xyz)

        # Sample voxels (with replacement if needed)
        rng = np.random.default_rng(42)
        if len(marked_indices) >= n_samples:
            sample_indices = rng.choice(len(marked_indices), size=n_samples, replace=False)
        else:
            sample_indices = rng.choice(len(marked_indices), size=n_samples, replace=True)

        for idx in sample_indices:
            voxel_ijk = marked_indices[idx]
            # Random point within the voxel
            offset = rng.uniform(0, 1, 3)
            world_pos = bbox_min + (voxel_ijk + offset) * voxel_size

            # Compute distance to nearest surface point
            dist, _ = tree.query(world_pos, k=1)

            # Sign the distance based on constraint type
            signed_dist = float(dist) if sign == SignConvention.EMPTY else -float(dist)

            constraints.append(
                GeneratedConstraint(
                    constraint={
                        "type": "sample_point",
                        "sign": sign.value,
                        "position": tuple(world_pos.tolist()),
                        "distance": signed_dist,
                    },
                    algorithm=algorithm,
                    confidence=0.8,
                    description=f"Voxel sample at d={signed_dist:.3f}m",
                )
            )

        return constraints

    def _generate_boxes_from_mask(
        self,
        empty_mask: np.ndarray,
        bbox_min: np.ndarray,
        voxel_size: float,
        nz: int,
        options: AutoAnalysisOptions,
        sign: SignConvention,
        algorithm: AlgorithmType,
    ) -> list[GeneratedConstraint]:
        """Generate axis-aligned box constraints from a voxel mask using greedy meshing."""
        constraints: list[GeneratedConstraint] = []

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

        # Filter out small boxes (must span at least 3 voxels in each dimension)
        min_extent = 3
        merged_boxes = [
            b
            for b in merged_boxes
            if (b[1] - b[0]) >= min_extent
            and (b[3] - b[2]) >= min_extent
            and (b[5] - b[4]) >= min_extent
        ]

        if not merged_boxes:
            return constraints

        # Keep only largest boxes
        max_boxes = options.max_boxes
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
                "sign": sign.value,
                "center": tuple(center.tolist()),
                "half_extents": tuple(half_extents.tolist()),
            }

            volume = float(np.prod(half_extents * 2))
            n_voxels = (z_end - z_start) * (x_max - x_min) * (y_max - y_min)
            constraints.append(
                GeneratedConstraint(
                    constraint=box_constraint,
                    algorithm=algorithm,
                    confidence=0.85,
                    description=f"Sky-reachable region ({n_voxels} voxels, {volume:.2f}m³)",
                )
            )

        return constraints

    def _generate_voxel_region_constraints(
        self, xyz: np.ndarray, _normals: np.ndarray | None, options: AutoAnalysisOptions
    ) -> list[GeneratedConstraint]:
        """Generate SOLID constraints for underground regions.

        Uses directional Z-ray propagation: SOLID propagates up from Z_min
        until hitting the surface. Only voxels inside the 2D convex hull
        are marked SOLID (exterior columns remain unmarked).

        Output depends on voxel_regions_output option:
           - "boxes": Uses per-Z-slice greedy meshing to create axis-aligned boxes
           - "samples": Generates point samples within solid voxels
           - "both": Both boxes and samples
        """
        constraints: list[GeneratedConstraint] = []

        grid_result = self._build_voxel_grid(xyz, options)
        if grid_result is None:
            return constraints

        occupied, bbox_min, voxel_size, grid_shape = grid_result

        # Compute hull mask for limiting SOLID propagation
        inside_hull = self._compute_hull_mask(xyz, bbox_min, voxel_size, grid_shape)

        # Use directional Z-propagation
        _, solid_mask = self._ray_propagation_with_bounces(
            occupied, grid_shape, inside_hull, options.cone_angle
        )

        output_mode = options.voxel_regions_output.lower()

        # Generate samples if requested
        if output_mode in ("samples", "both"):
            sample_constraints = self._generate_samples_from_mask(
                solid_mask,
                bbox_min,
                voxel_size,
                xyz,
                options.voxel_regions_sample_count,
                SignConvention.SOLID,
                AlgorithmType.VOXEL_REGIONS,
            )
            constraints.extend(sample_constraints)

        # Generate boxes if requested
        if output_mode in ("boxes", "both"):
            box_constraints = self._generate_boxes_from_solid_mask(
                solid_mask, bbox_min, voxel_size, grid_shape, options
            )
            constraints.extend(box_constraints)

        return constraints

    def _generate_boxes_from_solid_mask(
        self,
        solid_mask: np.ndarray,
        bbox_min: np.ndarray,
        voxel_size: float,
        grid_shape: tuple[int, int, int],
        options: AutoAnalysisOptions,
    ) -> list[GeneratedConstraint]:
        """Generate SOLID box constraints from a voxel mask using greedy meshing."""
        constraints: list[GeneratedConstraint] = []
        _nx, _ny, nz = grid_shape

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

        # Filter out small boxes (must span at least 3 voxels in each dimension)
        min_extent = 3
        merged_boxes = [
            b
            for b in merged_boxes
            if (b[1] - b[0]) >= min_extent
            and (b[3] - b[2]) >= min_extent
            and (b[5] - b[4]) >= min_extent
        ]

        if not merged_boxes:
            return constraints

        # Keep only largest boxes
        max_boxes = options.max_boxes
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
            constraints.append(
                GeneratedConstraint(
                    constraint=box_constraint,
                    algorithm=AlgorithmType.VOXEL_REGIONS,
                    confidence=0.85,
                    description=f"Underground region ({n_voxels} voxels, {volume:.2f}m³)",
                )
            )

        return constraints

    def _generate_idw_normal_samples(
        self, xyz: np.ndarray, normals: np.ndarray | None, options: AutoAnalysisOptions
    ) -> list[GeneratedConstraint]:
        """Generate sample constraints along normals with inverse distance weighting.

        Creates point samples at varying distances along surface normals, with
        more samples concentrated near the surface (IDW = 1/distance^power).

        Returns sample_point constraints for direct training use.
        """
        constraints: list[GeneratedConstraint] = []

        if normals is None or len(normals) != len(xyz):
            return constraints

        # Orient normals to point "outward" using viewpoint heuristic
        # For outdoor/ground scenes, we assume viewing from above, so normals
        # should generally point upward (positive Z) for horizontal surfaces
        oriented_normals = self._orient_normals_outward(xyz, normals)

        # Sample representative surface points (farthest-point sampling)
        n_surface_pts = min(options.idw_sample_count // 10, len(xyz))
        if n_surface_pts < 1:
            return constraints

        surface_indices = self._farthest_point_sample(xyz, n_surface_pts)
        samples_per_point = options.idw_sample_count // len(surface_indices)

        if samples_per_point < 1:
            samples_per_point = 1

        for idx in surface_indices:
            point = xyz[idx]
            normal = oriented_normals[idx]
            normal_norm = np.linalg.norm(normal)
            if normal_norm < 0.1:
                continue
            normal = normal / normal_norm

            # Generate distances with IDW distribution
            # More samples near 0, fewer at max_distance
            u = np.random.random(samples_per_point)
            # Inverse CDF for power-law distribution: closer to surface = more samples
            distances = options.idw_max_distance * (1 - u ** (1 / options.idw_power))

            for dist in distances:
                # Randomly choose positive or negative offset
                sign = np.random.choice([-1, 1])
                sample_pos = point + sign * dist * normal
                sample_sign = "empty" if sign > 0 else "solid"

                constraints.append(
                    GeneratedConstraint(
                        constraint={
                            "type": "sample_point",
                            "sign": sample_sign,
                            "position": tuple(sample_pos.tolist()),
                            "distance": float(sign * dist),
                        },
                        algorithm=AlgorithmType.NORMAL_IDW,
                        confidence=0.8,
                        description=f"IDW sample at d={sign * dist:.3f}m",
                    )
                )

        return constraints

    def _orient_normals_outward(
        self, xyz: np.ndarray, normals: np.ndarray
    ) -> np.ndarray:
        """Orient normals to point outward using a viewpoint heuristic.

        Uses a simple but effective heuristic: the viewpoint is assumed to be
        at the centroid of the point cloud but elevated above it. Normals are
        flipped to point toward this viewpoint.

        This works well for outdoor scenes, trenches, and excavations where
        the camera/viewer is typically above the scene.
        """
        # Compute centroid and place viewpoint above it
        centroid = xyz.mean(axis=0)
        z_range = xyz[:, 2].max() - xyz[:, 2].min()
        # Place viewpoint well above the scene
        viewpoint = centroid.copy()
        viewpoint[2] = xyz[:, 2].max() + z_range * 0.5

        # Compute vectors from each point to the viewpoint
        to_viewpoint = viewpoint - xyz  # Shape: (N, 3)

        # Check if normal points toward viewpoint (dot product > 0)
        dot_products = np.sum(normals * to_viewpoint, axis=1)

        # Flip normals that point away from viewpoint
        oriented = normals.copy()
        flip_mask = dot_products < 0
        oriented[flip_mask] = -oriented[flip_mask]

        return oriented

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
            AlgorithmType.NORMAL_IDW.value: f"Generated {count} IDW normal samples",
        }
        return descriptions.get(algo_name, f"Generated {count} constraints")

    def _compute_summary(
        self, constraints: list[GeneratedConstraint], algorithms_contributing: int
    ) -> AnalysisSummary:
        """Compute summary statistics from generated constraints."""
        solid_count = sum(
            1 for c in constraints if c.constraint.get("sign") == SignConvention.SOLID.value
        )
        empty_count = sum(
            1 for c in constraints if c.constraint.get("sign") == SignConvention.EMPTY.value
        )

        return AnalysisSummary(
            total_constraints=len(constraints),
            solid_constraints=solid_count,
            empty_constraints=empty_count,
            algorithms_contributing=algorithms_contributing,
        )

    def _box_intersection_fraction(self, box_a: dict, box_b: dict) -> float:
        """Calculate what fraction of box_b's volume intersects with box_a.

        Args:
            box_a: Box constraint dict with "center" and "half_extents" keys.
            box_b: Box constraint dict with "center" and "half_extents" keys.

        Returns:
            Fraction of box_b's volume that overlaps with box_a (0.0 to 1.0).
        """
        a_center = np.array(box_a["center"])
        a_half = np.array(box_a["half_extents"])
        b_center = np.array(box_b["center"])
        b_half = np.array(box_b["half_extents"])

        a_min, a_max = a_center - a_half, a_center + a_half
        b_min, b_max = b_center - b_half, b_center + b_half

        # Calculate intersection bounds
        inter_min = np.maximum(a_min, b_min)
        inter_max = np.minimum(a_max, b_max)

        # Calculate intersection dimensions (0 if no overlap)
        inter_dims = np.maximum(0, inter_max - inter_min)
        intersection_volume = float(np.prod(inter_dims))

        # Calculate box_b's volume
        b_dims = b_max - b_min
        b_volume = float(np.prod(b_dims))

        if b_volume <= 0:
            return 0.0

        return intersection_volume / b_volume

    def _simplify_constraints(
        self, constraints: list[GeneratedConstraint], overlap_threshold: float = 0.5
    ) -> list[GeneratedConstraint]:
        """Remove boxes that significantly overlap with larger boxes.

        Removes redundant/contradictory boxes in two cases:
        1. Same sign: smaller box mostly inside larger box of same sign (redundant)
        2. Opposite sign: smaller box mostly inside larger box of opposite sign (contradictory)

        Args:
            constraints: List of generated constraints.
            overlap_threshold: Fraction of volume overlap required to remove (default 0.5).

        Returns:
            Filtered list with redundant/contradictory boxes removed.
        """
        # Collect all box constraints with their indices and volumes
        boxes: list[tuple[int, GeneratedConstraint, float]] = []
        for i, c in enumerate(constraints):
            if c.constraint.get("type") == "box":
                half = np.array(c.constraint["half_extents"])
                volume = float(np.prod(half * 2))
                boxes.append((i, c, volume))

        # Find indices of smaller boxes to remove
        remove_indices: set[int] = set()
        for i, (_idx_a, box_a, vol_a) in enumerate(boxes):
            for j, (idx_b, box_b, vol_b) in enumerate(boxes):
                if i == j:
                    continue
                # Only consider removing smaller box when it overlaps with larger
                if vol_b < vol_a:
                    fraction = self._box_intersection_fraction(box_a.constraint, box_b.constraint)
                    if fraction > overlap_threshold:
                        remove_indices.add(idx_b)

        return [c for i, c in enumerate(constraints) if i not in remove_indices]

    def _filter_outside_hull(
        self, constraints: list[GeneratedConstraint], xyz: np.ndarray, alpha: float
    ) -> list[GeneratedConstraint]:
        """Filter out constraints whose center falls outside the X-Y alpha shape.

        Projects point cloud to X-Y plane, computes alpha shape (concave hull),
        and removes any constraints with centers outside. This filters out
        constraints in void regions, including concave voids like L-shaped gaps.

        Args:
            constraints: List of generated constraints.
            xyz: Point cloud positions (N, 3).
            alpha: Alpha shape parameter (smaller = tighter fit to concavities).

        Returns:
            Filtered list with out-of-shape constraints removed.
        """
        if len(constraints) == 0 or len(xyz) < 3:
            return constraints

        # Project to X-Y plane
        xy = xyz[:, :2]

        # Compute alpha shape (concave hull)
        try:
            import alphashape
            from shapely.geometry import Point

            # alphashape returns a shapely Polygon or MultiPolygon
            shape = alphashape.alphashape(xy, alpha)
            if shape is None or shape.is_empty:
                # Fall back to keeping all if alpha shape fails
                return constraints
        except Exception:
            # If alpha shape computation fails, keep all
            return constraints

        # Filter constraints
        filtered: list[GeneratedConstraint] = []
        for constraint in constraints:
            c = constraint.constraint
            c_type = c.get("type")

            # Get center point for this constraint
            center_xy = self._get_constraint_center_xy(c, c_type)
            if center_xy is None:
                # Keep constraints we can't check
                filtered.append(constraint)
                continue

            # Check if center is inside the alpha shape
            point = Point(center_xy[0], center_xy[1])
            if shape.contains(point) or shape.touches(point):
                filtered.append(constraint)

        return filtered

    def _get_constraint_center_xy(
        self, constraint: dict, c_type: str | None
    ) -> np.ndarray | None:
        """Get the X-Y center of a constraint for hull checking."""
        center = None

        if c_type == "box":
            center = constraint.get("center")
        elif c_type == "sample_point":
            center = constraint.get("position")
        elif c_type == "sphere":
            center = constraint.get("center")
        elif c_type == "pocket":
            center = constraint.get("centroid")
        else:
            # Try common fields
            for field in ["center", "position", "point", "centroid"]:
                if field in constraint:
                    center = constraint[field]
                    break

        if center is None:
            return None

        return np.array(center[:2])  # Just X-Y

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
