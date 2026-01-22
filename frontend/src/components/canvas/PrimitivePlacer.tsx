// ABOUTME: 3D component for placing and editing primitive constraints (box, sphere, cylinder, halfspace)
// ABOUTME: Uses TransformControls for interactive manipulation, with unified rendering for ghost/placing/existing states

import {
  useRef,
  useCallback,
  useEffect,
  useState,
  useMemo,
  forwardRef,
} from "react";
import { useThree, useFrame, type ThreeEvent } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";

import { useProjectStore, type LabelType } from "../../stores/projectStore";
import {
  usePrimitiveStore,
  type PlacingPrimitive,
} from "../../stores/primitiveStore";
import {
  useLabelStore,
  type BoxConstraint,
  type SphereConstraint,
  type HalfspaceConstraint,
  type CylinderConstraint,
  type Constraint,
} from "../../stores/labelStore";
import { useConstraintSync } from "../../hooks/useConstraintSync";

// =============================================================================
// Constants
// =============================================================================

const COLORS: Record<LabelType | "ghost", string> = {
  solid: "#3b82f6",
  empty: "#f97316",
  surface: "#22c55e",
  ghost: "#ffffff",
};

const OPACITY = {
  ghost: 0.2,
  placing: 0.4,
  existing: 0.3,
  selected: 0.5,
  halfspaceExisting: 0.35,
  halfspaceSelected: 0.5,
} as const;

const GEOMETRY = {
  sphereSegments: 32,
  cylinderSegments: 32,
  ghostSegments: 16,
  halfplaneSize: 10,
  clickPlaneSize: 1000,
  arrowLength: 2,
  arrowHeadLength: 0.4,
  arrowHeadWidth: 0.2,
} as const;

// =============================================================================
// Primitive Mesh Components
// =============================================================================

interface BaseMeshProps {
  color: string;
  opacity: number;
  position?: [number, number, number];
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

// BoxMesh - uses drei's Edges for outline
interface BoxMeshProps extends BaseMeshProps {
  halfExtents: [number, number, number];
  edgeColor?: string;
}

const BoxMesh = forwardRef<THREE.Mesh, BoxMeshProps>(
  ({ halfExtents, color, opacity, position, onClick }, ref) => {
    const [w, h, d] = halfExtents;

    const geometry = useMemo(
      () => new THREE.BoxGeometry(w * 2, h * 2, d * 2),
      [w, h, d],
    );

    useEffect(() => () => geometry.dispose(), [geometry]);

    // Plain mesh without children - TransformControls should work correctly
    return (
      <mesh ref={ref} geometry={geometry} position={position} onClick={onClick}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          wireframe={opacity < 0.3}
        />
      </mesh>
    );
  },
);
BoxMesh.displayName = "BoxMesh";

// SphereMesh
interface SphereMeshProps extends BaseMeshProps {
  radius: number;
  wireframe?: boolean;
}

const SphereMesh = forwardRef<THREE.Mesh, SphereMeshProps>(
  ({ radius, color, opacity, position, onClick, wireframe = false }, ref) => {
    const segments = wireframe
      ? GEOMETRY.ghostSegments
      : GEOMETRY.sphereSegments;

    const geometry = useMemo(
      () => new THREE.SphereGeometry(radius, segments, segments),
      [radius, segments],
    );

    useEffect(() => () => geometry.dispose(), [geometry]);

    return (
      <mesh ref={ref} geometry={geometry} position={position} onClick={onClick}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          wireframe={wireframe}
        />
      </mesh>
    );
  },
);
SphereMesh.displayName = "SphereMesh";

// CylinderMesh
interface CylinderMeshProps extends BaseMeshProps {
  radius: number;
  height: number;
  wireframe?: boolean;
}

const CylinderMesh = forwardRef<THREE.Mesh, CylinderMeshProps>(
  (
    { radius, height, color, opacity, position, onClick, wireframe = false },
    ref,
  ) => {
    const segments = wireframe
      ? GEOMETRY.ghostSegments
      : GEOMETRY.cylinderSegments;

    const geometry = useMemo(
      () => new THREE.CylinderGeometry(radius, radius, height, segments),
      [radius, height, segments],
    );

    useEffect(() => () => geometry.dispose(), [geometry]);

    return (
      <mesh ref={ref} geometry={geometry} position={position} onClick={onClick}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          wireframe={wireframe}
        />
      </mesh>
    );
  },
);
CylinderMesh.displayName = "CylinderMesh";

// HalfspaceMesh - plane with normal arrow
interface HalfspaceMeshProps extends Omit<BaseMeshProps, "onClick"> {
  normal: [number, number, number];
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

const HalfspaceMesh = forwardRef<THREE.Group, HalfspaceMeshProps>(
  ({ normal, color, opacity, position, onClick }, ref) => {
    return (
      <group ref={ref} position={position} onClick={onClick}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry
            args={[GEOMETRY.halfplaneSize, GEOMETRY.halfplaneSize]}
          />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <arrowHelper
          args={[
            new THREE.Vector3(...normal),
            new THREE.Vector3(0, 0, 0),
            GEOMETRY.arrowLength,
            color,
            GEOMETRY.arrowHeadLength,
            GEOMETRY.arrowHeadWidth,
          ]}
        />
      </group>
    );
  },
);
HalfspaceMesh.displayName = "HalfspaceMesh";

// =============================================================================
// Constraint Helpers
// =============================================================================

type Vec3 = [number, number, number];

type PrimitiveConstraint =
  | BoxConstraint
  | SphereConstraint
  | HalfspaceConstraint
  | CylinderConstraint;

function getConstraintPosition(constraint: PrimitiveConstraint): Vec3 {
  switch (constraint.type) {
    case "halfspace":
      return constraint.point;
    case "box":
    case "sphere":
    case "cylinder":
      return constraint.center;
  }
}

// Apply scale from TransformControls to constraint dimensions, then reset scale
function applyScaleToConstraint(
  constraint: PrimitiveConstraint,
  scale: THREE.Vector3,
  position: THREE.Vector3,
): Partial<PrimitiveConstraint> | null {
  const hasScaleChange = scale.x !== 1 || scale.y !== 1 || scale.z !== 1;
  const positionUpdate =
    constraint.type === "halfspace"
      ? { point: [position.x, position.y, position.z] as Vec3 }
      : { center: [position.x, position.y, position.z] as Vec3 };

  if (!hasScaleChange) {
    return positionUpdate;
  }

  switch (constraint.type) {
    case "box":
      return {
        ...positionUpdate,
        halfExtents: [
          constraint.halfExtents[0] * scale.x,
          constraint.halfExtents[1] * scale.y,
          constraint.halfExtents[2] * scale.z,
        ],
      };
    case "sphere":
      return {
        ...positionUpdate,
        radius: constraint.radius * scale.x,
      };
    case "cylinder":
      return {
        ...positionUpdate,
        radius: constraint.radius * scale.x,
        height: constraint.height * scale.y,
      };
    case "halfspace":
      return positionUpdate;
    default:
      return positionUpdate;
  }
}

// Apply scale from TransformControls to placing primitive dimensions
function applyScaleToPlacingPrimitive(
  primitive: PlacingPrimitive,
  scale: THREE.Vector3,
  position: THREE.Vector3,
): Partial<PlacingPrimitive> {
  const posUpdate: Partial<PlacingPrimitive> = {
    position: [position.x, position.y, position.z],
  };

  const hasScaleChange = scale.x !== 1 || scale.y !== 1 || scale.z !== 1;
  if (!hasScaleChange) {
    return posUpdate;
  }

  switch (primitive.type) {
    case "box":
      if (primitive.halfExtents) {
        return {
          ...posUpdate,
          halfExtents: [
            primitive.halfExtents[0] * scale.x,
            primitive.halfExtents[1] * scale.y,
            primitive.halfExtents[2] * scale.z,
          ],
        };
      }
      break;
    case "sphere":
      if (primitive.radius) {
        return { ...posUpdate, radius: primitive.radius * scale.x };
      }
      break;
    case "cylinder":
      if (primitive.radius && primitive.height) {
        return {
          ...posUpdate,
          radius: primitive.radius * scale.x,
          height: primitive.height * scale.y,
        };
      }
      break;
  }

  return posUpdate;
}

// =============================================================================
// TransformablePrimitive - Wraps any primitive with TransformControls
// =============================================================================

interface TransformablePrimitiveProps {
  meshRef: React.RefObject<THREE.Mesh | THREE.Group | null>;
  isActive: boolean;
  transformMode: "translate" | "rotate" | "scale";
  onTransformEnd: () => void;
  children: React.ReactNode;
}

function TransformablePrimitive({
  meshRef,
  isActive,
  transformMode,
  onTransformEnd,
  children,
}: TransformablePrimitiveProps) {
  const [meshReady, setMeshReady] = useState(false);

  // Track mesh mount state
  useEffect(() => {
    setMeshReady(!!meshRef.current);
  }, [meshRef]);

  // Also update on children change (in case mesh ref changes)
  useEffect(() => {
    const timer = setTimeout(() => setMeshReady(!!meshRef.current), 0);
    return () => clearTimeout(timer);
  }, [children, meshRef]);

  return (
    <group>
      {isActive && meshReady && meshRef.current && (
        <TransformControls
          object={meshRef.current}
          mode={transformMode}
          onMouseUp={onTransformEnd}
        />
      )}
      {children}
    </group>
  );
}

// =============================================================================
// PrimitiveRenderer - Unified rendering for any primitive state
// =============================================================================

type PrimitiveState = "ghost" | "placing" | "existing";

interface PrimitiveRendererProps {
  type: "box" | "sphere" | "halfspace" | "cylinder";
  position: Vec3;
  color: string;
  state: PrimitiveState;
  isSelected?: boolean;
  // Dimensions (type-specific)
  halfExtents?: Vec3;
  radius?: number;
  height?: number;
  normal?: Vec3;
  // Interactions
  meshRef?:
    | React.RefCallback<THREE.Mesh | THREE.Group | null>
    | React.RefObject<THREE.Mesh | THREE.Group | null>;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

function PrimitiveRenderer({
  type,
  position,
  color,
  state,
  isSelected = false,
  halfExtents,
  radius,
  height,
  normal,
  meshRef,
  onClick,
}: PrimitiveRendererProps) {
  const isGhost = state === "ghost";
  const opacity = isGhost
    ? OPACITY.ghost
    : state === "placing"
      ? OPACITY.placing
      : type === "halfspace"
        ? isSelected
          ? OPACITY.halfspaceSelected
          : OPACITY.halfspaceExisting
        : isSelected
          ? OPACITY.selected
          : OPACITY.existing;

  const edgeColor = isSelected ? "#ffffff" : color;

  switch (type) {
    case "box":
      if (!halfExtents) return null;
      return (
        <BoxMesh
          ref={meshRef as React.Ref<THREE.Mesh>}
          position={position}
          halfExtents={halfExtents}
          color={color}
          opacity={opacity}
          edgeColor={edgeColor}
          onClick={onClick}
        />
      );

    case "sphere":
      if (!radius) return null;
      return (
        <SphereMesh
          ref={meshRef as React.Ref<THREE.Mesh>}
          position={position}
          radius={radius}
          color={color}
          opacity={opacity}
          wireframe={isGhost}
          onClick={onClick}
        />
      );

    case "cylinder":
      if (!radius || !height) return null;
      return (
        <CylinderMesh
          ref={meshRef as React.Ref<THREE.Mesh>}
          position={position}
          radius={radius}
          height={height}
          color={color}
          opacity={opacity}
          wireframe={isGhost}
          onClick={onClick}
        />
      );

    case "halfspace":
      return (
        <HalfspaceMesh
          ref={meshRef as React.Ref<THREE.Group>}
          position={position}
          normal={normal || [0, 1, 0]}
          color={color}
          opacity={opacity}
          onClick={onClick}
        />
      );

    default:
      return null;
  }
}

// =============================================================================
// GhostPrimitive - Preview following mouse cursor
// =============================================================================

interface GhostPrimitiveProps {
  position: Vec3;
}

function GhostPrimitive({ position }: GhostPrimitiveProps) {
  const primitiveType = usePrimitiveStore((s) => s.primitiveType);
  const defaultSize = usePrimitiveStore((s) => s.defaultSize);

  const size = defaultSize / 2;

  return (
    <PrimitiveRenderer
      type={primitiveType}
      position={position}
      color={COLORS.ghost}
      state="ghost"
      halfExtents={[size, size, size]}
      radius={size}
      height={size * 2}
      normal={[0, 1, 0]}
    />
  );
}

// =============================================================================
// PlacingPrimitiveView - Primitive being placed with TransformControls
// =============================================================================

interface PlacingPrimitiveViewProps {
  primitive: PlacingPrimitive;
  label: LabelType;
  transformMode: "translate" | "rotate" | "scale";
  onUpdate: (updates: Partial<PlacingPrimitive>) => void;
}

function PlacingPrimitiveView({
  primitive,
  label,
  transformMode,
  onUpdate,
}: PlacingPrimitiveViewProps) {
  const meshRef = useRef<THREE.Mesh | THREE.Group | null>(null);

  const setMeshRef = useCallback((mesh: THREE.Mesh | THREE.Group | null) => {
    meshRef.current = mesh;
  }, []);

  const handleTransformEnd = useCallback(() => {
    if (!meshRef.current) return;

    const updates = applyScaleToPlacingPrimitive(
      primitive,
      meshRef.current.scale,
      meshRef.current.position,
    );

    onUpdate(updates);
    meshRef.current.scale.set(1, 1, 1);
  }, [primitive, onUpdate]);

  return (
    <TransformablePrimitive
      meshRef={meshRef}
      isActive={true}
      transformMode={transformMode}
      onTransformEnd={handleTransformEnd}
    >
      <PrimitiveRenderer
        type={primitive.type}
        position={primitive.position}
        color={COLORS[label]}
        state="placing"
        halfExtents={primitive.halfExtents}
        radius={primitive.radius}
        height={primitive.height}
        normal={primitive.normal}
        meshRef={setMeshRef}
      />
    </TransformablePrimitive>
  );
}

// =============================================================================
// ConstraintView - Existing constraint with optional TransformControls
// =============================================================================

interface ConstraintViewProps {
  constraint: PrimitiveConstraint;
  isSelected: boolean;
  transformMode: "translate" | "rotate" | "scale";
  onSelect: () => void;
  onUpdate: (updates: Partial<PrimitiveConstraint>) => void;
}

function ConstraintView({
  constraint,
  isSelected,
  transformMode,
  onSelect,
  onUpdate,
}: ConstraintViewProps) {
  const meshRef = useRef<THREE.Mesh | THREE.Group | null>(null);

  const handleTransformEnd = useCallback(() => {
    if (!meshRef.current || !isSelected) return;

    const updates = applyScaleToConstraint(
      constraint,
      meshRef.current.scale,
      meshRef.current.position,
    );

    if (updates) {
      onUpdate(updates);
    }

    meshRef.current.scale.set(1, 1, 1);
  }, [constraint, isSelected, onUpdate]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect();
    },
    [onSelect],
  );

  const position = getConstraintPosition(constraint);
  const color = COLORS[constraint.sign];

  // Extract type-specific properties
  const props = {
    halfExtents: constraint.type === "box" ? constraint.halfExtents : undefined,
    radius:
      constraint.type === "sphere" || constraint.type === "cylinder"
        ? constraint.radius
        : undefined,
    height: constraint.type === "cylinder" ? constraint.height : undefined,
    normal: constraint.type === "halfspace" ? constraint.normal : undefined,
  };

  return (
    <TransformablePrimitive
      meshRef={meshRef}
      isActive={isSelected}
      transformMode={transformMode}
      onTransformEnd={handleTransformEnd}
    >
      <PrimitiveRenderer
        type={constraint.type}
        position={position}
        color={color}
        state="existing"
        isSelected={isSelected}
        meshRef={meshRef}
        onClick={handleClick}
        {...props}
      />
    </TransformablePrimitive>
  );
}

// =============================================================================
// PrimitivePlacer - Main Component
// =============================================================================

interface PrimitivePlacerProps {
  projectId: string;
}

export function PrimitivePlacer({ projectId }: PrimitivePlacerProps) {
  const mode = useProjectStore((s) => s.mode);
  const activeLabel = useProjectStore((s) => s.activeLabel);

  const placingPrimitive = usePrimitiveStore((s) => s.placingPrimitive);
  const selectedConstraintId = usePrimitiveStore((s) => s.selectedConstraintId);
  const startPlacing = usePrimitiveStore((s) => s.startPlacing);
  const updatePlacing = usePrimitiveStore((s) => s.updatePlacing);
  const confirmPlacing = usePrimitiveStore((s) => s.confirmPlacing);
  const cancelPlacing = usePrimitiveStore((s) => s.cancelPlacing);
  const selectConstraint = usePrimitiveStore((s) => s.selectConstraint);
  const transformMode = usePrimitiveStore((s) => s.transformMode);
  const setTransformMode = usePrimitiveStore((s) => s.setTransformMode);

  const constraints = useLabelStore((s) => s.getConstraints(projectId));
  const addConstraint = useLabelStore((s) => s.addConstraint);
  const updateConstraint = useLabelStore((s) => s.updateConstraint);
  const removeConstraint = useLabelStore((s) => s.removeConstraint);

  const {
    createConstraint: syncConstraint,
    deleteConstraint: syncDeleteConstraint,
  } = useConstraintSync(projectId);

  const { camera, raycaster, pointer } = useThree();

  // Ghost primitive position (follows mouse)
  const [ghostPosition, setGhostPosition] = useState<Vec3 | null>(null);

  // Ground plane for raycasting (XZ plane at Y=0)
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersectPoint = useRef(new THREE.Vector3());

  // Cooldown after confirming a primitive to prevent accidental double-placement
  const lastConfirmTime = useRef<number>(0);
  const PLACEMENT_COOLDOWN_MS = 500;

  const isActive = mode === "primitive";

  // Update ghost position on mouse move
  useFrame(() => {
    if (!isActive || placingPrimitive || selectedConstraintId) {
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

  // Handle click to place primitive
  const handleClick = useCallback(
    (_event: THREE.Event) => {
      if (!isActive || placingPrimitive) return;

      // Prevent accidental double-placement with cooldown
      const now = Date.now();
      if (now - lastConfirmTime.current < PLACEMENT_COOLDOWN_MS) {
        return;
      }

      // Deselect any selected constraint first
      if (selectedConstraintId) {
        selectConstraint(null);
        return; // Just deselect, don't start placing
      }

      raycaster.setFromCamera(pointer, camera);
      if (
        raycaster.ray.intersectPlane(
          groundPlane.current,
          intersectPoint.current,
        )
      ) {
        startPlacing([
          intersectPoint.current.x,
          intersectPoint.current.y,
          intersectPoint.current.z,
        ]);
      }
    },
    [
      isActive,
      placingPrimitive,
      selectedConstraintId,
      selectConstraint,
      startPlacing,
      raycaster,
      pointer,
      camera,
    ],
  );

  // Handle confirm placement
  const handleConfirmPlacement = useCallback(() => {
    const primitive = confirmPlacing();
    if (!primitive) return;

    const baseConstraint = {
      id: crypto.randomUUID(),
      sign: activeLabel,
      weight: 1.0,
      createdAt: Date.now(),
    };

    let constraint: Constraint;

    switch (primitive.type) {
      case "box":
        constraint = {
          ...baseConstraint,
          type: "box",
          center: primitive.position,
          halfExtents: primitive.halfExtents!,
        } as BoxConstraint;
        break;
      case "sphere":
        constraint = {
          ...baseConstraint,
          type: "sphere",
          center: primitive.position,
          radius: primitive.radius!,
        } as SphereConstraint;
        break;
      case "halfspace":
        constraint = {
          ...baseConstraint,
          type: "halfspace",
          point: primitive.position,
          normal: primitive.normal!,
        } as HalfspaceConstraint;
        break;
      case "cylinder":
        constraint = {
          ...baseConstraint,
          type: "cylinder",
          center: primitive.position,
          axis: [0, 0, 1],
          radius: primitive.radius!,
          height: primitive.height!,
        } as CylinderConstraint;
        break;
      default:
        return;
    }

    addConstraint(projectId, constraint);
    syncConstraint(constraint);

    // Set cooldown to prevent accidental immediate re-placement
    lastConfirmTime.current = Date.now();
  }, [confirmPlacing, activeLabel, addConstraint, projectId, syncConstraint]);

  // Keyboard handlers
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Enter":
          if (placingPrimitive) handleConfirmPlacement();
          break;
        case "Escape":
          if (placingPrimitive) {
            cancelPlacing();
          } else if (selectedConstraintId) {
            selectConstraint(null);
          }
          break;
        case "Delete":
        case "Backspace":
          if (selectedConstraintId) {
            removeConstraint(projectId, selectedConstraintId);
            syncDeleteConstraint(selectedConstraintId);
            selectConstraint(null);
          }
          break;
        case "w":
        case "W":
          setTransformMode("translate");
          break;
        case "e":
        case "E":
          setTransformMode("rotate");
          break;
        case "r":
        case "R":
          setTransformMode("scale");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isActive,
    placingPrimitive,
    selectedConstraintId,
    handleConfirmPlacement,
    cancelPlacing,
    selectConstraint,
    removeConstraint,
    syncDeleteConstraint,
    projectId,
    setTransformMode,
  ]);

  if (!isActive) return null;

  // Filter to primitive-type constraints only
  const primitiveConstraints = constraints.filter(
    (
      c,
    ): c is
      | BoxConstraint
      | SphereConstraint
      | HalfspaceConstraint
      | CylinderConstraint =>
      c.type === "box" ||
      c.type === "sphere" ||
      c.type === "halfspace" ||
      c.type === "cylinder",
  );

  return (
    <group>
      {/* Ghost preview */}
      {ghostPosition && !placingPrimitive && (
        <GhostPrimitive position={ghostPosition} />
      )}

      {/* Primitive being placed */}
      {placingPrimitive && (
        <PlacingPrimitiveView
          primitive={placingPrimitive}
          label={activeLabel}
          transformMode={transformMode}
          onUpdate={updatePlacing}
        />
      )}

      {/* Existing constraints */}
      {primitiveConstraints.map((constraint) => (
        <ConstraintView
          key={constraint.id}
          constraint={constraint}
          isSelected={constraint.id === selectedConstraintId}
          transformMode={transformMode}
          onSelect={() => selectConstraint(constraint.id)}
          onUpdate={(updates) => {
            const updated = { ...constraint, ...updates } as typeof constraint;
            updateConstraint(projectId, updated);
          }}
        />
      ))}

      {/* Click handler plane (invisible) */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleClick}
      >
        <planeGeometry
          args={[GEOMETRY.clickPlaneSize, GEOMETRY.clickPlaneSize]}
        />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
