// ABOUTME: Hook for detecting GPU quality tier and returning appropriate config
// ABOUTME: Detects integrated vs discrete graphics and provides particle system settings

import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { useSprayEffectStore } from "../stores/sprayEffectStore";

export type QualityTier = "low" | "medium" | "high";

export interface TierConfig {
  maxParticles: number;
  emitRate: number; // particles per frame
  lifetime: number; // seconds
  segments: number; // geometry segments for hand model
}

export const TIER_CONFIGS: Record<QualityTier, TierConfig> = {
  low: {
    maxParticles: 100,
    emitRate: 5,
    lifetime: 0.2,
    segments: 6,
  },
  medium: {
    maxParticles: 500,
    emitRate: 15,
    lifetime: 0.3,
    segments: 12,
  },
  high: {
    maxParticles: 2000,
    emitRate: 30,
    lifetime: 0.4,
    segments: 16,
  },
};

/**
 * Detect quality tier from GPU renderer string.
 * Exported for testing.
 */
export function detectQualityTier(rendererString: string): QualityTier {
  const renderer = rendererString.toLowerCase();

  // Low tier: integrated graphics, software renderers
  const lowTierPatterns = [
    /intel/i,
    /mesa/i,
    /llvmpipe/i,
    /software/i,
    /swiftshader/i,
  ];

  for (const pattern of lowTierPatterns) {
    if (pattern.test(renderer)) {
      return "low";
    }
  }

  // High tier: known high-end discrete GPUs
  const highTierPatterns = [
    /rtx/i, // NVIDIA RTX series
    /radeon\s*rx/i, // AMD Radeon RX series
    /geforce\s*gtx\s*10[6-8]0/i, // GTX 1060, 1070, 1080
    /geforce\s*gtx\s*20/i, // GTX 20 series (doesn't exist but future-proof)
    /geforce\s*gtx\s*30/i, // GTX 30 series (doesn't exist but pattern matches)
  ];

  for (const pattern of highTierPatterns) {
    if (pattern.test(renderer)) {
      return "high";
    }
  }

  // Default to medium for unknown GPUs
  return "medium";
}

/**
 * Hook to get the quality tier and config for the current GPU.
 * Uses auto-detection unless user has set an override.
 */
export function useQualityTier(): { tier: QualityTier; config: TierConfig } {
  const { gl } = useThree();
  const qualityOverride = useSprayEffectStore((s) => s.qualityOverride);

  const tier = useMemo(() => {
    if (qualityOverride !== "auto") {
      return qualityOverride;
    }

    try {
      // Access the underlying WebGL context from the renderer
      const glContext = gl.getContext();
      const debugInfo = glContext.getExtension("WEBGL_debug_renderer_info");
      if (!debugInfo) {
        return "medium";
      }

      const renderer = glContext.getParameter(
        debugInfo.UNMASKED_RENDERER_WEBGL,
      ) as string;
      return detectQualityTier(renderer);
    } catch {
      return "medium";
    }
  }, [gl, qualityOverride]);

  return {
    tier,
    config: TIER_CONFIGS[tier],
  };
}
