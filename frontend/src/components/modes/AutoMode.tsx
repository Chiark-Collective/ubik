// ABOUTME: Settings panel for auto-analysis mode
// ABOUTME: Shows generated constraints for review and approval

import { useState } from "react";
import { LoadingButton } from "../ui/Spinner";
import { HelpTooltip } from "../ui/HelpTooltip";
import type {
  AlgorithmType,
  AutoAnalysisOptions,
  AutoAnalysisResult,
  GeneratedConstraint,
} from "../../stores/autoAnalysisStore";
import { DEFAULT_OPTIONS } from "../../stores/autoAnalysisStore";

export interface AutoModeProps {
  result: AutoAnalysisResult | null;
  isAnalyzing: boolean;
  isApplying: boolean;
  selectedIndices: Set<number>;
  options: AutoAnalysisOptions;
  onAnalyze: (algorithms?: AlgorithmType[]) => void;
  onApply: () => void;
  onToggleConstraint: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSetOptions: (options: Partial<AutoAnalysisOptions>) => void;
  onResetOptions: () => void;
}

const ALL_ALGORITHMS: AlgorithmType[] = [
  "pocket",
  "flood_fill",
  "voxel_regions",
  "normal_idw",
];

const ALGORITHM_LABELS: Record<AlgorithmType, string> = {
  pocket: "Pocket Detection",
  flood_fill: "Sky-Reachable Exterior",
  voxel_regions: "Underground Regions",
  normal_idw: "IDW Normal Sampling",
};

const ALGORITHM_DESCRIPTIONS: Record<AlgorithmType, string> = {
  pocket: "Detect interior cavities (solid)",
  flood_fill: "Sky-reachable exterior regions (empty)",
  voxel_regions: "Underground regions not reachable from sky (solid)",
  normal_idw: "Training samples along normals weighted by distance",
};

const SIGN_COLORS: Record<string, string> = {
  solid: "text-solid",
  empty: "text-empty",
};

function ConstraintItem({
  constraint,
  isSelected,
  onToggle,
}: {
  constraint: GeneratedConstraint;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const signColor = SIGN_COLORS[constraint.constraint.sign] || "text-gray-400";
  const confidencePercent = Math.round(constraint.confidence * 100);

  return (
    <label className="flex items-start gap-2 p-2 rounded hover:bg-gray-800 cursor-pointer">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="mt-1 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className={`font-medium ${signColor}`}>
            {constraint.constraint.sign.toUpperCase()}
          </span>
          <span className="text-gray-500 text-xs">
            {constraint.constraint.type}
          </span>
          <span className="text-gray-600 text-xs ml-auto">
            {confidencePercent}%
          </span>
        </div>
        <p
          className="text-xs text-gray-400 truncate"
          title={constraint.description}
        >
          {constraint.description}
        </p>
      </div>
    </label>
  );
}

function OptionsSlider({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  onChange,
  unit = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  const isDefault = Math.abs(value - defaultValue) < step / 2;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className={isDefault ? "text-gray-500" : "text-blue-400"}>
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
    </div>
  );
}

export function AutoMode({
  result,
  isAnalyzing,
  isApplying,
  selectedIndices,
  options,
  onAnalyze,
  onApply,
  onToggleConstraint,
  onSelectAll,
  onDeselectAll,
  onSetOptions,
  onResetOptions,
}: AutoModeProps) {
  const [showOptions, setShowOptions] = useState(false);
  // Track which algorithms are enabled for analysis
  const [enabledAlgorithms, setEnabledAlgorithms] = useState<Set<AlgorithmType>>(
    new Set(ALL_ALGORITHMS)
  );
  // Track which algorithms are expanded (showing their constraint items)
  const [expandedAlgorithms, setExpandedAlgorithms] = useState<Set<string>>(
    new Set()
  );
  const selectedCount = selectedIndices.size;
  const totalCount = result?.generatedConstraints.length || 0;

  // Toggle algorithm enabled state
  const toggleAlgorithmEnabled = (algo: AlgorithmType) => {
    setEnabledAlgorithms((prev) => {
      const next = new Set(prev);
      if (next.has(algo)) {
        next.delete(algo);
      } else {
        next.add(algo);
      }
      return next;
    });
  };

  // Run analysis with only enabled algorithms
  const handleAnalyze = () => {
    const algos = Array.from(enabledAlgorithms);
    // Always pass the explicit list since defaults may differ from ALL_ALGORITHMS
    onAnalyze(algos);
  };

  // Group constraints by algorithm for display
  const constraintsByAlgorithm: Record<
    string,
    { constraint: GeneratedConstraint; index: number }[]
  > = {};
  if (result) {
    result.generatedConstraints.forEach((c, i) => {
      if (!constraintsByAlgorithm[c.algorithm]) {
        constraintsByAlgorithm[c.algorithm] = [];
      }
      constraintsByAlgorithm[c.algorithm].push({ constraint: c, index: i });
    });
  }

  // Toggle algorithm expansion
  const toggleAlgorithmExpanded = (algo: string) => {
    setExpandedAlgorithms((prev) => {
      const next = new Set(prev);
      if (next.has(algo)) {
        next.delete(algo);
      } else {
        next.add(algo);
      }
      return next;
    });
  };

  // Select/deselect all constraints for a specific algorithm
  const selectAlgorithm = (algo: string) => {
    const items = constraintsByAlgorithm[algo] || [];
    items.forEach(({ index }) => {
      if (!selectedIndices.has(index)) {
        onToggleConstraint(index);
      }
    });
  };

  const deselectAlgorithm = (algo: string) => {
    const items = constraintsByAlgorithm[algo] || [];
    items.forEach(({ index }) => {
      if (selectedIndices.has(index)) {
        onToggleConstraint(index);
      }
    });
  };

  // Count selected per algorithm
  const getAlgorithmSelectedCount = (algo: string) => {
    const items = constraintsByAlgorithm[algo] || [];
    return items.filter(({ index }) => selectedIndices.has(index)).length;
  };

  return (
    <div className="p-4 space-y-3 border-b border-gray-800">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">Auto Analysis</h4>
        <HelpTooltip content="Automatically detect solid/empty regions. Review generated constraints and apply those you want to keep." />
      </div>

      {/* Advanced Options Toggle */}
      <button
        onClick={() => setShowOptions(!showOptions)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300"
      >
        <span
          className={`transform transition-transform ${showOptions ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        Advanced Options
      </button>

      {/* Options Panel */}
      {showOptions && (
        <div className="space-y-3 p-3 bg-gray-800 rounded text-xs">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400 font-medium">Hyperparameters</span>
            <button
              onClick={onResetOptions}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              Reset to defaults
            </button>
          </div>

          {/* Voxel Grid */}
          <div className="space-y-2 pb-2 border-b border-gray-700">
            <div className="text-gray-500 text-xs">Voxel Grid</div>
            <OptionsSlider
              label="Min Gap Size"
              value={options.min_gap_size}
              min={0.01}
              max={1.0}
              step={0.01}
              defaultValue={DEFAULT_OPTIONS.min_gap_size}
              onChange={(v) => onSetOptions({ min_gap_size: v })}
              unit="m"
            />
            <OptionsSlider
              label="Max Grid Dim"
              value={options.max_grid_dim}
              min={50}
              max={500}
              step={10}
              defaultValue={DEFAULT_OPTIONS.max_grid_dim}
              onChange={(v) => onSetOptions({ max_grid_dim: v })}
            />
          </div>

          {/* Ray Propagation */}
          <div className="space-y-2 pb-2 border-b border-gray-700">
            <div className="text-gray-500 text-xs">Ray Propagation</div>
            <OptionsSlider
              label="Cone Angle"
              value={options.cone_angle}
              min={0}
              max={45}
              step={1}
              defaultValue={DEFAULT_OPTIONS.cone_angle}
              onChange={(v) => onSetOptions({ cone_angle: v })}
              unit="°"
            />
          </div>

          {/* Filtering */}
          <div className="space-y-2 pb-2 border-b border-gray-700">
            <div className="text-gray-500 text-xs">Filtering</div>
            <OptionsSlider
              label="Max Boxes"
              value={options.max_boxes}
              min={5}
              max={100}
              step={5}
              defaultValue={DEFAULT_OPTIONS.max_boxes}
              onChange={(v) => onSetOptions({ max_boxes: v })}
            />
            <OptionsSlider
              label="Overlap Threshold"
              value={options.overlap_threshold}
              min={0.1}
              max={0.9}
              step={0.05}
              defaultValue={DEFAULT_OPTIONS.overlap_threshold}
              onChange={(v) => onSetOptions({ overlap_threshold: v })}
            />
          </div>

          {/* IDW Normal Sampling */}
          <div className="space-y-2">
            <div className="text-gray-500 text-xs">IDW Normal Sampling</div>
            <OptionsSlider
              label="Sample Count"
              value={options.idw_sample_count}
              min={100}
              max={10000}
              step={100}
              defaultValue={DEFAULT_OPTIONS.idw_sample_count}
              onChange={(v) => onSetOptions({ idw_sample_count: v })}
            />
            <OptionsSlider
              label="Max Distance"
              value={options.idw_max_distance}
              min={0.05}
              max={2.0}
              step={0.05}
              defaultValue={DEFAULT_OPTIONS.idw_max_distance}
              onChange={(v) => onSetOptions({ idw_max_distance: v })}
              unit="m"
            />
            <OptionsSlider
              label="IDW Power"
              value={options.idw_power}
              min={0.5}
              max={4.0}
              step={0.1}
              defaultValue={DEFAULT_OPTIONS.idw_power}
              onChange={(v) => onSetOptions({ idw_power: v })}
            />
          </div>
        </div>
      )}

      {/* Hull Filtering */}
      <div className="space-y-2 border-t border-gray-700 pt-3">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={options.hull_filter_enabled}
            onChange={(e) => onSetOptions({ hull_filter_enabled: e.target.checked })}
            className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-gray-300">Filter by X-Y Hull</span>
          <span className="text-gray-500 text-xs ml-auto">
            Remove constraints outside footprint
          </span>
        </label>
      </div>

      {/* Algorithm selection */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400 font-medium">Algorithms to run:</div>
        <div className="grid grid-cols-1 gap-1">
          {ALL_ALGORITHMS.map((algo) => (
            <label
              key={algo}
              className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-800 rounded px-2 py-1"
            >
              <input
                type="checkbox"
                checked={enabledAlgorithms.has(algo)}
                onChange={() => toggleAlgorithmEnabled(algo)}
                className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-gray-300">{ALGORITHM_LABELS[algo]}</span>
              <span className="text-gray-600 text-xs ml-auto">
                {ALGORITHM_DESCRIPTIONS[algo]}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Analyze button */}
      <LoadingButton
        onClick={handleAnalyze}
        loading={isAnalyzing}
        disabled={enabledAlgorithms.size === 0}
        className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {result ? "Re-analyze" : "Run Analysis"}
      </LoadingButton>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="flex justify-between text-xs text-gray-500 border-b border-gray-700 pb-2">
            <span>{result.summary.totalConstraints} constraints generated</span>
            <span>
              <span className="text-solid">
                {result.summary.solidConstraints} solid
              </span>
              {" / "}
              <span className="text-empty">
                {result.summary.emptyConstraints} empty
              </span>
            </span>
          </div>

          {/* Selection controls */}
          <div className="flex gap-2">
            <button
              onClick={onSelectAll}
              className="flex-1 px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
            >
              Select All
            </button>
            <button
              onClick={onDeselectAll}
              className="flex-1 px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
            >
              Deselect All
            </button>
          </div>

          {/* Constraint list grouped by algorithm */}
          <div className="max-h-80 overflow-y-auto space-y-2">
            {Object.entries(constraintsByAlgorithm).map(([algo, items]) => {
              const isExpanded = expandedAlgorithms.has(algo);
              const selectedInAlgo = getAlgorithmSelectedCount(algo);
              const allSelected = selectedInAlgo === items.length;
              const noneSelected = selectedInAlgo === 0;

              return (
                <div key={algo} className="border border-gray-700 rounded">
                  {/* Algorithm header with toggle and selection controls */}
                  <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-800 rounded-t">
                    <button
                      onClick={() => toggleAlgorithmExpanded(algo)}
                      className="text-gray-400 hover:text-gray-200 p-0.5"
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      <span
                        className={`inline-block transform transition-transform text-xs ${isExpanded ? "rotate-90" : ""}`}
                      >
                        ▶
                      </span>
                    </button>
                    <span className="text-xs font-medium text-gray-400 flex-1">
                      {ALGORITHM_LABELS[algo as AlgorithmType] || algo}
                      <span className="text-gray-600 ml-1">
                        ({selectedInAlgo}/{items.length})
                      </span>
                    </span>
                    {/* Per-algorithm select/deselect buttons */}
                    <button
                      onClick={() => selectAlgorithm(algo)}
                      disabled={allSelected}
                      className="text-xs px-1.5 py-0.5 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Select all from this algorithm"
                    >
                      +
                    </button>
                    <button
                      onClick={() => deselectAlgorithm(algo)}
                      disabled={noneSelected}
                      className="text-xs px-1.5 py-0.5 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Deselect all from this algorithm"
                    >
                      −
                    </button>
                  </div>
                  {/* Collapsible constraint items */}
                  {isExpanded && (
                    <div className="border-t border-gray-700 max-h-48 overflow-y-auto">
                      {items.map(({ constraint, index }) => (
                        <ConstraintItem
                          key={index}
                          constraint={constraint}
                          isSelected={selectedIndices.has(index)}
                          onToggle={() => onToggleConstraint(index)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Apply button */}
          <LoadingButton
            onClick={onApply}
            loading={isApplying}
            disabled={selectedCount === 0}
            className="w-full px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            Apply {selectedCount} of {totalCount} Constraints
          </LoadingButton>
        </div>
      )}

    </div>
  );
}
