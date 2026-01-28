# ABOUTME: CLI entry point for SDF Labeler Docker container
# ABOUTME: Provides pipeline, project, and analysis commands

import argparse
import json
import sys
from pathlib import Path

from sdf_labeler_api.cli.pipeline import PipelineExecutor

MAIN_HELP = """\
SDF Labeler - Generate SDF training data from point clouds

CONTAINER MODES:
  webapp    Full interactive UI (default) - access at http://localhost:8000
  api       Backend REST API only - for programmatic access
  pipeline  Run YAML pipeline file - batch processing
  cli       Direct CLI commands - project management & analysis

EXAMPLES:
  # Run webapp (default)
  docker run -p 8000:8000 -v ./data:/data ubik:latest

  # Run API-only mode
  docker run -p 8000:8000 ubik:latest api

  # Run a pipeline
  docker run -v ./input:/data/input:ro -v ./output:/data/output \\
    ubik:latest pipeline /data/input/my-pipeline.yml

  # CLI commands
  docker run ubik:latest cli project list
  docker run ubik:latest cli --help

For pipeline YAML format and more examples, run: cli help
"""

DETAILED_HELP = """\
================================================================================
                        SDF LABELER - DETAILED HELP
================================================================================

OVERVIEW
--------
SDF Labeler generates signed distance field (SDF) training data from point
clouds. It detects EMPTY (air/free-space) and SOLID (underground/material)
regions automatically, then exports training samples for SDF regression models.

CONTAINER MODES
---------------

1. WEBAPP MODE (default)
   Full interactive web UI with 3D viewer and manual labeling tools.

   docker run -p 8000:8000 -v ./data:/data ubik:latest webapp
   # Then open http://localhost:8000

2. API MODE
   Backend REST API only, for programmatic access or custom frontends.
   CORS is enabled for all origins.

   docker run -p 8000:8000 ubik:latest api
   # Endpoints: /v1/projects, /v1/scenarios, /health, /docs

3. PIPELINE MODE
   Batch processing from YAML pipeline definitions. Fire-and-forget.

   docker run -v ./input:/data/input:ro -v ./output:/data/output \\
     ubik:latest pipeline /data/input/pipeline.yml

4. CLI MODE
   Direct command-line access for project management and debugging.

   docker run ubik:latest cli project list
   docker run ubik:latest cli analyze <project-id> --apply

AUTO-ANALYSIS ALGORITHMS
------------------------

The auto-analysis system uses two complementary algorithms:

  flood_fill     Detects EMPTY (air) regions by ray-casting from above (+Z).
                 Rays propagate downward in a cone, finding sky-reachable space.
                 Use for: free-space above trenches, open air, cavities.

  voxel_regions  Detects SOLID (underground) regions by ray-casting from below.
                 Rays propagate upward from -Z until hitting surface points.
                 Use for: material below surface, trench walls, underground.

IMPORTANT: Use BOTH algorithms together for complete coverage:

  algorithms:
    - flood_fill      # EMPTY samples (positive SDF - outside surface)
    - voxel_regions   # SOLID samples (negative SDF - inside surface)

Using only flood_fill will produce EMPTY samples only!

PIPELINE YAML FORMAT
--------------------

name: my-pipeline
project_name: optional-project-name  # auto-generated if omitted

steps:
  - name: Load point cloud
    type: load_pointcloud
    source: S01_straight_vwalls      # scenario name or file path
    scenario_category: trenchfoot    # 'trenchfoot' or 'sdf'
    estimate_normals: true

  - name: Auto-analyze
    type: auto_analyze
    algorithms:
      - flood_fill                   # EMPTY detection
      - voxel_regions                # SOLID detection
    apply_filter: all                # 'all', 'solid', 'empty', or 'none'

  - name: Generate samples
    type: generate_samples
    total_samples: 10000             # target sample count

  - name: Export
    type: export
    format: parquet                  # output format
    output_path: /data/output        # where to write file
    include_surface_points: true     # include input points for self-contained export

cleanup: true  # delete project after pipeline completes

SELF-CONTAINED EXPORT
---------------------

By default, exports contain only the SDF constraint samples (far-field EMPTY/SOLID
points). Set `include_surface_points: true` to also include the original input
point cloud in the parquet file. This creates a fully self-contained training
dataset with both:
  - Surface points (phi=0, is_surface=true) - the original point cloud
  - Far-field samples (phi>0 for EMPTY, phi<0 for SOLID) - constraint samples

AVAILABLE SCENARIOS
-------------------

Trenchfoot scenarios (synthetic trenches):
  S01_straight_vwalls, S02_straight_slope_pipe, S03_L_slope_two_pipes_box,
  S04_U_slope_multi_noise, S05_wide_slope_pair, S06_bumpy_wide_loop,
  S07_circular_well

SDF scenarios (terrain surfaces):
  alpine_ridge_long, asteroid_cluster, bumpy_heterogeneous, cave_network_dense,
  compact_extreme_relief, complex_random_polygon, flat_rect_small, and more.

List all: curl http://localhost:8000/v1/scenarios

OUTPUT FORMAT
-------------

Parquet files contain these columns:
  x, y, z       3D position
  phi           SDF value (positive=outside/empty, negative=inside/solid)
  nx, ny, nz    Normal direction (zero for non-surface points)
  weight        Sample weight (default 1.0)
  source        Origin: 'idw_empty', 'idw_solid', 'surface', etc.
  is_surface    Boolean: true if on surface boundary
  is_free       Boolean: true if empty/air, false if solid/material

Compatible with survi SDF training:
  python -m survi.cli sdf train --point-cloud output/samples.parquet

DEFAULT PIPELINE
----------------

A default pipeline is included at /app/examples/default-pipeline.yml
that demonstrates the recommended configuration with both algorithms.

================================================================================
"""


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="sdf-labeler",
        description="SDF Labeler CLI - Pipeline execution and project management",
        epilog=MAIN_HELP,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Help command
    subparsers.add_parser(
        "help",
        help="Show detailed help for all modes and pipeline format",
    )

    # Pipeline command
    pipeline_parser = subparsers.add_parser(
        "pipeline",
        help="Run a YAML pipeline",
        description="Execute a YAML pipeline for batch processing point clouds.",
        epilog="Example: cli pipeline /data/input/pipeline.yml --dry-run",
    )
    pipeline_parser.add_argument("file", type=Path, help="Path to pipeline YAML file")
    pipeline_parser.add_argument("--dry-run", action="store_true", help="Show what would be done")
    pipeline_parser.add_argument(
        "--output-json", action="store_true", help="Output results as JSON"
    )

    # Project commands
    project_parser = subparsers.add_parser("project", help="Project management")
    project_subparsers = project_parser.add_subparsers(dest="project_command")

    project_subparsers.add_parser("list", help="List all projects")
    project_get = project_subparsers.add_parser("get", help="Get project details")
    project_get.add_argument("project_id", help="Project ID")
    project_delete = project_subparsers.add_parser("delete", help="Delete a project")
    project_delete.add_argument("project_id", help="Project ID")

    # Analyze command
    analyze_parser = subparsers.add_parser("analyze", help="Run auto-analysis on a project")
    analyze_parser.add_argument("project_id", help="Project ID")
    analyze_parser.add_argument(
        "--algorithms",
        nargs="+",
        default=["flood_fill", "voxel_regions", "normal_idw"],
        help="Algorithms to run",
    )
    analyze_parser.add_argument("--apply", action="store_true", help="Apply generated constraints")

    # Visualize command
    viz_parser = subparsers.add_parser(
        "visualize",
        help="Create interactive 3D visualization of SDF samples",
        description="Generate an HTML file with Plotly 3D scatter plot of samples",
    )
    viz_parser.add_argument("samples", type=Path, help="Path to samples parquet file")
    viz_parser.add_argument(
        "--surface", "-s", type=Path, help="Optional surface point cloud (ply, parquet, csv, las)"
    )
    viz_parser.add_argument("--output", "-o", type=Path, help="Output HTML path")
    viz_parser.add_argument(
        "--sample",
        type=float,
        default=1.0,
        help="Fraction of points to display (0.0-1.0, default: 1.0)",
    )
    viz_parser.add_argument("--point-size", type=int, default=3, help="Point size (default: 3)")
    viz_parser.add_argument("--open", action="store_true", help="Open in browser after creation")

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        return 1

    try:
        if args.command == "help":
            print(DETAILED_HELP)
            return 0
        elif args.command == "pipeline":
            return run_pipeline(args)
        elif args.command == "project":
            return run_project_command(args)
        elif args.command == "analyze":
            return run_analyze(args)
        elif args.command == "visualize":
            return run_visualize(args)
        else:
            parser.print_help()
            return 1
    except KeyboardInterrupt:
        print("\nInterrupted")
        return 130
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback

            traceback.print_exc()
        return 1


def run_pipeline(args) -> int:
    """Run a pipeline from YAML file."""
    executor = PipelineExecutor(verbose=args.verbose)

    try:
        pipeline = PipelineExecutor.load_pipeline(args.file)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error loading pipeline: {e}", file=sys.stderr)
        return 1

    result = executor.run(pipeline, dry_run=args.dry_run)

    if args.output_json:
        print(json.dumps(result, indent=2))
    elif args.dry_run:
        print("\nPipeline steps:")
        for step in result.get("steps", []):
            print(f"  {step['index']}. [{step['type']}] {step['name']}")

    return 0 if result.get("steps_failed", 0) == 0 else 1


def run_project_command(args) -> int:
    """Handle project subcommands."""
    from sdf_labeler_api.config import settings
    from sdf_labeler_api.services.project_service import ProjectService

    settings.ensure_data_dir()
    service = ProjectService(settings.data_dir)

    if args.project_command == "list":
        projects = service.list_all()
        if not projects:
            print("No projects found")
        else:
            print(f"{'ID':<40} {'Name':<30} {'Created'}")
            print("-" * 90)
            for p in projects:
                created = p.created_at.strftime("%Y-%m-%d %H:%M") if p.created_at else "N/A"
                print(f"{p.id:<40} {p.name:<30} {created}")
        return 0

    elif args.project_command == "get":
        project = service.get(args.project_id)
        if project is None:
            print(f"Project not found: {args.project_id}", file=sys.stderr)
            return 1
        print(json.dumps(project.model_dump(mode="json"), indent=2, default=str))
        return 0

    elif args.project_command == "delete":
        if service.delete(args.project_id):
            print(f"Deleted project: {args.project_id}")
            return 0
        else:
            print(f"Project not found: {args.project_id}", file=sys.stderr)
            return 1

    else:
        print("Unknown project command", file=sys.stderr)
        return 1


def run_analyze(args) -> int:
    """Run auto-analysis on a project."""
    import asyncio

    from sdf_labeler_api.config import settings
    from sdf_labeler_api.services.auto_analysis_service import AutoAnalysisService
    from sdf_labeler_api.services.constraint_service import ConstraintService
    from sdf_labeler_api.services.project_service import ProjectService

    settings.ensure_data_dir()
    project_service = ProjectService(settings.data_dir)
    auto_service = AutoAnalysisService(settings)
    constraint_service = ConstraintService()

    project = project_service.get(args.project_id)
    if project is None:
        print(f"Project not found: {args.project_id}", file=sys.stderr)
        return 1

    if project.point_cloud_id is None:
        print("Project has no point cloud loaded", file=sys.stderr)
        return 1

    print(f"Running analysis on project: {project.name}")
    print(f"Algorithms: {args.algorithms}")

    async def run_analysis():
        return await auto_service.analyze(
            args.project_id,
            algorithms=args.algorithms,
        )

    result = asyncio.run(run_analysis())

    print(f"\nGenerated {len(result.generated_constraints)} constraints:")
    for i, gc in enumerate(result.generated_constraints):
        print(f"  {i + 1}. [{gc.constraint.get('type', 'unknown')}] {gc.description}")

    if args.apply and result.generated_constraints:
        print("\nApplying constraints...")
        for gc in result.generated_constraints:
            constraint_service.add_from_dict(args.project_id, gc.constraint.copy())
        print(f"Applied {len(result.generated_constraints)} constraints")

    return 0


def run_visualize(args) -> int:
    """Create interactive visualization of SDF samples."""
    from sdf_labeler_api.cli.visualize import create_visualization

    if not args.samples.exists():
        print(f"Error: samples file not found: {args.samples}", file=sys.stderr)
        return 1

    if args.surface and not args.surface.exists():
        print(f"Error: surface file not found: {args.surface}", file=sys.stderr)
        return 1

    output_path = create_visualization(
        samples_path=args.samples,
        surface_path=args.surface,
        output_path=args.output,
        sample_fraction=args.sample,
        point_size=args.point_size,
    )

    if args.open:
        import webbrowser

        webbrowser.open(f"file://{output_path.absolute()}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
