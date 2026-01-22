// ABOUTME: Visualizes sample_point constraints from IDW normal sampling
// ABOUTME: Renders points as colored spheres based on sign (solid=blue, empty=orange)

import { useMemo } from "react";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";
import type { SamplePointConstraint } from "../../stores/labelStore";

interface SamplePointViewerProps {
  constraints: SamplePointConstraint[];
  visible?: boolean;
  pointSize?: number;
}

const COLORS = {
  solid: new THREE.Color("#3b82f6"), // Blue
  empty: new THREE.Color("#f97316"), // Orange
  surface: new THREE.Color("#22c55e"), // Green
};

export function SamplePointViewer({
  constraints,
  visible = true,
  pointSize = 0.02,
}: SamplePointViewerProps) {
  // Debug: log constraints received
  console.log(`[SamplePointViewer] Received ${constraints.length} constraints, visible=${visible}`);

  // Separate points by sign for different colors
  const { solidPositions, emptyPositions } = useMemo(() => {
    const solid: number[] = [];
    const empty: number[] = [];

    for (const c of constraints) {
      if (c.sign === "solid") {
        solid.push(c.position[0], c.position[1], c.position[2]);
      } else if (c.sign === "empty") {
        empty.push(c.position[0], c.position[1], c.position[2]);
      }
    }

    return {
      solidPositions: new Float32Array(solid),
      emptyPositions: new Float32Array(empty),
    };
  }, [constraints]);

  if (!visible || constraints.length === 0) {
    return null;
  }

  // Use keys to force remount when data changes (Three.js buffers don't update well)
  const solidKey = `solid-${solidPositions.length}`;
  const emptyKey = `empty-${emptyPositions.length}`;

  return (
    <group>
      {/* Solid (interior) points - blue */}
      {solidPositions.length > 0 && (
        <Points key={solidKey}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={solidPositions.length / 3}
              array={solidPositions}
              itemSize={3}
            />
          </bufferGeometry>
          <PointMaterial
            size={pointSize}
            color={COLORS.solid}
            transparent
            opacity={0.8}
            sizeAttenuation
            depthWrite={false}
          />
        </Points>
      )}

      {/* Empty (exterior) points - orange */}
      {emptyPositions.length > 0 && (
        <Points key={emptyKey}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={emptyPositions.length / 3}
              array={emptyPositions}
              itemSize={3}
            />
          </bufferGeometry>
          <PointMaterial
            size={pointSize}
            color={COLORS.empty}
            transparent
            opacity={0.8}
            sizeAttenuation
            depthWrite={false}
          />
        </Points>
      )}
    </group>
  );
}
