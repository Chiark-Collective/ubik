// ABOUTME: Slice painting mode panel for 2D cross-section labeling
// ABOUTME: Controls for plane selection, slice position, and painting tools

import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as Slider from "@radix-ui/react-slider";
import { EraserIcon, Pencil1Icon, SquareIcon } from "@radix-ui/react-icons";

import { useProjectStore } from "../../stores/projectStore";
import { HelpTooltip } from "../ui/HelpTooltip";

type SlicePlane = "xy" | "xz" | "yz";

const planeOptions: { value: SlicePlane; label: string }[] = [
  { value: "xy", label: "XY" },
  { value: "xz", label: "XZ" },
  { value: "yz", label: "YZ" },
];

export type SliceTool = "brush" | "lasso" | "eraser";

interface SliceModeProps {
  tool: SliceTool;
  setTool: (tool: SliceTool) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  selectedPointCount?: number;
  onCreateConstraint?: () => void;
}

export function SliceMode({
  tool,
  setTool,
  brushSize,
  setBrushSize,
  selectedPointCount = 0,
  onCreateConstraint,
}: SliceModeProps) {
  const activeLabel = useProjectStore((s) => s.activeLabel);
  const slicePlane = useProjectStore((s) => s.slicePlane);
  const setSlicePlane = useProjectStore((s) => s.setSlicePlane);
  const slicePosition = useProjectStore((s) => s.slicePosition);
  const setSlicePosition = useProjectStore((s) => s.setSlicePosition);
  const sliceThickness = useProjectStore((s) => s.sliceThickness);
  const setSliceThickness = useProjectStore((s) => s.setSliceThickness);

  const labelColor =
    activeLabel === "solid"
      ? "text-solid"
      : activeLabel === "empty"
        ? "text-empty"
        : "text-surface";

  return (
    <div className="p-4 space-y-3 border-b border-gray-800">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">Slice Paint</h4>
        <HelpTooltip content="Paint on 2D slices to mark regions. Scroll to move through slices. Tab to toggle label." />
        <span className={`ml-auto text-xs ${labelColor}`}>{activeLabel}</span>
      </div>

      {/* Slice plane selection */}
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">Plane</span>
          <HelpTooltip content="Press 1, 2, 3 to switch planes" />
        </div>
        <ToggleGroup.Root
          type="single"
          value={slicePlane}
          onValueChange={(value) => value && setSlicePlane(value as SlicePlane)}
          className="flex gap-1"
        >
          {planeOptions.map(({ value, label }) => (
            <ToggleGroup.Item
              key={value}
              value={value}
              className={`
                flex-1 px-2 py-1.5 rounded border transition-colors text-xs font-medium
                ${
                  slicePlane === value
                    ? "border-blue-500 bg-blue-500/10 text-blue-400"
                    : "border-gray-700 hover:border-gray-600 text-gray-400"
                }
              `}
            >
              {label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      {/* Slice position slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">Position</span>
            <HelpTooltip content="Scroll in the slice view to adjust position" />
          </div>
          <span className="text-xs text-gray-400 tabular-nums">
            {slicePosition.toFixed(2)}
          </span>
        </div>
        <Slider.Root
          value={[slicePosition]}
          onValueChange={([value]) => setSlicePosition(value)}
          min={-10}
          max={10}
          step={0.01}
          className="relative flex items-center h-4"
        >
          <Slider.Track className="relative h-[3px] flex-1 bg-gray-700 rounded-full">
            <Slider.Range className="absolute h-full bg-blue-500 rounded-full" />
          </Slider.Track>
          <Slider.Thumb className="block w-3.5 h-3.5 bg-white rounded-full shadow focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </Slider.Root>
      </div>

      {/* Slice thickness slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">Thickness</span>
            <HelpTooltip content="How thick the slice selection region is" />
          </div>
          <span className="text-xs text-gray-400 tabular-nums">
            {sliceThickness.toFixed(2)}
          </span>
        </div>
        <Slider.Root
          value={[sliceThickness]}
          onValueChange={([value]) => setSliceThickness(value)}
          min={0.01}
          max={1}
          step={0.01}
          className="relative flex items-center h-4"
        >
          <Slider.Track className="relative h-[3px] flex-1 bg-gray-700 rounded-full">
            <Slider.Range className="absolute h-full bg-blue-500 rounded-full" />
          </Slider.Track>
          <Slider.Thumb className="block w-3.5 h-3.5 bg-white rounded-full shadow focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </Slider.Root>
      </div>

      {/* Paint tools */}
      <div className="space-y-1">
        <span className="text-xs text-gray-500">Tool</span>
        <ToggleGroup.Root
          type="single"
          value={tool}
          onValueChange={(value) => value && setTool(value as SliceTool)}
          className="flex gap-1"
        >
          <ToggleGroup.Item
            value="brush"
            className={`
              flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded border transition-colors
              ${
                tool === "brush"
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-gray-700 hover:border-gray-600 text-gray-400"
              }
            `}
          >
            <Pencil1Icon className="w-3.5 h-3.5" />
          </ToggleGroup.Item>
          <ToggleGroup.Item
            value="lasso"
            className={`
              flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded border transition-colors
              ${
                tool === "lasso"
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-gray-700 hover:border-gray-600 text-gray-400"
              }
            `}
          >
            <SquareIcon className="w-3.5 h-3.5" />
          </ToggleGroup.Item>
          <ToggleGroup.Item
            value="eraser"
            className={`
              flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded border transition-colors
              ${
                tool === "eraser"
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-gray-700 hover:border-gray-600 text-gray-400"
              }
            `}
          >
            <EraserIcon className="w-3.5 h-3.5" />
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>

      {/* Brush size (when brush tool selected) */}
      {tool === "brush" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Size</span>
              <HelpTooltip content="Use [ and ] keys to adjust brush size" />
            </div>
            <span className="text-xs text-gray-400 tabular-nums">
              {brushSize.toFixed(0)}px
            </span>
          </div>
          <Slider.Root
            value={[brushSize]}
            onValueChange={([value]) => setBrushSize(value)}
            min={5}
            max={100}
            step={1}
            className="relative flex items-center h-4"
          >
            <Slider.Track className="relative h-[3px] flex-1 bg-gray-700 rounded-full">
              <Slider.Range className="absolute h-full bg-blue-500 rounded-full" />
            </Slider.Track>
            <Slider.Thumb className="block w-3.5 h-3.5 bg-white rounded-full shadow focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Slider.Root>
        </div>
      )}

      {/* Selection info and Create Constraint button */}
      {selectedPointCount > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-blue-400 flex-1">
            {selectedPointCount.toLocaleString()} pts
          </span>
          {onCreateConstraint && (
            <button
              onClick={onCreateConstraint}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
            >
              Create
            </button>
          )}
        </div>
      )}
    </div>
  );
}
