// ABOUTME: Right sidebar panel for label selection and constraint list
// ABOUTME: Shows active label type and list of created constraints

import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { TrashIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons'

import { useProjectStore, type LabelType } from '../../stores/projectStore'
import { useLabelStore, type Constraint } from '../../stores/labelStore'
import { useSliceStore } from '../../stores/sliceStore'
import { useBrushStore } from '../../stores/brushStore'
import { useSeedStore } from '../../stores/seedStore'
import { useRayScribbleStore } from '../../stores/rayScribbleStore'
import { useSprayEffectStore } from '../../stores/sprayEffectStore'
import { useLocalSpacing } from '../../hooks/useLocalSpacing'
import { usePocketStore } from '../../stores/pocketStore'
import { useConstraintSync } from '../../hooks/useConstraintSync'
import { toast } from '../../stores/toastStore'
import { LoadingButton } from './Spinner'
import { PrimitiveMode } from '../modes/PrimitiveMode'
import { SliceMode } from '../modes/SliceMode'
import { BrushMode } from '../modes/BrushMode'
import { SeedMode } from '../modes/SeedMode'
import { MLImportMode } from '../modes/MLImportMode'
import { RayScribbleMode } from '../modes/RayScribbleMode'
import { ClickPocketMode } from '../modes/ClickPocketMode'
import { generateSamples, exportParquet } from '../../services/api'

const labelOptions: { value: LabelType; label: string; description: string; color: string }[] = [
  {
    value: 'solid',
    label: 'Solid',
    description: 'Inside the surface (material)',
    color: 'bg-solid',
  },
  {
    value: 'empty',
    label: 'Empty',
    description: 'Outside the surface (air)',
    color: 'bg-empty',
  },
  {
    value: 'surface',
    label: 'Surface',
    description: 'On the boundary (distance = 0)',
    color: 'bg-surface',
  },
]

// Wrapper for SliceMode with store integration
function SliceModePanel({ projectId }: { projectId: string }) {
  const activeLabel = useProjectStore((s) => s.activeLabel)
  const slicePlane = useProjectStore((s) => s.slicePlane)
  const slicePosition = useProjectStore((s) => s.slicePosition)

  const tool = useSliceStore((s) => s.tool)
  const setTool = useSliceStore((s) => s.setTool)
  const brushSize = useSliceStore((s) => s.brushSize)
  const setBrushSize = useSliceStore((s) => s.setBrushSize)
  const selectedPointIndices = useSliceStore((s) => s.selectedPointIndices)
  const clearSelectedPoints = useSliceStore((s) => s.clearSelectedPoints)

  const addConstraint = useLabelStore((s) => s.addConstraint)

  const handleCreateConstraint = () => {
    if (selectedPointIndices.size === 0) return

    const constraint: import('../../stores/labelStore').SliceSelectionConstraint = {
      id: crypto.randomUUID(),
      type: 'slice_selection',
      sign: activeLabel,
      weight: 1.0,
      createdAt: Date.now(),
      pointIndices: Array.from(selectedPointIndices),
      slicePlane,
      slicePosition,
    }

    addConstraint(projectId, constraint)
    clearSelectedPoints()
    toast.success('Constraint created', `${selectedPointIndices.size} points marked as ${activeLabel}`)
  }

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
  )
}

// Wrapper for BrushMode with store integration
function BrushModePanel() {
  const depthAware = useBrushStore((s) => s.depthAware)
  const setDepthAware = useBrushStore((s) => s.setDepthAware)

  return (
    <div className="border-b border-gray-800">
      <BrushMode depthAware={depthAware} setDepthAware={setDepthAware} />
    </div>
  )
}

// Wrapper for SeedMode with store integration
function SeedModePanel({ projectId }: { projectId: string }) {
  const seeds = useSeedStore((s) => s.seeds)
  const addSeed = useSeedStore((s) => s.addSeed)
  const removeSeed = useSeedStore((s) => s.removeSeed)
  const clearSeeds = useSeedStore((s) => s.clearSeeds)

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
  )
}

// Wrapper for MLImportMode
function MLImportModePanel({ projectId }: { projectId: string }) {
  return (
    <div className="border-b border-gray-800">
      <MLImportMode projectId={projectId} />
    </div>
  )
}

// Wrapper for RayScribbleMode with store integration
function RayScribbleModePanel() {
  const pointCloudPositions = useProjectStore((s) => s.pointCloudPositions)

  const emptyBandWidth = useRayScribbleStore((s) => s.emptyBandWidth)
  const setEmptyBandWidth = useRayScribbleStore((s) => s.setEmptyBandWidth)
  const surfaceBandWidth = useRayScribbleStore((s) => s.surfaceBandWidth)
  const setSurfaceBandWidth = useRayScribbleStore((s) => s.setSurfaceBandWidth)
  const backBufferWidth = useRayScribbleStore((s) => s.backBufferWidth)
  const setBackBufferWidth = useRayScribbleStore((s) => s.setBackBufferWidth)
  const useAdaptiveBackBuffer = useRayScribbleStore((s) => s.useAdaptiveBackBuffer)
  const setUseAdaptiveBackBuffer = useRayScribbleStore((s) => s.setUseAdaptiveBackBuffer)
  const backBufferCoefficient = useRayScribbleStore((s) => s.backBufferCoefficient)
  const setBackBufferCoefficient = useRayScribbleStore((s) => s.setBackBufferCoefficient)
  const isScribbling = useRayScribbleStore((s) => s.isScribbling)
  const strokes = useRayScribbleStore((s) => s.strokes)
  const clearStrokes = useRayScribbleStore((s) => s.clearStrokes)

  // Spray effect settings
  const handedness = useSprayEffectStore((s) => s.handedness)
  const setHandedness = useSprayEffectStore((s) => s.setHandedness)

  // Local spacing computation for adaptive back buffer
  const { isReady, isComputing, progress, globalMean } = useLocalSpacing(pointCloudPositions)

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
      qualityTier="auto-detected"
    />
  )
}

// Wrapper for ClickPocketMode with store integration
function ClickPocketModePanel({ projectId }: { projectId: string }) {
  const analysis = usePocketStore((s) => s.analysis)
  const isAnalyzing = usePocketStore((s) => s.isAnalyzing)
  const selectedPocketId = usePocketStore((s) => s.selectedPocketId)
  const setSelectedPocketId = usePocketStore((s) => s.setSelectedPocketId)
  const togglePocket = usePocketStore((s) => s.togglePocket)
  const isPocketSolid = usePocketStore((s) => s.isPocketSolid)
  const setIsAnalyzing = usePocketStore((s) => s.setIsAnalyzing)
  const setAnalysis = usePocketStore((s) => s.setAnalysis)
  const setAnalyzeError = usePocketStore((s) => s.setAnalyzeError)

  // Transform pockets with local toggle state
  const pockets = (analysis?.pockets ?? []).map((p) => ({
    pocketId: p.pocketId,
    voxelCount: p.voxelCount,
    centroid: p.centroid,
    boundsLow: p.boundsLow,
    boundsHigh: p.boundsHigh,
    volumeEstimate: p.volumeEstimate,
    isToggledSolid: isPocketSolid(p.pocketId),
  }))

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    setAnalyzeError(null)
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/v1/projects/${projectId}/pockets/analyze`,
        { method: 'POST' }
      )
      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`)
      }
      const data = await response.json()
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
        pockets: data.pockets.map((p: {
          pocket_id: number
          voxel_count: number
          centroid: [number, number, number]
          bounds_low: [number, number, number]
          bounds_high: [number, number, number]
          volume_estimate: number
          is_toggled_solid: boolean
        }) => ({
          pocketId: p.pocket_id,
          voxelCount: p.voxel_count,
          centroid: p.centroid,
          boundsLow: p.bounds_low,
          boundsHigh: p.bounds_high,
          volumeEstimate: p.volume_estimate,
          isToggledSolid: p.is_toggled_solid,
        })),
        computedAt: data.computed_at,
      })
      toast.success('Pocket analysis complete', `Found ${data.pockets.length} pockets`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setAnalyzeError(message)
      toast.error('Pocket analysis failed', message)
    } finally {
      setIsAnalyzing(false)
    }
  }

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
  )
}

export function LabelPanel() {
  const [collapsed, setCollapsed] = useState(false)

  // Trigger canvas resize when panel collapses/expands
  useEffect(() => {
    // Small delay to let the DOM update first
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => clearTimeout(timer)
  }, [collapsed])

  const activeLabel = useProjectStore((s) => s.activeLabel)
  const setActiveLabel = useProjectStore((s) => s.setActiveLabel)
  const mode = useProjectStore((s) => s.mode)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)

  const constraints = useLabelStore((s) =>
    currentProjectId ? s.getConstraints(currentProjectId) : []
  )
  const removeConstraint = useLabelStore((s) => s.removeConstraint)

  // Backend sync for constraints
  const { deleteConstraint: syncDeleteConstraint } = useConstraintSync(currentProjectId)

  // Group constraints by type
  const groupedConstraints = useMemo(() => {
    const groups: Record<string, Constraint[]> = {}
    for (const c of constraints) {
      const type = c.type
      if (!groups[type]) groups[type] = []
      groups[type].push(c)
    }
    return groups
  }, [constraints])

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
                  : 'border-gray-700 hover:border-gray-600'
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
    )
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
                ${activeLabel === value
                  ? `border-${value} bg-${value}/10 ring-2 ring-${value}`
                  : 'border-gray-700 hover:border-gray-600'
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
        {mode === 'ray_scribble' && (
          <RayScribbleModePanel />
        )}

        {mode === 'click_pocket' && currentProjectId && (
          <ClickPocketModePanel projectId={currentProjectId} />
        )}

        {mode === 'primitive' && (
          <div className="border-b border-gray-800">
            <PrimitiveMode />
          </div>
        )}

        {mode === 'slice' && currentProjectId && (
          <SliceModePanel projectId={currentProjectId} />
        )}

        {mode === 'brush' && (
          <BrushModePanel />
        )}

        {mode === 'seed' && currentProjectId && (
          <SeedModePanel projectId={currentProjectId} />
        )}

        {mode === 'import' && currentProjectId && (
          <MLImportModePanel projectId={currentProjectId} />
        )}

        {/* Constraints list */}
        <div className="p-4">
          <h3 className="text-sm font-medium mb-3">
            Constraints ({constraints.length})
          </h3>

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
                            removeConstraint(currentProjectId, constraint.id)
                            syncDeleteConstraint(constraint.id)
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
        <ExportSection projectId={currentProjectId} constraintCount={constraints.length} />
      )}
    </div>
  )
}

interface ConstraintItemProps {
  constraint: Constraint
  onDelete: () => void
}

function ConstraintItem({ constraint, onDelete }: ConstraintItemProps) {
  const labelColor =
    constraint.sign === 'solid'
      ? 'bg-solid'
      : constraint.sign === 'empty'
      ? 'bg-empty'
      : 'bg-surface'

  const name = constraint.name || `${constraint.type} ${constraint.id.slice(0, 4)}`

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
  )
}

function formatConstraintType(type: string): string {
  const labels: Record<string, string> = {
    box: 'Boxes',
    sphere: 'Spheres',
    halfspace: 'Half-spaces',
    cylinder: 'Cylinders',
    brush_stroke: 'Brush Strokes',
    seed_propagation: 'Propagated Seeds',
    ml_import: 'ML Imports',
    ray_carve: 'Ray Carves',
    pocket: 'Pockets',
    slice_selection: 'Slice Selections',
  }
  return labels[type] || type
}

function ShowSamplesToggle() {
  const showSamples = useProjectStore((s) => s.showSamples)
  const setShowSamples = useProjectStore((s) => s.setShowSamples)

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
  )
}

interface ExportSectionProps {
  projectId: string
  constraintCount: number
}

function ExportSection({ projectId, constraintCount }: ExportSectionProps) {
  const [sampleCount, setSampleCount] = useState<number | null>(null)
  const [samplesPerPrimitive, setSamplesPerPrimitive] = useState(100)

  const generateMutation = useMutation({
    mutationFn: () =>
      generateSamples(projectId, {
        total_samples: 10000,
        samples_per_primitive: samplesPerPrimitive,
        include_surface: true,
        far_direction: 'bidirectional',
      }),
    onSuccess: (data) => {
      setSampleCount(data.sample_count)
      toast.success(
        'Samples generated',
        `${data.sample_count.toLocaleString()} training samples created`
      )
    },
    onError: (error: Error) => {
      toast.error('Generation failed', error.message)
    },
  })

  const exportMutation = useMutation({
    mutationFn: () => exportParquet(projectId),
    onSuccess: (blob) => {
      // Download the file
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectId}_samples.parquet`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Export complete', 'Parquet file downloaded')
    },
    onError: (error: Error) => {
      toast.error('Export failed', error.message)
    },
  })

  return (
    <div className="p-4 border-t border-gray-800 space-y-3">
      {/* Samples per primitive setting */}
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
          onChange={(e) => setSamplesPerPrimitive(Math.max(10, Math.min(10000, parseInt(e.target.value) || 100)))}
          className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-right text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

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
      {sampleCount !== null && (
        <ShowSamplesToggle />
      )}

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
        {constraintCount} constraint{constraintCount !== 1 ? 's' : ''} defined
      </p>
    </div>
  )
}
