// ABOUTME: Hook for efficient point cloud raycasting using BVH acceleration
// ABOUTME: Builds spatial index from point positions for fast ray intersection

import { useMemo, useCallback } from "react";
import * as THREE from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";

// Extend THREE.BufferGeometry to include BVH methods
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export interface RayHit {
  point: THREE.Vector3;
  distance: number;
  pointIndex: number;
}

export interface UsePointCloudBVHResult {
  /** Cast a ray and find the nearest point intersection */
  raycast: (ray: THREE.Ray, threshold?: number) => RayHit | null;

  /** Cast multiple rays efficiently */
  raycastBatch: (rays: THREE.Ray[], threshold?: number) => (RayHit | null)[];

  /** Check if BVH is ready */
  isReady: boolean;
}

/**
 * Hook for efficient point cloud raycasting.
 *
 * Creates a spatial index from point positions for fast ray-point intersection.
 * Uses a simple spherical representation for each point to enable BVH-accelerated raycasting.
 *
 * @param positions Float32Array of point positions (x,y,z,x,y,z,...)
 * @param pointRadius Radius around each point for intersection testing
 */
export function usePointCloudBVH(
  positions: Float32Array | null,
  pointRadius: number = 0.02,
): UsePointCloudBVHResult {
  // Build BVH mesh from point positions
  // We create a simple mesh with small spheres at each point position
  const { mesh, geometry, pointCount } = useMemo(() => {
    if (!positions || positions.length === 0) {
      return { mesh: null, geometry: null, pointCount: 0 };
    }

    const count = positions.length / 3;

    // For efficient BVH raycasting, we create a mesh where each point
    // is represented by a small tetrahedron (4 triangles, 12 indices per point)
    // This allows the BVH to accelerate spatial queries

    // Create geometry for a single point "marker" - a small tetrahedron
    const markerVertices = new Float32Array(count * 4 * 3); // 4 vertices per point
    const markerIndices: number[] = [];

    const tetraSize = pointRadius;

    for (let i = 0; i < count; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      // Create tetrahedron vertices around the point
      const baseIdx = i * 4;
      const vertexOffset = i * 12;

      // Top vertex
      markerVertices[vertexOffset + 0] = px;
      markerVertices[vertexOffset + 1] = py + tetraSize;
      markerVertices[vertexOffset + 2] = pz;

      // Base vertices (equilateral triangle in XZ plane)
      const angle1 = 0;
      const angle2 = (2 * Math.PI) / 3;
      const angle3 = (4 * Math.PI) / 3;

      markerVertices[vertexOffset + 3] = px + tetraSize * Math.cos(angle1);
      markerVertices[vertexOffset + 4] = py - tetraSize * 0.5;
      markerVertices[vertexOffset + 5] = pz + tetraSize * Math.sin(angle1);

      markerVertices[vertexOffset + 6] = px + tetraSize * Math.cos(angle2);
      markerVertices[vertexOffset + 7] = py - tetraSize * 0.5;
      markerVertices[vertexOffset + 8] = pz + tetraSize * Math.sin(angle2);

      markerVertices[vertexOffset + 9] = px + tetraSize * Math.cos(angle3);
      markerVertices[vertexOffset + 10] = py - tetraSize * 0.5;
      markerVertices[vertexOffset + 11] = pz + tetraSize * Math.sin(angle3);

      // Create indices for 4 triangular faces
      // Face 1: top-base1-base2
      markerIndices.push(baseIdx, baseIdx + 1, baseIdx + 2);
      // Face 2: top-base2-base3
      markerIndices.push(baseIdx, baseIdx + 2, baseIdx + 3);
      // Face 3: top-base3-base1
      markerIndices.push(baseIdx, baseIdx + 3, baseIdx + 1);
      // Face 4: base1-base3-base2 (bottom)
      markerIndices.push(baseIdx + 1, baseIdx + 3, baseIdx + 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(markerVertices, 3));
    geo.setIndex(markerIndices);

    // Store point index for each face (4 faces per point)
    const pointIndices = new Float32Array(count * 4 * 3);
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < 12; j++) {
        pointIndices[i * 12 + j] = i;
      }
    }
    geo.setAttribute("pointIndex", new THREE.BufferAttribute(pointIndices, 1));

    // Build BVH
    geo.computeBoundsTree();

    const material = new THREE.MeshBasicMaterial();
    const m = new THREE.Mesh(geo, material);

    return { mesh: m, geometry: geo, pointCount: count };
  }, [positions, pointRadius]);

  // Raycaster for intersection tests
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const raycast = useCallback(
    (ray: THREE.Ray, threshold?: number): RayHit | null => {
      if (!mesh || !geometry) return null;

      raycaster.ray.copy(ray);
      if (threshold !== undefined) {
        raycaster.params.Points = { threshold };
      }

      const intersects = raycaster.intersectObject(mesh, false);

      if (intersects.length === 0) return null;

      // Find the closest intersection
      const closest = intersects[0];

      // Get the point index from the face
      // Each point has 4 faces, so faceIndex / 4 gives us the point index
      const faceIndex = closest.faceIndex ?? 0;
      const pointIndex = Math.floor(faceIndex / 4);

      // Get the actual point position
      const point = new THREE.Vector3(
        positions![pointIndex * 3],
        positions![pointIndex * 3 + 1],
        positions![pointIndex * 3 + 2],
      );

      // Calculate distance from ray origin to the point (not to the tetrahedron surface)
      const distance = ray.origin.distanceTo(point);

      return {
        point,
        distance,
        pointIndex,
      };
    },
    [mesh, geometry, raycaster, positions],
  );

  const raycastBatch = useCallback(
    (rays: THREE.Ray[], threshold?: number): (RayHit | null)[] => {
      return rays.map((ray) => raycast(ray, threshold));
    },
    [raycast],
  );

  return {
    raycast,
    raycastBatch,
    isReady: mesh !== null && pointCount > 0,
  };
}

/**
 * Alternative simpler implementation using THREE.Points directly.
 * Less efficient but simpler and works well for smaller point clouds.
 */
export function useSimplePointCloudRaycast(
  positions: Float32Array | null,
  threshold: number = 0.05,
) {
  const { points, raycaster } = useMemo(() => {
    if (!positions || positions.length === 0) {
      return { points: null, raycaster: null };
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({ size: 0.01 });
    const p = new THREE.Points(geometry, material);

    const r = new THREE.Raycaster();
    r.params.Points = { threshold };

    return { points: p, raycaster: r };
  }, [positions, threshold]);

  const raycast = useCallback(
    (ray: THREE.Ray): RayHit | null => {
      if (!points || !raycaster) return null;

      raycaster.ray.copy(ray);
      const intersects = raycaster.intersectObject(points, false);

      if (intersects.length === 0) return null;

      const closest = intersects[0];
      return {
        point: closest.point.clone(),
        distance: closest.distance,
        pointIndex: closest.index ?? 0,
      };
    },
    [points, raycaster],
  );

  return {
    raycast,
    isReady: points !== null,
  };
}
