// ABOUTME: Seed + propagate mode panel for region growing labeling
// ABOUTME: Controls for seed placement and spatial propagation parameters

import { useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useMutation } from "@tanstack/react-query";

import { useProjectStore } from "../../stores/projectStore";
import {
  useLabelStore,
  type SeedPropagationConstraint,
} from "../../stores/labelStore";

type PropagationMethod = "euclidean" | "geodesic";

interface SeedModeProps {
  projectId: string;
  seeds: SeedPoint[];
  onAddSeed: (position: [number, number, number]) => void;
  onRemoveSeed: (index: number) => void;
  onClearSeeds: () => void;
}

export interface SeedPoint {
  position: [number, number, number];
  pointIndex?: number;
}

export function SeedMode({
  projectId,
  seeds,
  onAddSeed: _onAddSeed,
  onRemoveSeed,
  onClearSeeds,
}: SeedModeProps) {
  const activeLabel = useProjectStore((s) => s.activeLabel);
  const pointCloudPositions = useProjectStore((s) => s.pointCloudPositions);
  const addConstraint = useLabelStore((s) => s.addConstraint);

  const [propagationRadius, setPropagationRadius] = useState(0.5);
  const [propagationMethod, setPropagationMethod] =
    useState<PropagationMethod>("euclidean");
  const [isAnimating, setIsAnimating] = useState(false);

  const labelColor =
    activeLabel === "solid"
      ? "text-solid"
      : activeLabel === "empty"
        ? "text-empty"
        : "text-surface";

  // Propagation mutation - finds all points within radius of each seed
  const propagateMutation = useMutation({
    mutationFn: async () => {
      const propagatedIndices: number[] = [];
      const confidences: number[] = [];

      if (!pointCloudPositions || pointCloudPositions.length === 0) {
        return { propagatedIndices, confidences };
      }

      const radiusSquared = propagationRadius * propagationRadius;
      const numPoints = pointCloudPositions.length / 3;
      const foundIndices = new Set<number>();

      // For each seed, find all points within the propagation radius
      for (const seed of seeds) {
        const [sx, sy, sz] = seed.position;

        for (let i = 0; i < numPoints; i++) {
          if (foundIndices.has(i)) continue;

          const px = pointCloudPositions[i * 3];
          const py = pointCloudPositions[i * 3 + 1];
          const pz = pointCloudPositions[i * 3 + 2];

          const dx = px - sx;
          const dy = py - sy;
          const dz = pz - sz;
          const distSquared = dx * dx + dy * dy + dz * dz;

          if (distSquared <= radiusSquared) {
            foundIndices.add(i);
            // Confidence based on distance (closer = higher)
            const dist = Math.sqrt(distSquared);
            const confidence = 1.0 - dist / propagationRadius;
            propagatedIndices.push(i);
            confidences.push(confidence);
          }
        }
      }

      return { propagatedIndices, confidences };
    },
    onSuccess: (data) => {
      if (seeds.length === 0) return;

      // Create seed propagation constraint
      const constraint: SeedPropagationConstraint = {
        id: crypto.randomUUID(),
        type: "seed_propagation",
        sign: activeLabel,
        weight: 1.0,
        createdAt: Date.now(),
        seedPoint: seeds[0].position,
        propagationRadius,
        propagatedIndices: data.propagatedIndices,
        confidences: data.confidences,
      };

      addConstraint(projectId, constraint);
      onClearSeeds();
      setIsAnimating(false);
    },
  });

  const handlePropagate = () => {
    if (seeds.length === 0) return;
    setIsAnimating(true);
    propagateMutation.mutate();
  };

  return (
    <div className="p-4 space-y-4">
      {/* Instructions */}
      <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-gray-400">
        <p className="mb-2">
          <strong className="text-white">Click</strong> to place seed points
        </p>
        <p className="mb-2">
          <strong className="text-white">Propagate</strong> expands seeds to
          nearby points
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

      {/* Seeds info */}
      <div className="p-3 bg-gray-800/30 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Seeds placed</span>
          <span className="text-sm font-medium text-white">{seeds.length}</span>
        </div>
        {seeds.length > 0 && (
          <div className="mt-2 max-h-24 overflow-y-auto">
            {seeds.map((seed, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-1 text-xs text-gray-400"
              >
                <span>
                  ({seed.position[0].toFixed(2)}, {seed.position[1].toFixed(2)},{" "}
                  {seed.position[2].toFixed(2)})
                </span>
                <button
                  onClick={() => onRemoveSeed(index)}
                  className="text-red-400 hover:text-red-300"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Propagation radius slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-gray-500 uppercase">
            Propagation Radius
          </h4>
          <span className="text-sm text-gray-400">
            {propagationRadius.toFixed(2)}
          </span>
        </div>
        <Slider.Root
          value={[propagationRadius]}
          onValueChange={([value]) => setPropagationRadius(value)}
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

      {/* Propagation method */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
          Propagation Method
        </h4>
        <ToggleGroup.Root
          type="single"
          value={propagationMethod}
          onValueChange={(value) =>
            value && setPropagationMethod(value as PropagationMethod)
          }
          className="flex gap-2"
        >
          <ToggleGroup.Item
            value="euclidean"
            className={`
              flex-1 px-3 py-2 rounded-lg border transition-colors text-sm
              ${
                propagationMethod === "euclidean"
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-gray-700 hover:border-gray-600 text-gray-400"
              }
            `}
          >
            Euclidean
          </ToggleGroup.Item>
          <ToggleGroup.Item
            value="geodesic"
            className={`
              flex-1 px-3 py-2 rounded-lg border transition-colors text-sm
              ${
                propagationMethod === "geodesic"
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-gray-700 hover:border-gray-600 text-gray-400"
              }
            `}
          >
            Geodesic
          </ToggleGroup.Item>
        </ToggleGroup.Root>
        <p className="mt-1 text-xs text-gray-500">
          {propagationMethod === "euclidean"
            ? "Direct 3D distance"
            : "Surface-following distance"}
        </p>
      </div>

      {/* Action buttons */}
      <div className="space-y-2">
        <button
          onClick={handlePropagate}
          disabled={seeds.length === 0 || propagateMutation.isPending}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {propagateMutation.isPending || isAnimating
            ? "Propagating..."
            : "Propagate"}
        </button>

        <button
          onClick={onClearSeeds}
          disabled={seeds.length === 0}
          className="w-full px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          Clear Seeds
        </button>
      </div>

      {propagateMutation.isError && (
        <p className="text-sm text-red-400 text-center">
          {(propagateMutation.error as Error).message}
        </p>
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
            <span>Propagate</span>
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Enter</kbd>
          </div>
          <div className="flex justify-between">
            <span>Clear seeds</span>
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Esc</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
