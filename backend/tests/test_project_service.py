# ABOUTME: Unit tests for ProjectService
# ABOUTME: Tests CRUD operations for labeling projects

import pytest

from sdf_labeler_api.models.project import ProjectConfig, ProjectCreate
from sdf_labeler_api.services.project_service import ProjectService


class TestProjectService:
    """Tests for ProjectService CRUD operations."""

    def test_create_project_minimal(self, project_service: ProjectService):
        """Test creating a project with minimal data."""
        request = ProjectCreate(name="Minimal Project")
        project = project_service.create(request)

        assert project.id is not None
        assert project.name == "Minimal Project"
        assert project.description is None
        assert project.config is not None  # Default config
        assert project.point_cloud_id is None
        assert project.constraint_count == 0
        assert project.sample_count == 0

    def test_create_project_with_description(self, project_service: ProjectService):
        """Test creating a project with description."""
        request = ProjectCreate(
            name="Full Project",
            description="A project with all fields",
        )
        project = project_service.create(request)

        assert project.name == "Full Project"
        assert project.description == "A project with all fields"

    def test_create_project_with_custom_config(self, project_service: ProjectService):
        """Test creating a project with custom configuration."""
        config = ProjectConfig(
            near_band=0.02,
            tsdf_trunc=0.15,
            knn_neighbors=20,
        )
        request = ProjectCreate(
            name="Custom Config Project",
            config=config,
        )
        project = project_service.create(request)

        assert project.config.near_band == 0.02
        assert project.config.tsdf_trunc == 0.15
        assert project.config.knn_neighbors == 20

    def test_create_project_creates_directory(self, project_service: ProjectService, temp_data_dir):
        """Test that creating a project creates the project directory."""
        request = ProjectCreate(name="Directory Test")
        project = project_service.create(request)

        project_dir = temp_data_dir / "projects" / project.id
        assert project_dir.exists()
        assert (project_dir / "project.json").exists()

    def test_get_project_exists(self, project_service: ProjectService):
        """Test getting an existing project."""
        request = ProjectCreate(name="Get Test")
        created = project_service.create(request)

        retrieved = project_service.get(created.id)
        assert retrieved is not None
        assert retrieved.id == created.id
        assert retrieved.name == created.name

    def test_get_project_not_exists(self, project_service: ProjectService):
        """Test getting a non-existent project returns None."""
        result = project_service.get("non-existent-id")
        assert result is None

    def test_list_all_empty(self, project_service: ProjectService):
        """Test listing projects when none exist."""
        projects = project_service.list_all()
        assert projects == []

    def test_list_all_multiple(self, project_service: ProjectService):
        """Test listing multiple projects."""
        # Create several projects
        for i in range(3):
            project_service.create(ProjectCreate(name=f"Project {i}"))

        projects = project_service.list_all()
        assert len(projects) == 3
        # Should be sorted by creation date, newest first
        names = [p.name for p in projects]
        assert "Project 0" in names
        assert "Project 1" in names
        assert "Project 2" in names

    def test_update_config(self, project_service: ProjectService, sample_project):
        """Test updating project configuration."""
        new_config = ProjectConfig(
            near_band=0.05,
            far_field_ratio=0.3,
        )

        updated = project_service.update_config(sample_project.id, new_config)

        assert updated is not None
        assert updated.config.near_band == 0.05
        assert updated.config.far_field_ratio == 0.3
        assert updated.updated_at > sample_project.updated_at

    def test_update_config_not_exists(self, project_service: ProjectService):
        """Test updating non-existent project returns None."""
        config = ProjectConfig()
        result = project_service.update_config("non-existent", config)
        assert result is None

    def test_set_pointcloud(self, project_service: ProjectService, sample_project):
        """Test setting point cloud reference."""
        updated = project_service.set_pointcloud(
            sample_project.id,
            pointcloud_id="pc-123",
            bounds_low=(0.0, 0.0, 0.0),
            bounds_high=(1.0, 1.0, 1.0),
        )

        assert updated is not None
        assert updated.point_cloud_id == "pc-123"
        assert updated.bounds_low == (0.0, 0.0, 0.0)
        assert updated.bounds_high == (1.0, 1.0, 1.0)

    def test_delete_project(self, project_service: ProjectService, temp_data_dir):
        """Test deleting a project."""
        request = ProjectCreate(name="To Delete")
        project = project_service.create(request)
        project_dir = temp_data_dir / "projects" / project.id

        assert project_dir.exists()

        result = project_service.delete(project.id)

        assert result is True
        assert not project_dir.exists()
        assert project_service.get(project.id) is None

    def test_delete_project_not_exists(self, project_service: ProjectService):
        """Test deleting non-existent project returns False."""
        result = project_service.delete("non-existent-id")
        assert result is False

    def test_project_persistence(self, project_service: ProjectService, temp_data_dir):
        """Test that projects persist across service instances."""
        request = ProjectCreate(name="Persistent Project")
        project = project_service.create(request)

        # Create a new service instance
        new_service = ProjectService(temp_data_dir)
        retrieved = new_service.get(project.id)

        assert retrieved is not None
        assert retrieved.id == project.id
        assert retrieved.name == project.name


class TestProjectServiceEdgeCases:
    """Edge case tests for ProjectService."""

    def test_project_id_is_uuid(self, project_service: ProjectService):
        """Test that project IDs are valid UUIDs."""
        import uuid

        request = ProjectCreate(name="UUID Test")
        project = project_service.create(request)

        # Should not raise
        uuid.UUID(project.id)

    def test_timestamps_are_set(self, project_service: ProjectService):
        """Test that created_at and updated_at are set."""
        request = ProjectCreate(name="Timestamp Test")
        project = project_service.create(request)

        assert project.created_at is not None
        assert project.updated_at is not None
        # They should be very close (within a second)
        time_diff = abs((project.updated_at - project.created_at).total_seconds())
        assert time_diff < 1.0

    def test_special_characters_in_name(self, project_service: ProjectService):
        """Test project names with special characters."""
        request = ProjectCreate(name="Test & Project <with> 'special' \"chars\"")
        project = project_service.create(request)

        retrieved = project_service.get(project.id)
        assert retrieved.name == "Test & Project <with> 'special' \"chars\""

    def test_unicode_in_name(self, project_service: ProjectService):
        """Test project names with unicode characters."""
        request = ProjectCreate(name="Проект 测试 🏗️")
        project = project_service.create(request)

        retrieved = project_service.get(project.id)
        assert retrieved.name == "Проект 测试 🏗️"
