// ABOUTME: Particle system for spray paint effect using THREE.Points
// ABOUTME: Pre-allocated buffers for GC-free animation with cone spread and impact effects

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { TierConfig } from '../../hooks/useQualityTier'

interface SprayParticleSystemProps {
  nozzlePosition: React.MutableRefObject<THREE.Vector3>
  targetPosition: React.MutableRefObject<THREE.Vector3 | null>
  labelColor: string
  tierConfig: TierConfig
  densityMultiplier?: number
}

// Reusable vectors to avoid allocations in hot path
const _direction = new THREE.Vector3()
const _spreadDir = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _tempVec = new THREE.Vector3()

export function SprayParticleSystem({
  nozzlePosition,
  targetPosition,
  labelColor,
  tierConfig,
  densityMultiplier = 1.0,
}: SprayParticleSystemProps) {
  const pointsRef = useRef<THREE.Points>(null)

  const { maxParticles, lifetime } = tierConfig
  const emitRate = tierConfig.emitRate * densityMultiplier

  // Pre-allocated buffers
  const buffers = useMemo(() => ({
    positions: new Float32Array(maxParticles * 3),
    colors: new Float32Array(maxParticles * 3),
    sizes: new Float32Array(maxParticles),
    // Particle state (not passed to GPU)
    velocities: new Float32Array(maxParticles * 3),
    lives: new Float32Array(maxParticles),
    maxLives: new Float32Array(maxParticles),
    // Circular buffer index
    nextIndex: { current: 0 },
    activeCount: { current: 0 },
  }), [maxParticles])

  // Parse color once
  const color = useMemo(() => new THREE.Color(labelColor), [labelColor])

  // Create geometry with buffer attributes
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(buffers.sizes, 1))
    return geo
  }, [buffers])

  // Material for particles
  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      size: 0.015,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  // Emit particles and update physics
  useFrame((_, delta) => {
    const { positions, colors, sizes, velocities, lives, maxLives, nextIndex, activeCount } = buffers

    // Skip if no valid target
    const target = targetPosition.current
    if (!target) return

    // Clamp delta to avoid huge jumps
    const dt = Math.min(delta, 0.05)

    // Calculate emission direction
    _direction.copy(target).sub(nozzlePosition.current).normalize()

    // Create orthogonal basis for spread
    if (Math.abs(_direction.y) < 0.9) {
      _up.set(0, 1, 0)
    } else {
      _up.set(1, 0, 0)
    }
    _right.crossVectors(_direction, _up).normalize()
    _up.crossVectors(_right, _direction).normalize()

    // Emit new particles
    const toEmit = Math.floor(emitRate * (dt * 60)) // Normalize to 60fps
    for (let i = 0; i < toEmit; i++) {
      const idx = nextIndex.current
      nextIndex.current = (nextIndex.current + 1) % maxParticles

      // If we're overwriting an active particle, decrease count
      if (lives[idx] > 0) {
        activeCount.current--
      }

      // Initial position at nozzle
      positions[idx * 3] = nozzlePosition.current.x
      positions[idx * 3 + 1] = nozzlePosition.current.y
      positions[idx * 3 + 2] = nozzlePosition.current.z

      // Spread direction (cone shape)
      const spreadAngle = (Math.random() * 0.5 + 0.5) * 0.12 // 0-7 degrees
      const rotationAngle = Math.random() * Math.PI * 2

      _spreadDir.copy(_direction)
        .add(_right.clone().multiplyScalar(Math.cos(rotationAngle) * Math.tan(spreadAngle)))
        .add(_up.clone().multiplyScalar(Math.sin(rotationAngle) * Math.tan(spreadAngle)))
        .normalize()

      // Velocity: faster in center, variable speed
      const speed = 4.0 + Math.random() * 3.0 // 4-7 m/s
      velocities[idx * 3] = _spreadDir.x * speed
      velocities[idx * 3 + 1] = _spreadDir.y * speed
      velocities[idx * 3 + 2] = _spreadDir.z * speed

      // Lifetime with variation
      const particleLife = lifetime * (0.7 + Math.random() * 0.6)
      lives[idx] = 1.0
      maxLives[idx] = particleLife

      // Color (with slight variation)
      const colorVariation = 0.9 + Math.random() * 0.2
      colors[idx * 3] = color.r * colorVariation
      colors[idx * 3 + 1] = color.g * colorVariation
      colors[idx * 3 + 2] = color.b * colorVariation

      // Initial size
      sizes[idx] = 0.012 + Math.random() * 0.008

      activeCount.current++
    }

    // Update existing particles
    const distToTarget = nozzlePosition.current.distanceTo(target)

    for (let i = 0; i < maxParticles; i++) {
      if (lives[i] <= 0) continue

      // Decrease life
      lives[i] -= dt / maxLives[i]

      if (lives[i] <= 0) {
        // Kill particle
        sizes[i] = 0
        activeCount.current--
        continue
      }

      // Update position
      positions[i * 3] += velocities[i * 3] * dt
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt

      // Deceleration (air resistance)
      velocities[i * 3] *= 0.97
      velocities[i * 3 + 1] *= 0.97
      velocities[i * 3 + 2] *= 0.97

      // Check distance to target for impact
      _tempVec.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      const distFromNozzle = _tempVec.distanceTo(nozzlePosition.current)

      if (distFromNozzle >= distToTarget * 0.95) {
        // Near surface - create impact burst effect
        // Kill this particle quickly
        lives[i] *= 0.3

        // Spawn a few impact particles (reuse nearby slots)
        for (let j = 0; j < 2; j++) {
          const impactIdx = (i + j + 1) % maxParticles
          if (lives[impactIdx] > 0.5) continue // Don't overwrite fresh particles

          // Position at impact
          positions[impactIdx * 3] = positions[i * 3]
          positions[impactIdx * 3 + 1] = positions[i * 3 + 1]
          positions[impactIdx * 3 + 2] = positions[i * 3 + 2]

          // Tangent velocity (spread along surface)
          const tangentSpeed = 0.5 + Math.random() * 0.3
          velocities[impactIdx * 3] = (Math.random() - 0.5) * tangentSpeed
          velocities[impactIdx * 3 + 1] = (Math.random() - 0.5) * tangentSpeed
          velocities[impactIdx * 3 + 2] = (Math.random() - 0.5) * tangentSpeed

          // Short life, bright color
          lives[impactIdx] = 1.0
          maxLives[impactIdx] = 0.08 + Math.random() * 0.04

          colors[impactIdx * 3] = color.r * 1.3
          colors[impactIdx * 3 + 1] = color.g * 1.3
          colors[impactIdx * 3 + 2] = color.b * 1.3

          sizes[impactIdx] = 0.008 + Math.random() * 0.006
        }
      }

      // Size fades with life
      sizes[i] = (0.012 + Math.random() * 0.004) * Math.pow(lives[i], 0.4)

      // Color fades slightly
      const fade = 0.5 + lives[i] * 0.5
      colors[i * 3] = color.r * fade
      colors[i * 3 + 1] = color.g * fade
      colors[i * 3 + 2] = color.b * fade
    }

    // Mark attributes as needing update
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute
    const sizeAttr = geometry.getAttribute('size') as THREE.BufferAttribute

    posAttr.needsUpdate = true
    colorAttr.needsUpdate = true
    sizeAttr.needsUpdate = true
  })

  return (
    <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
  )
}
