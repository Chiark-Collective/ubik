// ABOUTME: Hook for computing local point spacing using k-NN
// ABOUTME: Builds KD-tree asynchronously and computes mean neighbor distances

import { useState, useEffect, useCallback, useRef } from "react";
import kdTree from "kd-tree-javascript";

const { kdTree: KdTree } = kdTree;

export interface LocalSpacingResult {
  /** Whether spacing computation is complete */
  isReady: boolean;
  /** Whether computation is in progress */
  isComputing: boolean;
  /** Progress as fraction 0-1 */
  progress: number;
  /** Global mean spacing across all points (available early) */
  globalMean: number | null;
  /** Get local spacing for a specific point index */
  getSpacing: (pointIndex: number) => number | null;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
  index: number;
}

function euclideanDistance(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Number of neighbors to consider for local spacing
const K_NEIGHBORS = 8;
// Process this many points per idle callback chunk
const CHUNK_SIZE = 1000;

/**
 * Hook for computing local point spacing from a point cloud.
 *
 * Builds a KD-tree and computes the mean distance to k-nearest neighbors
 * for each point. Computation happens asynchronously to avoid blocking the UI.
 *
 * @param positions Float32Array of point positions (x,y,z,x,y,z,...)
 */
export function useLocalSpacing(
  positions: Float32Array | null,
): LocalSpacingResult {
  const [isReady, setIsReady] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [globalMean, setGlobalMean] = useState<number | null>(null);
  const [spacings, setSpacings] = useState<Float32Array | null>(null);

  // Track the positions array identity to detect changes
  const positionsRef = useRef<Float32Array | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    // Reset if positions changed
    if (positions !== positionsRef.current) {
      positionsRef.current = positions;
      setIsReady(false);
      setIsComputing(false);
      setProgress(0);
      setGlobalMean(null);
      setSpacings(null);
      abortRef.current = true;
    }

    if (!positions || positions.length === 0) {
      return;
    }

    // Start computation
    abortRef.current = false;
    setIsComputing(true);

    const pointCount = positions.length / 3;

    // Convert to point array for KD-tree
    const points: Point3D[] = new Array(pointCount);
    for (let i = 0; i < pointCount; i++) {
      points[i] = {
        x: positions[i * 3],
        y: positions[i * 3 + 1],
        z: positions[i * 3 + 2],
        index: i,
      };
    }

    // Build KD-tree
    const tree = new KdTree(points, euclideanDistance, ["x", "y", "z"]);

    // Allocate results array
    const results = new Float32Array(pointCount);

    // Process in chunks using requestIdleCallback
    let processedCount = 0;
    let runningSum = 0;

    const processChunk = (deadline: IdleDeadline) => {
      if (abortRef.current) {
        setIsComputing(false);
        return;
      }

      // Process points while we have time
      while (processedCount < pointCount && deadline.timeRemaining() > 0) {
        const endIndex = Math.min(processedCount + CHUNK_SIZE, pointCount);

        for (let i = processedCount; i < endIndex; i++) {
          const point = points[i];
          // Query k+1 neighbors (includes self)
          const nearest = tree.nearest(point, K_NEIGHBORS + 1);

          // Compute mean distance (skip self which is at distance 0)
          let sumDist = 0;
          let count = 0;
          for (const [neighbor, dist] of nearest) {
            if (neighbor.index !== point.index) {
              sumDist += dist;
              count++;
            }
          }

          const meanDist = count > 0 ? sumDist / count : 0;
          results[i] = meanDist;
          runningSum += meanDist;
        }

        processedCount = endIndex;

        // Update progress
        const newProgress = processedCount / pointCount;
        setProgress(newProgress);

        // Update global mean periodically
        if (processedCount > 0 && processedCount % (CHUNK_SIZE * 10) === 0) {
          setGlobalMean(runningSum / processedCount);
        }
      }

      if (processedCount < pointCount) {
        // More work to do
        requestIdleCallback(processChunk, { timeout: 100 });
      } else {
        // Done!
        const finalMean = runningSum / pointCount;
        setGlobalMean(finalMean);
        setSpacings(results);
        setIsComputing(false);
        setIsReady(true);
      }
    };

    // Start processing
    requestIdleCallback(processChunk, { timeout: 100 });

    return () => {
      abortRef.current = true;
    };
  }, [positions]);

  const getSpacing = useCallback(
    (pointIndex: number): number | null => {
      if (!spacings || pointIndex < 0 || pointIndex >= spacings.length) {
        return null;
      }
      return spacings[pointIndex];
    },
    [spacings],
  );

  return {
    isReady,
    isComputing,
    progress,
    globalMean,
    getSpacing,
  };
}
