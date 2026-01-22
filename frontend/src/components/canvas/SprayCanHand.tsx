// ABOUTME: Procedural 3D spray can and hand model for first-person spray effect
// ABOUTME: Camera-relative positioning with trigger animation and handedness support

import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { TierConfig } from "../../hooks/useQualityTier";
import type { Handedness } from "../../stores/sprayEffectStore";

interface SprayCanHandProps {
  handedness: Handedness;
  isSpraying: boolean;
  tierConfig: TierConfig;
  nozzlePositionRef: React.MutableRefObject<THREE.Vector3>;
  pointerDirection: THREE.Vector3;
}

// Dimensions for spray can
const CAN = {
  bodyRadius: 0.018,
  bodyHeight: 0.065,
  nozzleRadius: 0.004,
  nozzleHeight: 0.012,
  capRadius: 0.02,
  capHeight: 0.008,
};

// Dimensions for hand
const HAND = {
  palmWidth: 0.045,
  palmHeight: 0.055,
  palmDepth: 0.018,
  fingerRadius: 0.005,
  fingerLength: 0.028,
  thumbRadius: 0.006,
  thumbLength: 0.022,
};

// Camera-relative offsets
const OFFSETS = {
  right: new THREE.Vector3(0.14, -0.12, -0.28),
  left: new THREE.Vector3(-0.14, -0.12, -0.28),
};

// Colors
const COLORS = {
  can: "#4a5568", // Gray metal
  canCap: "#e53e3e", // Red cap
  nozzle: "#2d3748", // Dark gray
  skin: "#d4a574", // Skin tone
};

export function SprayCanHand({
  handedness,
  isSpraying,
  tierConfig,
  nozzlePositionRef,
  pointerDirection,
}: SprayCanHandProps) {
  const groupRef = useRef<THREE.Group>(null);
  const nozzleRef = useRef<THREE.Mesh>(null);
  const indexFingerRef = useRef<THREE.Group>(null);

  const { camera } = useThree();

  // Animation state
  const triggerPressRef = useRef(0);
  const idleSwayRef = useRef(0);

  const segments = tierConfig.segments;

  // Create geometries (memoized to avoid recreation)
  const geometries = useMemo(
    () => ({
      // Spray can parts
      canBody: new THREE.CylinderGeometry(
        CAN.bodyRadius,
        CAN.bodyRadius,
        CAN.bodyHeight,
        segments,
      ),
      canCap: new THREE.CylinderGeometry(
        CAN.capRadius,
        CAN.capRadius,
        CAN.capHeight,
        segments,
      ),
      nozzle: new THREE.CylinderGeometry(
        CAN.nozzleRadius,
        CAN.nozzleRadius * 0.7,
        CAN.nozzleHeight,
        segments,
      ),

      // Hand parts
      palm: new THREE.BoxGeometry(
        HAND.palmWidth,
        HAND.palmHeight,
        HAND.palmDepth,
      ),
      finger: new THREE.CylinderGeometry(
        HAND.fingerRadius,
        HAND.fingerRadius * 0.85,
        HAND.fingerLength,
        segments,
      ),
      thumb: new THREE.CylinderGeometry(
        HAND.thumbRadius,
        HAND.thumbRadius * 0.85,
        HAND.thumbLength,
        segments,
      ),
    }),
    [segments],
  );

  // Materials (memoized)
  const materials = useMemo(
    () => ({
      can: new THREE.MeshStandardMaterial({
        color: COLORS.can,
        metalness: 0.6,
        roughness: 0.4,
      }),
      cap: new THREE.MeshStandardMaterial({
        color: COLORS.canCap,
        metalness: 0.3,
        roughness: 0.6,
      }),
      nozzle: new THREE.MeshStandardMaterial({
        color: COLORS.nozzle,
        metalness: 0.5,
        roughness: 0.5,
      }),
      skin: new THREE.MeshStandardMaterial({
        color: COLORS.skin,
        metalness: 0.1,
        roughness: 0.8,
      }),
    }),
    [],
  );

  // Cleanup geometries and materials on unmount
  // Note: In a real app you might want a more sophisticated cleanup

  // Per-frame update: position relative to camera, animate trigger
  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Get camera position and rotation
    const camPos = camera.position.clone();
    const camQuat = camera.quaternion.clone();

    // Calculate offset based on handedness
    const offset = OFFSETS[handedness].clone();
    if (handedness === "left") {
      // Mirror the X offset for left hand
      offset.x = -Math.abs(offset.x);
    }

    // Apply camera rotation to offset
    offset.applyQuaternion(camQuat);

    // Position group relative to camera
    groupRef.current.position.copy(camPos).add(offset);

    // Base rotation follows camera
    groupRef.current.quaternion.copy(camQuat);

    // Add idle sway when not spraying
    if (!isSpraying) {
      idleSwayRef.current += delta * 1.5;
      const swayX = Math.sin(idleSwayRef.current) * 0.02;
      const swayY = Math.sin(idleSwayRef.current * 0.7) * 0.015;
      groupRef.current.rotation.x += swayX;
      groupRef.current.rotation.y += swayY;
    }

    // Aim toward pointer direction (subtle)
    if (pointerDirection) {
      // Convert pointer direction to local space
      const localDir = pointerDirection.clone();
      localDir.applyQuaternion(camQuat.clone().invert());

      // Subtle rotation toward aim point
      const aimX = localDir.y * 0.15;
      const aimY = -localDir.x * 0.15;
      groupRef.current.rotation.x += aimX;
      groupRef.current.rotation.y += aimY;
    }

    // Animate trigger press
    const targetPress = isSpraying ? 1 : 0;
    triggerPressRef.current +=
      (targetPress - triggerPressRef.current) * Math.min(1, delta * 12);

    // Apply trigger animation to index finger
    if (indexFingerRef.current) {
      // Rotate finger toward nozzle when pressing trigger
      indexFingerRef.current.rotation.x = -0.3 - triggerPressRef.current * 0.4;
    }

    // Update nozzle world position for particle emission
    if (nozzleRef.current) {
      nozzleRef.current.getWorldPosition(nozzlePositionRef.current);
    }
  });

  // Mirror factor for left-handed
  const mirrorX = handedness === "left" ? -1 : 1;

  return (
    <group ref={groupRef}>
      {/* Spray Can */}
      <group position={[0, 0, 0]} rotation={[0.1, 0, 0]}>
        {/* Can body */}
        <mesh geometry={geometries.canBody} material={materials.can} />

        {/* Cap (top of can) */}
        <mesh
          geometry={geometries.canCap}
          material={materials.cap}
          position={[0, CAN.bodyHeight / 2 + CAN.capHeight / 2, 0]}
        />

        {/* Nozzle */}
        <mesh
          ref={nozzleRef}
          geometry={geometries.nozzle}
          material={materials.nozzle}
          position={[
            0,
            CAN.bodyHeight / 2 + CAN.capHeight + CAN.nozzleHeight / 2,
            0,
          ]}
        />
      </group>

      {/* Hand */}
      <group
        position={[CAN.bodyRadius * 1.5 * mirrorX, -CAN.bodyHeight * 0.3, 0]}
      >
        {/* Palm */}
        <mesh
          geometry={geometries.palm}
          material={materials.skin}
          position={[HAND.palmWidth * 0.3 * mirrorX, 0, 0]}
          rotation={[0, 0, 0.2 * mirrorX]}
        />

        {/* Index finger (on trigger, animated) */}
        <group
          ref={indexFingerRef}
          position={[
            HAND.palmWidth * 0.1 * mirrorX,
            HAND.palmHeight * 0.35,
            HAND.palmDepth * 0.3,
          ]}
        >
          <mesh
            geometry={geometries.finger}
            material={materials.skin}
            position={[0, HAND.fingerLength / 2, 0]}
          />
        </group>

        {/* Middle finger */}
        <mesh
          geometry={geometries.finger}
          material={materials.skin}
          position={[
            HAND.palmWidth * 0.35 * mirrorX,
            HAND.palmHeight * 0.4 + HAND.fingerLength / 2,
            0,
          ]}
          rotation={[-0.2, 0, 0]}
        />

        {/* Ring finger */}
        <mesh
          geometry={geometries.finger}
          material={materials.skin}
          position={[
            HAND.palmWidth * 0.55 * mirrorX,
            HAND.palmHeight * 0.35 + HAND.fingerLength / 2,
            -HAND.palmDepth * 0.15,
          ]}
          rotation={[-0.25, 0, 0]}
        />

        {/* Pinky finger */}
        <mesh
          geometry={geometries.finger}
          material={materials.skin}
          position={[
            HAND.palmWidth * 0.7 * mirrorX,
            HAND.palmHeight * 0.25 + HAND.fingerLength / 2,
            -HAND.palmDepth * 0.3,
          ]}
          rotation={[-0.3, 0, 0.1 * mirrorX]}
        />

        {/* Thumb (wrapped around can) */}
        <mesh
          geometry={geometries.thumb}
          material={materials.skin}
          position={[
            -HAND.palmWidth * 0.1 * mirrorX,
            -HAND.palmHeight * 0.1,
            HAND.palmDepth * 0.4,
          ]}
          rotation={[0.5, 0.3 * mirrorX, -0.8 * mirrorX]}
        />
      </group>

      {/* Simple ambient light for the hand (won't affect scene much) */}
      <pointLight position={[0, 0.1, 0.1]} intensity={0.3} distance={0.5} />
    </group>
  );
}
