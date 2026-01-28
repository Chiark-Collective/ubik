# ABOUTME: Pipeline executor for running YAML pipeline definitions
# ABOUTME: Dispatches step types to service layer methods

import asyncio
import shutil
import uuid
from datetime import datetime
from pathlib import Path

import yaml

from sdf_labeler_api.cli.pipeline_schema import (
    ApplyConstraintsStep,
    AutoAnalyzeStep,
    ExportFormat,
    ExportStep,
    GenerateSamplesStep,
    LoadPointcloudStep,
    Pipeline,
    PipelineStep,
)
from sdf_labeler_api.config import settings
from sdf_labeler_api.models.auto_analysis import AutoAnalysisOptions, AutoAnalyzeRequest
from sdf_labeler_api.models.project import ProjectCreate
from sdf_labeler_api.models.samples import SampleGenerationRequest
from sdf_labeler_api.services import scenarios_service
from sdf_labeler_api.services.auto_analysis_service import AutoAnalysisService
from sdf_labeler_api.services.constraint_service import ConstraintService
from sdf_labeler_api.services.pointcloud_service import PointCloudService
from sdf_labeler_api.services.project_service import ProjectService
from sdf_labeler_api.services.sampling_service import SamplingService


class PipelineExecutor:
    """Executes pipeline definitions using the service layer."""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        settings.ensure_data_dir()

        # Initialize services
        self.project_service = ProjectService(settings.data_dir)
        self.pointcloud_service = PointCloudService(settings)
        self.constraint_service = ConstraintService()
        self.sampling_service = SamplingService()
        self.auto_analysis_service = AutoAnalysisService(settings)

        # Runtime state
        self.project_id: str | None = None
        self.project_name: str | None = None

    def log(self, message: str, level: str = "info") -> None:
        """Log a message to stdout."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        prefix = {"info": "ℹ", "success": "✓", "error": "✗", "warn": "⚠"}.get(level, "•")
        print(f"[{timestamp}] {prefix} {message}")

    def log_verbose(self, message: str) -> None:
        """Log a message only in verbose mode."""
        if self.verbose:
            self.log(message)

    @staticmethod
    def load_pipeline(yaml_path: Path) -> Pipeline:
        """Load and validate a pipeline from YAML file."""
        if not yaml_path.exists():
            raise FileNotFoundError(f"Pipeline file not found: {yaml_path}")

        with open(yaml_path) as f:
            data = yaml.safe_load(f)

        return Pipeline.model_validate(data)

    def run(self, pipeline: Pipeline, dry_run: bool = False) -> dict:
        """Run a pipeline synchronously (wraps async execution)."""
        return asyncio.run(self.run_async(pipeline, dry_run=dry_run))

    async def run_async(self, pipeline: Pipeline, dry_run: bool = False) -> dict:
        """Run a pipeline asynchronously."""
        self.log(f"Starting pipeline: {pipeline.name}")
        if pipeline.description:
            self.log_verbose(f"Description: {pipeline.description}")

        step_counts = pipeline.get_step_counts()
        self.log(f"Steps: {len(pipeline.steps)} ({', '.join(f'{k}:{v}' for k, v in step_counts.items())})")

        if dry_run:
            self.log("DRY RUN - no changes will be made")
            return self._dry_run_summary(pipeline)

        # Create project
        project_name = pipeline.project_name or f"pipeline-{uuid.uuid4().hex[:8]}"
        self.project_name = project_name
        project = self.project_service.create(ProjectCreate(name=project_name))
        self.project_id = project.id
        self.log(f"Created project: {project_name} ({project.id})")

        results: dict = {
            "project_id": project.id,
            "project_name": project_name,
            "steps_completed": 0,
            "steps_failed": 0,
            "outputs": [],
        }

        try:
            for i, step in enumerate(pipeline.steps, 1):
                self.log(f"[{i}/{len(pipeline.steps)}] {step.name}")
                try:
                    step_result = await self._execute_step(step)
                    results["steps_completed"] += 1
                    if step_result:
                        results["outputs"].append(step_result)
                except Exception as e:
                    self.log(f"Step failed: {e}", level="error")
                    results["steps_failed"] += 1
                    raise

            self.log("Pipeline completed successfully", level="success")

        finally:
            if pipeline.cleanup and self.project_id:
                self.log("Cleaning up project...")
                self.project_service.delete(self.project_id)

        return results

    def _dry_run_summary(self, pipeline: Pipeline) -> dict:
        """Generate dry-run summary without executing."""
        summary = {
            "dry_run": True,
            "pipeline_name": pipeline.name,
            "steps": [],
        }

        for i, step in enumerate(pipeline.steps, 1):
            step_info = {
                "index": i,
                "name": step.name,
                "type": step.type.value,
            }

            if isinstance(step, LoadPointcloudStep):
                step_info["source"] = step.source
            elif isinstance(step, AutoAnalyzeStep):
                step_info["algorithms"] = step.algorithms
                step_info["apply_filter"] = step.apply_filter
            elif isinstance(step, ApplyConstraintsStep):
                step_info["constraint_count"] = len(step.constraints)
            elif isinstance(step, GenerateSamplesStep):
                step_info["total_samples"] = step.total_samples
            elif isinstance(step, ExportStep):
                step_info["format"] = step.format.value
                step_info["output_path"] = step.output_path

            summary["steps"].append(step_info)

        return summary

    async def _execute_step(self, step: PipelineStep) -> dict | None:
        """Dispatch step execution based on type."""
        if isinstance(step, LoadPointcloudStep):
            return await self._execute_load(step)
        elif isinstance(step, AutoAnalyzeStep):
            return await self._execute_auto_analyze(step)
        elif isinstance(step, ApplyConstraintsStep):
            return await self._execute_apply_constraints(step)
        elif isinstance(step, GenerateSamplesStep):
            return await self._execute_generate_samples(step)
        elif isinstance(step, ExportStep):
            return await self._execute_export(step)
        else:
            raise ValueError(f"Unknown step type: {type(step)}")

    async def _execute_load(self, step: LoadPointcloudStep) -> dict:
        """Execute a load_pointcloud step."""
        assert self.project_id is not None

        source = Path(step.source)

        # Check if it's a scenario or file
        if step.scenario_category or not source.exists():
            # Try to load as scenario
            category = step.scenario_category or "trenchfoot"
            scenario_name = step.source

            self.log_verbose(f"Loading scenario: {category}:{scenario_name}")

            if category == "trenchfoot":
                loaded = scenarios_service.load_trenchfoot_scenario(
                    scenario_name, variant=step.scenario_variant
                )
            elif category == "sdf":
                loaded = scenarios_service.load_sdf_scenario(scenario_name)
            else:
                raise ValueError(f"Unknown scenario category: {category}")

            result = await self.pointcloud_service.store_dataframe(
                project_id=self.project_id,
                df=loaded.points,
                source_name=f"{category}:{scenario_name}",
                mesh=loaded.mesh,
            )
        else:
            # Load from file
            self.log_verbose(f"Loading file: {source}")

            # Create a mock UploadFile for the service
            from io import BytesIO

            from fastapi import UploadFile

            with open(source, "rb") as f:
                content = f.read()

            file = UploadFile(
                filename=source.name,
                file=BytesIO(content),
            )

            result = await self.pointcloud_service.upload_and_process(
                project_id=self.project_id,
                file=file,
                estimate_normals=step.estimate_normals,
                normal_k=step.normal_k,
            )

        # Update project
        self.project_service.set_pointcloud(
            self.project_id, result.id, result.bounds_low, result.bounds_high
        )

        self.log_verbose(f"Loaded {result.point_count} points")
        return {"point_count": result.point_count, "bounds": [result.bounds_low, result.bounds_high]}

    async def _execute_auto_analyze(self, step: AutoAnalyzeStep) -> dict:
        """Execute an auto_analyze step."""
        assert self.project_id is not None

        # Build options from step config
        options_dict = {
            "flood_fill_sample_count": step.options.flood_fill_sample_count,
            "voxel_regions_sample_count": step.options.voxel_regions_sample_count,
        }
        if step.options.min_gap_size is not None:
            options_dict["min_gap_size"] = step.options.min_gap_size
        if step.options.voxel_size is not None:
            options_dict["voxel_size"] = step.options.voxel_size
        options = AutoAnalysisOptions(**options_dict)

        request = AutoAnalyzeRequest(
            algorithms=step.algorithms,  # type: ignore[arg-type]
            options=options,
        )

        self.log_verbose(f"Running algorithms: {step.algorithms}")
        result = await self.auto_analysis_service.analyze(
            self.project_id,
            algorithms=request.algorithms,
            options=request.options,
        )

        # Apply constraints based on filter
        applied_count = 0
        if step.apply_filter != "none" and result.generated_constraints:
            for gen_constraint in result.generated_constraints:
                constraint_data = gen_constraint.constraint.copy()
                sign = constraint_data.get("sign", "").lower()

                if step.apply_filter == "all":
                    should_apply = True
                elif step.apply_filter == "solid":
                    should_apply = sign == "solid"
                elif step.apply_filter == "empty":
                    should_apply = sign == "empty"
                else:
                    should_apply = False

                if should_apply:
                    self.constraint_service.add_from_dict(self.project_id, constraint_data)
                    applied_count += 1

        self.log_verbose(f"Generated {len(result.generated_constraints)} constraints, applied {applied_count}")
        return {
            "generated": len(result.generated_constraints),
            "applied": applied_count,
            "algorithms_run": result.algorithms_run,
        }

    async def _execute_apply_constraints(self, step: ApplyConstraintsStep) -> dict:
        """Execute an apply_constraints step."""
        assert self.project_id is not None

        added = 0
        for spec in step.constraints:
            constraint_dict = {"type": spec.type, "sign": spec.sign}

            # Add type-specific fields
            if spec.center:
                constraint_dict["center"] = spec.center
            if spec.half_extents:
                constraint_dict["half_extents"] = spec.half_extents
            if spec.radius is not None:
                constraint_dict["radius"] = spec.radius
            if spec.point:
                constraint_dict["point"] = spec.point
            if spec.normal:
                constraint_dict["normal"] = spec.normal
            if spec.height is not None:
                constraint_dict["height"] = spec.height

            self.constraint_service.add_from_dict(self.project_id, constraint_dict)
            added += 1

        self.log_verbose(f"Added {added} constraints")
        return {"constraints_added": added}

    async def _execute_generate_samples(self, step: GenerateSamplesStep) -> dict:
        """Execute a generate_samples step."""
        assert self.project_id is not None

        request = SampleGenerationRequest(
            total_samples=step.total_samples,
            strategy=step.strategy.value,
            inverse_square_falloff=step.falloff,
        )

        result = self.sampling_service.generate(self.project_id, request)

        self.log_verbose(f"Generated {result.sample_count} samples")
        return {"total_samples": result.sample_count}

    async def _execute_export(self, step: ExportStep) -> dict:
        """Execute an export step."""
        assert self.project_id is not None

        output_dir = Path(step.output_path)
        output_dir.mkdir(parents=True, exist_ok=True)

        outputs = []

        if step.format == ExportFormat.PARQUET or step.format == ExportFormat.CONFIG:
            # Always export parquet for training data
            parquet_path = self.sampling_service.export_parquet(self.project_id)
            if parquet_path:
                filename = step.filename or f"{self.project_name}_samples.parquet"
                dest = output_dir / filename

                if step.include_surface_points:
                    # Create self-contained export with surface points included
                    self._export_with_surface_points(parquet_path, dest)
                else:
                    shutil.copy(parquet_path, dest)

                outputs.append(str(dest))
                self.log_verbose(f"Exported: {dest}")

        if step.format == ExportFormat.CONFIG:
            # Also export config JSON
            project = self.project_service.get(self.project_id)
            if project:
                config = self.sampling_service.export_config(self.project_id, project)
                config_filename = (step.filename or self.project_name or "config") + ".json"
                if config_filename.endswith(".parquet.json"):
                    config_filename = config_filename.replace(".parquet.json", ".json")
                config_path = output_dir / config_filename
                import json
                with open(config_path, "w") as f:
                    json.dump(config, f, indent=2)
                outputs.append(str(config_path))
                self.log_verbose(f"Exported: {config_path}")

        return {"outputs": outputs}

    def _export_with_surface_points(self, samples_parquet: Path, dest: Path) -> None:
        """Export samples merged with surface points for self-contained output.

        This creates a parquet file containing both:
        - SDF constraint samples (from the sampling service)
        - Surface points from the input point cloud (phi=0, is_surface=True)
        """
        import numpy as np
        import pandas as pd

        assert self.project_id is not None

        # Load existing samples
        samples_df = pd.read_parquet(samples_parquet)

        # Load surface point cloud
        points_path = (
            settings.data_dir / "projects" / self.project_id / "pointcloud" / "points.npz"
        )
        if not points_path.exists():
            # No point cloud - just copy the samples
            samples_df.to_parquet(dest)
            return

        data = np.load(points_path)
        xyz = data["xyz"]
        normals = data["normals"] if data["normals"].size > 0 else None

        # Create surface points DataFrame
        surface_data = {
            "x": xyz[:, 0],
            "y": xyz[:, 1],
            "z": xyz[:, 2],
            "phi": np.zeros(len(xyz)),  # Surface points have phi=0
            "nx": normals[:, 0] if normals is not None else np.zeros(len(xyz)),
            "ny": normals[:, 1] if normals is not None else np.zeros(len(xyz)),
            "nz": normals[:, 2] if normals is not None else np.zeros(len(xyz)),
            "weight": np.ones(len(xyz)),
            "source": ["surface"] * len(xyz),
            "is_surface": [True] * len(xyz),
            "is_free": [False] * len(xyz),  # Surface is boundary, not free space
        }
        surface_df = pd.DataFrame(surface_data)

        # Concatenate samples + surface points
        combined_df = pd.concat([samples_df, surface_df], ignore_index=True)

        self.log_verbose(
            f"Self-contained export: {len(samples_df)} samples + {len(surface_df)} surface points"
        )

        # Write combined parquet
        combined_df.to_parquet(dest)
