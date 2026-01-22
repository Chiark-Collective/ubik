// ABOUTME: 3D brush painting mode panel for direct point selection
// ABOUTME: Controls for brush size and painting settings

import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";

import { useProjectStore } from "../../stores/projectStore";

interface BrushModeProps {
  depthAware: boolean;
  setDepthAware: (value: boolean) => void;
}

export function BrushMode({ depthAware, setDepthAware }: BrushModeProps) {
  const activeLabel = useProjectStore((s) => s.activeLabel);
  const brushRadius = useProjectStore((s) => s.brushRadius);
  const setBrushRadius = useProjectStore((s) => s.setBrushRadius);
  const selectedPointIndices = useProjectStore((s) => s.selectedPointIndices);

  const labelColor =
    activeLabel === "solid"
      ? "text-solid"
      : activeLabel === "empty"
        ? "text-empty"
        : "text-surface";

  return (
    <div className="p-4 space-y-4">
      {/* Instructions */}
      <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-gray-400">
        <p className="mb-2">
          <strong className="text-white">Click + drag</strong> in 3D space to
          paint points
        </p>
        <p className="mb-2">
          <strong className="text-white">Scroll</strong> to adjust brush size
        </p>
        <p>
          Label:{" "}
          <span className={`font-medium ${labelColor}`}>
            {activeLabel === "solid"
              ? "Solid (inside)"
              : activeLabel === "empty"
                ? "Empty (outside)"
                : "Surface"}
          </span>
        </p>
      </div>

      {/* Selection info */}
      <div className="p-3 bg-gray-800/30 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Selected points</span>
          <span className="text-sm font-medium text-white">
            {selectedPointIndices.size.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Brush size slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-gray-500 uppercase">
            Brush Radius
          </h4>
          <span className="text-sm text-gray-400">
            {brushRadius.toFixed(2)}
          </span>
        </div>
        <Slider.Root
          value={[brushRadius]}
          onValueChange={([value]) => setBrushRadius(value)}
          min={0.01}
          max={2}
          step={0.01}
          className="relative flex items-center h-5"
        >
          <Slider.Track className="relative h-1 flex-1 bg-gray-700 rounded">
            <Slider.Range className="absolute h-full bg-blue-500 rounded" />
          </Slider.Track>
          <Slider.Thumb className="block w-4 h-4 bg-white rounded-full shadow focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </Slider.Root>
      </div>

      {/* Depth-aware toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Depth Aware</h4>
          <p className="text-xs text-gray-500">Only paint visible points</p>
        </div>
        <Switch.Root
          checked={depthAware}
          onCheckedChange={setDepthAware}
          className={`
            relative w-10 h-6 rounded-full transition-colors
            ${depthAware ? "bg-blue-600" : "bg-gray-700"}
          `}
        >
          <Switch.Thumb
            className={`
              block w-4 h-4 rounded-full bg-white transition-transform
              ${depthAware ? "translate-x-5" : "translate-x-1"}
            `}
          />
        </Switch.Root>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={() => useProjectStore.getState().clearSelection()}
          disabled={selectedPointIndices.size === 0}
          className="w-full px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          Clear Selection
        </button>
      </div>

      {/* Keyboard shortcuts reference */}
      <div className="pt-4 border-t border-gray-800">
        <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
          Shortcuts
        </h4>
        <div className="space-y-1 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Toggle label</span>
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Tab</kbd>
          </div>
          <div className="flex justify-between">
            <span>Brush size</span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">[</kbd>
              <kbd className="px-1.5 py-0.5 bg-gray-700 rounded ml-1">]</kbd>
            </span>
          </div>
          <div className="flex justify-between">
            <span>Confirm as constraint</span>
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Enter</kbd>
          </div>
          <div className="flex justify-between">
            <span>Clear selection</span>
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Esc</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
