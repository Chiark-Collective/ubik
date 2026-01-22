// ABOUTME: Visualization for selection tools (brush sphere, box, etc.)
// ABOUTME: Renders semi-transparent volumes for active selection mode

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { useProjectStore } from "../../stores/projectStore";
import { useLabelStore } from "../../stores/labelStore";

export function SelectionVolume() {
  const mode = useProjectStore((s) => s.mode);
  const activeLabel = useProjectStore((s) => s.activeLabel);
  const brushRadius = useProjectStore((s) => s.brushRadius);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

  const constraints = useLabelStore((s) =>
    currentProjectId ? s.getConstraints(currentProjectId) : [],
  );

  // Get color based on active label
  const labelColor = activeLabel === "solid" ? "#3b82f6" : "#f97316";

  return (
    <group>
      {/* Brush sphere (shown in brush mode) */}
      {mode === "brush" && (
        <BrushSphere radius={brushRadius} color={labelColor} />
      )}

      {/* Render constraint visualizations */}
      {constraints.map((constraint) => {
        const color = constraint.sign === "solid" ? "#3b82f6" : "#f97316";

        switch (constraint.type) {
          case "box":
            return (
              <BoxVolume
                key={constraint.id}
                center={constraint.center}
                halfExtents={constraint.halfExtents}
                color={color}
              />
            );
          case "sphere":
            return (
              <SphereVolume
                key={constraint.id}
                center={constraint.center}
                radius={constraint.radius}
                color={color}
              />
            );
          case "halfspace":
            return (
              <HalfspaceVolume
                key={constraint.id}
                point={constraint.point}
                normal={constraint.normal}
                color={color}
              />
            );
          default:
            return null;
        }
      })}
    </group>
  );
}

interface BrushSphereProps {
  radius: number;
  color: string;
}

function BrushSphere({ radius, color }: BrushSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Follow mouse position (simplified - would need raycasting)
  useFrame(({ mouse, camera }) => {
    if (!meshRef.current) return;

    // Project mouse to 3D space at a fixed distance
    const vec = new THREE.Vector3(mouse.x, mouse.y, 0.5);
    vec.unproject(camera);
    vec.sub(camera.position).normalize();
    const distance = 5;
    vec.multiplyScalar(distance).add(camera.position);

    meshRef.current.position.copy(vec);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={0.3} wireframe />
    </mesh>
  );
}

interface BoxVolumeProps {
  center: [number, number, number];
  halfExtents: [number, number, number];
  color: string;
}

function BoxVolume({ center, halfExtents, color }: BoxVolumeProps) {
  return (
    <mesh position={center}>
      <boxGeometry
        args={[halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2]}
      />
      <meshBasicMaterial color={color} transparent opacity={0.2} />
      <lineSegments>
        <edgesGeometry
          args={[
            new THREE.BoxGeometry(
              halfExtents[0] * 2,
              halfExtents[1] * 2,
              halfExtents[2] * 2,
            ),
          ]}
        />
        <lineBasicMaterial color={color} />
      </lineSegments>
    </mesh>
  );
}

interface SphereVolumeProps {
  center: [number, number, number];
  radius: number;
  color: string;
}

function SphereVolume({ center, radius, color }: SphereVolumeProps) {
  return (
    <mesh position={center}>
      <sphereGeometry args={[radius, 32, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.2} />
    </mesh>
  );
}

interface HalfspaceVolumeProps {
  point: [number, number, number];
  normal: [number, number, number];
  color: string;
}

function HalfspaceVolume({ point, normal, color }: HalfspaceVolumeProps) {
  // Visualize as a plane with arrow indicating normal direction
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 0, 1);
  const normalVec = new THREE.Vector3(...normal).normalize();
  quaternion.setFromUnitVectors(up, normalVec);

  return (
    <group position={point} quaternion={quaternion}>
      {/* Plane */}
      <mesh>
        <planeGeometry args={[10, 10]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Normal arrow */}
      <arrowHelper
        args={[
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(0, 0, 0),
          1,
          color,
          0.2,
          0.1,
        ]}
      />
    </group>
  );
}
