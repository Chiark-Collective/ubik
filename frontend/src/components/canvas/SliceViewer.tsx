// ABOUTME: 2D slice viewer component for cross-section visualization
// ABOUTME: Renders points within slice thickness and handles paint interactions

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useProjectStore } from "../../stores/projectStore";
import type { SliceTool } from "../modes/SliceMode";

interface Point2D {
  x: number;
  y: number;
  index: number;
  selected: boolean;
}

interface SliceViewerProps {
  points: Float32Array | null;
  tool: SliceTool;
  brushSize: number;
  onPointsSelected: (indices: number[]) => void;
  onPointsDeselected: (indices: number[]) => void;
}

const COLORS = {
  solid: "#3b82f6",
  empty: "#f97316",
  surface: "#22c55e",
  unselected: "#6b7280",
  background: "#1a1a1a",
  grid: "#2a2a2a",
  slicePlane: "#ffffff22",
};

export function SliceViewer({
  points,
  tool,
  brushSize,
  onPointsSelected,
  onPointsDeselected,
}: SliceViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 400, height: 400 });
  const [isPainting, setIsPainting] = useState(false);
  const [lassoPoints, setLassoPoints] = useState<{ x: number; y: number }[]>(
    [],
  );
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );

  const activeLabel = useProjectStore((s) => s.activeLabel);
  const slicePlane = useProjectStore((s) => s.slicePlane);
  const slicePosition = useProjectStore((s) => s.slicePosition);
  const sliceThickness = useProjectStore((s) => s.sliceThickness);
  const selectedPointIndices = useProjectStore((s) => s.selectedPointIndices);

  // Calculate view bounds from points
  const viewBounds = useMemo(() => {
    if (!points || points.length === 0) {
      return { minX: -5, maxX: 5, minY: -5, maxY: 5 };
    }

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    const numPoints = points.length / 3;
    for (let i = 0; i < numPoints; i++) {
      const x = points[i * 3];
      const y = points[i * 3 + 1];
      const z = points[i * 3 + 2];

      // Get 2D coordinates based on slice plane
      let px: number, py: number;
      if (slicePlane === "xy") {
        px = x;
        py = y;
      } else if (slicePlane === "xz") {
        px = x;
        py = z;
      } else {
        px = y;
        py = z;
      }

      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }

    // Add padding
    const padX = (maxX - minX) * 0.1;
    const padY = (maxY - minY) * 0.1;
    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minY: minY - padY,
      maxY: maxY + padY,
    };
  }, [points, slicePlane]);

  // Get points in current slice
  const slicePoints = useMemo((): Point2D[] => {
    if (!points || points.length === 0) return [];

    const result: Point2D[] = [];
    const numPoints = points.length / 3;
    const halfThickness = sliceThickness / 2;

    for (let i = 0; i < numPoints; i++) {
      const x = points[i * 3];
      const y = points[i * 3 + 1];
      const z = points[i * 3 + 2];

      // Check if point is within slice
      let sliceCoord: number;
      let px: number, py: number;

      if (slicePlane === "xy") {
        sliceCoord = z;
        px = x;
        py = y;
      } else if (slicePlane === "xz") {
        sliceCoord = y;
        px = x;
        py = z;
      } else {
        sliceCoord = x;
        px = y;
        py = z;
      }

      if (Math.abs(sliceCoord - slicePosition) <= halfThickness) {
        result.push({
          x: px,
          y: py,
          index: i,
          selected: selectedPointIndices.has(i),
        });
      }
    }

    return result;
  }, [points, slicePlane, slicePosition, sliceThickness, selectedPointIndices]);

  // Convert world coords to canvas coords
  const worldToCanvas = useCallback(
    (wx: number, wy: number) => {
      const { minX, maxX, minY, maxY } = viewBounds;
      const scaleX = canvasSize.width / (maxX - minX);
      const scaleY = canvasSize.height / (maxY - minY);
      const scale = Math.min(scaleX, scaleY);

      const offsetX = (canvasSize.width - (maxX - minX) * scale) / 2;
      const offsetY = (canvasSize.height - (maxY - minY) * scale) / 2;

      return {
        x: (wx - minX) * scale + offsetX,
        y: canvasSize.height - ((wy - minY) * scale + offsetY), // Flip Y
      };
    },
    [viewBounds, canvasSize],
  );

  // Convert canvas coords to world coords
  const canvasToWorld = useCallback(
    (cx: number, cy: number) => {
      const { minX, maxX, minY, maxY } = viewBounds;
      const scaleX = canvasSize.width / (maxX - minX);
      const scaleY = canvasSize.height / (maxY - minY);
      const scale = Math.min(scaleX, scaleY);

      const offsetX = (canvasSize.width - (maxX - minX) * scale) / 2;
      const offsetY = (canvasSize.height - (maxY - minY) * scale) / 2;

      return {
        x: (cx - offsetX) / scale + minX,
        y: (canvasSize.height - cy - offsetY) / scale + minY,
      };
    },
    [viewBounds, canvasSize],
  );

  // Find points within brush radius
  const getPointsInBrush = useCallback(
    (canvasX: number, canvasY: number): number[] => {
      const worldPos = canvasToWorld(canvasX, canvasY);
      const worldRadius =
        brushSize /
        Math.min(
          canvasSize.width / (viewBounds.maxX - viewBounds.minX),
          canvasSize.height / (viewBounds.maxY - viewBounds.minY),
        );

      const indices: number[] = [];
      for (const point of slicePoints) {
        const dx = point.x - worldPos.x;
        const dy = point.y - worldPos.y;
        if (dx * dx + dy * dy <= worldRadius * worldRadius) {
          indices.push(point.index);
        }
      }
      return indices;
    },
    [canvasToWorld, brushSize, canvasSize, viewBounds, slicePoints],
  );

  // Find points inside lasso polygon
  const getPointsInLasso = useCallback(
    (polygon: { x: number; y: number }[]): number[] => {
      if (polygon.length < 3) return [];

      const indices: number[] = [];
      for (const point of slicePoints) {
        const canvasPos = worldToCanvas(point.x, point.y);
        if (isPointInPolygon(canvasPos.x, canvasPos.y, polygon)) {
          indices.push(point.index);
        }
      }
      return indices;
    },
    [slicePoints, worldToCanvas],
  );

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    // Draw grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const gridSpacing = 50;
    for (let x = 0; x < canvasSize.width; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasSize.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvasSize.height; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasSize.width, y);
      ctx.stroke();
    }

    // Draw points
    for (const point of slicePoints) {
      const { x, y } = worldToCanvas(point.x, point.y);

      ctx.beginPath();
      ctx.arc(x, y, point.selected ? 4 : 2, 0, Math.PI * 2);

      if (point.selected) {
        ctx.fillStyle = COLORS[activeLabel];
      } else {
        ctx.fillStyle = COLORS.unselected;
      }
      ctx.fill();
    }

    // Draw lasso polygon
    if (lassoPoints.length > 0) {
      ctx.strokeStyle = COLORS[activeLabel];
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) {
        ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      }
      if (lassoPoints.length > 2) {
        ctx.closePath();
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw brush cursor
    if (mousePos && (tool === "brush" || tool === "eraser")) {
      ctx.strokeStyle = tool === "eraser" ? "#ff0000" : COLORS[activeLabel];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, brushSize, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [
    canvasSize,
    slicePoints,
    worldToCanvas,
    activeLabel,
    lassoPoints,
    mousePos,
    tool,
    brushSize,
  ]);

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setIsPainting(true);

      if (tool === "lasso") {
        setLassoPoints([{ x, y }]);
      } else if (tool === "brush") {
        const indices = getPointsInBrush(x, y);
        if (indices.length > 0) {
          onPointsSelected(indices);
        }
      } else if (tool === "eraser") {
        const indices = getPointsInBrush(x, y);
        if (indices.length > 0) {
          onPointsDeselected(indices);
        }
      }
    },
    [tool, getPointsInBrush, onPointsSelected, onPointsDeselected],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setMousePos({ x, y });

      if (!isPainting) return;

      if (tool === "lasso") {
        setLassoPoints((prev) => [...prev, { x, y }]);
      } else if (tool === "brush") {
        const indices = getPointsInBrush(x, y);
        if (indices.length > 0) {
          onPointsSelected(indices);
        }
      } else if (tool === "eraser") {
        const indices = getPointsInBrush(x, y);
        if (indices.length > 0) {
          onPointsDeselected(indices);
        }
      }
    },
    [isPainting, tool, getPointsInBrush, onPointsSelected, onPointsDeselected],
  );

  const handleMouseUp = useCallback(() => {
    if (tool === "lasso" && lassoPoints.length > 2) {
      const indices = getPointsInLasso(lassoPoints);
      if (indices.length > 0) {
        onPointsSelected(indices);
      }
    }

    setIsPainting(false);
    setLassoPoints([]);
  }, [tool, lassoPoints, getPointsInLasso, onPointsSelected]);

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
    if (isPainting) {
      handleMouseUp();
    }
  }, [isPainting, handleMouseUp]);

  // Handle scroll for slice position
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      useProjectStore.getState().setSlicePosition(slicePosition + delta);
    },
    [slicePosition],
  );

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="absolute inset-0 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      {/* Info overlay */}
      <div className="absolute top-2 left-2 bg-black/50 px-2 py-1 rounded text-xs text-gray-300">
        {slicePlane.toUpperCase()} plane @ {slicePosition.toFixed(2)} |{" "}
        {slicePoints.length} points
      </div>
    </div>
  );
}

// Point-in-polygon test using ray casting
function isPointInPolygon(
  x: number,
  y: number,
  polygon: { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
