# ABOUTME: Service for loading pre-built scenario datasets (trenchfoot, SDF scenarios)
# ABOUTME: Provides access to bundled point clouds and meshes for testing/demo purposes

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np
import pandas as pd
import trimesh

if TYPE_CHECKING:
    from numpy.typing import NDArray

logger = logging.getLogger(__name__)


@dataclass
class ScenarioInfo:
    """Metadata about an available scenario."""

    name: str
    description: str
    category: str  # "trenchfoot", "sdf", etc.
    preview_url: str | None = None
    point_count: int | None = None


@dataclass
class LoadedScenario:
    """A loaded scenario with point cloud and optional mesh."""

    name: str
    points: pd.DataFrame  # columns: x, y, z, and optionally nx, ny, nz
    mesh: trimesh.Trimesh | None
    bounds: tuple[NDArray[np.float64], NDArray[np.float64]]  # (min, max)
    metadata: dict


def list_trenchfoot_scenarios() -> list[ScenarioInfo]:
    """List available trenchfoot scenarios from the surface-scenarios package."""
    try:
        import survi_scenarios

        scenario_names = survi_scenarios.list_trenchfoot_scenarios()
        return [
            ScenarioInfo(
                name=name,
                description=f"Trenchfoot scenario: {name.replace('_', ' ').title()}",
                category="trenchfoot",
            )
            for name in scenario_names
        ]

    except ImportError:
        logger.warning("survi_scenarios package not available")
        return []
    except Exception as e:
        logger.error(f"Error listing trenchfoot scenarios: {e}")
        return []


def list_sdf_scenarios() -> list[ScenarioInfo]:
    """List available SDF scenarios from the surface-scenarios package."""
    try:
        from survi_scenarios import list_sdf_scenarios as _list_sdf

        scenario_names = _list_sdf()
        return [
            ScenarioInfo(
                name=name,
                description=f"SDF scenario: {name.replace('_', ' ').title()}",
                category="sdf",
            )
            for name in scenario_names
        ]

    except ImportError:
        logger.warning("survi_scenarios package not available")
        return []
    except Exception as e:
        logger.error(f"Error listing SDF scenarios: {e}")
        return []


def load_trenchfoot_scenario(
    scenario_name: str,
    num_samples: int = 50000,
    variant: str | None = None,
) -> LoadedScenario:
    """
    Load a trenchfoot scenario by name using the survi_scenarios API.

    Args:
        scenario_name: Name of the scenario (e.g., "S01_straight_vwalls")
        num_samples: Number of points to sample from mesh (default 50000)
        variant: Optional variant name (not currently used, reserved for future)

    Returns:
        LoadedScenario with point cloud DataFrame and mesh
    """
    # Note: variant parameter reserved for future use
    _ = variant
    import survi_scenarios

    # Use the new survi_scenarios loader
    surface = survi_scenarios.load_trenchfoot_scenario(scenario_name)

    # Load mesh from the path in metadata
    mesh_path = surface.metadata.get("mesh_path")
    if not mesh_path:
        raise ValueError(f"No mesh path in scenario metadata: {scenario_name}")

    mesh = trimesh.load(mesh_path)
    if isinstance(mesh, trimesh.Scene):
        meshes = [g for g in mesh.geometry.values() if isinstance(g, trimesh.Trimesh)]
        if meshes:
            mesh = trimesh.util.concatenate(meshes)
        else:
            raise ValueError(f"No mesh geometry found: {scenario_name}")

    # Sample points uniformly from mesh surface
    points, face_indices = mesh.sample(num_samples, return_index=True)

    # Compute face normals for sampled points
    face_normals = mesh.face_normals[face_indices]

    points_data = {
        "x": points[:, 0].astype(np.float64),
        "y": points[:, 1].astype(np.float64),
        "z": points[:, 2].astype(np.float64),
        "nx": face_normals[:, 0].astype(np.float64),
        "ny": face_normals[:, 1].astype(np.float64),
        "nz": face_normals[:, 2].astype(np.float64),
    }

    points_df = pd.DataFrame(points_data)

    # Compute bounds from mesh
    bounds = (mesh.bounds[0], mesh.bounds[1])

    # Build metadata
    metadata = {
        "scenario": scenario_name,
        "point_count": len(points_df),
        "has_normals": True,
        "has_mesh": True,
        "sampled_from_mesh": True,
        **surface.metadata,
    }

    return LoadedScenario(
        name=scenario_name,
        points=points_df,
        mesh=mesh,
        bounds=bounds,
        metadata=metadata,
    )


def load_sdf_scenario(scenario_name: str) -> LoadedScenario:
    """
    Load an SDF scenario by name.

    Args:
        scenario_name: Name of the scenario (e.g., "torus_compact")

    Returns:
        LoadedScenario with point cloud DataFrame and mesh
    """
    from survi_scenarios import load_sdf_scenario as _load_sdf

    surface = _load_sdf(scenario_name)

    # Convert to DataFrame
    points_df = surface.surface_df.copy()

    # Ensure required columns exist
    if "x" not in points_df.columns:
        raise ValueError(f"SDF scenario {scenario_name} missing coordinate columns")

    # Load mesh if available
    mesh = surface.mesh if hasattr(surface, "mesh") and surface.mesh is not None else None

    # Compute bounds
    coords = points_df[["x", "y", "z"]].values
    bounds = (coords.min(axis=0), coords.max(axis=0))

    metadata = {
        "scenario": scenario_name,
        "category": "sdf",
        "point_count": len(points_df),
        "has_normals": "nx" in points_df.columns,
        "has_mesh": mesh is not None,
    }

    return LoadedScenario(
        name=scenario_name,
        points=points_df,
        mesh=mesh,
        bounds=bounds,
        metadata=metadata,
    )
