// ABOUTME: Pocket detector for visualizing and selecting detected cavities
// ABOUTME: Renders pocket boundaries and handles pocket selection/toggle

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { useProjectStore } from "../../stores/projectStore";
import { useLabelStore, type PocketConstraint } from "../../stores/labelStore";
import { usePocketStore, type PocketInfo } from "../../stores/pocketStore";

const COLORS = {
  solid: "#3b82f6",
  empty: "#f97316",
  surface: "#22c55e",
  hover: "#fbbf24", // Yellow for hover
  selected: "#a855f7", // Purple for selected
};

interface PocketDetectorProps {
  projectId: string;
}

export function PocketDetector({ projectId }: PocketDetectorProps) {
  const mode = useProjectStore((s) => s.mode);

  const addConstraint = useLabelStore((s) => s.addConstraint);
  const constraints = useLabelStore((s) => s.getConstraints(projectId));

  const analysis = usePocketStore((s) => s.analysis);
  const selectedPocketId = usePocketStore((s) => s.selectedPocketId);
  const hoveredPocketId = usePocketStore((s) => s.hoveredPocketId);
  const setSelectedPocketId = usePocketStore((s) => s.setSelectedPocketId);
  const setHoveredPocketId = usePocketStore((s) => s.setHoveredPocketId);
  const isPocketSolid = usePocketStore((s) => s.isPocketSolid);
  const togglePocket = usePocketStore((s) => s.togglePocket);

  const { camera, raycaster, pointer, gl } = useThree();

  const isActive = mode === "click_pocket";

  // Create meshes for each pocket for raycasting
  const pocketMeshes = useMemo(() => {
    if (!analysis?.pockets) return [];

    return analysis.pockets.map((pocket) => {
      // Create a box mesh at the pocket bounds for selection
      const size = [
        pocket.boundsHigh[0] - pocket.boundsLow[0],
        pocket.boundsHigh[1] - pocket.boundsLow[1],
        pocket.boundsHigh[2] - pocket.boundsLow[2],
      ] as [number, number, number];

      const center = [
        (pocket.boundsLow[0] + pocket.boundsHigh[0]) / 2,
        (pocket.boundsLow[1] + pocket.boundsHigh[1]) / 2,
        (pocket.boundsLow[2] + pocket.boundsHigh[2]) / 2,
      ] as [number, number, number];

      const geometry = new THREE.BoxGeometry(...size);
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...center);
      mesh.userData.pocketId = pocket.pocketId;

      return { mesh, pocket };
    });
  }, [analysis?.pockets]);

  // Add meshes to scene for raycasting
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!groupRef.current) return;

    pocketMeshes.forEach(({ mesh }) => {
      groupRef.current!.add(mesh);
    });

    return () => {
      pocketMeshes.forEach(({ mesh }) => {
        groupRef.current?.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
    };
  }, [pocketMeshes]);

  // Handle hover detection
  useFrame(() => {
    if (!isActive || !groupRef.current || pocketMeshes.length === 0) {
      if (hoveredPocketId !== null) {
        setHoveredPocketId(null);
      }
      return;
    }

    raycaster.setFromCamera(pointer, camera);
    const meshes = pocketMeshes.map((p) => p.mesh);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const pocketId = intersects[0].object.userData.pocketId as number;
      if (pocketId !== hoveredPocketId) {
        setHoveredPocketId(pocketId);
      }
    } else {
      if (hoveredPocketId !== null) {
        setHoveredPocketId(null);
      }
    }
  });

  // Handle click to select/toggle pocket
  const handleClick = useCallback(() => {
    if (!isActive || hoveredPocketId === null) return;

    if (selectedPocketId === hoveredPocketId) {
      // Already selected, toggle the pocket
      togglePocket(hoveredPocketId);

      // Create constraint
      const pocket = analysis?.pockets.find(
        (p) => p.pocketId === hoveredPocketId,
      );
      if (pocket) {
        const isSolid = isPocketSolid(hoveredPocketId);
        const constraint: PocketConstraint = {
          id: crypto.randomUUID(),
          type: "pocket",
          sign: isSolid ? "solid" : "empty",
          weight: 1.0,
          createdAt: Date.now(),
          pocketId: pocket.pocketId,
          voxelCount: pocket.voxelCount,
          centroid: pocket.centroid,
          boundsLow: pocket.boundsLow,
          boundsHigh: pocket.boundsHigh,
          volumeEstimate: pocket.volumeEstimate,
        };
        addConstraint(projectId, constraint);
      }
    } else {
      // Select the pocket
      setSelectedPocketId(hoveredPocketId);
    }
  }, [
    isActive,
    hoveredPocketId,
    selectedPocketId,
    togglePocket,
    analysis?.pockets,
    isPocketSolid,
    addConstraint,
    projectId,
    setSelectedPocketId,
  ]);

  // Mouse event handlers
  useEffect(() => {
    if (!isActive) return;

    const canvas = gl.domElement;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        handleClick();
      }
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    return () => canvas.removeEventListener("mousedown", handleMouseDown);
  }, [isActive, handleClick, gl.domElement]);

  // Get pocket constraints for this project
  const pocketConstraints = constraints.filter(
    (c): c is PocketConstraint => c.type === "pocket",
  );

  // Don't render anything if not in pocket mode and no constraints
  if (!isActive && pocketConstraints.length === 0) return null;

  const pockets = analysis?.pockets ?? [];

  return (
    <group ref={groupRef}>
      {/* Render pocket visualizations */}
      {pockets.map((pocket) => (
        <PocketVisualization
          key={pocket.pocketId}
          pocket={pocket}
          isHovered={hoveredPocketId === pocket.pocketId}
          isSelected={selectedPocketId === pocket.pocketId}
          isSolid={isPocketSolid(pocket.pocketId)}
          isActive={isActive}
        />
      ))}

      {/* Render existing pocket constraints (when mode is inactive) */}
      {!isActive &&
        pocketConstraints.map((constraint) => (
          <PocketConstraintVisualization
            key={constraint.id}
            constraint={constraint}
          />
        ))}
    </group>
  );
}

interface PocketVisualizationProps {
  pocket: PocketInfo;
  isHovered: boolean;
  isSelected: boolean;
  isSolid: boolean;
  isActive: boolean;
}

function PocketVisualization({
  pocket,
  isHovered,
  isSelected,
  isSolid,
  isActive,
}: PocketVisualizationProps) {
  const size = [
    pocket.boundsHigh[0] - pocket.boundsLow[0],
    pocket.boundsHigh[1] - pocket.boundsLow[1],
    pocket.boundsHigh[2] - pocket.boundsLow[2],
  ] as [number, number, number];

  const center = [
    (pocket.boundsLow[0] + pocket.boundsHigh[0]) / 2,
    (pocket.boundsLow[1] + pocket.boundsHigh[1]) / 2,
    (pocket.boundsLow[2] + pocket.boundsHigh[2]) / 2,
  ] as [number, number, number];

  // Determine color based on state
  let color = isSolid ? COLORS.solid : COLORS.empty;
  let opacity = 0.15;

  if (isActive) {
    if (isSelected) {
      color = COLORS.selected;
      opacity = 0.4;
    } else if (isHovered) {
      color = COLORS.hover;
      opacity = 0.3;
    }
  }

  return (
    <group position={center}>
      {/* Filled box */}
      <mesh>
        <boxGeometry args={size} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Wireframe outline */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(...size)]} />
        <lineBasicMaterial
          color={color}
          transparent
          opacity={isActive ? 0.8 : 0.4}
        />
      </lineSegments>

      {/* Centroid marker */}
      <mesh
        position={[
          pocket.centroid[0] - center[0],
          pocket.centroid[1] - center[1],
          pocket.centroid[2] - center[2],
        ]}
      >
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

interface PocketConstraintVisualizationProps {
  constraint: PocketConstraint;
}

function PocketConstraintVisualization({
  constraint,
}: PocketConstraintVisualizationProps) {
  const size = [
    constraint.boundsHigh[0] - constraint.boundsLow[0],
    constraint.boundsHigh[1] - constraint.boundsLow[1],
    constraint.boundsHigh[2] - constraint.boundsLow[2],
  ] as [number, number, number];

  const center = [
    (constraint.boundsLow[0] + constraint.boundsHigh[0]) / 2,
    (constraint.boundsLow[1] + constraint.boundsHigh[1]) / 2,
    (constraint.boundsLow[2] + constraint.boundsHigh[2]) / 2,
  ] as [number, number, number];

  const color = constraint.sign === "solid" ? COLORS.solid : COLORS.empty;

  return (
    <group position={center}>
      {/* Filled box */}
      <mesh>
        <boxGeometry args={size} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Wireframe outline */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(...size)]} />
        <lineBasicMaterial color={color} transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}
