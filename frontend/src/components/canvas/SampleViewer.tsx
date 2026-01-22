// ABOUTME: Renders generated SDF samples as colored points in 3D viewport
// ABOUTME: Colors points on continuous gradient: blue (solid) → white (surface) → orange (empty)

import { useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import * as THREE from "three";

import { getSamples, type SamplePoint } from "../../services/api";
import { useProjectStore } from "../../stores/projectStore";

interface SampleViewerProps {
  projectId: string;
}

// Color constants matching the label colors
const SOLID_COLOR = new THREE.Color("#3b82f6"); // Blue - negative phi
const SURFACE_COLOR = new THREE.Color("#ffffff"); // White - zero phi
const EMPTY_COLOR = new THREE.Color("#f97316"); // Orange - positive phi

/**
 * Map phi value to color on continuous gradient.
 * Blue (solid/negative) → White (surface/zero) → Orange (empty/positive)
 */
function phiToColor(phi: number, phiScale: number): THREE.Color {
  // Normalize to [-1, 1] range using the scale
  const t = Math.max(-1, Math.min(1, phi / phiScale));

  if (t < 0) {
    // Blue to white for negative phi
    return SOLID_COLOR.clone().lerp(SURFACE_COLOR, t + 1);
  } else {
    // White to orange for positive phi
    return SURFACE_COLOR.clone().lerp(EMPTY_COLOR, t);
  }
}

/**
 * Compute scale for phi normalization (95th percentile of |phi|).
 */
function computePhiScale(samples: SamplePoint[]): number {
  if (samples.length === 0) return 1.0;

  const absPhiValues = samples
    .map((s) => Math.abs(s.phi))
    .sort((a, b) => a - b);
  const p95Index = Math.floor(absPhiValues.length * 0.95);
  const p95 = absPhiValues[p95Index] || 1.0;

  // Ensure minimum scale to avoid division issues
  return Math.max(p95, 0.01);
}

export function SampleViewer({ projectId }: SampleViewerProps) {
  const showSamples = useProjectStore((s) => s.showSamples);

  const { data, isLoading } = useQuery({
    queryKey: ["samples", projectId],
    queryFn: () => getSamples(projectId),
    enabled: showSamples && !!projectId,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Build geometry from sample data
  const geometry = useMemo(() => {
    if (!data || data.samples.length === 0) return null;

    const samples = data.samples;
    const geo = new THREE.BufferGeometry();

    // Position buffer
    const positions = new Float32Array(samples.length * 3);
    for (let i = 0; i < samples.length; i++) {
      positions[i * 3] = samples[i].x;
      positions[i * 3 + 1] = samples[i].y;
      positions[i * 3 + 2] = samples[i].z;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Color buffer with continuous gradient
    const phiScale = computePhiScale(samples);
    const colors = new Float32Array(samples.length * 3);
    for (let i = 0; i < samples.length; i++) {
      const color = phiToColor(samples[i].phi, phiScale);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    geo.computeBoundingSphere();
    return geo;
  }, [data]);

  // Cleanup geometry on unmount
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  // Don't render if not visible or no data
  if (!showSamples || isLoading || !geometry) {
    return null;
  }

  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={0.03}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  );
}
