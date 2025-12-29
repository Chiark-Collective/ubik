// ABOUTME: Ray scribble painter for creating ray-carve constraints
// ABOUTME: Captures scribble strokes and casts rays to find surface hits with spray paint effect

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { useProjectStore } from '../../stores/projectStore'
import { useLabelStore, type RayCarveConstraint } from '../../stores/labelStore'
import { useRayScribbleStore, type RayInfo as StoreRayInfo } from '../../stores/rayScribbleStore'
import { useSprayEffectStore } from '../../stores/sprayEffectStore'
import { useSimplePointCloudRaycast } from '../../hooks/usePointCloudBVH'
import { useLocalSpacing } from '../../hooks/useLocalSpacing'
import { useConstraintSync } from '../../hooks/useConstraintSync'
import { useQualityTier } from '../../hooks/useQualityTier'
import { SprayCanHand } from './SprayCanHand'
import { SprayParticleSystem } from './SprayParticleSystem'

const COLORS = {
  solid: '#3b82f6',
  empty: '#f97316',
  surface: '#22c55e',
}

interface RayScribblePainterProps {
  projectId: string
}

export function RayScribblePainter({ projectId }: RayScribblePainterProps) {
  const mode = useProjectStore((s) => s.mode)
  const activeLabel = useProjectStore((s) => s.activeLabel)
  const pointCloudPositions = useProjectStore((s) => s.pointCloudPositions)

  const addConstraint = useLabelStore((s) => s.addConstraint)
  const constraints = useLabelStore((s) => s.constraintsByProject[projectId] ?? [])
  const { createConstraint: syncConstraint } = useConstraintSync(projectId)

  const emptyBandWidth = useRayScribbleStore((s) => s.emptyBandWidth)
  const surfaceBandWidth = useRayScribbleStore((s) => s.surfaceBandWidth)
  const backBufferWidth = useRayScribbleStore((s) => s.backBufferWidth)
  const useAdaptiveBackBuffer = useRayScribbleStore((s) => s.useAdaptiveBackBuffer)
  const backBufferCoefficient = useRayScribbleStore((s) => s.backBufferCoefficient)
  const isScribbling = useRayScribbleStore((s) => s.isScribbling)
  const currentStrokeRays = useRayScribbleStore((s) => s.currentStrokeRays)
  const startStroke = useRayScribbleStore((s) => s.startStroke)
  const addRayToStroke = useRayScribbleStore((s) => s.addRayToStroke)
  const endStroke = useRayScribbleStore((s) => s.endStroke)
  const cancelStroke = useRayScribbleStore((s) => s.cancelStroke)

  // Local spacing computation for adaptive back buffer
  const { isReady: spacingReady, globalMean, getSpacing } = useLocalSpacing(pointCloudPositions)

  // Spray effect settings
  const handedness = useSprayEffectStore((s) => s.handedness)
  const particleDensity = useSprayEffectStore((s) => s.particleDensity)
  const { config: tierConfig } = useQualityTier()

  const { camera, raycaster, pointer, gl } = useThree()

  const isActive = mode === 'ray_scribble'

  // Refs for spray effect
  const nozzlePositionRef = useRef(new THREE.Vector3())
  const currentHitPointRef = useRef<THREE.Vector3 | null>(null)
  const pointerDirectionRef = useRef(new THREE.Vector3(0, 0, -1))

  // Point cloud raycasting
  const { raycast, isReady: raycastReady } = useSimplePointCloudRaycast(
    pointCloudPositions,
    0.1 // threshold for point intersection
  )

  // Track last raycast position to avoid duplicate rays
  const lastRayPosition = useRef<THREE.Vector2>(new THREE.Vector2())
  const MIN_SCREEN_DISTANCE = 5 // Minimum pixels between ray samples

  // Cast ray from current pointer position
  const castRayAtPointer = useCallback(() => {
    if (!raycastReady) return null

    raycaster.setFromCamera(pointer, camera)

    const ray = raycaster.ray
    const hit = raycast(ray)

    if (hit) {
      // Look up local spacing for this point if adaptive mode is enabled
      let localSpacing: number | undefined
      if (useAdaptiveBackBuffer) {
        if (spacingReady) {
          // Use per-point spacing if available
          localSpacing = getSpacing(hit.pointIndex) ?? undefined
        } else if (globalMean !== null) {
          // Fall back to global mean while computing
          localSpacing = globalMean
        }
      }

      const rayInfo: StoreRayInfo = {
        origin: [ray.origin.x, ray.origin.y, ray.origin.z],
        direction: [ray.direction.x, ray.direction.y, ray.direction.z],
        hitDistance: hit.distance,
        surfaceNormal: undefined, // Could compute from nearby points
        hitPointIndex: hit.pointIndex,
        localSpacing,
      }
      return rayInfo
    }

    return null
  }, [camera, pointer, raycaster, raycast, raycastReady, useAdaptiveBackBuffer, spacingReady, globalMean, getSpacing])

  // Update rays during scribbling and track hit point for particles
  useFrame(() => {
    // Always update pointer direction for hand aiming
    if (isActive) {
      raycaster.setFromCamera(pointer, camera)
      pointerDirectionRef.current.copy(raycaster.ray.direction)

      // Update current hit point for particle targeting
      if (raycastReady) {
        const hit = raycast(raycaster.ray)
        if (hit) {
          const hitPoint = raycaster.ray.origin.clone().add(
            raycaster.ray.direction.clone().multiplyScalar(hit.distance)
          )
          currentHitPointRef.current = hitPoint
        } else {
          // No hit - aim at a point far away
          currentHitPointRef.current = raycaster.ray.origin.clone().add(
            raycaster.ray.direction.clone().multiplyScalar(10)
          )
        }
      }
    }

    if (!isActive || !isScribbling) return

    // Check if pointer moved enough
    const currentPointer = new THREE.Vector2(
      pointer.x * gl.domElement.width,
      pointer.y * gl.domElement.height
    )

    const distance = currentPointer.distanceTo(lastRayPosition.current)
    if (distance < MIN_SCREEN_DISTANCE) return

    lastRayPosition.current.copy(currentPointer)

    // Cast ray and add to stroke
    const rayInfo = castRayAtPointer()
    if (rayInfo) {
      addRayToStroke(rayInfo)
    }
  })

  // Handle start scribbling
  const handleStartScribble = useCallback(() => {
    if (!isActive) return

    startStroke()

    // Cast initial ray
    const rayInfo = castRayAtPointer()
    if (rayInfo) {
      addRayToStroke(rayInfo)
    }

    // Reset last position
    lastRayPosition.current.set(
      pointer.x * gl.domElement.width,
      pointer.y * gl.domElement.height
    )
  }, [isActive, startStroke, castRayAtPointer, addRayToStroke, pointer, gl.domElement])

  // Handle stop scribbling - create constraint
  const handleStopScribble = useCallback(() => {
    if (!isScribbling) return

    const stroke = endStroke()

    // Create constraint if stroke has rays
    if (stroke && stroke.rays.length >= 1) {
      const constraint: RayCarveConstraint = {
        id: crypto.randomUUID(),
        type: 'ray_carve',
        sign: activeLabel,
        weight: 1.0,
        createdAt: Date.now(),
        rays: stroke.rays.map((r) => ({
          origin: r.origin,
          direction: r.direction,
          hitDistance: r.hitDistance,
          surfaceNormal: r.surfaceNormal,
          hitPointIndex: r.hitPointIndex,
          localSpacing: r.localSpacing,
        })),
        emptyBandWidth,
        surfaceBandWidth,
        backBufferWidth,
        backBufferCoefficient,
      }

      addConstraint(projectId, constraint)
      syncConstraint(constraint)
    }
  }, [
    isScribbling,
    endStroke,
    activeLabel,
    emptyBandWidth,
    surfaceBandWidth,
    backBufferWidth,
    backBufferCoefficient,
    addConstraint,
    syncConstraint,
    projectId,
  ])

  // Mouse event handlers
  useEffect(() => {
    if (!isActive) return

    const canvas = gl.domElement

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        handleStartScribble()
      }
    }

    const handleMouseUp = () => {
      handleStopScribble()
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mouseup', handleMouseUp)

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isActive, handleStartScribble, handleStopScribble, gl.domElement])

  // Keyboard handler for Escape to cancel
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelStroke()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, cancelStroke])

  // Get ray carve constraints for this project
  const rayCarves = useMemo(
    () => constraints.filter((c): c is RayCarveConstraint => c.type === 'ray_carve'),
    [constraints]
  )

  // Render cones always, spray effect only when mode active
  if (!isActive && rayCarves.length === 0) return null

  const color = COLORS[activeLabel]

  return (
    <group>
      {/* Spray can hand - always visible when mode active */}
      {isActive && (
        <SprayCanHand
          handedness={handedness}
          isSpraying={isScribbling}
          tierConfig={tierConfig}
          nozzlePositionRef={nozzlePositionRef}
          pointerDirection={pointerDirectionRef.current}
        />
      )}

      {/* Particle system - only during active stroke */}
      {isActive && isScribbling && (
        <SprayParticleSystem
          nozzlePosition={nozzlePositionRef}
          targetPosition={currentHitPointRef}
          labelColor={color}
          tierConfig={tierConfig}
          densityMultiplier={particleDensity}
        />
      )}

      {/* Preview cone for current stroke (during active spraying) */}
      {isActive && isScribbling && currentStrokeRays.length > 0 && (
        <RayStrokeCones
          rays={currentStrokeRays}
          backBufferCoefficient={backBufferCoefficient}
          backBufferWidth={backBufferWidth}
          color={color}
          opacity={0.5}
        />
      )}

      {/* Ray carve constraint cones (finalized) */}
      {rayCarves.map((constraint) => (
        <RayStrokeCones
          key={constraint.id}
          rays={constraint.rays}
          backBufferCoefficient={constraint.backBufferCoefficient}
          backBufferWidth={constraint.backBufferWidth}
          color={COLORS[constraint.sign]}
        />
      ))}
    </group>
  )
}

interface RayStrokeConesProps {
  rays: RayCarveConstraint['rays']
  backBufferCoefficient: number
  backBufferWidth: number
  color: string
  opacity?: number
}

function RayStrokeCones({
  rays,
  backBufferCoefficient,
  backBufferWidth,
  color,
  opacity = 0.3,
}: RayStrokeConesProps) {
  const geometry = useMemo(() => {
    if (rays.length === 0) return null

    // Pre-compute all hit points and effective end distances to detect outliers
    // This prevents rays that pass through thin surface gaps from bleeding through
    const rayData = rays.map((ray) => {
      const origin = new THREE.Vector3(...ray.origin)
      const direction = new THREE.Vector3(...ray.direction).normalize()
      const hitPoint = origin.clone().add(direction.clone().multiplyScalar(ray.hitDistance))
      const bufferZone =
        ray.localSpacing != null
          ? ray.localSpacing * backBufferCoefficient
          : backBufferWidth
      return { origin, direction, hitDistance: ray.hitDistance, hitPoint, bufferZone }
    })

    const positions: number[] = []
    const indices: number[] = []
    const CONE_SEGMENTS = 8

    rayData.forEach((ray, rayIndex) => {
      const { origin, direction, hitDistance, hitPoint, bufferZone } = ray

      // Check if this ray's hit point is an outlier by comparing against nearby rays
      // If any nearby ray has a much shorter hit distance, this ray likely hit a back face
      let effectiveHitDistance = hitDistance

      for (let j = 0; j < rayData.length; j++) {
        if (j === rayIndex) continue

        const other = rayData[j]
        // Check if rays are close (similar direction = coming from similar viewpoint)
        const dirDot = direction.dot(other.direction)
        if (dirDot > 0.95) { // Similar direction (within ~18 degrees)
          // Project this ray's hit point onto the other ray's direction
          // to see if we've gone past where the other ray hit
          const toHit = hitPoint.clone().sub(other.origin)
          const projDist = toHit.dot(other.direction)

          // If this ray extends significantly past where a nearby ray hit,
          // clamp it to that distance (with some tolerance)
          if (projDist > other.hitDistance * 1.1) {
            // This ray likely passed through a gap - clamp to the other ray's hit distance
            const clampedDist = other.hitDistance
            effectiveHitDistance = Math.min(effectiveHitDistance, clampedDist)
          }
        }
      }

      const endDistance = Math.max(0.1, effectiveHitDistance - bufferZone)
      const endPoint = origin.clone().add(direction.clone().multiplyScalar(endDistance))
      const coneAngle = 0.05
      const endRadius = endDistance * Math.tan(coneAngle)

      const up =
        Math.abs(direction.y) < 0.9
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(1, 0, 0)
      const right = new THREE.Vector3().crossVectors(direction, up).normalize()
      const perpUp = new THREE.Vector3().crossVectors(right, direction).normalize()

      const baseVertexIndex = positions.length / 3
      positions.push(origin.x, origin.y, origin.z)

      for (let i = 0; i < CONE_SEGMENTS; i++) {
        const angle = (i / CONE_SEGMENTS) * Math.PI * 2
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const vertex = endPoint
          .clone()
          .add(right.clone().multiplyScalar(cos * endRadius))
          .add(perpUp.clone().multiplyScalar(sin * endRadius))
        positions.push(vertex.x, vertex.y, vertex.z)
      }

      for (let i = 0; i < CONE_SEGMENTS; i++) {
        const nextI = (i + 1) % CONE_SEGMENTS
        indices.push(baseVertexIndex, baseVertexIndex + 1 + i, baseVertexIndex + 1 + nextI)
      }
    })

    if (positions.length === 0) return null

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    return geo
  }, [rays, backBufferCoefficient, backBufferWidth])

  if (!geometry) return null

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

