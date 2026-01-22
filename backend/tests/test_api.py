# ABOUTME: API integration tests for SDF Labeler
# ABOUTME: Tests all REST endpoints end-to-end

import io
import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from sdf_labeler_api.config import settings


class TestHealthEndpoint:
    """Tests for health check endpoint."""

    def test_health_check(self, client: TestClient):
        """Test health endpoint returns healthy status."""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data


class TestProjectEndpoints:
    """Tests for project management endpoints."""

    def test_create_project(self, client: TestClient):
        """Test creating a new project."""
        response = client.post(
            "/v1/projects",
            json={"name": "Test Project", "description": "A test project"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Project"
        assert data["description"] == "A test project"
        assert "id" in data
        assert "created_at" in data

    def test_create_project_minimal(self, client: TestClient):
        """Test creating a project with minimal data."""
        response = client.post("/v1/projects", json={"name": "Minimal"})

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Minimal"

    def test_create_project_with_config(self, client: TestClient):
        """Test creating a project with custom config."""
        response = client.post(
            "/v1/projects",
            json={
                "name": "Configured",
                "config": {"near_band": 0.02, "tsdf_trunc": 0.15},
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["config"]["near_band"] == 0.02
        assert data["config"]["tsdf_trunc"] == 0.15

    def test_list_projects_empty(self, client: TestClient):
        """Test listing projects when none exist."""
        response = client.get("/v1/projects")

        assert response.status_code == 200
        data = response.json()
        assert data["projects"] == []
        assert data["total"] == 0

    def test_list_projects(self, client: TestClient):
        """Test listing multiple projects."""
        # Create projects
        client.post("/v1/projects", json={"name": "Project 1"})
        client.post("/v1/projects", json={"name": "Project 2"})

        response = client.get("/v1/projects")

        assert response.status_code == 200
        data = response.json()
        assert len(data["projects"]) == 2
        assert data["total"] == 2

    def test_get_project(self, client: TestClient):
        """Test getting a specific project."""
        create_response = client.post("/v1/projects", json={"name": "Get Test"})
        project_id = create_response.json()["id"]

        response = client.get(f"/v1/projects/{project_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == project_id
        assert data["name"] == "Get Test"

    def test_get_project_not_found(self, client: TestClient):
        """Test getting a non-existent project."""
        response = client.get("/v1/projects/non-existent-id")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_project(self, client: TestClient):
        """Test updating project configuration."""
        create_response = client.post("/v1/projects", json={"name": "Update Test"})
        project_id = create_response.json()["id"]

        response = client.patch(
            f"/v1/projects/{project_id}",
            json={"near_band": 0.05, "far_field_ratio": 0.25},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["config"]["near_band"] == 0.05
        assert data["config"]["far_field_ratio"] == 0.25

    def test_update_project_not_found(self, client: TestClient):
        """Test updating non-existent project."""
        response = client.patch(
            "/v1/projects/non-existent",
            json={"near_band": 0.05},
        )

        assert response.status_code == 404

    def test_delete_project(self, client: TestClient):
        """Test deleting a project."""
        create_response = client.post("/v1/projects", json={"name": "Delete Test"})
        project_id = create_response.json()["id"]

        response = client.delete(f"/v1/projects/{project_id}")

        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

        # Verify it's gone
        get_response = client.get(f"/v1/projects/{project_id}")
        assert get_response.status_code == 404

    def test_delete_project_not_found(self, client: TestClient):
        """Test deleting non-existent project."""
        response = client.delete("/v1/projects/non-existent")
        assert response.status_code == 404


class TestConstraintEndpoints:
    """Tests for constraint management endpoints."""

    @pytest.fixture
    def project_id(self, client: TestClient) -> str:
        """Create a project and return its ID."""
        response = client.post("/v1/projects", json={"name": "Constraint Test"})
        return response.json()["id"]

    def test_add_box_constraint(self, client: TestClient, project_id: str):
        """Test adding a box constraint."""
        response = client.post(
            f"/v1/projects/{project_id}/constraints",
            json={
                "type": "box",
                "sign": "solid",
                "weight": 1.0,
                "center": [0.5, 0.5, 0.5],
                "half_extents": [0.1, 0.1, 0.1],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "box"
        assert data["sign"] == "solid"
        assert data["center"] == [0.5, 0.5, 0.5]

    def test_add_sphere_constraint(self, client: TestClient, project_id: str):
        """Test adding a sphere constraint."""
        response = client.post(
            f"/v1/projects/{project_id}/constraints",
            json={
                "type": "sphere",
                "sign": "empty",
                "weight": 0.8,
                "center": [0.3, 0.3, 0.3],
                "radius": 0.2,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "sphere"
        assert data["radius"] == 0.2

    def test_add_halfspace_constraint(self, client: TestClient, project_id: str):
        """Test adding a halfspace constraint."""
        response = client.post(
            f"/v1/projects/{project_id}/constraints",
            json={
                "type": "halfspace",
                "sign": "empty",
                "point": [0, 0, 0.5],
                "normal": [0, 0, 1],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "halfspace"

    def test_add_cylinder_constraint(self, client: TestClient, project_id: str):
        """Test adding a cylinder constraint."""
        response = client.post(
            f"/v1/projects/{project_id}/constraints",
            json={
                "type": "cylinder",
                "sign": "solid",
                "center": [0.5, 0.5, 0],
                "axis": [0, 0, 1],
                "radius": 0.15,
                "height": 0.5,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "cylinder"
        assert data["radius"] == 0.15
        assert data["height"] == 0.5

    def test_add_brush_stroke_constraint(self, client: TestClient, project_id: str):
        """Test adding a brush stroke constraint."""
        response = client.post(
            f"/v1/projects/{project_id}/constraints",
            json={
                "type": "brush_stroke",
                "sign": "empty",
                "stroke_points": [[0.0, 0.0, 0.0], [0.1, 0.0, 0.0], [0.2, 0.0, 0.0]],
                "radius": 0.05,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "brush_stroke"
        assert len(data["stroke_points"]) == 3
        assert data["radius"] == 0.05

    def test_list_constraints_empty(self, client: TestClient, project_id: str):
        """Test listing constraints when none exist."""
        response = client.get(f"/v1/projects/{project_id}/constraints")

        assert response.status_code == 200
        data = response.json()
        assert data["constraints"] == []

    def test_list_constraints(self, client: TestClient, project_id: str):
        """Test listing multiple constraints."""
        # Add constraints
        client.post(
            f"/v1/projects/{project_id}/constraints",
            json={
                "type": "box",
                "sign": "solid",
                "center": [0.5, 0.5, 0.5],
                "half_extents": [0.1, 0.1, 0.1],
            },
        )
        client.post(
            f"/v1/projects/{project_id}/constraints",
            json={
                "type": "sphere",
                "sign": "empty",
                "center": [0.3, 0.3, 0.3],
                "radius": 0.2,
            },
        )

        response = client.get(f"/v1/projects/{project_id}/constraints")

        assert response.status_code == 200
        data = response.json()
        assert len(data["constraints"]) == 2

    def test_delete_constraint(self, client: TestClient, project_id: str):
        """Test deleting a constraint."""
        add_response = client.post(
            f"/v1/projects/{project_id}/constraints",
            json={
                "type": "box",
                "sign": "solid",
                "center": [0.5, 0.5, 0.5],
                "half_extents": [0.1, 0.1, 0.1],
            },
        )
        constraint_id = add_response.json()["id"]

        response = client.delete(f"/v1/projects/{project_id}/constraints/{constraint_id}")

        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

        # Verify it's gone
        list_response = client.get(f"/v1/projects/{project_id}/constraints")
        assert len(list_response.json()["constraints"]) == 0

    def test_delete_constraint_not_found(self, client: TestClient, project_id: str):
        """Test deleting non-existent constraint."""
        response = client.delete(f"/v1/projects/{project_id}/constraints/non-existent")
        assert response.status_code == 404

    def test_constraint_project_not_found(self, client: TestClient):
        """Test adding constraint to non-existent project."""
        response = client.post(
            "/v1/projects/non-existent/constraints",
            json={
                "type": "box",
                "sign": "solid",
                "center": [0.5, 0.5, 0.5],
                "half_extents": [0.1, 0.1, 0.1],
            },
        )
        assert response.status_code == 404

    def test_clear_constraints(self, client: TestClient, project_id: str):
        """Test clearing all constraints for a project."""
        # Add some constraints first
        for i in range(3):
            client.post(
                f"/v1/projects/{project_id}/constraints",
                json={
                    "type": "box",
                    "sign": "solid",
                    "center": [i, 0, 0],
                    "half_extents": [0.1, 0.1, 0.1],
                },
            )

        # Verify we have 3 constraints
        list_response = client.get(f"/v1/projects/{project_id}/constraints")
        assert len(list_response.json()["constraints"]) == 3

        # Clear all constraints
        response = client.delete(f"/v1/projects/{project_id}/constraints")
        assert response.status_code == 200
        assert response.json()["status"] == "cleared"

        # Verify all are gone
        list_response = client.get(f"/v1/projects/{project_id}/constraints")
        assert len(list_response.json()["constraints"]) == 0

    def test_clear_constraints_project_not_found(self, client: TestClient):
        """Test clearing constraints for non-existent project."""
        response = client.delete("/v1/projects/non-existent/constraints")
        assert response.status_code == 404


class TestSampleEndpoints:
    """Tests for sample generation endpoints."""

    @pytest.fixture
    def project_with_pointcloud(self, client: TestClient, temp_data_dir: Path) -> str:
        """Create a project with a point cloud."""
        # Create project
        response = client.post("/v1/projects", json={"name": "Sample Test"})
        project_id = response.json()["id"]

        # Create point cloud data
        n_points = 100
        rng = np.random.default_rng(42)
        xyz = rng.random((n_points, 3)).astype(np.float32)
        normals = rng.standard_normal((n_points, 3)).astype(np.float32)
        normals /= np.linalg.norm(normals, axis=1, keepdims=True)

        # Save to project directory - use settings.data_dir which is patched
        pc_dir = settings.data_dir / "projects" / project_id / "pointcloud"
        pc_dir.mkdir(parents=True, exist_ok=True)
        np.savez(pc_dir / "points.npz", xyz=xyz, normals=normals)

        return project_id

    def test_preview_samples(self, client: TestClient, project_with_pointcloud: str):
        """Test previewing sample generation."""
        # Add a constraint
        client.post(
            f"/v1/projects/{project_with_pointcloud}/constraints",
            json={
                "type": "box",
                "sign": "solid",
                "center": [0.5, 0.5, 0.5],
                "half_extents": [0.1, 0.1, 0.1],
            },
        )

        response = client.post(
            f"/v1/projects/{project_with_pointcloud}/samples/preview",
            json={"total_samples": 1000},
        )

        assert response.status_code == 200
        data = response.json()
        assert "total_count" in data
        assert "constraint_sample_count" in data

    def test_generate_samples(self, client: TestClient, project_with_pointcloud: str):
        """Test generating samples."""
        # Add a constraint
        client.post(
            f"/v1/projects/{project_with_pointcloud}/constraints",
            json={
                "type": "box",
                "sign": "solid",
                "center": [0.5, 0.5, 0.5],
                "half_extents": [0.1, 0.1, 0.1],
            },
        )

        response = client.post(
            f"/v1/projects/{project_with_pointcloud}/samples/generate",
            json={"total_samples": 1000},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["sample_count"] > 0
        assert "source_breakdown" in data

    def test_generate_samples_project_not_found(self, client: TestClient):
        """Test generating samples for non-existent project."""
        response = client.post(
            "/v1/projects/non-existent/samples/generate",
            json={"total_samples": 1000},
        )
        assert response.status_code == 404


class TestExportEndpoints:
    """Tests for export endpoints."""

    @pytest.fixture
    def project_with_samples(self, client: TestClient, temp_data_dir: Path) -> str:
        """Create a project with generated samples."""
        # Create project
        response = client.post("/v1/projects", json={"name": "Export Test"})
        project_id = response.json()["id"]

        # Create point cloud - use settings.data_dir which is patched
        n_points = 100
        rng = np.random.default_rng(42)
        xyz = rng.random((n_points, 3)).astype(np.float32)
        normals = rng.standard_normal((n_points, 3)).astype(np.float32)
        normals /= np.linalg.norm(normals, axis=1, keepdims=True)

        pc_dir = settings.data_dir / "projects" / project_id / "pointcloud"
        pc_dir.mkdir(parents=True, exist_ok=True)
        np.savez(pc_dir / "points.npz", xyz=xyz, normals=normals)

        # Add constraint
        client.post(
            f"/v1/projects/{project_id}/constraints",
            json={
                "type": "box",
                "sign": "solid",
                "center": [0.5, 0.5, 0.5],
                "half_extents": [0.1, 0.1, 0.1],
            },
        )

        # Generate samples
        client.post(
            f"/v1/projects/{project_id}/samples/generate",
            json={"total_samples": 1000},
        )

        return project_id

    def test_export_parquet(self, client: TestClient, project_with_samples: str):
        """Test exporting samples as Parquet."""
        response = client.get(f"/v1/projects/{project_with_samples}/export/parquet")

        assert response.status_code == 200
        assert "application/octet-stream" in response.headers["content-type"]

    def test_export_parquet_no_samples(self, client: TestClient):
        """Test export when no samples exist."""
        # Create project without samples
        create_response = client.post("/v1/projects", json={"name": "No Samples"})
        project_id = create_response.json()["id"]

        response = client.get(f"/v1/projects/{project_id}/export/parquet")
        assert response.status_code == 404

    def test_export_config(self, client: TestClient, project_with_samples: str):
        """Test exporting SDFTaskSpec configuration."""
        response = client.get(f"/v1/projects/{project_with_samples}/export/config")

        assert response.status_code == 200
        data = response.json()
        assert "project_id" in data
        assert "near_band" in data
        assert "tsdf_trunc" in data

    def test_export_config_project_not_found(self, client: TestClient):
        """Test export config for non-existent project."""
        response = client.get("/v1/projects/non-existent/export/config")
        assert response.status_code == 404
