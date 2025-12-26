// ABOUTME: Settings panel for ray-scribble annotation mode
// ABOUTME: Controls empty band width, spray effect settings, and displays scribbling instructions

import * as Slider from '@radix-ui/react-slider'
import * as Switch from '@radix-ui/react-switch'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { HelpTooltip } from '../ui/HelpTooltip'
import type { Handedness } from '../../stores/sprayEffectStore'

export interface LocalSpacingStatus {
  isReady: boolean
  isComputing: boolean
  progress: number
  globalMean: number | null
}

export interface RayScribbleModeProps {
  emptyBandWidth: number
  setEmptyBandWidth: (width: number) => void
  surfaceBandWidth: number
  setSurfaceBandWidth: (width: number) => void
  backBufferWidth: number
  setBackBufferWidth: (width: number) => void
  useAdaptiveBackBuffer: boolean
  setUseAdaptiveBackBuffer: (use: boolean) => void
  backBufferCoefficient: number
  setBackBufferCoefficient: (coeff: number) => void
  localSpacingStatus: LocalSpacingStatus
  isScribbling: boolean
  strokeCount: number
  onClearStrokes: () => void
  // Spray effect settings
  handedness: Handedness
  setHandedness: (hand: Handedness) => void
  particleDensity: number
  setParticleDensity: (density: number) => void
  qualityTier: string
}

export function RayScribbleMode({
  emptyBandWidth,
  setEmptyBandWidth,
  surfaceBandWidth,
  setSurfaceBandWidth,
  backBufferWidth,
  setBackBufferWidth,
  useAdaptiveBackBuffer,
  setUseAdaptiveBackBuffer,
  backBufferCoefficient,
  setBackBufferCoefficient,
  localSpacingStatus,
  isScribbling,
  strokeCount,
  onClearStrokes,
  handedness,
  setHandedness,
  particleDensity,
  setParticleDensity,
  qualityTier,
}: RayScribbleModeProps) {
  return (
    <div className="p-4 space-y-3 border-b border-gray-800">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">Ray Scribble</h4>
        <HelpTooltip content="Scribble to mark free space. Rays cast through stroke points find the surface, marking everything before the hit as empty." />
      </div>

      {/* Empty band width slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1">
            <label className="text-gray-400">Empty band</label>
            <HelpTooltip content="Distance before the hit point to mark as empty space" />
          </div>
          <span className="text-gray-300 tabular-nums">{emptyBandWidth.toFixed(2)}</span>
        </div>
        <Slider.Root
          className="relative flex items-center select-none touch-none w-full h-5"
          value={[emptyBandWidth]}
          onValueChange={([v]) => setEmptyBandWidth(v)}
          min={0.01}
          max={0.5}
          step={0.01}
        >
          <Slider.Track className="bg-gray-700 relative grow rounded-full h-[3px]">
            <Slider.Range className="absolute bg-orange-500 rounded-full h-full" />
          </Slider.Track>
          <Slider.Thumb
            className="block w-4 h-4 bg-white rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            aria-label="Empty band width"
          />
        </Slider.Root>
      </div>

      {/* Surface band width slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1">
            <label className="text-gray-400">Surface band</label>
            <HelpTooltip content="Width of the surface region around the hit point" />
          </div>
          <span className="text-gray-300 tabular-nums">{surfaceBandWidth.toFixed(3)}</span>
        </div>
        <Slider.Root
          className="relative flex items-center select-none touch-none w-full h-5"
          value={[surfaceBandWidth]}
          onValueChange={([v]) => setSurfaceBandWidth(v)}
          min={0.001}
          max={0.1}
          step={0.001}
        >
          <Slider.Track className="bg-gray-700 relative grow rounded-full h-[3px]">
            <Slider.Range className="absolute bg-blue-500 rounded-full h-full" />
          </Slider.Track>
          <Slider.Thumb
            className="block w-4 h-4 bg-white rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Surface band width"
          />
        </Slider.Root>
      </div>

      {/* Back buffer section */}
      <div className="space-y-2">
        {/* Adaptive toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <label className="text-sm text-gray-400">Adaptive back buffer</label>
            <HelpTooltip content="Use local point spacing to determine back buffer. Each point's 'thickness' is based on its neighbors' distances." />
          </div>
          <Switch.Root
            checked={useAdaptiveBackBuffer}
            onCheckedChange={setUseAdaptiveBackBuffer}
            className="w-9 h-5 bg-gray-700 rounded-full relative data-[state=checked]:bg-purple-600 transition-colors"
          >
            <Switch.Thumb className="block w-4 h-4 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
          </Switch.Root>
        </div>

        {/* Adaptive mode: coefficient slider + status */}
        {useAdaptiveBackBuffer && (
          <>
            {/* Coefficient slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1">
                  <label className="text-gray-400">Buffer Zone</label>
                  <HelpTooltip content="Size of impenetrable zone around surface. Higher = more protection from bleed-through. Measured in multiples of local point spacing." />
                </div>
                <span className="text-gray-300 tabular-nums">{backBufferCoefficient.toFixed(1)}×</span>
              </div>
              <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-5"
                value={[backBufferCoefficient]}
                onValueChange={([v]) => setBackBufferCoefficient(v)}
                min={0.5}
                max={200}
                step={1}
              >
                <Slider.Track className="bg-gray-700 relative grow rounded-full h-[3px]">
                  <Slider.Range className="absolute bg-purple-500 rounded-full h-full" />
                </Slider.Track>
                <Slider.Thumb
                  className="block w-4 h-4 bg-white rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  aria-label="Back buffer coefficient"
                />
              </Slider.Root>
            </div>

            {/* Local spacing status */}
            <div className="text-xs text-gray-500">
              {localSpacingStatus.isComputing ? (
                <span className="text-yellow-500">
                  Computing spacing... {Math.round(localSpacingStatus.progress * 100)}%
                </span>
              ) : localSpacingStatus.isReady && localSpacingStatus.globalMean != null ? (
                <span className="text-green-500">
                  Ready — buffer: {(localSpacingStatus.globalMean * backBufferCoefficient).toFixed(3)}m
                  <span className="text-gray-500 ml-1">
                    ({localSpacingStatus.globalMean.toFixed(4)} × {backBufferCoefficient})
                  </span>
                </span>
              ) : (
                <span>Waiting for point cloud...</span>
              )}
            </div>
          </>
        )}

        {/* Fixed mode: back buffer width slider */}
        {!useAdaptiveBackBuffer && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1">
                <label className="text-gray-400">Back buffer</label>
                <HelpTooltip content="Fixed distance past the surface to sample. 0 = no bleed-through (recommended for thin surfaces)" />
              </div>
              <span className="text-gray-300 tabular-nums">{backBufferWidth.toFixed(3)}</span>
            </div>
            <Slider.Root
              className="relative flex items-center select-none touch-none w-full h-5"
              value={[backBufferWidth]}
              onValueChange={([v]) => setBackBufferWidth(v)}
              min={0}
              max={0.05}
              step={0.001}
            >
              <Slider.Track className="bg-gray-700 relative grow rounded-full h-[3px]">
                <Slider.Range className="absolute bg-purple-500 rounded-full h-full" />
              </Slider.Track>
              <Slider.Thumb
                className="block w-4 h-4 bg-white rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                aria-label="Back buffer width"
              />
            </Slider.Root>
          </div>
        )}
      </div>

      {/* Spray hand settings */}
      <div className="space-y-2 pt-2 border-t border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <label className="text-sm text-gray-400">Spray hand</label>
            <HelpTooltip content="Which hand holds the spray can" />
          </div>
          <ToggleGroup.Root
            type="single"
            value={handedness}
            onValueChange={(value) => value && setHandedness(value as Handedness)}
            className="flex gap-0.5"
          >
            <ToggleGroup.Item
              value="left"
              className={`
                px-2 py-1 rounded-l border text-xs font-medium transition-colors
                ${handedness === 'left'
                  ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                  : 'border-gray-700 hover:border-gray-600 text-gray-400'
                }
              `}
            >
              Left
            </ToggleGroup.Item>
            <ToggleGroup.Item
              value="right"
              className={`
                px-2 py-1 rounded-r border border-l-0 text-xs font-medium transition-colors
                ${handedness === 'right'
                  ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                  : 'border-gray-700 hover:border-gray-600 text-gray-400'
                }
              `}
            >
              Right
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>

        {/* Particle density slider */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1">
              <label className="text-gray-400">Spray density</label>
              <HelpTooltip content="Density of spray particles. Higher values create thicker spray." />
            </div>
            <span className="text-gray-300 tabular-nums">{particleDensity.toFixed(1)}×</span>
          </div>
          <Slider.Root
            className="relative flex items-center select-none touch-none w-full h-5"
            value={[particleDensity]}
            onValueChange={([v]) => setParticleDensity(v)}
            min={0.1}
            max={20}
            step={0.1}
          >
            <Slider.Track className="bg-gray-700 relative grow rounded-full h-[3px]">
              <Slider.Range className="absolute bg-purple-500 rounded-full h-full" />
            </Slider.Track>
            <Slider.Thumb
              className="block w-4 h-4 bg-white rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              aria-label="Particle density"
            />
          </Slider.Root>
        </div>

        {/* Quality tier indicator */}
        <div className="text-xs text-gray-500">
          Spray quality: {qualityTier}
        </div>
      </div>

      {/* Status + Clear */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">Strokes:</span>
          <span className="text-gray-300">{strokeCount}</span>
          {isScribbling && (
            <span className="text-orange-400 text-xs">Drawing...</span>
          )}
        </div>
        {strokeCount > 0 && (
          <button
            onClick={onClearStrokes}
            className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700 hover:text-gray-300 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
