// ABOUTME: 3D component for placing and visualizing seed points
// ABOUTME: Shows seed markers and propagation preview

import { useRef, useCallback, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import { useProjectStore } from "../../stores/projectStore";
import type { SeedPoint } from "../modes/SeedMode";

const COLORS = {
  solid: "#3b82f6",
  empty: "#f97316",
  surface: "#22c55e",
  ghost: "#ffffff",
};

interface SeedPlacerProps {
  projectId: string;
  seeds: SeedPoint[];
  onAddSeed: (position: [number, number, number]) => void;
  propagationRadius: number;
}

export function SeedPlacer({
  projectId: _projectId,
  seeds,
  onAddSeed,
  propagationRadius,
}: SeedPlacerProps) {
  const mode = useProjectStore((s) => s.mode);
  const activeLabel = useProjectStore((s) => s.activeLabel);

  const { camera, raycaster, pointer } = useThree();

  const [ghostPosition, setGhostPosition] = useState<
    [number, number, number] | null
  >(null);

  // Ground plane for raycasting (XZ plane at Y=0, matching the click mesh)
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersectPoint = useRef(new THREE.Vector3());

  const isActive = mode === "seed";

  // Update ghost position on mouse move
  useFrame(() => {
    if (!isActive) {
      setGhostPosition(null);
      return;
    }

    raycaster.setFromCamera(pointer, camera);

    if (
      raycaster.ray.intersectPlane(groundPlane.current, intersectPoint.current)
    ) {
      setGhostPosition([
        intersectPoint.current.x,
        intersectPoint.current.y,
        intersectPoint.current.z,
      ]);
    }
  });

  // Handle click to place seed (called by invisible click plane)
  const handleClick = useCallback(() => {
    if (!isActive || !ghostPosition) return;
    onAddSeed(ghostPosition);
  }, [isActive, ghostPosition, onAddSeed]);

  if (!isActive) return null;

  const color = COLORS[activeLabel];

  return (
    <group>
      {/* Ghost seed preview */}
      {ghostPosition && (
        <group position={ghostPosition}>
          {/* Seed point marker */}
          <mesh>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshBasicMaterial color={COLORS.ghost} transparent opacity={0.5} />
          </mesh>

          {/* Propagation radius preview */}
          <mesh>
            <sphereGeometry args={[propagationRadius, 32, 32]} />
            <meshBasicMaterial
              color={COLORS.ghost}
              transparent
              opacity={0.1}
              wireframe
            />
          </mesh>
        </group>
      )}

      {/* Placed seeds */}
      {seeds.map((seed, index) => (
        <group key={index} position={seed.position}>
          {/* Seed point marker */}
          <mesh>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshBasicMaterial color={color} />
          </mesh>

          {/* Propagation radius indicator */}
          <mesh>
            <sphereGeometry args={[propagationRadius, 32, 32]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.15}
              wireframe
            />
          </mesh>

          {/* Seed label */}
          <Html position={[0, 0.2, 0]} center>
            <div className="px-1.5 py-0.5 bg-gray-900/90 rounded text-xs text-white whitespace-nowrap">
              Seed {index + 1}
            </div>
          </Html>
        </group>
      ))}

      {/* Invisible click plane */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleClick}
      >
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
