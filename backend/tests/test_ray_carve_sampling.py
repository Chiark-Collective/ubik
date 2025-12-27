# ABOUTME: Unit tests for ray_carve constraint sampling with adaptive back buffer
# ABOUTME: Tests local spacing-based back buffer and fallback behavior

import numpy as np
import pytest

from sdf_labeler_api.models.constraints import (
    RayCarveConstraint,
    RayInfo,
    SignConvention,
)
from sdf_labeler_api.models.samples import SampleGenerationRequest
from sdf_labeler_api.services.constraint_service import ConstraintService
from sdf_labeler_api.services.sampling_service import SamplingService


@pytest.fixture
def sampling_service() -> SamplingService:
    """Create a SamplingService instance."""
    return SamplingService()


class TestRayCarveAdaptiveBackBuffer:
    """Tests for adaptive back buffer based on local spacing."""

    def test_ray_carve_with_local_spacing(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test ray_carve uses local_spacing * coefficient when available."""
        ray = RayInfo(
            origin=(0.0, 0.0, 0.0),
            direction=(1.0, 0.0, 0.0),
            hit_distance=1.0,
            local_spacing=0.1,  # Local spacing provided
        )
        constraint = RayCarveConstraint(
            sign=SignConvention.EMPTY,
            rays=[ray],
            empty_band_width=0.1,
            surface_band_width=0.02,
            back_buffer_width=0.0,  # Fixed fallback (not used)
            back_buffer_coefficient=2.0,  # 2x local spacing = 0.2
        )
        constraint_service.add(sample_project.id, constraint)

        request = SampleGenerationRequest(total_samples=1000, samples_per_primitive=500)
        result = sampling_service.generate(sample_project.id, request)

        # Should have samples from ray_carve
        assert result.sample_count > 0

        # Check that surface samples can extend past hit point
        # With local_spacing=0.1 and coefficient=2.0, max back buffer = 0.2
        surface_samples = [s for s in result.samples if s.source == "ray_carve_surface"]
        assert len(surface_samples) > 0

        # Some surface samples should have positive phi (beyond hit)
        positive_phi_samples = [s for s in surface_samples if s.phi > 0]
        assert len(positive_phi_samples) > 0

        # But none should exceed local_spacing * coefficient = 0.2
        max_phi = max(s.phi for s in surface_samples)
        assert max_phi <= 0.2 + 0.001  # Small tolerance for floating point

    def test_ray_carve_fallback_to_fixed_width(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test ray_carve falls back to back_buffer_width when no local_spacing."""
        ray = RayInfo(
            origin=(0.0, 0.0, 0.0),
            direction=(1.0, 0.0, 0.0),
            hit_distance=1.0,
            local_spacing=None,  # No local spacing - should use fallback
        )
        constraint = RayCarveConstraint(
            sign=SignConvention.EMPTY,
            rays=[ray],
            empty_band_width=0.1,
            surface_band_width=0.02,
            back_buffer_width=0.05,  # Fixed fallback
            back_buffer_coefficient=2.0,  # Ignored since no local_spacing
        )
        constraint_service.add(sample_project.id, constraint)

        request = SampleGenerationRequest(total_samples=1000, samples_per_primitive=500)
        result = sampling_service.generate(sample_project.id, request)

        surface_samples = [s for s in result.samples if s.source == "ray_carve_surface"]
        assert len(surface_samples) > 0

        # Max phi should be around back_buffer_width = 0.05
        max_phi = max(s.phi for s in surface_samples)
        assert max_phi <= 0.05 + 0.001

    def test_ray_carve_zero_back_buffer_no_bleed_through(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test that zero back buffer means no samples past hit point."""
        ray = RayInfo(
            origin=(0.0, 0.0, 0.0),
            direction=(1.0, 0.0, 0.0),
            hit_distance=1.0,
            local_spacing=None,
        )
        constraint = RayCarveConstraint(
            sign=SignConvention.EMPTY,
            rays=[ray],
            empty_band_width=0.1,
            surface_band_width=0.02,
            back_buffer_width=0.0,  # Zero - no bleed through
            back_buffer_coefficient=1.0,
        )
        constraint_service.add(sample_project.id, constraint)

        request = SampleGenerationRequest(total_samples=1000, samples_per_primitive=500)
        result = sampling_service.generate(sample_project.id, request)

        surface_samples = [s for s in result.samples if s.source == "ray_carve_surface"]
        assert len(surface_samples) > 0

        # All surface samples should have phi <= 0 (no bleed through)
        for sample in surface_samples:
            assert sample.phi <= 0.001  # Small tolerance

    def test_ray_carve_per_ray_local_spacing(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test that each ray uses its own local_spacing independently."""
        rays = [
            RayInfo(
                origin=(0.0, 0.0, 0.0),
                direction=(1.0, 0.0, 0.0),
                hit_distance=1.0,
                local_spacing=0.05,  # Small spacing
            ),
            RayInfo(
                origin=(0.0, 0.1, 0.0),
                direction=(1.0, 0.0, 0.0),
                hit_distance=1.0,
                local_spacing=0.2,  # Large spacing
            ),
        ]
        constraint = RayCarveConstraint(
            sign=SignConvention.EMPTY,
            rays=rays,
            empty_band_width=0.1,
            surface_band_width=0.02,
            back_buffer_width=0.0,
            back_buffer_coefficient=1.0,
        )
        constraint_service.add(sample_project.id, constraint)

        request = SampleGenerationRequest(total_samples=1000, samples_per_primitive=500)
        result = sampling_service.generate(sample_project.id, request)

        surface_samples = [s for s in result.samples if s.source == "ray_carve_surface"]
        assert len(surface_samples) > 0

        # Should have some samples with phi up to ~0.2 (from ray with large spacing)
        # But some should be limited to ~0.05 (from ray with small spacing)
        max_phi = max(s.phi for s in surface_samples)
        assert max_phi > 0.05  # At least some samples from the large-spacing ray
        assert max_phi <= 0.2 + 0.001  # But not exceeding max local_spacing

    def test_ray_carve_empty_samples_generated(
        self,
        sampling_service: SamplingService,
        constraint_service: ConstraintService,
        sample_project,
        sample_pointcloud,
    ):
        """Test that empty (free space) samples are generated along ray."""
        ray = RayInfo(
            origin=(0.0, 0.0, 0.0),
            direction=(1.0, 0.0, 0.0),
            hit_distance=1.0,
            local_spacing=0.1,
        )
        constraint = RayCarveConstraint(
            sign=SignConvention.EMPTY,
            rays=[ray],
            empty_band_width=0.1,
            surface_band_width=0.02,
            back_buffer_width=0.0,
            back_buffer_coefficient=1.0,
        )
        constraint_service.add(sample_project.id, constraint)

        request = SampleGenerationRequest(total_samples=1000, samples_per_primitive=500)
        result = sampling_service.generate(sample_project.id, request)

        empty_samples = [s for s in result.samples if s.source == "ray_carve_empty"]
        assert len(empty_samples) > 0

        # All empty samples should be along the ray (x between 0 and 0.9)
        # Ray is along x-axis from origin, hits at x=1.0, empty_band_width=0.1
        # So t ranges from 0 to 0.9, and phi = hit_dist - t = 1.0 - t
        for sample in empty_samples:
            assert 0 <= sample.x <= (1.0 - 0.1)  # Before empty_band_width
            assert sample.is_free is True
            # phi should be actual signed distance: hit_dist (1.0) - t (sample.x)
            expected_phi = 1.0 - sample.x
            assert sample.phi == pytest.approx(expected_phi, abs=1e-6)
