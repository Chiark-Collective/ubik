// ABOUTME: Settings panel for click-pocket annotation mode
// ABOUTME: Shows detected pockets and allows toggling solid/empty state

import { LoadingButton } from "../ui/Spinner";
import { HelpTooltip } from "../ui/HelpTooltip";

export interface PocketInfo {
  pocketId: number;
  voxelCount: number;
  centroid: [number, number, number];
  boundsLow: [number, number, number];
  boundsHigh: [number, number, number];
  volumeEstimate: number;
  isToggledSolid: boolean;
}

export interface ClickPocketModeProps {
  pockets: PocketInfo[];
  selectedPocketId: number | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onTogglePocket: (pocketId: number) => void;
  onSelectPocket: (pocketId: number | null) => void;
}

export function ClickPocketMode({
  pockets,
  selectedPocketId,
  isAnalyzing,
  onAnalyze,
  onTogglePocket,
  onSelectPocket,
}: ClickPocketModeProps) {
  return (
    <div className="p-4 space-y-3 border-b border-gray-800">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">Click Pocket</h4>
        <HelpTooltip content="Auto-detect enclosed cavities. Click pockets to toggle between solid (filled) and empty (cavity)." />
      </div>

      {/* Analyze button */}
      <LoadingButton
        onClick={onAnalyze}
        loading={isAnalyzing}
        className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {pockets.length > 0 ? "Re-analyze" : "Detect Pockets"}
      </LoadingButton>

      {/* Pocket list */}
      {pockets.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Pockets ({pockets.length})
            </span>
            <HelpTooltip content="Click pocket in 3D view to select. Orange = empty, Blue = solid." />
          </div>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {pockets.map((pocket) => (
              <PocketItem
                key={pocket.pocketId}
                pocket={pocket}
                isSelected={selectedPocketId === pocket.pocketId}
                onSelect={() =>
                  onSelectPocket(
                    selectedPocketId === pocket.pocketId
                      ? null
                      : pocket.pocketId,
                  )
                }
                onToggle={() => onTogglePocket(pocket.pocketId)}
              />
            ))}
          </ul>
        </div>
      )}

      {pockets.length === 0 && !isAnalyzing && (
        <p className="text-xs text-gray-500 text-center py-2">
          No pockets detected yet
        </p>
      )}
    </div>
  );
}

interface PocketItemProps {
  pocket: PocketInfo;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

function PocketItem({
  pocket,
  isSelected,
  onSelect,
  onToggle,
}: PocketItemProps) {
  const formatVolume = (v: number) => {
    if (v < 0.001) return `${(v * 1e6).toFixed(1)} mm³`;
    if (v < 1) return `${(v * 1000).toFixed(1)} cm³`;
    return `${v.toFixed(2)} m³`;
  };

  return (
    <li
      className={`
        flex items-center gap-2 p-2 rounded cursor-pointer transition-colors
        ${isSelected ? "bg-gray-700 ring-1 ring-blue-500" : "hover:bg-gray-800"}
      `}
      onClick={onSelect}
    >
      {/* State indicator */}
      <div
        className={`w-3 h-3 rounded ${
          pocket.isToggledSolid ? "bg-solid" : "bg-empty"
        }`}
        title={pocket.isToggledSolid ? "Solid" : "Empty"}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">Pocket #{pocket.pocketId}</div>
        <div className="text-xs text-gray-500">
          {pocket.voxelCount} voxels · {formatVolume(pocket.volumeEstimate)}
        </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`
          px-2 py-1 text-xs rounded transition-colors
          ${
            pocket.isToggledSolid
              ? "bg-solid/20 text-blue-400 hover:bg-solid/30"
              : "bg-empty/20 text-orange-400 hover:bg-empty/30"
          }
        `}
      >
        {pocket.isToggledSolid ? "Solid" : "Empty"}
      </button>
    </li>
  );
}
