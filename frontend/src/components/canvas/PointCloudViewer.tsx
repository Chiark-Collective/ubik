// ABOUTME: React Three Fiber point cloud viewer with LOD streaming
// ABOUTME: Renders octree tiles based on camera distance for performance

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import * as THREE from "three";

import {
  getOctreeMetadata,
  getTile,
  type OctreeMetadata,
  type TileData,
} from "../../services/api";
import { useProjectStore } from "../../stores/projectStore";

// Label colors matching CSS
const LABEL_COLORS = {
  unlabeled: new THREE.Color(0x9ca3af),
  solid: new THREE.Color(0x3b82f6),
  empty: new THREE.Color(0xf97316),
  surface: new THREE.Color(0x22c55e),
};

interface PointCloudViewerProps {
  projectId: string;
}

export function PointCloudViewer({ projectId }: PointCloudViewerProps) {
  const { camera } = useThree();
  const setVisiblePointCount = useProjectStore((s) => s.setVisiblePointCount);
  const setTotalPointCount = useProjectStore((s) => s.setTotalPointCount);
  const setPointCloudLoaded = useProjectStore((s) => s.setPointCloudLoaded);
  const setPointCloudPositions = useProjectStore(
    (s) => s.setPointCloudPositions,
  );

  // Fetch octree metadata
  const {
    data: metadata,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["octree-metadata", projectId],
    queryFn: () => getOctreeMetadata(projectId),
    staleTime: Infinity,
  });

  // Track loaded tiles
  const [loadedTiles, setLoadedTiles] = useState<Map<string, TileData>>(
    new Map(),
  );
  const [visibleNodes, setVisibleNodes] = useState<Set<string>>(new Set());

  // Clear loaded tiles when metadata changes (new scenario/point cloud)
  useEffect(() => {
    setLoadedTiles(new Map());
    setVisibleNodes(new Set());
  }, [metadata]);

  // Update total point count when metadata loads
  useEffect(() => {
    if (metadata) {
      setTotalPointCount(metadata.total_points);
      setPointCloudLoaded(true);
    }
    return () => setPointCloudLoaded(false);
  }, [metadata, setTotalPointCount, setPointCloudLoaded]);

  // LOD selection based on camera position
  useFrame(() => {
    if (!metadata) return;

    const newVisible = selectVisibleNodes(metadata, camera);

    // Only update if changed
    if (!setsEqual(newVisible, visibleNodes)) {
      setVisibleNodes(newVisible);

      // Load missing tiles
      for (const nodeId of newVisible) {
        if (!loadedTiles.has(nodeId)) {
          loadTile(
            projectId,
            metadata.nodes[nodeId],
            loadedTiles,
            setLoadedTiles,
          );
        }
      }
    }
  });

  // Update visible point count
  useEffect(() => {
    let count = 0;
    for (const nodeId of visibleNodes) {
      const tile = loadedTiles.get(nodeId);
      if (tile) {
        count += tile.point_count;
      }
    }
    setVisiblePointCount(count);
  }, [visibleNodes, loadedTiles, setVisiblePointCount]);

  // Consolidate all loaded tile positions for brush/seed tools
  useEffect(() => {
    if (loadedTiles.size === 0) {
      setPointCloudPositions(null);
      return;
    }

    // Calculate total points
    let totalPoints = 0;
    for (const tile of loadedTiles.values()) {
      totalPoints += tile.point_count;
    }

    // Consolidate all positions into a single array
    const consolidated = new Float32Array(totalPoints * 3);
    let offset = 0;
    for (const tile of loadedTiles.values()) {
      consolidated.set(tile.positions, offset);
      offset += tile.positions.length;
    }

    setPointCloudPositions(consolidated);
  }, [loadedTiles, setPointCloudPositions]);

  if (isLoading) {
    return null;
  }

  if (error) {
    console.error("Failed to load point cloud:", error);
    return null;
  }

  if (!metadata) {
    return null;
  }

  return (
    <group>
      {Array.from(visibleNodes).map((nodeId) => {
        const tile = loadedTiles.get(nodeId);
        if (!tile) return null;
        return <TilePoints key={nodeId} tile={tile} />;
      })}
    </group>
  );
}

interface TilePointsProps {
  tile: TileData;
}

function TilePoints({ tile }: TilePointsProps) {
  const pointsRef = useRef<THREE.Points>(null);

  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    // Positions
    const positions = new Float32Array(tile.positions);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Colors based on labels
    const colors = new Float32Array(tile.point_count * 3);
    for (let i = 0; i < tile.point_count; i++) {
      const label = tile.labels?.[i] ?? 0;
      let color: THREE.Color;
      switch (label) {
        case 1:
          color = LABEL_COLORS.solid;
          break;
        case 2:
          color = LABEL_COLORS.empty;
          break;
        case 3:
          color = LABEL_COLORS.surface;
          break;
        default:
          color = LABEL_COLORS.unlabeled;
      }
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    geo.computeBoundingSphere();

    const mat = new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: true,
      sizeAttenuation: true,
    });

    return { geometry: geo, material: mat };
  }, [tile]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

// LOD selection algorithm
function selectVisibleNodes(
  metadata: OctreeMetadata,
  camera: THREE.Camera,
  minPointPixelSize = 2,
): Set<string> {
  const visible = new Set<string>();

  // Get viewport dimensions
  const renderer = (camera as any).userData?.renderer;
  const height = renderer?.domElement?.height ?? 800;

  const queue = [metadata.root_id];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = metadata.nodes[nodeId];

    if (!node) continue;

    // Compute screen-space error
    const center = new THREE.Vector3(
      (node.bounds_low[0] + node.bounds_high[0]) / 2,
      (node.bounds_low[1] + node.bounds_high[1]) / 2,
      (node.bounds_low[2] + node.bounds_high[2]) / 2,
    );

    const distance = camera.position.distanceTo(center);
    const nodeSize = Math.max(
      node.bounds_high[0] - node.bounds_low[0],
      node.bounds_high[1] - node.bounds_low[1],
      node.bounds_high[2] - node.bounds_low[2],
    );

    // Project node size to screen space
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
    const projectedSize =
      (nodeSize / distance) * (height / (2 * Math.tan((fov * Math.PI) / 360)));

    // Compute error per point
    const errorPerPoint = projectedSize / Math.max(node.point_count, 1);

    // Decide whether to use this node or recurse
    if (errorPerPoint < minPointPixelSize || node.children.length === 0) {
      visible.add(nodeId);
    } else {
      queue.push(...node.children);
    }
  }

  return visible;
}

// Async tile loader
async function loadTile(
  projectId: string,
  node: { node_id: string; level: number },
  loadedTiles: Map<string, TileData>,
  setLoadedTiles: (
    fn: (prev: Map<string, TileData>) => Map<string, TileData>,
  ) => void,
) {
  if (loadedTiles.has(node.node_id)) return;

  try {
    // Parse node_id to get coordinates
    // Format: "r" for root, "r0", "r01", etc. for children
    const nodeId = node.node_id;
    let x = 0,
      y = 0,
      z = 0;
    for (let i = 1; i < nodeId.length; i++) {
      const octant = parseInt(nodeId[i], 10);
      const shift = nodeId.length - i - 1;
      x |= (octant & 1) << shift;
      y |= ((octant >> 1) & 1) << shift;
      z |= ((octant >> 2) & 1) << shift;
    }

    const tile = await getTile(projectId, node.level, x, y, z);
    setLoadedTiles((prev) => {
      const next = new Map(prev);
      next.set(node.node_id, tile);
      return next;
    });
  } catch (err) {
    console.error(`Failed to load tile ${node.node_id}:`, err);
  }
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
