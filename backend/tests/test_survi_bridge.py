# ABOUTME: Unit tests for survi_bridge module
# ABOUTME: Tests fallback implementations when survi is not available

import pytest

from sdf_labeler_api.survi_bridge import (
    SDF_COLUMNS,
    SURVI_AVAILABLE,
    SDFTaskSpec,
    estimate_normals,
    orient_normals,
    sample_band,
    sample_far_field_global,
    sample_surface_anchors,
    sample_training_mixture,
)


class TestSurviBridge:
    """Tests for survi bridge fallback behavior."""

    def test_survi_available_flag(self):
        """Test that SURVI_AVAILABLE is a boolean."""
        assert isinstance(SURVI_AVAILABLE, bool)

    def test_sdf_columns_defined(self):
        """Test that SDF_COLUMNS has expected columns."""
        assert isinstance(SDF_COLUMNS, list)
        assert "x" in SDF_COLUMNS
        assert "y" in SDF_COLUMNS
        assert "z" in SDF_COLUMNS
        assert "phi" in SDF_COLUMNS
        assert "weight" in SDF_COLUMNS
        assert "source" in SDF_COLUMNS

    def test_sdf_columns_complete(self):
        """Test that SDF_COLUMNS has all required columns."""
        expected = [
            "x",
            "y",
            "z",
            "phi",
            "nx",
            "ny",
            "nz",
            "weight",
            "source",
            "is_surface",
            "is_free",
        ]
        assert expected == SDF_COLUMNS

    def test_sdf_task_spec_exists(self):
        """Test that SDFTaskSpec class exists."""
        assert SDFTaskSpec is not None


class TestFallbackFunctions:
    """Tests for fallback function behavior when survi is not available."""

    @pytest.mark.skipif(SURVI_AVAILABLE, reason="Only test fallbacks when survi not installed")
    def test_sample_training_mixture_fallback(self):
        """Test that sample_training_mixture raises NotImplementedError."""
        with pytest.raises(NotImplementedError, match="Survi not available"):
            sample_training_mixture()

    @pytest.mark.skipif(SURVI_AVAILABLE, reason="Only test fallbacks when survi not installed")
    def test_sample_surface_anchors_fallback(self):
        """Test that sample_surface_anchors raises NotImplementedError."""
        with pytest.raises(NotImplementedError, match="Survi not available"):
            sample_surface_anchors()

    @pytest.mark.skipif(SURVI_AVAILABLE, reason="Only test fallbacks when survi not installed")
    def test_sample_band_fallback(self):
        """Test that sample_band raises NotImplementedError."""
        with pytest.raises(NotImplementedError, match="Survi not available"):
            sample_band()

    @pytest.mark.skipif(SURVI_AVAILABLE, reason="Only test fallbacks when survi not installed")
    def test_sample_far_field_global_fallback(self):
        """Test that sample_far_field_global raises NotImplementedError."""
        with pytest.raises(NotImplementedError, match="Survi not available"):
            sample_far_field_global()

    @pytest.mark.skipif(SURVI_AVAILABLE, reason="Only test fallbacks when survi not installed")
    def test_estimate_normals_fallback(self):
        """Test that estimate_normals raises NotImplementedError."""
        with pytest.raises(NotImplementedError, match="Survi not available"):
            estimate_normals()

    @pytest.mark.skipif(SURVI_AVAILABLE, reason="Only test fallbacks when survi not installed")
    def test_orient_normals_fallback(self):
        """Test that orient_normals raises NotImplementedError."""
        with pytest.raises(NotImplementedError, match="Survi not available"):
            orient_normals()


class TestModuleExports:
    """Tests for module __all__ exports."""

    def test_all_exports_importable(self):
        """Test that all exported names are importable."""
        from sdf_labeler_api import survi_bridge

        expected_exports = [
            "SURVI_AVAILABLE",
            "sample_training_mixture",
            "sample_surface_anchors",
            "sample_band",
            "sample_far_field_global",
            "SDFTaskSpec",
            "SDF_COLUMNS",
            "estimate_normals",
            "orient_normals",
        ]

        for name in expected_exports:
            assert hasattr(survi_bridge, name), f"Missing export: {name}"

    def test_all_matches_expected(self):
        """Test that __all__ contains expected exports."""
        from sdf_labeler_api import survi_bridge

        expected = {
            "SURVI_AVAILABLE",
            "sample_training_mixture",
            "sample_surface_anchors",
            "sample_band",
            "sample_far_field_global",
            "SDFTaskSpec",
            "SDF_COLUMNS",
            "estimate_normals",
            "orient_normals",
        }

        assert set(survi_bridge.__all__) == expected
