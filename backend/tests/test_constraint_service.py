# ABOUTME: Unit tests for ConstraintService
# ABOUTME: Tests CRUD operations for geometric constraints

import pytest

from sdf_labeler_api.models.constraints import (
    BoxConstraint,
    ConstraintSet,
    SignConvention,
    SphereConstraint,
)
from sdf_labeler_api.services.constraint_service import ConstraintService


class TestConstraintServiceCRUD:
    """Tests for ConstraintService CRUD operations."""

    def test_add_box_constraint(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_box_constraint: BoxConstraint,
    ):
        """Test adding a box constraint."""
        result = constraint_service.add(sample_project.id, sample_box_constraint)

        assert result.id == sample_box_constraint.id
        assert result.type == "box"
        assert result.sign == SignConvention.SOLID
        assert result.center == (0.5, 0.5, 0.5)

    def test_add_sphere_constraint(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_sphere_constraint: SphereConstraint,
    ):
        """Test adding a sphere constraint."""
        result = constraint_service.add(sample_project.id, sample_sphere_constraint)

        assert result.type == "sphere"
        assert result.radius == 0.2

    def test_add_all_constraint_types(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_box_constraint,
        sample_sphere_constraint,
        sample_halfspace_constraint,
        sample_cylinder_constraint,
        sample_brush_stroke_constraint,
        sample_seed_constraint,
        sample_ml_import_constraint,
    ):
        """Test adding all constraint types."""
        constraints = [
            sample_box_constraint,
            sample_sphere_constraint,
            sample_halfspace_constraint,
            sample_cylinder_constraint,
            sample_brush_stroke_constraint,
            sample_seed_constraint,
            sample_ml_import_constraint,
        ]

        for c in constraints:
            constraint_service.add(sample_project.id, c)

        result = constraint_service.list_all(sample_project.id)
        assert len(result.constraints) == 7

        types = {c.type for c in result.constraints}
        assert types == {
            "box",
            "sphere",
            "halfspace",
            "cylinder",
            "brush_stroke",
            "seed_propagation",
            "ml_import",
        }

    def test_list_all_empty(self, constraint_service: ConstraintService, sample_project):
        """Test listing constraints when none exist."""
        result = constraint_service.list_all(sample_project.id)

        assert isinstance(result, ConstraintSet)
        assert result.constraints == []
        assert result.total == 0

    def test_list_all_with_constraints(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_box_constraint,
        sample_sphere_constraint,
    ):
        """Test listing multiple constraints."""
        constraint_service.add(sample_project.id, sample_box_constraint)
        constraint_service.add(sample_project.id, sample_sphere_constraint)

        result = constraint_service.list_all(sample_project.id)

        assert len(result.constraints) == 2
        assert result.total == 2

    def test_get_constraint_exists(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_box_constraint,
    ):
        """Test getting an existing constraint."""
        constraint_service.add(sample_project.id, sample_box_constraint)

        result = constraint_service.get(sample_project.id, sample_box_constraint.id)

        assert result is not None
        assert result.id == sample_box_constraint.id
        assert result.type == "box"

    def test_get_constraint_not_exists(self, constraint_service: ConstraintService, sample_project):
        """Test getting a non-existent constraint returns None."""
        result = constraint_service.get(sample_project.id, "non-existent-id")
        assert result is None

    def test_update_constraint(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_box_constraint,
    ):
        """Test updating a constraint."""
        constraint_service.add(sample_project.id, sample_box_constraint)

        # Modify and update
        sample_box_constraint.name = "Updated Box"
        sample_box_constraint.weight = 0.5

        result = constraint_service.update(sample_project.id, sample_box_constraint)

        assert result is not None
        assert result.name == "Updated Box"
        assert result.weight == 0.5

        # Verify persistence
        retrieved = constraint_service.get(sample_project.id, sample_box_constraint.id)
        assert retrieved.name == "Updated Box"

    def test_update_constraint_not_exists(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_box_constraint,
    ):
        """Test updating non-existent constraint returns None."""
        result = constraint_service.update(sample_project.id, sample_box_constraint)
        assert result is None

    def test_delete_constraint(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_box_constraint,
    ):
        """Test deleting a constraint."""
        constraint_service.add(sample_project.id, sample_box_constraint)

        result = constraint_service.delete(sample_project.id, sample_box_constraint.id)

        assert result is True
        assert constraint_service.get(sample_project.id, sample_box_constraint.id) is None

    def test_delete_constraint_not_exists(
        self, constraint_service: ConstraintService, sample_project
    ):
        """Test deleting non-existent constraint returns False."""
        result = constraint_service.delete(sample_project.id, "non-existent-id")
        assert result is False

    def test_delete_preserves_other_constraints(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_box_constraint,
        sample_sphere_constraint,
    ):
        """Test that deleting one constraint doesn't affect others."""
        constraint_service.add(sample_project.id, sample_box_constraint)
        constraint_service.add(sample_project.id, sample_sphere_constraint)

        constraint_service.delete(sample_project.id, sample_box_constraint.id)

        remaining = constraint_service.list_all(sample_project.id)
        assert len(remaining.constraints) == 1
        assert remaining.constraints[0].id == sample_sphere_constraint.id


class TestConstraintServicePersistence:
    """Tests for constraint persistence."""

    def test_constraints_persist(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_box_constraint,
    ):
        """Test that constraints persist across service instances."""
        constraint_service.add(sample_project.id, sample_box_constraint)

        # Create new service instance
        new_service = ConstraintService()

        result = new_service.list_all(sample_project.id)
        assert len(result.constraints) == 1
        assert result.constraints[0].id == sample_box_constraint.id

    def test_constraints_file_created(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_box_constraint,
        temp_data_dir,
    ):
        """Test that constraints file is created."""
        constraint_service.add(sample_project.id, sample_box_constraint)

        constraints_path = temp_data_dir / "projects" / sample_project.id / "constraints.json"
        assert constraints_path.exists()


class TestConstraintTypes:
    """Tests for specific constraint types."""

    def test_brush_stroke_stores_data(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_brush_stroke_constraint,
    ):
        """Test that brush stroke stores stroke data correctly."""
        constraint_service.add(sample_project.id, sample_brush_stroke_constraint)

        result = constraint_service.get(sample_project.id, sample_brush_stroke_constraint.id)

        assert result.type == "brush_stroke"
        assert len(result.stroke_points) == 3
        assert result.radius == 0.05

    def test_seed_propagation_stores_results(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_seed_constraint,
    ):
        """Test that seed propagation stores propagated data."""
        constraint_service.add(sample_project.id, sample_seed_constraint)

        result = constraint_service.get(sample_project.id, sample_seed_constraint.id)

        assert result.type == "seed_propagation"
        assert result.seed_point == (0.5, 0.5, 0.5)
        assert result.propagation_radius == 0.3
        assert result.propagated_indices == [0, 1, 2, 3]
        assert result.confidences == [1.0, 0.9, 0.8, 0.7]

    def test_ml_import_stores_metadata(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_ml_import_constraint,
    ):
        """Test that ML import constraint stores source metadata."""
        constraint_service.add(sample_project.id, sample_ml_import_constraint)

        result = constraint_service.get(sample_project.id, sample_ml_import_constraint.id)

        assert result.type == "ml_import"
        assert result.source_file == "predictions.npz"
        assert result.source_class == "class_0"
        assert len(result.point_indices) == 5
        assert len(result.confidences) == 5

    def test_cylinder_stores_geometry(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_cylinder_constraint,
    ):
        """Test that cylinder constraint stores all geometry."""
        constraint_service.add(sample_project.id, sample_cylinder_constraint)

        result = constraint_service.get(sample_project.id, sample_cylinder_constraint.id)

        assert result.type == "cylinder"
        assert result.center == (0.5, 0.5, 0.0)
        assert result.axis == (0.0, 0.0, 1.0)
        assert result.radius == 0.15
        assert result.height == 0.5

    def test_halfspace_stores_plane(
        self,
        constraint_service: ConstraintService,
        sample_project,
        sample_halfspace_constraint,
    ):
        """Test that halfspace constraint stores plane definition."""
        constraint_service.add(sample_project.id, sample_halfspace_constraint)

        result = constraint_service.get(sample_project.id, sample_halfspace_constraint.id)

        assert result.type == "halfspace"
        assert result.point == (0.0, 0.0, 0.5)
        assert result.normal == (0.0, 0.0, 1.0)
