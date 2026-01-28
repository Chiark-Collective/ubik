# ABOUTME: Pytest fixtures for SDF Labeler API tests
# ABOUTME: Provides test clients, temporary directories, and sample data

from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from sdf_labeler_api.app import app
from sdf_labeler_api.config import settings
from sdf_labeler_api.models.constraints import (
    BoxConstraint,
    BrushStrokeConstraint,
    CylinderConstraint,
    HalfspaceConstraint,
    MLImportConstraint,
    SeedPropagationConstraint,
    SignConvention,
    SphereConstraint,
)
from sdf_labeler_api.models.project import ProjectCreate
from sdf_labeler_api.services.constraint_service import ConstraintService
from sdf_labeler_api.services.project_service import ProjectService


@pytest.fixture(autouse=True)
def temp_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Create a temporary data directory and patch settings to use it.

    This fixture is autouse=True so every test gets isolated storage.
    """
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(settings, "data_dir", data_dir)
    return data_dir


@pytest.fixture
def project_service(temp_data_dir: Path) -> ProjectService:
    """Create a ProjectService with temporary storage."""
    return ProjectService(temp_data_dir)


@pytest.fixture
def constraint_service() -> ConstraintService:
    """Create a ConstraintService."""
    return ConstraintService()


@pytest.fixture
def sample_project(project_service: ProjectService):
    """Create a sample project for testing."""
    request = ProjectCreate(
        name="Test Project",
        description="A test project for unit tests",
    )
    return project_service.create(request)


@pytest.fixture
def sample_pointcloud(temp_data_dir: Path, sample_project) -> tuple[np.ndarray, np.ndarray]:
    """Create a sample point cloud for testing."""
    # Generate a simple cube point cloud
    n_points = 1000
    rng = np.random.default_rng(42)

    # Random points in unit cube
    xyz = rng.uniform(0, 1, (n_points, 3)).astype(np.float32)

    # Random normals (normalized)
    normals = rng.standard_normal((n_points, 3)).astype(np.float32)
    normals /= np.linalg.norm(normals, axis=1, keepdims=True)

    # Save to project directory
    pc_dir = temp_data_dir / "projects" / sample_project.id / "pointcloud"
    pc_dir.mkdir(parents=True, exist_ok=True)
    np.savez(pc_dir / "points.npz", xyz=xyz, normals=normals)

    return xyz, normals


@pytest.fixture
def client(temp_data_dir: Path) -> TestClient:
    """Create a FastAPI test client with patched services."""
    # Re-initialize global services with the patched data_dir
    import sdf_labeler_api.app as app_module

    app_module.project_service = ProjectService(temp_data_dir)

    return TestClient(app)


# Sample constraint fixtures
@pytest.fixture
def sample_box_constraint() -> BoxConstraint:
    """Create a sample box constraint."""
    return BoxConstraint(
        name="Test Box",
        sign=SignConvention.SOLID,
        weight=1.0,
        center=(0.5, 0.5, 0.5),
        half_extents=(0.1, 0.1, 0.1),
    )


@pytest.fixture
def sample_sphere_constraint() -> SphereConstraint:
    """Create a sample sphere constraint."""
    return SphereConstraint(
        name="Test Sphere",
        sign=SignConvention.EMPTY,
        weight=0.8,
        center=(0.3, 0.3, 0.3),
        radius=0.2,
    )


@pytest.fixture
def sample_halfspace_constraint() -> HalfspaceConstraint:
    """Create a sample halfspace constraint."""
    return HalfspaceConstraint(
        name="Test Halfspace",
        sign=SignConvention.EMPTY,
        weight=1.0,
        point=(0.0, 0.0, 0.5),
        normal=(0.0, 0.0, 1.0),
    )


@pytest.fixture
def sample_cylinder_constraint() -> CylinderConstraint:
    """Create a sample cylinder constraint."""
    return CylinderConstraint(
        name="Test Cylinder",
        sign=SignConvention.SOLID,
        weight=1.0,
        center=(0.5, 0.5, 0.0),
        axis=(0.0, 0.0, 1.0),
        radius=0.15,
        height=0.5,
    )


@pytest.fixture
def sample_brush_stroke_constraint() -> BrushStrokeConstraint:
    """Create a sample brush stroke constraint."""
    return BrushStrokeConstraint(
        name="Test Brush Stroke",
        sign=SignConvention.EMPTY,
        weight=1.0,
        stroke_points=[(0.0, 0.0, 0.0), (0.1, 0.0, 0.0), (0.2, 0.0, 0.0)],
        radius=0.05,
    )


@pytest.fixture
def sample_seed_constraint() -> SeedPropagationConstraint:
    """Create a sample seed propagation constraint."""
    return SeedPropagationConstraint(
        name="Test Seed",
        sign=SignConvention.SOLID,
        weight=1.0,
        seed_point=(0.5, 0.5, 0.5),
        propagation_radius=0.3,
        propagated_indices=[0, 1, 2, 3],
        confidences=[1.0, 0.9, 0.8, 0.7],
    )


@pytest.fixture
def sample_ml_import_constraint() -> MLImportConstraint:
    """Create a sample ML import constraint."""
    return MLImportConstraint(
        name="Test ML Import",
        sign=SignConvention.SOLID,
        weight=1.0,
        source_file="predictions.npz",
        source_class="class_0",
        point_indices=[100, 101, 102, 103, 104],
        confidences=[0.95, 0.92, 0.88, 0.91, 0.94],
    )
