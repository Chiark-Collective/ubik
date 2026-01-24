# ABOUTME: CLI entry point for SDF Labeler Docker container
# ABOUTME: Provides pipeline, project, and analysis commands

import argparse
import json
import sys
from pathlib import Path

from sdf_labeler_api.cli.pipeline import PipelineExecutor


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="sdf-labeler",
        description="SDF Labeler CLI - Pipeline execution and project management",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Pipeline command
    pipeline_parser = subparsers.add_parser("pipeline", help="Run a YAML pipeline")
    pipeline_parser.add_argument("file", type=Path, help="Path to pipeline YAML file")
    pipeline_parser.add_argument("--dry-run", action="store_true", help="Show what would be done")
    pipeline_parser.add_argument("--output-json", action="store_true", help="Output results as JSON")

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

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        return 1

    try:
        if args.command == "pipeline":
            return run_pipeline(args)
        elif args.command == "project":
            return run_project_command(args)
        elif args.command == "analyze":
            return run_analyze(args)
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
        print(f"  {i+1}. [{gc.constraint.get('type', 'unknown')}] {gc.description}")

    if args.apply and result.generated_constraints:
        print("\nApplying constraints...")
        for gc in result.generated_constraints:
            constraint_service.add_from_dict(args.project_id, gc.constraint.copy())
        print(f"Applied {len(result.generated_constraints)} constraints")

    return 0


if __name__ == "__main__":
    sys.exit(main())
