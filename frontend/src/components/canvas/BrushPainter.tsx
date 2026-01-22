// ABOUTME: 3D brush painter for creating volumetric stroke constraints
// ABOUTME: Paints tube-like regions in 3D space for SDF training

import { useRef, useCallback, useState, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { useProjectStore } from "../../stores/projectStore";
import {
  useLabelStore,
  type BrushStrokeConstraint,
} from "../../stores/labelStore";

const COLORS = {
  solid: "#3b82f6",
  empty: "#f97316",
  surface: "#22c55e",
};

interface BrushPainterProps {
  projectId: string;
  depthAware: boolean;
}

export function BrushPainter({
  projectId,
  depthAware: _depthAware,
}: BrushPainterProps) {
  const mode = useProjectStore((s) => s.mode);
  const activeLabel = useProjectStore((s) => s.activeLabel);
  const brushRadius = useProjectStore((s) => s.brushRadius);

  const addConstraint = useLabelStore((s) => s.addConstraint);
  const constraints = useLabelStore((s) => s.getConstraints(projectId));

  const { camera, raycaster, pointer, gl } = useThree();

  const [brushPosition, setBrushPosition] = useState<
    [number, number, number] | null
  >(null);
  const [isPainting, setIsPainting] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<
    [number, number, number][]
  >([]);
  const brushRef = useRef<THREE.Mesh>(null);

  const isActive = mode === "brush";

  // Ground plane for raycasting (XZ plane at Y=0)
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersectPoint = useRef(new THREE.Vector3());

  // Minimum distance between stroke points to avoid overdense paths
  const MIN_STROKE_POINT_DISTANCE = 0.05;

  // Update brush position on mouse move
  useFrame(() => {
    if (!isActive) {
      setBrushPosition(null);
      return;
    }

    raycaster.setFromCamera(pointer, camera);

    if (
      raycaster.ray.intersectPlane(groundPlane.current, intersectPoint.current)
    ) {
      const newPos: [number, number, number] = [
        intersectPoint.current.x,
        intersectPoint.current.y,
        intersectPoint.current.z,
      ];
      setBrushPosition(newPos);

      // Add point to stroke if painting and moved enough distance
      if (isPainting && currentStroke.length > 0) {
        const last = currentStroke[currentStroke.length - 1];
        const dx = newPos[0] - last[0];
        const dy = newPos[1] - last[1];
        const dz = newPos[2] - last[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist >= MIN_STROKE_POINT_DISTANCE) {
          setCurrentStroke((prev) => [...prev, newPos]);
        }
      }
    }
  });

  // Handle start painting
  const handleStartPaint = useCallback(() => {
    if (!brushPosition || !isActive) return;
    setIsPainting(true);
    setCurrentStroke([brushPosition]);
  }, [brushPosition, isActive]);

  // Handle stop painting - create constraint
  const handleStopPaint = useCallback(() => {
    if (!isPainting) return;
    setIsPainting(false);

    // Only create constraint if stroke has enough points
    if (currentStroke.length >= 2) {
      const constraint: BrushStrokeConstraint = {
        id: crypto.randomUUID(),
        type: "brush_stroke",
        sign: activeLabel,
        weight: 1.0,
        createdAt: Date.now(),
        strokePoints: currentStroke,
        radius: brushRadius,
      };

      addConstraint(projectId, constraint);
    }

    setCurrentStroke([]);
  }, [
    isPainting,
    currentStroke,
    activeLabel,
    brushRadius,
    addConstraint,
    projectId,
  ]);

  // Mouse event handlers
  useEffect(() => {
    if (!isActive) return;

    const canvas = gl.domElement;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        handleStartPaint();
      }
    };

    const handleMouseUp = () => {
      handleStopPaint();
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mouseup", handleMouseUp);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isActive, handleStartPaint, handleStopPaint, gl.domElement]);

  // Keyboard handler for Escape to cancel current stroke
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPainting(false);
        setCurrentStroke([]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive]);

  // Get brush stroke constraints for this project
  const brushStrokes = constraints.filter(
    (c): c is BrushStrokeConstraint => c.type === "brush_stroke",
  );

  if (!isActive && brushStrokes.length === 0) return null;

  const color = COLORS[activeLabel];

  return (
    <group>
      {/* Brush cursor (only when active) */}
      {isActive && brushPosition && (
        <>
          {/* Brush sphere */}
          <mesh ref={brushRef} position={brushPosition}>
            <sphereGeometry args={[brushRadius, 32, 32]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={isPainting ? 0.4 : 0.2}
              wireframe={!isPainting}
            />
          </mesh>

          {/* Brush outline */}
          <mesh position={brushPosition}>
            <sphereGeometry args={[brushRadius, 16, 16]} />
            <meshBasicMaterial
              color={color}
              wireframe
              transparent
              opacity={0.6}
            />
          </mesh>
        </>
      )}

      {/* Current stroke being painted */}
      {currentStroke.length > 0 && (
        <StrokeVisualization
          points={currentStroke}
          radius={brushRadius}
          color={color}
          opacity={0.5}
        />
      )}

      {/* Existing brush stroke constraints */}
      {brushStrokes.map((stroke) => (
        <StrokeVisualization
          key={stroke.id}
          points={stroke.strokePoints}
          radius={stroke.radius}
          color={COLORS[stroke.sign]}
          opacity={0.3}
        />
      ))}
    </group>
  );
}

interface StrokeVisualizationProps {
  points: [number, number, number][];
  radius: number;
  color: string;
  opacity: number;
}

function StrokeVisualization({
  points,
  radius,
  color,
  opacity,
}: StrokeVisualizationProps) {
  if (points.length === 0) return null;

  return (
    <group>
      {/* Render spheres at each stroke point */}
      {points.map((point, index) => (
        <mesh key={index} position={point}>
          <sphereGeometry args={[radius, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} />
        </mesh>
      ))}

      {/* Render connecting cylinders between points for smoother visualization */}
      {points.slice(0, -1).map((point, index) => {
        const nextPoint = points[index + 1];
        return (
          <StrokeSegment
            key={`seg-${index}`}
            start={point}
            end={nextPoint}
            radius={radius}
            color={color}
            opacity={opacity}
          />
        );
      })}
    </group>
  );
}

interface StrokeSegmentProps {
  start: [number, number, number];
  end: [number, number, number];
  radius: number;
  color: string;
  opacity: number;
}

function StrokeSegment({
  start,
  end,
  radius,
  color,
  opacity,
}: StrokeSegmentProps) {
  const startVec = new THREE.Vector3(...start);
  const endVec = new THREE.Vector3(...end);

  const direction = new THREE.Vector3().subVectors(endVec, startVec);
  const length = direction.length();

  if (length < 0.001) return null;

  // Position at midpoint
  const midpoint = new THREE.Vector3()
    .addVectors(startVec, endVec)
    .multiplyScalar(0.5);

  // Calculate rotation to align cylinder with direction
  const up = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(up, direction.normalize());

  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 8]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}
