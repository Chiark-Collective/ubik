// ABOUTME: Primitive placement mode panel
// ABOUTME: UI for selecting and configuring box/sphere/halfspace primitives

import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as Slider from "@radix-ui/react-slider";
import {
  BoxIcon,
  CircleIcon,
  ShadowIcon,
  Component1Icon,
} from "@radix-ui/react-icons";

import { useProjectStore } from "../../stores/projectStore";
import {
  usePrimitiveStore,
  type PrimitiveType,
} from "../../stores/primitiveStore";

const primitiveOptions: {
  value: PrimitiveType;
  icon: typeof BoxIcon;
  label: string;
  shortcut: string;
}[] = [
  { value: "box", icon: BoxIcon, label: "Box", shortcut: "B" },
  { value: "sphere", icon: CircleIcon, label: "Sphere", shortcut: "O" },
  { value: "halfspace", icon: ShadowIcon, label: "Half-space", shortcut: "H" },
  { value: "cylinder", icon: Component1Icon, label: "Cylinder", shortcut: "C" },
];

export function PrimitiveMode() {
  const activeLabel = useProjectStore((s) => s.activeLabel);
  const primitiveType = usePrimitiveStore((s) => s.primitiveType);
  const setPrimitiveType = usePrimitiveStore((s) => s.setPrimitiveType);
  const defaultSize = usePrimitiveStore((s) => s.defaultSize);
  const setDefaultSize = usePrimitiveStore((s) => s.setDefaultSize);
  const snapToGrid = usePrimitiveStore((s) => s.snapToGrid);
  const setSnapToGrid = usePrimitiveStore((s) => s.setSnapToGrid);
  const gridSize = usePrimitiveStore((s) => s.gridSize);
  const setGridSize = usePrimitiveStore((s) => s.setGridSize);

  const labelColor = activeLabel === "solid" ? "text-solid" : "text-empty";

  return (
    <div className="p-4 space-y-4">
      {/* Instructions */}
      <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-gray-400">
        <p className="mb-2">
          <strong className="text-white">Click</strong> in 3D space to place a
          primitive
        </p>
        <p className="mb-2">
          <strong className="text-white">Drag handles</strong> to resize/move
        </p>
        <p>
          Label:{" "}
          <span className={`font-medium ${labelColor}`}>
            {activeLabel === "solid" ? "Solid (inside)" : "Empty (outside)"}
          </span>
        </p>
      </div>

      {/* Primitive type selection */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
          Primitive Type
        </h4>
        <ToggleGroup.Root
          type="single"
          value={primitiveType}
          onValueChange={(value) =>
            value && setPrimitiveType(value as PrimitiveType)
          }
          className="grid grid-cols-2 gap-2"
        >
          {primitiveOptions.map(({ value, icon: Icon, label, shortcut }) => (
            <ToggleGroup.Item
              key={value}
              value={value}
              className={`
                flex items-center gap-2 p-3 rounded-lg border transition-colors
                ${
                  primitiveType === value
                    ? "border-blue-500 bg-blue-500/10 text-blue-400"
                    : "border-gray-700 hover:border-gray-600 text-gray-400"
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{label}</div>
              </div>
              <kbd className="px-1.5 py-0.5 text-xs bg-gray-700 rounded">
                {shortcut}
              </kbd>
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      {/* Default size slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-gray-500 uppercase">
            Default Size
          </h4>
          <span className="text-sm text-gray-400">
            {defaultSize.toFixed(2)}
          </span>
        </div>
        <Slider.Root
          value={[defaultSize]}
          onValueChange={([value]) => setDefaultSize(value)}
          min={0.1}
          max={5}
          step={0.1}
          className="relative flex items-center h-5"
        >
          <Slider.Track className="relative h-1 flex-1 bg-gray-700 rounded">
            <Slider.Range className="absolute h-full bg-blue-500 rounded" />
          </Slider.Track>
          <Slider.Thumb className="block w-4 h-4 bg-white rounded-full shadow focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </Slider.Root>
      </div>

      {/* Snap to grid toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Snap to Grid</h4>
          <p className="text-xs text-gray-500">Align primitives to grid</p>
        </div>
        <button
          onClick={() => setSnapToGrid(!snapToGrid)}
          className={`
            relative w-10 h-6 rounded-full transition-colors
            ${snapToGrid ? "bg-blue-600" : "bg-gray-700"}
          `}
        >
          <span
            className={`
              absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
              ${snapToGrid ? "left-5" : "left-1"}
            `}
          />
        </button>
      </div>

      {/* Grid size (when snap enabled) */}
      {snapToGrid && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-gray-500 uppercase">
              Grid Size
            </h4>
            <span className="text-sm text-gray-400">{gridSize.toFixed(2)}</span>
          </div>
          <Slider.Root
            value={[gridSize]}
            onValueChange={([value]) => setGridSize(value)}
            min={0.1}
            max={2}
            step={0.1}
            className="relative flex items-center h-5"
          >
            <Slider.Track className="relative h-1 flex-1 bg-gray-700 rounded">
              <Slider.Range className="absolute h-full bg-blue-500 rounded" />
            </Slider.Track>
            <Slider.Thumb className="block w-4 h-4 bg-white rounded-full shadow focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Slider.Root>
        </div>
      )}

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
            <span>Delete selected</span>
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Delete</kbd>
          </div>
          <div className="flex justify-between">
            <span>Confirm placement</span>
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Enter</kbd>
          </div>
          <div className="flex justify-between">
            <span>Cancel</span>
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Esc</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
