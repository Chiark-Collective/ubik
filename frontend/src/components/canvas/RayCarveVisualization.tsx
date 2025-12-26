// ABOUTME: Standalone visualization for ray carve constraints (cones)
// ABOUTME: Separated from RayScribblePainter to avoid render issues during spraying

import { useMemo } from 'react'
import * as THREE from 'three'

import { useLabelStore, type RayCarveConstraint } from '../../stores/labelStore'
import type { RayInfo } from '../../stores/rayScribbleStore'

const COLORS: Record<string, string> = {
  solid: '#3b82f6',
  empty: '#f97316',
  surface: '#22c55e',
}

interface RayCarveVisualizationProps {
  projectId: string
}

export function RayCarveVisualization({ projectId }: RayCarveVisualizationProps) {
  // Subscribe directly to constraints for this project
  const constraints = useLabelStore((s) => s.constraintsByProject[projectId] ?? [])

  // Filter to ray carve constraints
  const rayCarves = useMemo(
    () => constraints.filter((c): c is RayCarveConstraint => c.type === 'ray_carve'),
    [constraints]
  )

  if (rayCarves.length === 0) return null

  return (
    <group>
      {rayCarves.map((constraint) => (
        <RayStrokeVisualization
          key={constraint.id}
          rays={constraint.rays}
          backBufferCoefficient={constraint.backBufferCoefficient}
          backBufferWidth={constraint.backBufferWidth}
          color={COLORS[constraint.sign]}
          opacity={0.3}
        />
      ))}
    </group>
  )
}

interface RayStrokeVisualizationProps {
  rays: RayInfo[]
  backBufferCoefficient: number
  backBufferWidth: number
  color: string
  opacity: number
}

function RayStrokeVisualization({
  rays,
  backBufferCoefficient,
  backBufferWidth,
  color,
  opacity,
}: RayStrokeVisualizationProps) {
  // Create geometry for visualizing rays as cones showing empty space
  const coneGeometry = useMemo(() => {
    if (rays.length === 0) return null

    const positions: number[] = []
    const indices: number[] = []
    const CONE_SEGMENTS = 8

    rays.forEach((ray) => {
      const origin = new THREE.Vector3(...ray.origin)
      const direction = new THREE.Vector3(...ray.direction).normalize()
      const hitDistance = ray.hitDistance

      // Compute the actual buffer zone for this ray
      const bufferZone =
        ray.localSpacing != null
          ? ray.localSpacing * backBufferCoefficient
          : backBufferWidth

      // Cone end point is hit - bufferZone
      const endDistance = Math.max(0.1, hitDistance - bufferZone)
      const endPoint = origin.clone().add(direction.clone().multiplyScalar(endDistance))

      // Cone radius increases with distance
      const coneAngle = 0.05
      const endRadius = endDistance * Math.tan(coneAngle)

      // Create basis vectors perpendicular to ray direction
      const up =
        Math.abs(direction.y) < 0.9
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(1, 0, 0)
      const right = new THREE.Vector3().crossVectors(direction, up).normalize()
      const perpUp = new THREE.Vector3().crossVectors(right, direction).normalize()

      const baseVertexIndex = positions.length / 3

      // Add origin vertex (cone tip)
      positions.push(origin.x, origin.y, origin.z)

      // Add ring of vertices at end
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

      // Create triangles from tip to ring
      for (let i = 0; i < CONE_SEGMENTS; i++) {
        const nextI = (i + 1) % CONE_SEGMENTS
        indices.push(
          baseVertexIndex,
          baseVertexIndex + 1 + i,
          baseVertexIndex + 1 + nextI
        )
      }
    })

    if (positions.length === 0) return null

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()

    return geometry
  }, [rays, backBufferCoefficient, backBufferWidth])

  if (!coneGeometry) return null

  return (
    <mesh geometry={coneGeometry} frustumCulled={false} renderOrder={-1}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}
