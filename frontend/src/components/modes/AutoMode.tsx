// ABOUTME: Settings panel for auto-analysis mode
// ABOUTME: Shows generated constraints for review and approval

import { LoadingButton } from '../ui/Spinner'
import { HelpTooltip } from '../ui/HelpTooltip'
import type { AlgorithmType, AutoAnalysisResult, GeneratedConstraint } from '../../stores/autoAnalysisStore'

export interface AutoModeProps {
  result: AutoAnalysisResult | null
  isAnalyzing: boolean
  isApplying: boolean
  selectedIndices: Set<number>
  onAnalyze: () => void
  onApply: () => void
  onToggleConstraint: (index: number) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

const ALGORITHM_LABELS: Record<AlgorithmType, string> = {
  pocket: 'Pocket Detection',
  normal_offset: 'Normal Offset',
  flood_fill: 'Sky-Reachable Exterior',
  voxel_regions: 'Underground Regions',
}

const SIGN_COLORS: Record<string, string> = {
  solid: 'text-solid',
  empty: 'text-empty',
}

function ConstraintItem({
  constraint,
  isSelected,
  onToggle,
}: {
  constraint: GeneratedConstraint
  isSelected: boolean
  onToggle: () => void
}) {
  const signColor = SIGN_COLORS[constraint.constraint.sign] || 'text-gray-400'
  const confidencePercent = Math.round(constraint.confidence * 100)

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
        <p className="text-xs text-gray-400 truncate" title={constraint.description}>
          {constraint.description}
        </p>
      </div>
    </label>
  )
}

export function AutoMode({
  result,
  isAnalyzing,
  isApplying,
  selectedIndices,
  onAnalyze,
  onApply,
  onToggleConstraint,
  onSelectAll,
  onDeselectAll,
}: AutoModeProps) {
  const selectedCount = selectedIndices.size
  const totalCount = result?.generatedConstraints.length || 0

  // Group constraints by algorithm for display
  const constraintsByAlgorithm: Record<string, { constraint: GeneratedConstraint; index: number }[]> = {}
  if (result) {
    result.generatedConstraints.forEach((c, i) => {
      if (!constraintsByAlgorithm[c.algorithm]) {
        constraintsByAlgorithm[c.algorithm] = []
      }
      constraintsByAlgorithm[c.algorithm].push({ constraint: c, index: i })
    })
  }

  return (
    <div className="p-4 space-y-3 border-b border-gray-800">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">Auto Analysis</h4>
        <HelpTooltip content="Automatically detect solid/empty regions. Review generated constraints and apply those you want to keep." />
      </div>

      {/* Analyze button */}
      <LoadingButton
        onClick={onAnalyze}
        loading={isAnalyzing}
        className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {result ? 'Re-analyze' : 'Run Analysis'}
      </LoadingButton>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="flex justify-between text-xs text-gray-500 border-b border-gray-700 pb-2">
            <span>
              {result.summary.totalConstraints} constraints generated
            </span>
            <span>
              <span className="text-solid">{result.summary.solidConstraints} solid</span>
              {' / '}
              <span className="text-empty">{result.summary.emptyConstraints} empty</span>
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
          <div className="max-h-64 overflow-y-auto space-y-2">
            {Object.entries(constraintsByAlgorithm).map(([algo, items]) => (
              <div key={algo}>
                <div className="text-xs font-medium text-gray-500 px-2 py-1 bg-gray-800 rounded-t">
                  {ALGORITHM_LABELS[algo as AlgorithmType] || algo} ({items.length})
                </div>
                <div className="border border-gray-700 border-t-0 rounded-b">
                  {items.map(({ constraint, index }) => (
                    <ConstraintItem
                      key={index}
                      constraint={constraint}
                      isSelected={selectedIndices.has(index)}
                      onToggle={() => onToggleConstraint(index)}
                    />
                  ))}
                </div>
              </div>
            ))}
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

      {/* Instructions */}
      {!result && !isAnalyzing && (
        <div className="text-xs text-gray-500 space-y-2 pt-2">
          <p>Run analysis to automatically detect solid/empty regions based on:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Pockets:</strong> Interior cavities (solid)</li>
            <li><strong>Normal Offset:</strong> Surface-relative samples (solid/empty pairs)</li>
            <li><strong>Flood Fill:</strong> Sky-reachable exterior including trenches (empty)</li>
            <li><strong>Underground:</strong> Regions below ground, not sky-reachable (solid)</li>
          </ul>
        </div>
      )}
    </div>
  )
}
