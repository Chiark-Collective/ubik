# ABOUTME: Unit tests for SamplingService
# ABOUTME: Tests constraint-to-sample conversion for SDF training

import numpy as np
import pytest

from sdf_labeler_api.models.constraints import (
    BoxConstraint,
    BrushStrokeConstraint,
    HalfspaceConstraint,
    SeedPropagationConstraint,
    SignConvention,
    SphereConstraint,
)
from sdf_labeler_api.models.samples import SampleGenerationRequest
from sdf_labeler_api.services.constraint_service import ConstraintService
from sdf_labeler_api.services.sampling_service import SamplingService


@pytest.fixture
def sampling_service() -> SamplingService:
    """Create a SamplingService instance."""
    return SamplingService()


class TestSamplingServiceGenerate:
    """Tests for sample generation from constraints."""

    def test_generate_no_constraints(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test generating samples with no constraints."""
        request = SampleGenerationRequest(total_samples=100)

        result = sampling_service.generate(sample_project.id, request)

        # Should return empty sample set
        assert result.sample_count == 0
        assert result.samples == []

    def test_generate_from_box_solid(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test generating samples from a solid box constraint."""
        box = BoxConstraint(
            sign=SignConvention.SOLID,
            center=(0.5, 0.5, 0.5),
            half_extents=(0.2, 0.2, 0.2),
        )
        constraint_service.add(sample_project.id, box)

        request = SampleGenerationRequest(total_samples=1000)
        result = sampling_service.generate(sample_project.id, request)

        assert result.sample_count > 0
        # Source name may have strategy suffix (e.g., box_solid_inv_sq)
        assert any(k.startswith("box_solid") for k in result.source_breakdown)

        # Check sample properties
        for sample in result.samples:
            assert sample.source.startswith("box_solid")
            assert sample.phi < 0  # Solid = negative SDF
            assert sample.is_free is False
            assert sample.weight == 1.0

    def test_generate_from_box_empty(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test generating samples from an empty box constraint."""
        box = BoxConstraint(
            sign=SignConvention.EMPTY,
            center=(0.5, 0.5, 0.5),
            half_extents=(0.2, 0.2, 0.2),
        )
        constraint_service.add(sample_project.id, box)

        request = SampleGenerationRequest()
        result = sampling_service.generate(sample_project.id, request)

        assert result.sample_count > 0

        for sample in result.samples:
            # Source name may have strategy suffix (e.g., box_empty_inv_sq)
            assert sample.source.startswith("box_empty")
            assert sample.phi > 0  # Empty = positive SDF
            assert sample.is_free is True

    def test_generate_from_sphere(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test generating samples from a sphere constraint."""
        sphere = SphereConstraint(
            sign=SignConvention.SOLID,
            center=(0.5, 0.5, 0.5),
            radius=0.3,
        )
        constraint_service.add(sample_project.id, sphere)

        request = SampleGenerationRequest()
        result = sampling_service.generate(sample_project.id, request)

        assert result.sample_count > 0
        # Source name may have strategy suffix
        assert any(k.startswith("sphere_solid") for k in result.source_breakdown)

        # Check normals are unit vectors (pointing outward from sphere center)
        for sample in result.samples:
            nx, ny, nz = sample.nx, sample.ny, sample.nz
            norm = np.sqrt(nx**2 + ny**2 + nz**2)
            assert abs(norm - 1.0) < 1e-5, "Normals should be unit vectors"

    def test_generate_from_halfspace(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test generating samples from a halfspace constraint."""
        halfspace = HalfspaceConstraint(
            sign=SignConvention.EMPTY,
            point=(0.0, 0.0, 0.5),
            normal=(0.0, 0.0, 1.0),
        )
        constraint_service.add(sample_project.id, halfspace)

        request = SampleGenerationRequest()
        result = sampling_service.generate(sample_project.id, request)

        assert result.sample_count > 0
        # Source name may have strategy suffix
        assert any(k.startswith("halfspace_empty") for k in result.source_breakdown)

    def test_generate_from_brush_stroke(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test generating samples from brush stroke."""
        stroke = BrushStrokeConstraint(
            sign=SignConvention.EMPTY,
            stroke_points=[(0.0, 0.0, 0.0), (0.1, 0.0, 0.0), (0.2, 0.0, 0.0)],
            radius=0.05,
        )
        constraint_service.add(sample_project.id, stroke)

        # Use CONSTANT strategy to get predictable sample counts
        from sdf_labeler_api.models.samples import SamplingStrategy

        request = SampleGenerationRequest(
            strategy=SamplingStrategy.CONSTANT, samples_per_primitive=10
        )
        result = sampling_service.generate(sample_project.id, request)

        # 3 stroke points * 10 samples each = 30 samples
        assert result.sample_count == 30
        assert "brush_empty" in result.source_breakdown

        # Empty samples should have positive phi
        for sample in result.samples:
            assert sample.phi > 0
            assert sample.is_free is True

    def test_generate_from_seed_propagation(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test generating samples from seed propagation."""
        seed = SeedPropagationConstraint(
            sign=SignConvention.SOLID,
            seed_point=(0.5, 0.5, 0.5),
            propagation_radius=0.3,
            propagated_indices=[0, 1, 2, 3, 4],
            confidences=[1.0, 0.9, 0.8, 0.7, 0.6],
        )
        constraint_service.add(sample_project.id, seed)

        request = SampleGenerationRequest()
        result = sampling_service.generate(sample_project.id, request)

        assert result.sample_count == 5
        assert "propagated_solid" in result.source_breakdown

        # Check that weights reflect confidences
        weights = sorted([s.weight for s in result.samples], reverse=True)
        assert weights == [1.0, 0.9, 0.8, 0.7, 0.6]

    def test_generate_multiple_constraints(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test generating samples from multiple constraints."""
        box = BoxConstraint(
            sign=SignConvention.SOLID,
            center=(0.3, 0.3, 0.3),
            half_extents=(0.1, 0.1, 0.1),
        )
        sphere = SphereConstraint(
            sign=SignConvention.EMPTY,
            center=(0.7, 0.7, 0.7),
            radius=0.15,
        )
        constraint_service.add(sample_project.id, box)
        constraint_service.add(sample_project.id, sphere)

        request = SampleGenerationRequest()
        result = sampling_service.generate(sample_project.id, request)

        assert result.sample_count > 0
        # Source names may have strategy suffix
        assert any(k.startswith("box_solid") for k in result.source_breakdown)
        assert any(k.startswith("sphere_empty") for k in result.source_breakdown)

    def test_generate_with_custom_weight(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test that constraint weight is applied to samples."""
        box = BoxConstraint(
            sign=SignConvention.SOLID,
            weight=2.5,
            center=(0.5, 0.5, 0.5),
            half_extents=(0.1, 0.1, 0.1),
        )
        constraint_service.add(sample_project.id, box)

        request = SampleGenerationRequest()
        result = sampling_service.generate(sample_project.id, request)

        for sample in result.samples:
            assert sample.weight == 2.5

    def test_generate_reproducible_with_seed(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test that generation is reproducible with same seed."""
        box = BoxConstraint(
            sign=SignConvention.SOLID,
            center=(0.5, 0.5, 0.5),
            half_extents=(0.2, 0.2, 0.2),
        )
        constraint_service.add(sample_project.id, box)

        request1 = SampleGenerationRequest(seed=42)
        request2 = SampleGenerationRequest(seed=42)

        result1 = sampling_service.generate(sample_project.id, request1)
        result2 = sampling_service.generate(sample_project.id, request2)

        assert result1.sample_count == result2.sample_count
        for s1, s2 in zip(result1.samples, result2.samples):
            assert s1.x == s2.x
            assert s1.y == s2.y
            assert s1.z == s2.z


class TestSamplingServicePreview:
    """Tests for sample preview functionality."""

    def test_preview_estimates_counts(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test that preview estimates sample counts."""
        box = BoxConstraint(
            sign=SignConvention.SOLID,
            center=(0.5, 0.5, 0.5),
            half_extents=(0.1, 0.1, 0.1),
        )
        constraint_service.add(sample_project.id, box)

        request = SampleGenerationRequest(total_samples=10000)
        preview = sampling_service.preview(sample_project.id, request)

        assert preview.total_count > 0
        assert preview.constraint_sample_count > 0


class TestSamplingServiceExport:
    """Tests for sample export functionality."""

    def test_export_parquet_no_samples(
        self,
        sampling_service: SamplingService,
        sample_project,
    ):
        """Test export when no samples have been generated."""
        result = sampling_service.export_parquet(sample_project.id)
        assert result is None

    def test_export_parquet_after_generate(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
        temp_data_dir,
    ):
        """Test export after generating samples."""
        box = BoxConstraint(
            sign=SignConvention.SOLID,
            center=(0.5, 0.5, 0.5),
            half_extents=(0.1, 0.1, 0.1),
        )
        constraint_service.add(sample_project.id, box)

        request = SampleGenerationRequest()
        sampling_service.generate(sample_project.id, request)

        path = sampling_service.export_parquet(sample_project.id)

        assert path is not None
        assert path.exists()
        assert path.suffix == ".parquet"

    def test_export_config(
        self,
        sampling_service: SamplingService,
        sample_project,
    ):
        """Test exporting SDFTaskSpec configuration."""
        config = sampling_service.export_config(sample_project.id, sample_project)

        assert config.project_id == sample_project.id
        assert config.project_name == sample_project.name
        assert config.near_band == sample_project.config.near_band
        assert config.tsdf_trunc == sample_project.config.tsdf_trunc


class TestSamplingServiceValidation:
    """Tests for input validation and edge cases."""

    def test_empty_propagated_indices(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test seed propagation with no propagated points."""
        seed = SeedPropagationConstraint(
            sign=SignConvention.SOLID,
            seed_point=(0.5, 0.5, 0.5),
            propagation_radius=0.1,
            propagated_indices=[],
            confidences=[],
        )
        constraint_service.add(sample_project.id, seed)

        request = SampleGenerationRequest()
        result = sampling_service.generate(sample_project.id, request)

        assert result.sample_count == 0
