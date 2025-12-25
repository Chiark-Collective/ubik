// ABOUTME: Tests for quality tier detection and configuration
// ABOUTME: Tests GPU detection logic and tier config mapping

import { describe, it, expect } from 'vitest'
import { detectQualityTier, TIER_CONFIGS } from './useQualityTier'

describe('detectQualityTier', () => {
  describe('integrated graphics detection (low tier)', () => {
    it('should detect Intel integrated graphics as low', () => {
      expect(detectQualityTier('Intel(R) UHD Graphics 620')).toBe('low')
    })

    it('should detect Intel Iris as low', () => {
      expect(detectQualityTier('Intel(R) Iris(R) Xe Graphics')).toBe('low')
    })

    it('should detect Mesa drivers as low', () => {
      expect(detectQualityTier('Mesa DRI Intel(R) HD Graphics 530')).toBe('low')
    })

    it('should detect llvmpipe (software) as low', () => {
      expect(detectQualityTier('llvmpipe (LLVM 12.0.0, 256 bits)')).toBe('low')
    })

    it('should detect SwiftShader as low', () => {
      expect(detectQualityTier('Google SwiftShader')).toBe('low')
    })

    it('should detect Software Rasterizer as low', () => {
      expect(detectQualityTier('Software Rasterizer')).toBe('low')
    })
  })

  describe('high-end GPU detection (high tier)', () => {
    it('should detect NVIDIA RTX cards as high', () => {
      expect(detectQualityTier('NVIDIA GeForce RTX 3080')).toBe('high')
      expect(detectQualityTier('NVIDIA GeForce RTX 4090')).toBe('high')
      expect(detectQualityTier('NVIDIA GeForce RTX 2070 Super')).toBe('high')
    })

    it('should detect AMD Radeon RX cards as high', () => {
      expect(detectQualityTier('AMD Radeon RX 6800 XT')).toBe('high')
      expect(detectQualityTier('AMD Radeon RX 7900 XTX')).toBe('high')
    })

    it('should detect NVIDIA GTX 1060 and above as high', () => {
      expect(detectQualityTier('NVIDIA GeForce GTX 1060')).toBe('high')
      expect(detectQualityTier('NVIDIA GeForce GTX 1070')).toBe('high')
      expect(detectQualityTier('NVIDIA GeForce GTX 1080 Ti')).toBe('high')
    })
  })

  describe('medium tier (default)', () => {
    it('should detect older NVIDIA cards as medium', () => {
      expect(detectQualityTier('NVIDIA GeForce GTX 950')).toBe('medium')
      expect(detectQualityTier('NVIDIA GeForce GTX 750 Ti')).toBe('medium')
    })

    it('should detect unknown GPUs as medium', () => {
      expect(detectQualityTier('Unknown GPU')).toBe('medium')
      expect(detectQualityTier('Some Random Renderer')).toBe('medium')
    })

    it('should detect Apple GPUs as medium', () => {
      expect(detectQualityTier('Apple M1 Pro')).toBe('medium')
      expect(detectQualityTier('Apple GPU')).toBe('medium')
    })
  })

  describe('edge cases', () => {
    it('should handle empty string as medium', () => {
      expect(detectQualityTier('')).toBe('medium')
    })

    it('should be case-insensitive', () => {
      expect(detectQualityTier('intel uhd graphics')).toBe('low')
      expect(detectQualityTier('NVIDIA GEFORCE RTX 3080')).toBe('high')
    })
  })
})

describe('TIER_CONFIGS', () => {
  it('should have config for low tier', () => {
    const config = TIER_CONFIGS.low
    expect(config.maxParticles).toBe(100)
    expect(config.emitRate).toBe(5)
    expect(config.lifetime).toBe(0.2)
    expect(config.segments).toBe(6)
  })

  it('should have config for medium tier', () => {
    const config = TIER_CONFIGS.medium
    expect(config.maxParticles).toBe(500)
    expect(config.emitRate).toBe(15)
    expect(config.lifetime).toBe(0.3)
    expect(config.segments).toBe(12)
  })

  it('should have config for high tier', () => {
    const config = TIER_CONFIGS.high
    expect(config.maxParticles).toBe(2000)
    expect(config.emitRate).toBe(30)
    expect(config.lifetime).toBe(0.4)
    expect(config.segments).toBe(16)
  })

  it('should have increasing particle counts from low to high', () => {
    expect(TIER_CONFIGS.low.maxParticles).toBeLessThan(TIER_CONFIGS.medium.maxParticles)
    expect(TIER_CONFIGS.medium.maxParticles).toBeLessThan(TIER_CONFIGS.high.maxParticles)
  })

  it('should have increasing emit rates from low to high', () => {
    expect(TIER_CONFIGS.low.emitRate).toBeLessThan(TIER_CONFIGS.medium.emitRate)
    expect(TIER_CONFIGS.medium.emitRate).toBeLessThan(TIER_CONFIGS.high.emitRate)
  })
})
