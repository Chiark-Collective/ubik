# ABOUTME: Tests for pipeline executor functionality
# ABOUTME: Tests self-contained export with surface points

import numpy as np
import pandas as pd
import pytest

from sdf_labeler_api.cli.pipeline import PipelineExecutor
from sdf_labeler_api.cli.pipeline_schema import (
    AutoAnalyzeStep,
    ExportFormat,
    ExportStep,
    GenerateSamplesStep,
    LoadPointcloudStep,
    Pipeline,
)
from sdf_labeler_api.config import settings


@pytest.fixture
def pipeline_executor():
    """Create a pipeline executor for testing."""
    settings.ensure_data_dir()
    return PipelineExecutor(verbose=False)


@pytest.fixture
def simple_pipeline(tmp_path):
    """Create a simple pipeline for testing."""
    output_dir = tmp_path / "output"
    output_dir.mkdir()

    return Pipeline(
        name="test-pipeline",
        project_name="test-project",
        steps=[
            LoadPointcloudStep(
                name="Load scenario",
                source="S01_straight_vwalls",
                scenario_category="trenchfoot",
            ),
            AutoAnalyzeStep(
                name="Auto-analyze",
                algorithms=["flood_fill", "voxel_regions"],
                apply_filter="all",
            ),
            GenerateSamplesStep(
                name="Generate samples",
                total_samples=1000,
            ),
            ExportStep(
                name="Export",
                format=ExportFormat.PARQUET,
                output_path=str(output_dir),
                include_surface_points=False,
            ),
        ],
        cleanup=True,
    )


@pytest.fixture
def self_contained_pipeline(tmp_path):
    """Create a pipeline with self-contained export enabled."""
    output_dir = tmp_path / "output"
    output_dir.mkdir()

    return Pipeline(
        name="test-self-contained",
        project_name="test-self-contained",
        steps=[
            LoadPointcloudStep(
                name="Load scenario",
                source="S01_straight_vwalls",
                scenario_category="trenchfoot",
            ),
            AutoAnalyzeStep(
                name="Auto-analyze",
                algorithms=["flood_fill", "voxel_regions"],
                apply_filter="all",
            ),
            GenerateSamplesStep(
                name="Generate samples",
                total_samples=500,
            ),
            ExportStep(
                name="Export self-contained",
                format=ExportFormat.PARQUET,
                output_path=str(output_dir),
                include_surface_points=True,  # Include surface points
            ),
        ],
        cleanup=True,
    )


class TestPipelineExport:
    """Tests for pipeline export functionality."""

    def test_basic_export_excludes_surface_points(
        self, pipeline_executor, simple_pipeline, tmp_path
    ):
        """Test that basic export (include_surface_points=False) only contains samples."""
        result = pipeline_executor.run(simple_pipeline, dry_run=False)

        assert result["steps_completed"] == 4
        assert result["steps_failed"] == 0

        # Check output file exists
        output_dir = tmp_path / "output"
        parquet_files = list(output_dir.glob("*.parquet"))
        assert len(parquet_files) == 1

        # Read the parquet
        df = pd.read_parquet(parquet_files[0])

        # Verify no surface points (source should not be 'surface')
        sources = df["source"].unique()
        assert "surface" not in sources, (
            f"Basic export should not contain 'surface' source, got {sources}"
        )

        # Should have constraint-based samples
        assert len(df) > 0
        assert "idw_empty" in sources or "idw_solid" in sources

    def test_self_contained_export_includes_surface_points(
        self, pipeline_executor, self_contained_pipeline, tmp_path
    ):
        """Test that self-contained export includes surface points."""
        result = pipeline_executor.run(self_contained_pipeline, dry_run=False)

        assert result["steps_completed"] == 4
        assert result["steps_failed"] == 0

        # Check output file exists
        output_dir = tmp_path / "output"
        parquet_files = list(output_dir.glob("*.parquet"))
        assert len(parquet_files) == 1

        # Read the parquet
        df = pd.read_parquet(parquet_files[0])

        # Verify surface points are present
        sources = df["source"].unique()
        assert "surface" in sources, (
            f"Self-contained export should contain 'surface' source, got {sources}"
        )

        # Check surface points have correct properties
        surface_df = df[df["source"] == "surface"]
        assert len(surface_df) > 0

        # Surface points should have phi=0
        assert np.allclose(surface_df["phi"].values, 0.0), "Surface points should have phi=0"

        # Surface points should have is_surface=True
        assert all(surface_df["is_surface"]), "Surface points should have is_surface=True"

        # Should also have constraint samples
        non_surface_df = df[df["source"] != "surface"]
        assert len(non_surface_df) > 0, (
            "Should have constraint samples in addition to surface points"
        )

    def test_self_contained_export_has_all_columns(
        self, pipeline_executor, self_contained_pipeline, tmp_path
    ):
        """Test that self-contained export has all required columns."""
        pipeline_executor.run(self_contained_pipeline, dry_run=False)

        output_dir = tmp_path / "output"
        parquet_files = list(output_dir.glob("*.parquet"))
        df = pd.read_parquet(parquet_files[0])

        required_columns = [
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
        for col in required_columns:
            assert col in df.columns, f"Missing required column: {col}"

    def test_surface_points_have_normals(
        self, pipeline_executor, self_contained_pipeline, tmp_path
    ):
        """Test that surface points in self-contained export have normals."""
        pipeline_executor.run(self_contained_pipeline, dry_run=False)

        output_dir = tmp_path / "output"
        parquet_files = list(output_dir.glob("*.parquet"))
        df = pd.read_parquet(parquet_files[0])

        surface_df = df[df["source"] == "surface"]

        # Check that normals are present (not all zeros)
        normals = surface_df[["nx", "ny", "nz"]].values
        norms = np.linalg.norm(normals, axis=1)

        # Most normals should be unit length (some might be zero if normals weren't estimated)
        unit_normals = np.isclose(norms, 1.0)
        assert np.mean(unit_normals) > 0.5, "Most surface points should have unit normals"
