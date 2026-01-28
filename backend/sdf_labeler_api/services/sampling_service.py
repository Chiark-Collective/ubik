# ABOUTME: Training sample generation service
# ABOUTME: Converts constraints to survi-compatible training data

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np
import pandas as pd

if TYPE_CHECKING:
    from sdf_labeler_api.models.samples import SampleVisualizationResponse

logger = logging.getLogger(__name__)

from sdf_labeler_api.models.constraints import (
    BoxConstraint,
    BrushStrokeConstraint,
    ConstraintSet,
    HalfspaceConstraint,
    PocketConstraint,
    RayCarveConstraint,
    SamplePointConstraint,
    SeedPropagationConstraint,
    SignConvention,
    SliceSelectionConstraint,
    SphereConstraint,
)
from sdf_labeler_api.models.project import Project
from sdf_labeler_api.models.samples import (
    ExportConfig,
    SampleGenerationRequest,
    SamplePreview,
    SamplingStrategy,
    TrainingSample,
    TrainingSampleSet,
)


class SamplingService:
    """Service for generating training samples from constraints."""

    def preview(self, project_id: str, request: SampleGenerationRequest) -> SamplePreview:
        """Preview sample distribution before generation."""
        from sdf_labeler_api.config import settings
        from sdf_labeler_api.services.constraint_service import ConstraintService
        from sdf_labeler_api.services.project_service import ProjectService

        project_service = ProjectService(settings.data_dir)
        constraint_service = ConstraintService()

        project = project_service.get(project_id)
        if project is None:
            raise ValueError("Project not found")

        constraints = constraint_service.list_all(project_id)

        # Estimate sample counts based on ratios
        total = request.total_samples
        surface_ratio = project.config.surface_anchor_ratio
        far_ratio = project.config.far_field_ratio
        near_ratio = 1.0 - surface_ratio - far_ratio

        surface_count = int(total * surface_ratio) if request.include_surface else 0
        far_count = int(total * far_ratio)
        near_count = int(total * near_ratio)

        # Count constraint samples
        constraint_count = self._count_constraint_samples(
            constraints, request.samples_per_primitive
        )

        return SamplePreview(
            surface_anchor_count=surface_count,
            near_band_count=near_count,
            far_field_count=far_count,
            constraint_sample_count=constraint_count,
            total_count=surface_count + near_count + far_count + constraint_count,
            preview_samples=[],  # TODO: Generate actual preview
        )

    def generate(self, project_id: str, request: SampleGenerationRequest) -> TrainingSampleSet:
        """Generate training samples from constraints."""
        from sdf_labeler_api.config import settings
        from sdf_labeler_api.services.constraint_service import ConstraintService
        from sdf_labeler_api.services.project_service import ProjectService

        project_service = ProjectService(settings.data_dir)
        constraint_service = ConstraintService()

        project = project_service.get(project_id)
        if project is None:
            raise ValueError("Project not found")

        constraints = constraint_service.list_all(project_id)

        # Load point cloud
        xyz, normals = self._load_pointcloud(project_id, settings.data_dir)

        # Generate samples from constraints
        samples = self._generate_from_constraints(
            xyz=xyz,
            normals=normals,
            constraints=constraints,
            project=project,
            request=request,
        )

        # Save samples
        self._save_samples(project_id, samples, settings.data_dir)

        # Build response
        source_breakdown = {}
        for s in samples:
            source_breakdown[s.source] = source_breakdown.get(s.source, 0) + 1

        return TrainingSampleSet(
            samples=samples,
            sample_count=len(samples),
            source_breakdown=source_breakdown,
        )

    def export_parquet(self, project_id: str) -> Path | None:
        """Export samples as Parquet file."""
        from sdf_labeler_api.config import settings

        samples_path = settings.data_dir / "projects" / project_id / "samples.parquet"
        if not samples_path.exists():
            return None
        return samples_path

    def export_config(self, project_id: str, project: Project) -> ExportConfig:
        """Export SDFTaskSpec-compatible configuration."""
        from sdf_labeler_api.config import settings
        from sdf_labeler_api.services.constraint_service import ConstraintService

        constraint_service = ConstraintService()
        constraints = constraint_service.list_all(project_id)

        # Count samples
        samples_path = settings.data_dir / "projects" / project_id / "samples.parquet"
        sample_count = 0
        if samples_path.exists():
            df = pd.read_parquet(samples_path)
            sample_count = len(df)

        return ExportConfig(
            bounds_low=project.bounds_low or (0, 0, 0),
            bounds_high=project.bounds_high or (1, 1, 1),
            tsdf_trunc=project.config.tsdf_trunc,
            near_band=project.config.near_band,
            tangential_jitter=project.config.tangential_jitter,
            far_field_ratio=project.config.far_field_ratio,
            surface_anchor_ratio=project.config.surface_anchor_ratio,
            knn=project.config.knn_neighbors,
            orientation=project.config.normal_orientation,
            project_id=project.id,
            project_name=project.name,
            sample_count=sample_count,
            constraint_count=len(constraints.constraints),
        )

    def _load_pointcloud(
        self, project_id: str, data_dir: Path
    ) -> tuple[np.ndarray, np.ndarray | None]:
        """Load point cloud for a project."""
        points_path = data_dir / "projects" / project_id / "pointcloud" / "points.npz"
        if not points_path.exists():
            raise ValueError("No point cloud uploaded")

        data = np.load(points_path)
        xyz = data["xyz"]
        normals = data["normals"] if data["normals"].size > 0 else None
        return xyz, normals

    def _count_constraint_samples(
        self, constraints: ConstraintSet, samples_per_primitive: int = 100
    ) -> int:
        """Estimate sample count from constraints."""
        count = 0
        for c in constraints.constraints:
            if isinstance(c, BrushStrokeConstraint):
                # Each stroke point generates samples_per_primitive samples
                count += len(c.stroke_points) * samples_per_primitive
            elif isinstance(c, SeedPropagationConstraint):
                count += len(c.propagated_indices)
            elif isinstance(c, BoxConstraint | SphereConstraint | HalfspaceConstraint):
                count += samples_per_primitive
            elif isinstance(c, RayCarveConstraint):
                # Each ray generates samples_per_primitive samples
                count += len(c.rays) * samples_per_primitive
            elif isinstance(c, PocketConstraint):
                # Estimate based on voxel count
                count += min(c.voxel_count, samples_per_primitive * 10)
            elif isinstance(c, SliceSelectionConstraint):
                count += len(c.point_indices)
        return count

    def _generate_from_constraints(
        self,
        xyz: np.ndarray,
        normals: np.ndarray | None,
        constraints: ConstraintSet,
        project: Project,
        request: SampleGenerationRequest,
    ) -> list[TrainingSample]:
        """Generate samples from all constraints using the selected strategy."""
        rng = np.random.default_rng(request.seed)
        samples = []
        project_id = project.id

        # Build KD-tree for inverse_square strategy (distance to surface)
        surface_tree = None
        if request.strategy == SamplingStrategy.INVERSE_SQUARE:
            from scipy.spatial import KDTree

            surface_tree = KDTree(xyz)

        print(
            f"[DEBUG] Processing {len(constraints.constraints)} constraints with strategy={request.strategy.value}",
            flush=True,
        )
        for constraint in constraints.constraints:
            # Compute sample count based on strategy
            n_samples = self._compute_sample_count(constraint, request)

            print(
                f"[DEBUG] Constraint type: {type(constraint).__name__}, n_samples={n_samples}",
                flush=True,
            )
            if isinstance(constraint, BoxConstraint):
                if request.strategy == SamplingStrategy.INVERSE_SQUARE:
                    samples.extend(
                        self._sample_box_inverse_square(
                            constraint,
                            rng,
                            project.config.near_band,
                            n_samples,
                            surface_tree,
                            request,
                        )
                    )
                else:
                    samples.extend(
                        self._sample_box(constraint, rng, project.config.near_band, n_samples)
                    )
            elif isinstance(constraint, SphereConstraint):
                samples.extend(
                    self._sample_sphere(constraint, rng, project.config.near_band, n_samples)
                )
            elif isinstance(constraint, HalfspaceConstraint):
                samples.extend(
                    self._sample_halfspace(
                        constraint, xyz, rng, project.config.near_band, n_samples
                    )
                )
            elif isinstance(constraint, BrushStrokeConstraint):
                samples.extend(
                    self._sample_brush_stroke(constraint, rng, project.config.near_band, n_samples)
                )
            elif isinstance(constraint, SeedPropagationConstraint):
                samples.extend(self._sample_propagated(constraint, xyz, normals))
            elif isinstance(constraint, RayCarveConstraint):
                samples.extend(self._sample_ray_carve(constraint, rng, n_samples))
            elif isinstance(constraint, PocketConstraint):
                samples.extend(self._sample_pocket(constraint, project_id, rng, n_samples))
            elif isinstance(constraint, SliceSelectionConstraint):
                samples.extend(self._sample_slice_selection(constraint, xyz, normals))
            elif isinstance(constraint, SamplePointConstraint):
                samples.extend(self._sample_sample_point(constraint))

        return samples

    def _compute_sample_count(
        self,
        constraint: Any,
        request: SampleGenerationRequest,
    ) -> int:
        """Compute number of samples for a constraint based on strategy."""
        if request.strategy == SamplingStrategy.CONSTANT:
            return request.samples_per_primitive

        elif request.strategy == SamplingStrategy.DENSITY:
            # Compute volume and scale by density
            volume = self._compute_constraint_volume(constraint)
            return max(10, int(volume * request.samples_per_cubic_meter))

        elif request.strategy == SamplingStrategy.INVERSE_SQUARE:
            # Base samples, actual distribution handled in sampling method
            return request.inverse_square_base_samples

        return request.samples_per_primitive

    def _compute_constraint_volume(self, constraint: Any) -> float:
        """Compute approximate volume of a constraint in cubic meters."""
        if isinstance(constraint, BoxConstraint):
            half = np.array(constraint.half_extents)
            return float(np.prod(half * 2))  # length * width * height

        elif isinstance(constraint, SphereConstraint):
            return (4 / 3) * np.pi * (constraint.radius**3)

        elif isinstance(constraint, PocketConstraint):
            # Estimate from voxel count (assume ~0.01m voxels)
            voxel_size = 0.01
            return constraint.voxel_count * (voxel_size**3)

        elif isinstance(constraint, BrushStrokeConstraint):
            # Volume of spheres at each stroke point
            n_points = len(constraint.stroke_points)
            sphere_vol = (4 / 3) * np.pi * (constraint.radius**3)
            return n_points * sphere_vol * 0.5  # Overlap factor

        # Default: small volume
        return 0.001

    def _sample_box(
        self,
        constraint: BoxConstraint,
        rng: np.random.Generator,
        near_band: float,
        n_samples: int,
    ) -> list[TrainingSample]:
        """Generate samples from a box constraint."""
        samples = []
        center = np.array(constraint.center)
        half = np.array(constraint.half_extents)
        for _ in range(n_samples):
            # Random point near box surface
            face = rng.integers(0, 6)
            point = center + rng.uniform(-1, 1, 3) * half

            # Clamp to face
            axis = face // 2
            sign = 1 if face % 2 else -1
            point[axis] = center[axis] + sign * half[axis]

            # Offset based on sign convention
            # EMPTY (outside) = positive SDF, SOLID (inside) = negative SDF
            offset = near_band if constraint.sign == SignConvention.EMPTY else -near_band
            normal = np.zeros(3)
            normal[axis] = sign
            point = point + offset * normal

            # phi directly uses offset: EMPTY=+near_band, SOLID=-near_band
            phi = offset

            samples.append(
                TrainingSample(
                    x=float(point[0]),
                    y=float(point[1]),
                    z=float(point[2]),
                    phi=phi,
                    nx=float(normal[0]),
                    ny=float(normal[1]),
                    nz=float(normal[2]),
                    weight=constraint.weight,
                    source=f"box_{constraint.sign.value}",
                    is_surface=False,
                    is_free=constraint.sign == SignConvention.EMPTY,
                )
            )

        return samples

    def _sample_box_inverse_square(
        self,
        constraint: BoxConstraint,
        rng: np.random.Generator,
        near_band: float,
        n_samples: int,
        surface_tree: Any,
        request: SampleGenerationRequest,
    ) -> list[TrainingSample]:
        """Generate samples from a box with inverse-square density distribution.

        Samples more points near the surface (point cloud) and fewer far away.
        The density follows: density ∝ 1 / (distance_to_surface ^ falloff)
        """
        samples = []
        center = np.array(constraint.center)
        half = np.array(constraint.half_extents)
        falloff = request.inverse_square_falloff

        # Generate candidate points uniformly in the box
        # Then accept/reject based on inverse-square weighting
        n_candidates = n_samples * 10  # Oversample for rejection

        for _ in range(n_candidates):
            if len(samples) >= n_samples:
                break

            # Random point in box
            point = center + rng.uniform(-1, 1, 3) * half

            # Compute distance to nearest surface point
            dist_to_surface, _ = surface_tree.query(point, k=1)

            # Inverse-square acceptance probability
            # Normalize so that points at distance ~near_band have ~1.0 probability
            min_dist = max(dist_to_surface, near_band * 0.1)  # Avoid division by zero
            weight = (near_band / min_dist) ** falloff

            # Accept with probability proportional to weight
            if rng.random() < min(1.0, weight):
                # Offset based on sign convention
                offset = near_band if constraint.sign == SignConvention.EMPTY else -near_band
                phi = offset

                samples.append(
                    TrainingSample(
                        x=float(point[0]),
                        y=float(point[1]),
                        z=float(point[2]),
                        phi=phi,
                        nx=0.0,
                        ny=0.0,
                        nz=0.0,
                        weight=constraint.weight,
                        source=f"box_{constraint.sign.value}_inv_sq",
                        is_surface=False,
                        is_free=constraint.sign == SignConvention.EMPTY,
                    )
                )

        return samples

    def _sample_sphere(
        self,
        constraint: SphereConstraint,
        rng: np.random.Generator,
        near_band: float,
        n_samples: int,
    ) -> list[TrainingSample]:
        """Generate samples from a sphere constraint."""
        samples = []
        center = np.array(constraint.center)
        radius = constraint.radius
        for _ in range(n_samples):
            # Random direction
            direction = rng.standard_normal(3)
            direction /= np.linalg.norm(direction)

            # Point on sphere surface
            point = center + radius * direction

            # Offset based on sign
            # EMPTY (outside) = positive SDF, SOLID (inside) = negative SDF
            offset = near_band if constraint.sign == SignConvention.EMPTY else -near_band
            point = point + offset * direction
            phi = offset

            samples.append(
                TrainingSample(
                    x=float(point[0]),
                    y=float(point[1]),
                    z=float(point[2]),
                    phi=phi,
                    nx=float(direction[0]),
                    ny=float(direction[1]),
                    nz=float(direction[2]),
                    weight=constraint.weight,
                    source=f"sphere_{constraint.sign.value}",
                    is_surface=False,
                    is_free=constraint.sign == SignConvention.EMPTY,
                )
            )

        return samples

    def _sample_halfspace(
        self,
        constraint: HalfspaceConstraint,
        xyz: np.ndarray,
        rng: np.random.Generator,
        near_band: float,
        n_samples: int,
    ) -> list[TrainingSample]:
        """Generate samples from a halfspace constraint."""
        samples = []
        point = np.array(constraint.point)
        normal = np.array(constraint.normal)
        normal /= np.linalg.norm(normal)

        # Sample points in the halfspace region
        bounds_low = xyz.min(axis=0)
        bounds_high = xyz.max(axis=0)
        for _ in range(n_samples):
            # Random point in bounds
            sample_point = rng.uniform(bounds_low, bounds_high)

            # Compute signed distance to plane
            dist = np.dot(sample_point - point, normal)

            # Determine phi based on sign convention
            if constraint.sign == SignConvention.EMPTY:
                phi = abs(dist) + near_band  # Positive (outside)
            else:
                phi = -(abs(dist) + near_band)  # Negative (inside)

            samples.append(
                TrainingSample(
                    x=float(sample_point[0]),
                    y=float(sample_point[1]),
                    z=float(sample_point[2]),
                    phi=phi,
                    nx=float(normal[0]),
                    ny=float(normal[1]),
                    nz=float(normal[2]),
                    weight=constraint.weight,
                    source=f"halfspace_{constraint.sign.value}",
                    is_surface=False,
                    is_free=constraint.sign == SignConvention.EMPTY,
                )
            )

        return samples

    def _sample_brush_stroke(
        self,
        constraint: BrushStrokeConstraint,
        rng: np.random.Generator,
        near_band: float,
        n_samples_per_point: int,
    ) -> list[TrainingSample]:
        """Generate samples from brush stroke volume.

        Samples uniformly within the tube-like stroke region.
        """
        samples = []
        stroke_points = np.array(constraint.stroke_points)
        radius = constraint.radius

        # Determine phi based on sign
        if constraint.sign == SignConvention.SURFACE:
            phi = 0.0
        elif constraint.sign == SignConvention.SOLID:
            phi = -near_band
        else:  # EMPTY
            phi = near_band

        # Sample around each stroke point
        for center in stroke_points:
            for _ in range(n_samples_per_point):
                # Random point within sphere of radius
                direction = rng.standard_normal(3)
                direction /= np.linalg.norm(direction)
                distance = rng.uniform(0, radius)
                point = center + distance * direction

                samples.append(
                    TrainingSample(
                        x=float(point[0]),
                        y=float(point[1]),
                        z=float(point[2]),
                        phi=phi,
                        nx=0.0,  # No normal for volumetric samples
                        ny=0.0,
                        nz=0.0,
                        weight=constraint.weight,
                        source=f"brush_{constraint.sign.value}",
                        is_surface=constraint.sign == SignConvention.SURFACE,
                        is_free=constraint.sign == SignConvention.EMPTY,
                    )
                )

        return samples

    def _sample_propagated(
        self,
        constraint: SeedPropagationConstraint,
        xyz: np.ndarray,
        normals: np.ndarray | None,
    ) -> list[TrainingSample]:
        """Generate samples from propagated seed."""
        samples = []

        for i, idx in enumerate(constraint.propagated_indices):
            if idx >= len(xyz):
                continue

            point = xyz[idx]
            normal = normals[idx] if normals is not None else [0, 0, 1]
            confidence = constraint.confidences[i] if i < len(constraint.confidences) else 1.0

            phi = (
                0.0
                if constraint.sign == SignConvention.SURFACE
                else (-0.01 if constraint.sign == SignConvention.SOLID else 0.01)
            )

            samples.append(
                TrainingSample(
                    x=float(point[0]),
                    y=float(point[1]),
                    z=float(point[2]),
                    phi=phi,
                    nx=float(normal[0]),
                    ny=float(normal[1]),
                    nz=float(normal[2]),
                    weight=constraint.weight * confidence,
                    source=f"propagated_{constraint.sign.value}",
                    is_surface=constraint.sign == SignConvention.SURFACE,
                    is_free=constraint.sign == SignConvention.EMPTY,
                )
            )

        return samples

    def _sample_ray_carve(
        self,
        constraint: RayCarveConstraint,
        rng: np.random.Generator,
        n_samples_per_ray: int,
    ) -> list[TrainingSample]:
        """Generate samples from ray-carve constraint.

        For each ray:
        1. Sample EMPTY points uniformly along ray from origin to (hit - empty_band)
        2. Sample SURFACE points in band around hit point

        Uses outlier detection to prevent rays that pass through thin surface gaps
        from bleeding through to the other side.
        """
        print(
            f"[DEBUG] _sample_ray_carve called with {len(constraint.rays)} rays, coeff={constraint.back_buffer_coefficient}",
            flush=True,
        )
        samples = []

        # Pre-compute ray data for outlier detection
        ray_data = []
        for ray in constraint.rays:
            origin = np.array(ray.origin)
            direction = np.array(ray.direction)
            direction = direction / np.linalg.norm(direction)
            hit_point = origin + direction * ray.hit_distance
            ray_data.append(
                {
                    "origin": origin,
                    "direction": direction,
                    "hit_distance": ray.hit_distance,
                    "hit_point": hit_point,
                    "local_spacing": ray.local_spacing,
                    "surface_normal": ray.surface_normal,
                }
            )

        # Detect outliers: rays that pass through gaps and hit back faces
        effective_hit_distances = []
        for i, ray in enumerate(ray_data):
            effective_dist = ray["hit_distance"]

            for j, other in enumerate(ray_data):
                if i == j:
                    continue

                # Check if rays have similar directions (within ~18 degrees)
                dir_dot = np.dot(ray["direction"], other["direction"])
                if dir_dot > 0.95:
                    # Project this ray's hit point onto the other ray's direction
                    to_hit = ray["hit_point"] - other["origin"]
                    proj_dist = np.dot(to_hit, other["direction"])

                    # If this ray extends significantly past where a nearby ray hit,
                    # it likely passed through a gap - clamp to the other ray's hit distance
                    if proj_dist > other["hit_distance"] * 1.1:
                        effective_dist = min(effective_dist, other["hit_distance"])

            effective_hit_distances.append(effective_dist)

        for idx, ray in enumerate(ray_data):
            origin = ray["origin"]
            direction = ray["direction"]
            hit_dist = effective_hit_distances[idx]  # Use clamped distance

            # Compute the "impenetrable buffer" zone size
            # This is the zone before the hit where we don't sample empty points
            # Higher coefficient = larger buffer = more protection from bleed-through
            if ray["local_spacing"] is not None:
                buffer_zone = ray["local_spacing"] * constraint.back_buffer_coefficient
                print(
                    f"[DEBUG] Impenetrable buffer: local_spacing={ray['local_spacing']:.4f} × coeff={constraint.back_buffer_coefficient} = {buffer_zone:.4f}",
                    flush=True,
                )
            else:
                buffer_zone = constraint.back_buffer_width
                print(f"[DEBUG] Fixed buffer: {buffer_zone:.4f} (no local_spacing)", flush=True)

            # EMPTY samples along ray (before hit, stopping at buffer zone)
            empty_end = hit_dist - buffer_zone
            n_empty = n_samples_per_ray // 2

            if empty_end > 0:
                for _ in range(n_empty):
                    t = rng.uniform(0, empty_end)
                    point = origin + t * direction

                    samples.append(
                        TrainingSample(
                            x=float(point[0]),
                            y=float(point[1]),
                            z=float(point[2]),
                            phi=hit_dist - t,  # Signed distance: positive = outside surface
                            nx=float(direction[0]),
                            ny=float(direction[1]),
                            nz=float(direction[2]),
                            weight=constraint.weight,
                            source="ray_carve_empty",
                            is_surface=False,
                            is_free=True,
                        )
                    )

            # SURFACE samples near hit (from -surface_band to hit, NEVER past hit!)
            n_surface = n_samples_per_ray - n_empty
            for _ in range(n_surface):
                t = rng.uniform(
                    hit_dist - constraint.surface_band_width,
                    hit_dist,  # Never sample past the hit point
                )
                point = origin + t * direction
                phi = 0.0  # Surface samples are on the zero level set

                # Use surface normal if available, otherwise use ray direction
                if ray["surface_normal"]:
                    nx, ny, nz = ray["surface_normal"]
                else:
                    nx, ny, nz = -direction[0], -direction[1], -direction[2]

                samples.append(
                    TrainingSample(
                        x=float(point[0]),
                        y=float(point[1]),
                        z=float(point[2]),
                        phi=phi,
                        nx=float(nx),
                        ny=float(ny),
                        nz=float(nz),
                        weight=constraint.weight,
                        source="ray_carve_surface",
                        is_surface=True,  # Surface samples are always on the surface
                        is_free=False,
                    )
                )

        return samples

    def _sample_pocket(
        self,
        constraint: PocketConstraint,
        project_id: str,
        rng: np.random.Generator,
        n_samples: int,
    ) -> list[TrainingSample]:
        """Generate samples from a pocket constraint.

        Samples uniformly within the pocket voxel volume.
        """
        from sdf_labeler_api.config import settings
        from sdf_labeler_api.services.pocket_service import PocketService

        pocket_service = PocketService(settings)
        voxels = pocket_service.get_pocket_voxels(project_id, constraint.pocket_id)

        if voxels is None or len(voxels) == 0:
            return []

        samples = []

        # Determine phi based on sign
        if constraint.sign == SignConvention.SOLID:
            phi = -0.05  # Negative = inside
        else:
            phi = 0.05  # Positive = outside

        # Sample uniformly within pocket volume
        n_to_sample = min(n_samples, len(voxels) * 10)
        for _ in range(n_to_sample):
            # Pick random voxel center
            idx = rng.integers(0, len(voxels))
            point = voxels[idx]

            samples.append(
                TrainingSample(
                    x=float(point[0]),
                    y=float(point[1]),
                    z=float(point[2]),
                    phi=phi,
                    nx=0.0,
                    ny=0.0,
                    nz=0.0,
                    weight=constraint.weight,
                    source=f"pocket_{constraint.sign.value}",
                    is_surface=False,
                    is_free=constraint.sign == SignConvention.EMPTY,
                )
            )

        return samples

    def _sample_slice_selection(
        self,
        constraint: SliceSelectionConstraint,
        xyz: np.ndarray,
        normals: np.ndarray | None,
    ) -> list[TrainingSample]:
        """Generate samples from slice selection constraint.

        One sample per selected point.
        """
        samples = []

        for idx in constraint.point_indices:
            if idx >= len(xyz):
                continue

            point = xyz[idx]
            normal = normals[idx] if normals is not None else [0, 0, 1]

            # Determine phi based on sign
            if constraint.sign == SignConvention.SURFACE:
                phi = 0.0
            elif constraint.sign == SignConvention.SOLID:
                phi = -0.01
            else:  # EMPTY
                phi = 0.01

            samples.append(
                TrainingSample(
                    x=float(point[0]),
                    y=float(point[1]),
                    z=float(point[2]),
                    phi=phi,
                    nx=float(normal[0]),
                    ny=float(normal[1]),
                    nz=float(normal[2]),
                    weight=constraint.weight,
                    source=f"slice_{constraint.sign.value}",
                    is_surface=constraint.sign == SignConvention.SURFACE,
                    is_free=constraint.sign == SignConvention.EMPTY,
                )
            )

        return samples

    def _sample_sample_point(
        self,
        constraint: SamplePointConstraint,
    ) -> list[TrainingSample]:
        """Convert a sample_point constraint directly to a training sample.

        Sample point constraints from IDW normal sampling are already in sample form,
        so we just convert them directly to TrainingSample format.
        """
        # phi is the signed distance (negative=solid, positive=empty)
        phi = constraint.distance

        return [
            TrainingSample(
                x=float(constraint.position[0]),
                y=float(constraint.position[1]),
                z=float(constraint.position[2]),
                phi=phi,
                nx=0.0,  # No normal information for IDW samples
                ny=0.0,
                nz=0.0,
                weight=constraint.weight,
                source=f"idw_{constraint.sign.value}",
                is_surface=constraint.sign == SignConvention.SURFACE,
                is_free=constraint.sign == SignConvention.EMPTY,
            )
        ]

    def _save_samples(self, project_id: str, samples: list[TrainingSample], data_dir: Path) -> None:
        """Save samples to Parquet file."""
        if not samples:
            return

        df = pd.DataFrame([s.model_dump() for s in samples])
        path = data_dir / "projects" / project_id / "samples.parquet"
        df.to_parquet(path)

    def get_samples_for_visualization(
        self, project_id: str, limit: int = 10000, subsample: bool = True
    ) -> "SampleVisualizationResponse":
        """
        Get samples for 3D visualization.

        Args:
            project_id: Project ID
            limit: Maximum samples to return
            subsample: Whether to randomly subsample if count > limit

        Returns:
            SampleVisualizationResponse with minimal sample data for rendering
        """
        from sdf_labeler_api.config import settings
        from sdf_labeler_api.models.samples import SamplePoint, SampleVisualizationResponse

        samples_path = settings.data_dir / "projects" / project_id / "samples.parquet"
        if not samples_path.exists():
            return SampleVisualizationResponse(
                samples=[],
                total_count=0,
                returned_count=0,
                phi_min=0.0,
                phi_max=0.0,
            )

        df = pd.read_parquet(samples_path, columns=["x", "y", "z", "phi"])
        total_count = len(df)

        # Compute phi stats before subsampling
        phi_min = float(df["phi"].min())
        phi_max = float(df["phi"].max())

        # Subsample if needed
        if subsample and total_count > limit:
            indices = np.random.default_rng(seed=42).choice(total_count, size=limit, replace=False)
            df = df.iloc[indices]

        # Convert to list of SamplePoint
        samples = [
            SamplePoint(x=row["x"], y=row["y"], z=row["z"], phi=row["phi"])
            for _, row in df.iterrows()
        ]

        return SampleVisualizationResponse(
            samples=samples,
            total_count=total_count,
            returned_count=len(samples),
            phi_min=phi_min,
            phi_max=phi_max,
        )

    def expand_to_sample_points(
        self, project_id: str, samples_per_constraint: int = 100
    ) -> list[dict]:
        """Expand shape constraints to sample_point constraints for visualization.

        This converts boxes, spheres, cylinders etc. to individual sample points
        using inverse-square distance weighting (more points near surface).

        Returns a list of sample_point constraint dicts ready for visualization.
        """
        from scipy.spatial import KDTree

        from sdf_labeler_api.config import settings
        from sdf_labeler_api.services.constraint_service import ConstraintService

        constraint_service = ConstraintService()
        constraints = constraint_service.list_all(project_id)

        # Load point cloud for distance computation
        try:
            xyz, _ = self._load_pointcloud(project_id, settings.data_dir)
        except ValueError:
            return []

        if xyz is None or len(xyz) == 0:
            return []

        # Build KD-tree for distance to surface
        tree = KDTree(xyz)
        rng = np.random.default_rng(42)

        sample_points = []

        for constraint in constraints.constraints:
            # Skip sample_point constraints - they're already points
            if isinstance(constraint, SamplePointConstraint):
                continue

            # Generate sample points for shape constraints
            points = self._expand_constraint_to_points(
                constraint, samples_per_constraint, tree, rng
            )
            sample_points.extend(points)

        return sample_points

    def _expand_constraint_to_points(
        self,
        constraint: Any,
        n_samples: int,
        surface_tree: Any,
        rng: np.random.Generator,
    ) -> list[dict]:
        """Convert a single shape constraint to sample point dicts."""
        from sdf_labeler_api.models.constraints import CylinderConstraint

        points = []

        if isinstance(constraint, BoxConstraint):
            points = self._expand_box(constraint, n_samples, surface_tree, rng)
        elif isinstance(constraint, SphereConstraint):
            points = self._expand_sphere(constraint, n_samples, surface_tree, rng)
        elif isinstance(constraint, CylinderConstraint):
            points = self._expand_cylinder(constraint, n_samples, surface_tree, rng)
        elif isinstance(constraint, HalfspaceConstraint):
            # Halfspace needs bounds - skip for now
            pass
        elif isinstance(constraint, BrushStrokeConstraint):
            points = self._expand_brush_stroke(constraint, n_samples, surface_tree, rng)
        elif isinstance(constraint, PocketConstraint):
            # Pocket already has voxels - could expand but skip for now
            pass

        return points

    def _expand_box(
        self,
        constraint: BoxConstraint,
        n_samples: int,
        surface_tree: Any,
        rng: np.random.Generator,
    ) -> list[dict]:
        """Expand box constraint to sample points with inverse-square weighting."""
        center = np.array(constraint.center)
        half = np.array(constraint.half_extents)

        # Generate candidates with inverse-square rejection sampling
        points = []
        n_candidates = n_samples * 10

        for _ in range(n_candidates):
            if len(points) >= n_samples:
                break

            # Random point in box
            point = center + rng.uniform(-1, 1, 3) * half

            # Distance to surface
            dist, _ = surface_tree.query(point, k=1)

            # Inverse-square acceptance
            min_dist = max(dist, 0.01)
            weight = 1.0 / (min_dist**2)
            max_weight = 1.0 / (0.01**2)

            if rng.random() < weight / max_weight:
                signed_dist = -dist if constraint.sign == SignConvention.SOLID else dist
                points.append(
                    {
                        "type": "sample_point",
                        "sign": constraint.sign.value,
                        "position": tuple(point.tolist()),
                        "distance": float(signed_dist),
                    }
                )

        return points

    def _expand_sphere(
        self,
        constraint: SphereConstraint,
        n_samples: int,
        surface_tree: Any,
        rng: np.random.Generator,
    ) -> list[dict]:
        """Expand sphere constraint to sample points."""
        center = np.array(constraint.center)
        radius = constraint.radius

        points = []
        n_candidates = n_samples * 10

        for _ in range(n_candidates):
            if len(points) >= n_samples:
                break

            # Random point in sphere (cube rejection sampling)
            while True:
                point = center + rng.uniform(-1, 1, 3) * radius
                if np.linalg.norm(point - center) <= radius:
                    break

            # Distance to surface
            dist, _ = surface_tree.query(point, k=1)

            # Inverse-square acceptance
            min_dist = max(dist, 0.01)
            weight = 1.0 / (min_dist**2)
            max_weight = 1.0 / (0.01**2)

            if rng.random() < weight / max_weight:
                signed_dist = -dist if constraint.sign == SignConvention.SOLID else dist
                points.append(
                    {
                        "type": "sample_point",
                        "sign": constraint.sign.value,
                        "position": tuple(point.tolist()),
                        "distance": float(signed_dist),
                    }
                )

        return points

    def _expand_cylinder(
        self,
        constraint: Any,  # CylinderConstraint
        n_samples: int,
        surface_tree: Any,
        rng: np.random.Generator,
    ) -> list[dict]:
        """Expand cylinder constraint to sample points."""
        center = np.array(constraint.center)
        radius = constraint.radius
        height = constraint.height
        axis = np.array(constraint.axis)
        axis = axis / np.linalg.norm(axis)

        points = []
        n_candidates = n_samples * 10

        for _ in range(n_candidates):
            if len(points) >= n_samples:
                break

            # Random point in cylinder
            # Random height along axis
            h = rng.uniform(-height / 2, height / 2)
            # Random point in disk
            theta = rng.uniform(0, 2 * np.pi)
            r = radius * np.sqrt(rng.uniform(0, 1))

            # Build orthonormal basis
            if abs(axis[2]) < 0.9:
                perp1 = np.cross(axis, [0, 0, 1])
            else:
                perp1 = np.cross(axis, [1, 0, 0])
            perp1 = perp1 / np.linalg.norm(perp1)
            perp2 = np.cross(axis, perp1)

            point = center + h * axis + r * (np.cos(theta) * perp1 + np.sin(theta) * perp2)

            # Distance to surface
            dist, _ = surface_tree.query(point, k=1)

            # Inverse-square acceptance
            min_dist = max(dist, 0.01)
            weight = 1.0 / (min_dist**2)
            max_weight = 1.0 / (0.01**2)

            if rng.random() < weight / max_weight:
                signed_dist = -dist if constraint.sign == SignConvention.SOLID else dist
                points.append(
                    {
                        "type": "sample_point",
                        "sign": constraint.sign.value,
                        "position": tuple(point.tolist()),
                        "distance": float(signed_dist),
                    }
                )

        return points

    def _expand_brush_stroke(
        self,
        constraint: BrushStrokeConstraint,
        n_samples: int,
        surface_tree: Any,
        rng: np.random.Generator,
    ) -> list[dict]:
        """Expand brush stroke constraint to sample points."""
        points = []
        samples_per_point = max(1, n_samples // len(constraint.stroke_points))

        for stroke_pt in constraint.stroke_points:
            center = np.array(stroke_pt)
            radius = constraint.radius

            n_candidates = samples_per_point * 10
            for _ in range(n_candidates):
                if (
                    len(
                        [
                            p
                            for p in points
                            if np.linalg.norm(np.array(p["position"]) - center) < radius * 2
                        ]
                    )
                    >= samples_per_point
                ):
                    break

                # Random point in sphere around stroke point
                direction = rng.standard_normal(3)
                direction = direction / np.linalg.norm(direction)
                r = radius * (rng.uniform(0, 1) ** (1 / 3))
                point = center + r * direction

                # Distance to surface
                dist, _ = surface_tree.query(point, k=1)

                # Inverse-square acceptance
                min_dist = max(dist, 0.01)
                weight = 1.0 / (min_dist**2)
                max_weight = 1.0 / (0.01**2)

                if rng.random() < weight / max_weight:
                    signed_dist = -dist if constraint.sign == SignConvention.SOLID else dist
                    points.append(
                        {
                            "type": "sample_point",
                            "sign": constraint.sign.value,
                            "position": tuple(point.tolist()),
                            "distance": float(signed_dist),
                        }
                    )

        return points
