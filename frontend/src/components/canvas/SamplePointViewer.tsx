// ABOUTME: Visualizes sample_point constraints from auto-analysis algorithms
// ABOUTME: Renders points with vertex colors: solid=blue, empty=orange, intensity varies by distance

import { useMemo, useEffect } from "react";
import * as THREE from "three";
import type { SamplePointConstraint } from "../../stores/labelStore";

interface SamplePointViewerProps {
  constraints: SamplePointConstraint[];
  visible?: boolean;
  pointSize?: number;
}

// Base colors for solid and empty
const SOLID_COLOR = new THREE.Color("#3b82f6"); // Blue
const EMPTY_COLOR = new THREE.Color("#f97316"); // Orange
const WHITE = new THREE.Color("#ffffff");

/**
 * Compute color based on sign and distance from surface.
 * Near surface = saturated base color, far from surface = lighter (towards white).
 */
function distanceToColor(
  sign: "solid" | "empty" | "surface",
  distance: number,
  maxDistance: number,
): THREE.Color {
  // Surface points get green, solid=blue, empty=orange
  const baseColor =
    sign === "surface"
      ? new THREE.Color("#22c55e")
      : sign === "solid"
        ? SOLID_COLOR
        : EMPTY_COLOR;

  // Normalize distance to [0, 1] range
  const t = Math.min(Math.abs(distance) / maxDistance, 1.0);

  // Near surface (t~0) = full color, far (t~1) = blend towards white
  // Use sqrt for more gradual transition near surface
  const blendFactor = Math.sqrt(t) * 0.7; // Max 70% white blend

  return baseColor.clone().lerp(WHITE, blendFactor);
}

export function SamplePointViewer({
  constraints,
  visible = true,
  pointSize = 0.08,
}: SamplePointViewerProps) {
  // Build geometry with vertex colors based on distance
  const geometry = useMemo(() => {
    if (constraints.length === 0) return null;

    const geo = new THREE.BufferGeometry();

    // Compute max distance for normalization
    const distances = constraints.map((c) => Math.abs(c.distance));
    const maxDistance = Math.max(...distances, 0.1); // Avoid division by zero

    // Position buffer
    const positions = new Float32Array(constraints.length * 3);
    const colors = new Float32Array(constraints.length * 3);

    for (let i = 0; i < constraints.length; i++) {
      const c = constraints[i];

      // Position
      positions[i * 3] = c.position[0];
      positions[i * 3 + 1] = c.position[1];
      positions[i * 3 + 2] = c.position[2];

      // Color based on sign and distance
      const color = distanceToColor(c.sign, c.distance, maxDistance);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();

    return geo;
  }, [constraints]);

  // Cleanup geometry on unmount
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!visible || !geometry) {
    return null;
  }

  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={pointSize}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  );
}
