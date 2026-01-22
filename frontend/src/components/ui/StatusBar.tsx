// ABOUTME: Bottom status bar showing point cloud and selection statistics
// ABOUTME: Displays visible points, total points, and memory usage

import { useProjectStore } from "../../stores/projectStore";
import { useLabelStore } from "../../stores/labelStore";

export function StatusBar() {
  const mode = useProjectStore((s) => s.mode);
  const pointCloudLoaded = useProjectStore((s) => s.pointCloudLoaded);
  const visiblePointCount = useProjectStore((s) => s.visiblePointCount);
  const totalPointCount = useProjectStore((s) => s.totalPointCount);
  const selectedPointIndices = useProjectStore((s) => s.selectedPointIndices);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

  const constraints = useLabelStore((s) =>
    currentProjectId ? s.getConstraints(currentProjectId) : [],
  );

  // Count labeled points from constraints
  const labeledPointCount = constraints.reduce((acc, c) => {
    if ("pointIndices" in c) {
      return acc + (c.pointIndices?.length ?? 0);
    }
    if ("propagatedIndices" in c) {
      return acc + (c.propagatedIndices?.length ?? 0);
    }
    return acc;
  }, 0);

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const modeLabels: Record<string, string> = {
    orbit: "Navigate",
    primitive: "Place Primitive",
    slice: "Slice Paint",
    brush: "3D Brush",
    seed: "Seed & Propagate",
    import: "Import ML",
  };

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 bg-gray-900 border-t border-gray-800 text-xs text-gray-400">
      {/* Mode indicator */}
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Mode:</span>
        <span className="text-white">{modeLabels[mode]}</span>
      </div>

      <div className="w-px h-4 bg-gray-700" />

      {/* Point cloud stats */}
      {pointCloudLoaded ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Visible:</span>
            <span>{formatNumber(visiblePointCount)}</span>
            <span className="text-gray-600">/</span>
            <span>{formatNumber(totalPointCount)}</span>
            <span className="text-gray-500">points</span>
          </div>

          <div className="w-px h-4 bg-gray-700" />

          <div className="flex items-center gap-2">
            <span className="text-gray-500">Selected:</span>
            <span>{formatNumber(selectedPointIndices.size)}</span>
          </div>

          <div className="w-px h-4 bg-gray-700" />

          <div className="flex items-center gap-2">
            <span className="text-gray-500">Labeled:</span>
            <span>{formatNumber(labeledPointCount)}</span>
            <span className="text-gray-600">
              (
              {totalPointCount > 0
                ? ((labeledPointCount / totalPointCount) * 100).toFixed(1)
                : 0}
              %)
            </span>
          </div>
        </>
      ) : (
        <span className="text-gray-500">No point cloud loaded</span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Constraints count */}
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Constraints:</span>
        <span>{constraints.length}</span>
      </div>

      <div className="w-px h-4 bg-gray-700" />

      {/* Version */}
      <span className="text-gray-600">v0.1.0</span>
    </div>
  );
}
