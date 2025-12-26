# ABOUTME: Constraint management service
# ABOUTME: Handles storage and retrieval of user-defined constraints

import json
from pathlib import Path

from sdf_labeler_api.models.constraints import Constraint, ConstraintSet


class ConstraintService:
    """Service for managing project constraints."""

    def __init__(self):
        # Constraints are stored per-project in their project directory
        pass

    def _constraints_path(self, project_id: str, data_dir: Path) -> Path:
        """Get path to constraints file."""
        return data_dir / "projects" / project_id / "constraints.json"

    def add(self, project_id: str, constraint: Constraint) -> Constraint:
        """Add a constraint to a project."""
        from sdf_labeler_api.config import settings

        constraints = self.list_all(project_id)
        constraints.constraints.append(constraint)
        self._save(project_id, constraints, settings.data_dir)
        return constraint

    def list_all(self, project_id: str) -> ConstraintSet:
        """List all constraints for a project."""
        from sdf_labeler_api.config import settings

        path = self._constraints_path(project_id, settings.data_dir)
        if not path.exists():
            return ConstraintSet(constraints=[])

        with open(path) as f:
            data = json.load(f)

        return ConstraintSet(**data)

    def get(self, project_id: str, constraint_id: str) -> Constraint | None:
        """Get a specific constraint."""
        constraints = self.list_all(project_id)
        for c in constraints.constraints:
            if c.id == constraint_id:
                return c
        return None

    def update(self, project_id: str, constraint: Constraint) -> Constraint | None:
        """Update an existing constraint."""
        from sdf_labeler_api.config import settings

        constraints = self.list_all(project_id)
        for i, c in enumerate(constraints.constraints):
            if c.id == constraint.id:
                constraints.constraints[i] = constraint
                self._save(project_id, constraints, settings.data_dir)
                return constraint
        return None

    def delete(self, project_id: str, constraint_id: str) -> bool:
        """Delete a constraint."""
        from sdf_labeler_api.config import settings

        constraints = self.list_all(project_id)
        original_count = len(constraints.constraints)
        constraints.constraints = [c for c in constraints.constraints if c.id != constraint_id]

        if len(constraints.constraints) < original_count:
            self._save(project_id, constraints, settings.data_dir)
            return True
        return False

    def clear(self, project_id: str) -> None:
        """Clear all constraints for a project."""
        from sdf_labeler_api.config import settings

        path = self._constraints_path(project_id, settings.data_dir)
        if path.exists():
            path.unlink()

    def _save(self, project_id: str, constraints: ConstraintSet, data_dir: Path) -> None:
        """Save constraints to disk."""
        path = self._constraints_path(project_id, data_dir)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(constraints.model_dump(mode="json"), f, indent=2)
