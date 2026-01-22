// ABOUTME: Overlay UI for primitive mode hints
// ABOUTME: Renders outside the Canvas for proper CSS positioning

import { useProjectStore } from "../../stores/projectStore";
import { usePrimitiveStore } from "../../stores/primitiveStore";

export function PrimitiveOverlay() {
  const mode = useProjectStore((s) => s.mode);
  const placingPrimitive = usePrimitiveStore((s) => s.placingPrimitive);
  const transformMode = usePrimitiveStore((s) => s.transformMode);

  // Only show when in primitive mode
  if (mode !== "primitive") return null;

  // Dispatch Enter key to trigger confirm in PrimitivePlacer
  const handleConfirmClick = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  };

  return (
    <>
      {/* Transform mode indicator - bottom-left */}
      <div className="absolute left-3 bottom-14 z-10 pointer-events-none">
        <div className="flex flex-col gap-1 bg-gray-900/90 rounded-lg px-3 py-2 text-xs whitespace-nowrap">
          <span
            className={
              transformMode === "translate"
                ? "text-blue-400 font-bold"
                : "text-gray-400"
            }
          >
            [W] Move
          </span>
          <span
            className={
              transformMode === "rotate"
                ? "text-blue-400 font-bold"
                : "text-gray-400"
            }
          >
            [E] Rotate
          </span>
          <span
            className={
              transformMode === "scale"
                ? "text-blue-400 font-bold"
                : "text-gray-400"
            }
          >
            [R] Scale
          </span>
        </div>
      </div>

      {/* Confirm button - top-center (only when placing) */}
      {placingPrimitive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={handleConfirmClick}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded shadow-lg hover:bg-blue-700 whitespace-nowrap"
          >
            Confirm (Enter)
          </button>
        </div>
      )}
    </>
  );
}
