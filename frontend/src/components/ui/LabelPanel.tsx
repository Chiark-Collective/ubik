// ABOUTME: Right sidebar panel for label selection and constraint list
// ABOUTME: Shows active label type and list of created constraints

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as Dialog from "@radix-ui/react-dialog";
import {
  TrashIcon,
  DownloadIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";

import { useProjectStore, type LabelType } from "../../stores/projectStore";
import { useLabelStore, type Constraint } from "../../stores/labelStore";
import { useSliceStore } from "../../stores/sliceStore";
import { useBrushStore } from "../../stores/brushStore";
import { useSeedStore } from "../../stores/seedStore";
import { useRayScribbleStore } from "../../stores/rayScribbleStore";
import { useSprayEffectStore } from "../../stores/sprayEffectStore";
import { useLocalSpacing } from "../../hooks/useLocalSpacing";
import { usePocketStore } from "../../stores/pocketStore";
import { useAutoAnalysisStore } from "../../stores/autoAnalysisStore";
import { useConstraintSync } from "../../hooks/useConstraintSync";
import { toast } from "../../stores/toastStore";
import { LoadingButton } from "./Spinner";
import { PrimitiveMode } from "../modes/PrimitiveMode";
import { SliceMode } from "../modes/SliceMode";
import { BrushMode } from "../modes/BrushMode";
import { SeedMode } from "../modes/SeedMode";
import { MLImportMode } from "../modes/MLImportMode";
import { RayScribbleMode } from "../modes/RayScribbleMode";
import { ClickPocketMode } from "../modes/ClickPocketMode";
import { AutoMode } from "../modes/AutoMode";
import {
  generateSamples,
  exportParquet,
  clearConstraints as clearConstraintsApi,
  runAutoAnalysis,
  applyAutoConstraints,
  expandToSamplePoints,
} from "../../services/api";

const labelOptions: {
  value: LabelType;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    value: "solid",
    label: "Solid",
    description: "Inside the surface (material)",
    color: "bg-solid",
  },
  {
    value: "empty",
    label: "Empty",
    description: "Outside the surface (air)",
    color: "bg-empty",
  },
  {
    value: "surface",
    label: "Surface",
    description: "On the boundary (distance = 0)",
    color: "bg-surface",
  },
];

// Wrapper for SliceMode with store integration
function SliceModePanel({ projectId }: { projectId: string }) {
  const activeLabel = useProjectStore((s) => s.activeLabel);
  const slicePlane = useProjectStore((s) => s.slicePlane);
  const slicePosition = useProjectStore((s) => s.slicePosition);

  const tool = useSliceStore((s) => s.tool);
  const setTool = useSliceStore((s) => s.setTool);
  const brushSize = useSliceStore((s) => s.brushSize);
  const setBrushSize = useSliceStore((s) => s.setBrushSize);
  const selectedPointIndices = useSliceStore((s) => s.selectedPointIndices);
  const clearSelectedPoints = useSliceStore((s) => s.clearSelectedPoints);

  const addConstraint = useLabelStore((s) => s.addConstraint);

  const handleCreateConstraint = () => {
    if (selectedPointIndices.size === 0) return;

    const constraint: import("../../stores/labelStore").SliceSelectionConstraint =
      {
        id: crypto.randomUUID(),
        type: "slice_selection",
        sign: activeLabel,
        weight: 1.0,
        createdAt: Date.now(),
        pointIndices: Array.from(selectedPointIndices),
        slicePlane,
        slicePosition,
      };

    addConstraint(projectId, constraint);
    clearSelectedPoints();
    toast.success(
      "Constraint created",
      `${selectedPointIndices.size} points marked as ${activeLabel}`,
    );
  };

  return (
    <div className="border-b border-gray-800">
      <SliceMode
        tool={tool}
        setTool={setTool}
        brushSize={brushSize}
        setBrushSize={setBrushSize}
        selectedPointCount={selectedPointIndices.size}
        onCreateConstraint={handleCreateConstraint}
      />
    </div>
  );
}

// Wrapper for BrushMode with store integration
function BrushModePanel() {
  const depthAware = useBrushStore((s) => s.depthAware);
  const setDepthAware = useBrushStore((s) => s.setDepthAware);

  return (
    <div className="border-b border-gray-800">
      <BrushMode depthAware={depthAware} setDepthAware={setDepthAware} />
    </div>
  );
}

// Wrapper for SeedMode with store integration
function SeedModePanel({ projectId }: { projectId: string }) {
  const seeds = useSeedStore((s) => s.seeds);
  const addSeed = useSeedStore((s) => s.addSeed);
  const removeSeed = useSeedStore((s) => s.removeSeed);
  const clearSeeds = useSeedStore((s) => s.clearSeeds);

  return (
    <div className="border-b border-gray-800">
      <SeedMode
        projectId={projectId}
        seeds={seeds}
        onAddSeed={(pos) => addSeed(pos)}
        onRemoveSeed={removeSeed}
        onClearSeeds={clearSeeds}
      />
    </div>
  );
}

// Wrapper for MLImportMode
function MLImportModePanel({ projectId }: { projectId: string }) {
  return (
    <div className="border-b border-gray-800">
      <MLImportMode projectId={projectId} />
    </div>
  );
}

// Wrapper for RayScribbleMode with store integration
function RayScribbleModePanel() {
  const pointCloudPositions = useProjectStore((s) => s.pointCloudPositions);

  const emptyBandWidth = useRayScribbleStore((s) => s.emptyBandWidth);
  const setEmptyBandWidth = useRayScribbleStore((s) => s.setEmptyBandWidth);
  const surfaceBandWidth = useRayScribbleStore((s) => s.surfaceBandWidth);
  const setSurfaceBandWidth = useRayScribbleStore((s) => s.setSurfaceBandWidth);
  const backBufferWidth = useRayScribbleStore((s) => s.backBufferWidth);
  const setBackBufferWidth = useRayScribbleStore((s) => s.setBackBufferWidth);
  const useAdaptiveBackBuffer = useRayScribbleStore(
    (s) => s.useAdaptiveBackBuffer,
  );
  const setUseAdaptiveBackBuffer = useRayScribbleStore(
    (s) => s.setUseAdaptiveBackBuffer,
  );
  const backBufferCoefficient = useRayScribbleStore(
    (s) => s.backBufferCoefficient,
  );
  const setBackBufferCoefficient = useRayScribbleStore(
    (s) => s.setBackBufferCoefficient,
  );
  const isScribbling = useRayScribbleStore((s) => s.isScribbling);
  const strokes = useRayScribbleStore((s) => s.strokes);
  const clearStrokes = useRayScribbleStore((s) => s.clearStrokes);

  // Spray effect settings
  const handedness = useSprayEffectStore((s) => s.handedness);
  const setHandedness = useSprayEffectStore((s) => s.setHandedness);
  const particleDensity = useSprayEffectStore((s) => s.particleDensity);
  const setParticleDensity = useSprayEffectStore((s) => s.setParticleDensity);

  // Local spacing computation for adaptive back buffer
  const { isReady, isComputing, progress, globalMean } =
    useLocalSpacing(pointCloudPositions);

  return (
    <RayScribbleMode
      emptyBandWidth={emptyBandWidth}
      setEmptyBandWidth={setEmptyBandWidth}
      surfaceBandWidth={surfaceBandWidth}
      setSurfaceBandWidth={setSurfaceBandWidth}
      backBufferWidth={backBufferWidth}
      setBackBufferWidth={setBackBufferWidth}
      useAdaptiveBackBuffer={useAdaptiveBackBuffer}
      setUseAdaptiveBackBuffer={setUseAdaptiveBackBuffer}
      backBufferCoefficient={backBufferCoefficient}
      setBackBufferCoefficient={setBackBufferCoefficient}
      localSpacingStatus={{ isReady, isComputing, progress, globalMean }}
      isScribbling={isScribbling}
      strokeCount={strokes.length}
      onClearStrokes={clearStrokes}
      handedness={handedness}
      setHandedness={setHandedness}
      particleDensity={particleDensity}
      setParticleDensity={setParticleDensity}
      qualityTier="auto-detected"
    />
  );
}

// Wrapper for ClickPocketMode with store integration
function ClickPocketModePanel({ projectId }: { projectId: string }) {
  const analysis = usePocketStore((s) => s.analysis);
  const isAnalyzing = usePocketStore((s) => s.isAnalyzing);
  const selectedPocketId = usePocketStore((s) => s.selectedPocketId);
  const setSelectedPocketId = usePocketStore((s) => s.setSelectedPocketId);
  const togglePocket = usePocketStore((s) => s.togglePocket);
  const isPocketSolid = usePocketStore((s) => s.isPocketSolid);
  const setIsAnalyzing = usePocketStore((s) => s.setIsAnalyzing);
  const setAnalysis = usePocketStore((s) => s.setAnalysis);
  const setAnalyzeError = usePocketStore((s) => s.setAnalyzeError);

  // Transform pockets with local toggle state
  const pockets = (analysis?.pockets ?? []).map((p) => ({
    pocketId: p.pocketId,
    voxelCount: p.voxelCount,
    centroid: p.centroid,
    boundsLow: p.boundsLow,
    boundsHigh: p.boundsHigh,
    volumeEstimate: p.volumeEstimate,
    isToggledSolid: isPocketSolid(p.pocketId),
  }));

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/v1/projects/${projectId}/pockets/analyze`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }
      const data = await response.json();
      setAnalysis({
        gridMetadata: {
          resolution: data.grid_metadata.resolution,
          voxelSize: data.grid_metadata.voxel_size,
          boundsLow: data.grid_metadata.bounds_low,
          boundsHigh: data.grid_metadata.bounds_high,
          occupiedCount: data.grid_metadata.occupied_count,
          emptyCount: data.grid_metadata.empty_count,
          outsideCount: data.grid_metadata.outside_count,
          pocketCount: data.grid_metadata.pocket_count,
        },
        pockets: data.pockets.map(
          (p: {
            pocket_id: number;
            voxel_count: number;
            centroid: [number, number, number];
            bounds_low: [number, number, number];
            bounds_high: [number, number, number];
            volume_estimate: number;
            is_toggled_solid: boolean;
          }) => ({
            pocketId: p.pocket_id,
            voxelCount: p.voxel_count,
            centroid: p.centroid,
            boundsLow: p.bounds_low,
            boundsHigh: p.bounds_high,
            volumeEstimate: p.volume_estimate,
            isToggledSolid: p.is_toggled_solid,
          }),
        ),
        computedAt: data.computed_at,
      });
      toast.success(
        "Pocket analysis complete",
        `Found ${data.pockets.length} pockets`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setAnalyzeError(message);
      toast.error("Pocket analysis failed", message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="border-b border-gray-800">
      <ClickPocketMode
        pockets={pockets}
        selectedPocketId={selectedPocketId}
        isAnalyzing={isAnalyzing}
        onAnalyze={handleAnalyze}
        onTogglePocket={togglePocket}
        onSelectPocket={setSelectedPocketId}
      />
    </div>
  );
}

// Preview as Points controls - expands shape constraints to sample points for visualization
function PreviewAsPointsSection({ projectId }: { projectId: string }) {
  const previewAsPoints = useProjectStore((s) => s.previewAsPoints);
  const setPreviewAsPoints = useProjectStore((s) => s.setPreviewAsPoints);
  const samplesPerShape = useProjectStore((s) => s.samplesPerShape);
  const setSamplesPerShape = useProjectStore((s) => s.setSamplesPerShape);
  const setExpandedSamplePoints = useProjectStore(
    (s) => s.setExpandedSamplePoints,
  );
  const expandedSamplePoints = useProjectStore((s) => s.expandedSamplePoints);

  const constraints = useLabelStore((s) =>
    projectId ? s.getConstraints(projectId) : [],
  );

  // Count shape constraints (non-sample_point)
  const shapeConstraintCount = constraints.filter(
    (c) => c.type !== "sample_point",
  ).length;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expand shape constraints when toggle is enabled or samples per shape changes
  useEffect(() => {
    if (!previewAsPoints || shapeConstraintCount === 0) {
      setExpandedSamplePoints([]);
      return;
    }

    let cancelled = false;

    const doExpand = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const points = await expandToSamplePoints(projectId, samplesPerShape);
        if (!cancelled) {
          setExpandedSamplePoints(points);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Expansion failed");
          setExpandedSamplePoints([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    doExpand();

    return () => {
      cancelled = true;
    };
  }, [
    previewAsPoints,
    samplesPerShape,
    shapeConstraintCount,
    projectId,
    setExpandedSamplePoints,
  ]);

  // Nothing to show if no shape constraints
  if (shapeConstraintCount === 0) {
    return null;
  }

  return (
    <div className="p-4 border-b border-gray-800 space-y-3">
      <h3 className="text-sm font-medium">Shape Visualization</h3>

      {/* Preview toggle */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={previewAsPoints}
          onChange={(e) => setPreviewAsPoints(e.target.checked)}
          className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
        />
        <span className="text-gray-300">Preview as points</span>
        {isLoading && (
          <span className="ml-auto text-xs text-gray-500">Loading...</span>
        )}
      </label>

      {/* Samples per shape slider */}
      {previewAsPoints && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <label htmlFor="samples-per-shape" className="text-gray-400">
              Samples per shape
            </label>
            <input
              id="samples-per-shape"
              type="number"
              min={10}
              max={1000}
              step={10}
              value={samplesPerShape}
              onChange={(e) =>
                setSamplesPerShape(
                  Math.max(10, Math.min(1000, parseInt(e.target.value) || 100)),
                )
              }
              className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-right text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Status */}
          {expandedSamplePoints.length > 0 && (
            <p className="text-xs text-gray-500">
              {expandedSamplePoints.length.toLocaleString()} points from{" "}
              {shapeConstraintCount} shape
              {shapeConstraintCount !== 1 ? "s" : ""}
            </p>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

// Wrapper for AutoMode with store integration
function AutoModePanel({ projectId }: { projectId: string }) {
  const result = useAutoAnalysisStore((s) => s.result);
  const isAnalyzing = useAutoAnalysisStore((s) => s.isAnalyzing);
  const isApplying = useAutoAnalysisStore((s) => s.isApplying);
  const selectedIndices = useAutoAnalysisStore((s) => s.selectedIndices);
  const options = useAutoAnalysisStore((s) => s.options);
  const setResult = useAutoAnalysisStore((s) => s.setResult);
  const setIsAnalyzing = useAutoAnalysisStore((s) => s.setIsAnalyzing);
  const setIsApplying = useAutoAnalysisStore((s) => s.setIsApplying);
  const setAnalyzeError = useAutoAnalysisStore((s) => s.setAnalyzeError);
  const setApplyError = useAutoAnalysisStore((s) => s.setApplyError);
  const setOptions = useAutoAnalysisStore((s) => s.setOptions);
  const resetOptions = useAutoAnalysisStore((s) => s.resetOptions);
  const toggleConstraint = useAutoAnalysisStore((s) => s.toggleConstraint);
  const selectAll = useAutoAnalysisStore((s) => s.selectAll);
  const deselectAll = useAutoAnalysisStore((s) => s.deselectAll);

  const { refreshConstraints } = useConstraintSync(projectId);

  const handleAnalyze = async (
    algorithms?: import("../../stores/autoAnalysisStore").AlgorithmType[],
  ) => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const data = await runAutoAnalysis(projectId, {
        algorithms,
        recompute: true,
        analysisOptions: options,
      });
      setResult({
        analysisId: data.analysis_id,
        computedAt: data.computed_at,
        algorithmsRun: data.algorithms_run,
        summary: {
          totalConstraints: data.summary.total_constraints,
          solidConstraints: data.summary.solid_constraints,
          emptyConstraints: data.summary.empty_constraints,
          algorithmsContributing: data.summary.algorithms_contributing,
        },
        algorithmStats: Object.fromEntries(
          Object.entries(data.algorithm_stats).map(([k, v]) => [
            k,
            {
              constraintsGenerated: v.constraints_generated,
              coverageDescription: v.coverage_description,
            },
          ]),
        ),
        generatedConstraints: data.generated_constraints.map(
          (gc: {
            constraint: { type: string; sign: string; [key: string]: unknown };
            algorithm: string;
            confidence: number;
            description: string;
          }) => ({
            constraint: {
              ...gc.constraint,
              sign: gc.constraint.sign as "solid" | "empty",
            },
            algorithm:
              gc.algorithm as import("../../stores/autoAnalysisStore").AlgorithmType,
            confidence: gc.confidence,
            description: gc.description,
          }),
        ),
      });
      toast.success(
        "Auto-analysis complete",
        `Generated ${data.summary.total_constraints} constraints`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setAnalyzeError(message);
      toast.error("Auto-analysis failed", message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApply = async () => {
    if (selectedIndices.size === 0) return;

    setIsApplying(true);
    setApplyError(null);
    try {
      const indices = Array.from(selectedIndices);
      const data = await applyAutoConstraints(projectId, {
        constraintIndices: indices,
      });
      toast.success(
        "Constraints applied",
        `Added ${data.constraints_added} constraints`,
      );

      // Force refresh constraints from backend (clears loaded state and refetches)
      refreshConstraints();

      // Clear selection after successful apply
      deselectAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setApplyError(message);
      toast.error("Apply failed", message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="border-b border-gray-800">
      <AutoMode
        result={result}
        isAnalyzing={isAnalyzing}
        isApplying={isApplying}
        selectedIndices={selectedIndices}
        options={options}
        onAnalyze={handleAnalyze}
        onApply={handleApply}
        onToggleConstraint={toggleConstraint}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        onSetOptions={setOptions}
        onResetOptions={resetOptions}
      />
    </div>
  );
}

export function LabelPanel() {
  const [collapsed, setCollapsed] = useState(false);

  // Trigger canvas resize when panel collapses/expands
  useEffect(() => {
    // Small delay to let the DOM update first
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 50);
    return () => clearTimeout(timer);
  }, [collapsed]);

  const activeLabel = useProjectStore((s) => s.activeLabel);
  const setActiveLabel = useProjectStore((s) => s.setActiveLabel);
  const mode = useProjectStore((s) => s.mode);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

  const constraints = useLabelStore((s) =>
    currentProjectId ? s.getConstraints(currentProjectId) : [],
  );
  const removeConstraint = useLabelStore((s) => s.removeConstraint);

  // Backend sync for constraints
  const { deleteConstraint: syncDeleteConstraint } =
    useConstraintSync(currentProjectId);

  // Group constraints by type
  const groupedConstraints = useMemo(() => {
    const groups: Record<string, Constraint[]> = {};
    for (const c of constraints) {
      const type = c.type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(c);
    }
    return groups;
  }, [constraints]);

  // Collapsed state - minimal view with just label buttons
  if (collapsed) {
    return (
      <div className="w-14 h-full flex-shrink-0 flex flex-col bg-gray-900 border-l border-gray-800 overflow-hidden">
        {/* Expand button */}
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 m-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
          title="Expand panel"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>

        {/* Compact label buttons */}
        <div className="flex flex-col gap-1 p-2">
          {labelOptions.map(({ value, color }) => (
            <button
              key={value}
              onClick={() => setActiveLabel(value)}
              className={`w-10 h-10 rounded-lg border transition-colors ${
                activeLabel === value
                  ? `border-${value} ring-2 ring-${value}`
                  : "border-gray-700 hover:border-gray-600"
              }`}
              title={value.charAt(0).toUpperCase() + value.slice(1)}
            >
              <div className={`w-4 h-4 rounded mx-auto ${color}`} />
            </button>
          ))}
        </div>

        {/* Constraint count badge */}
        {constraints.length > 0 && (
          <div className="mx-auto mt-2 px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">
            {constraints.length}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-72 h-full flex-shrink-0 flex flex-col bg-gray-900 border-l border-gray-800 overflow-hidden">
      {/* Label selection */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Active Label</h3>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded"
            title="Collapse panel"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
        <ToggleGroup.Root
          type="single"
          value={activeLabel}
          onValueChange={(value) => value && setActiveLabel(value as LabelType)}
          className="flex flex-col gap-2"
        >
          {labelOptions.map(({ value, label, description, color }) => (
            <ToggleGroup.Item
              key={value}
              value={value}
              aria-label={label}
              className={`
                flex items-center gap-3 p-3 rounded-lg border transition-colors text-left
                ${
                  activeLabel === value
                    ? `border-${value} bg-${value}/10 ring-2 ring-${value}`
                    : "border-gray-700 hover:border-gray-600"
                }
              `}
            >
              <div className={`w-4 h-4 rounded ${color}`} />
              <div>
                <div className="font-medium text-sm">{label}</div>
                <div className="text-xs text-gray-500">{description}</div>
              </div>
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      {/* Scrollable content area - mode panels + constraints */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Mode-specific settings */}
        {mode === "ray_scribble" && <RayScribbleModePanel />}

        {mode === "click_pocket" && currentProjectId && (
          <ClickPocketModePanel projectId={currentProjectId} />
        )}

        {mode === "primitive" && (
          <div className="border-b border-gray-800">
            <PrimitiveMode />
          </div>
        )}

        {mode === "slice" && currentProjectId && (
          <SliceModePanel projectId={currentProjectId} />
        )}

        {mode === "brush" && <BrushModePanel />}

        {mode === "seed" && currentProjectId && (
          <SeedModePanel projectId={currentProjectId} />
        )}

        {mode === "import" && currentProjectId && (
          <MLImportModePanel projectId={currentProjectId} />
        )}

        {mode === "auto" && currentProjectId && (
          <AutoModePanel projectId={currentProjectId} />
        )}

        {/* Shape to points preview */}
        {currentProjectId && (
          <PreviewAsPointsSection projectId={currentProjectId} />
        )}

        {/* Constraints list */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">
              Constraints ({constraints.length})
            </h3>
            {currentProjectId && constraints.length > 0 && (
              <ClearConstraintsButton
                projectId={currentProjectId}
                constraintCount={constraints.length}
              />
            )}
          </div>

          {constraints.length === 0 ? (
            <p className="text-sm text-gray-500">
              No constraints yet. Use the tools to mark regions.
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedConstraints).map(([type, items]) => (
                <div key={type}>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                    {formatConstraintType(type)}
                  </h4>
                  <ul className="space-y-1">
                    {items.map((constraint) => (
                      <ConstraintItem
                        key={constraint.id}
                        constraint={constraint}
                        onDelete={() => {
                          if (currentProjectId) {
                            removeConstraint(currentProjectId, constraint.id);
                            syncDeleteConstraint(constraint.id);
                          }
                        }}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Export section */}
      {currentProjectId && constraints.length > 0 && (
        <ExportSection
          projectId={currentProjectId}
          constraintCount={constraints.length}
        />
      )}
    </div>
  );
}

interface ConstraintItemProps {
  constraint: Constraint;
  onDelete: () => void;
}

function ConstraintItem({ constraint, onDelete }: ConstraintItemProps) {
  const labelColor =
    constraint.sign === "solid"
      ? "bg-solid"
      : constraint.sign === "empty"
        ? "bg-empty"
        : "bg-surface";

  const name =
    constraint.name || `${constraint.type} ${constraint.id.slice(0, 4)}`;

  return (
    <li className="flex items-center gap-2 p-2 rounded hover:bg-gray-800 group">
      <div className={`w-3 h-3 rounded ${labelColor}`} />
      <span className="flex-1 text-sm truncate">{name}</span>
      <button
        onClick={onDelete}
        className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </li>
  );
}

interface ClearConstraintsButtonProps {
  projectId: string;
  constraintCount: number;
}

function ClearConstraintsButton({
  projectId,
  constraintCount,
}: ClearConstraintsButtonProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const clearLocalConstraints = useLabelStore((s) => s.clearConstraints);

  const clearMutation = useMutation({
    mutationFn: () => clearConstraintsApi(projectId),
    onSuccess: () => {
      clearLocalConstraints(projectId);
      queryClient.invalidateQueries({ queryKey: ["constraints", projectId] });
      toast.success("Constraints cleared", "All constraints have been removed");
      setOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Failed to clear constraints", error.message);
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
          title="Clear all constraints"
        >
          Clear All
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 p-6 bg-gray-900 rounded-lg border border-gray-700 shadow-xl">
          <Dialog.Title className="text-lg font-medium mb-2">
            Clear All Constraints?
          </Dialog.Title>
          <Dialog.Description className="text-sm text-gray-400 mb-4">
            This will permanently delete all {constraintCount} constraint
            {constraintCount !== 1 ? "s" : ""}. This action cannot be undone.
          </Dialog.Description>
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {clearMutation.isPending ? "Clearing..." : "Clear All"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function formatConstraintType(type: string): string {
  const labels: Record<string, string> = {
    box: "Boxes",
    sphere: "Spheres",
    halfspace: "Half-spaces",
    cylinder: "Cylinders",
    brush_stroke: "Brush Strokes",
    seed_propagation: "Propagated Seeds",
    ml_import: "ML Imports",
    ray_carve: "Ray Carves",
    pocket: "Pockets",
    slice_selection: "Slice Selections",
    sample_point: "Sample Points",
  };
  return labels[type] || type;
}

function ShowSamplesToggle() {
  const showSamples = useProjectStore((s) => s.showSamples);
  const setShowSamples = useProjectStore((s) => s.setShowSamples);

  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={showSamples}
        onChange={(e) => setShowSamples(e.target.checked)}
        className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
      />
      <span className="text-gray-300">Show samples in viewport</span>
    </label>
  );
}

interface ExportSectionProps {
  projectId: string;
  constraintCount: number;
}

type SamplingStrategy = "constant" | "density" | "inverse_square";

function ExportSection({ projectId, constraintCount }: ExportSectionProps) {
  const [sampleCount, setSampleCount] = useState<number | null>(null);
  const [strategy, setStrategy] = useState<SamplingStrategy>("inverse_square");
  const [samplesPerPrimitive, setSamplesPerPrimitive] = useState(100);
  const [samplesPerCubicMeter, setSamplesPerCubicMeter] = useState(10000);
  const [inverseSquareBaseSamples, setInverseSquareBaseSamples] = useState(100);
  const [inverseSquareFalloff, setInverseSquareFalloff] = useState(2.0);

  const generateMutation = useMutation({
    mutationFn: () =>
      generateSamples(projectId, {
        total_samples: 10000,
        strategy,
        samples_per_primitive: samplesPerPrimitive,
        samples_per_cubic_meter: samplesPerCubicMeter,
        inverse_square_base_samples: inverseSquareBaseSamples,
        inverse_square_falloff: inverseSquareFalloff,
        include_surface: true,
        far_direction: "bidirectional",
      }),
    onSuccess: (data) => {
      setSampleCount(data.sample_count);
      toast.success(
        "Samples generated",
        `${data.sample_count.toLocaleString()} training samples created`,
      );
    },
    onError: (error: Error) => {
      toast.error("Generation failed", error.message);
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => exportParquet(projectId),
    onSuccess: (blob) => {
      // Download the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectId}_samples.parquet`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Export complete", "Parquet file downloaded");
    },
    onError: (error: Error) => {
      toast.error("Export failed", error.message);
    },
  });

  return (
    <div className="p-4 border-t border-gray-800 space-y-3">
      {/* Sampling strategy selection */}
      <div className="space-y-2">
        <label className="text-sm text-gray-400">Sampling Strategy</label>
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as SamplingStrategy)}
          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white focus:border-blue-500 focus:outline-none text-sm"
        >
          <option value="constant">Constant (fixed per constraint)</option>
          <option value="density">Density (proportional to volume)</option>
          <option value="inverse_square">
            Inverse Square (more near surface)
          </option>
        </select>
      </div>

      {/* Strategy-specific parameters */}
      {strategy === "constant" && (
        <div className="flex items-center justify-between text-sm">
          <label htmlFor="samples-per-primitive" className="text-gray-400">
            Samples per primitive
          </label>
          <input
            id="samples-per-primitive"
            type="number"
            min={10}
            max={10000}
            step={10}
            value={samplesPerPrimitive}
            onChange={(e) =>
              setSamplesPerPrimitive(
                Math.max(10, Math.min(10000, parseInt(e.target.value) || 100)),
              )
            }
            className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-right text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      {strategy === "density" && (
        <div className="flex items-center justify-between text-sm">
          <label htmlFor="samples-per-m3" className="text-gray-400">
            Samples per m³
          </label>
          <input
            id="samples-per-m3"
            type="number"
            min={100}
            max={1000000}
            step={1000}
            value={samplesPerCubicMeter}
            onChange={(e) =>
              setSamplesPerCubicMeter(
                Math.max(
                  100,
                  Math.min(1000000, parseInt(e.target.value) || 10000),
                ),
              )
            }
            className="w-24 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-right text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      {strategy === "inverse_square" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <label htmlFor="inv-sq-base" className="text-gray-400">
              Base samples
            </label>
            <input
              id="inv-sq-base"
              type="number"
              min={10}
              max={10000}
              step={10}
              value={inverseSquareBaseSamples}
              onChange={(e) =>
                setInverseSquareBaseSamples(
                  Math.max(
                    10,
                    Math.min(10000, parseInt(e.target.value) || 100),
                  ),
                )
              }
              className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-right text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <label htmlFor="inv-sq-falloff" className="text-gray-400">
              Falloff exponent
            </label>
            <input
              id="inv-sq-falloff"
              type="number"
              min={0.5}
              max={4.0}
              step={0.1}
              value={inverseSquareFalloff}
              onChange={(e) =>
                setInverseSquareFalloff(
                  Math.max(
                    0.5,
                    Math.min(4.0, parseFloat(e.target.value) || 2.0),
                  ),
                )
              }
              className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-right text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Generate button */}
      <LoadingButton
        onClick={() => generateMutation.mutate()}
        loading={generateMutation.isPending}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Generate Samples
      </LoadingButton>

      {/* Status */}
      {sampleCount !== null && (
        <div className="text-center">
          <p className="text-sm text-green-400">
            {sampleCount.toLocaleString()} samples generated
          </p>
        </div>
      )}

      {/* Show samples toggle */}
      {sampleCount !== null && <ShowSamplesToggle />}

      {generateMutation.isError && (
        <p className="text-sm text-red-400 text-center">
          {(generateMutation.error as Error).message}
        </p>
      )}

      {/* Export button (shown after generation) */}
      {sampleCount !== null && (
        <LoadingButton
          onClick={() => exportMutation.mutate()}
          loading={exportMutation.isPending}
          className="w-full px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <DownloadIcon className="w-4 h-4" />
          Export Parquet
        </LoadingButton>
      )}

      <p className="text-xs text-gray-500 text-center">
        {constraintCount} constraint{constraintCount !== 1 ? "s" : ""} defined
      </p>
    </div>
  );
}
