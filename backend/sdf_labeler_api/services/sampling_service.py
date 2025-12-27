# ABOUTME: Training sample generation service
# ABOUTME: Converts constraints to survi-compatible training data

import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

from sdf_labeler_api.models.constraints import (
    BoxConstraint,
    BrushStrokeConstraint,
    ConstraintSet,
    HalfspaceConstraint,
    PocketConstraint,
    RayCarveConstraint,
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
            elif isinstance(c, (BoxConstraint, SphereConstraint, HalfspaceConstraint)):
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
        """Generate samples from all constraints."""
        rng = np.random.default_rng(request.seed)
        samples = []

        n_samples = request.samples_per_primitive
        project_id = project.id

        print(f"[DEBUG] Processing {len(constraints.constraints)} constraints", flush=True)
        for constraint in constraints.constraints:
            print(f"[DEBUG] Constraint type: {type(constraint).__name__}", flush=True)
            if isinstance(constraint, BoxConstraint):
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
                    self._sample_brush_stroke(
                        constraint, rng, project.config.near_band, n_samples
                    )
                )
            elif isinstance(constraint, SeedPropagationConstraint):
                samples.extend(
                    self._sample_propagated(constraint, xyz, normals)
                )
            elif isinstance(constraint, RayCarveConstraint):
                samples.extend(
                    self._sample_ray_carve(constraint, rng, n_samples)
                )
            elif isinstance(constraint, PocketConstraint):
                samples.extend(
                    self._sample_pocket(constraint, project_id, rng, n_samples)
                )
            elif isinstance(constraint, SliceSelectionConstraint):
                samples.extend(
                    self._sample_slice_selection(constraint, xyz, normals)
                )

        return samples

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

            phi = 0.0 if constraint.sign == SignConvention.SURFACE else (
                -0.01 if constraint.sign == SignConvention.SOLID else 0.01
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
        """
        print(f"[DEBUG] _sample_ray_carve called with {len(constraint.rays)} rays, coeff={constraint.back_buffer_coefficient}", flush=True)
        samples = []

        for ray in constraint.rays:
            origin = np.array(ray.origin)
            direction = np.array(ray.direction)
            direction = direction / np.linalg.norm(direction)
            hit_dist = ray.hit_distance

            # Compute the "impenetrable buffer" zone size
            # This is the zone before the hit where we don't sample empty points
            # Higher coefficient = larger buffer = more protection from bleed-through
            if ray.local_spacing is not None:
                buffer_zone = ray.local_spacing * constraint.back_buffer_coefficient
                print(f"[DEBUG] Impenetrable buffer: local_spacing={ray.local_spacing:.4f} × coeff={constraint.back_buffer_coefficient} = {buffer_zone:.4f}", flush=True)
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
                phi = t - hit_dist  # Signed distance from surface (always <= 0 now)

                # Use surface normal if available, otherwise use ray direction
                if ray.surface_normal:
                    nx, ny, nz = ray.surface_normal
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
                        is_surface=abs(phi) < 0.01,
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

    def _save_samples(
        self, project_id: str, samples: list[TrainingSample], data_dir: Path
    ) -> None:
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
            indices = np.random.default_rng(seed=42).choice(
                total_count, size=limit, replace=False
            )
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
