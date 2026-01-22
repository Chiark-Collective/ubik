// ABOUTME: Zustand store for spray paint effect settings
// ABOUTME: Manages handedness preference and quality tier override with persistence

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Handedness = "left" | "right";
export type QualityOverride = "low" | "medium" | "high" | "auto";

interface SprayEffectState {
  // Settings
  handedness: Handedness;
  qualityOverride: QualityOverride;
  particleDensity: number; // Multiplier for emission rate (0.1 to 3.0)

  // Actions
  setHandedness: (hand: Handedness) => void;
  setQualityOverride: (tier: QualityOverride) => void;
  setParticleDensity: (density: number) => void;
}

export const useSprayEffectStore = create<SprayEffectState>()(
  persist(
    (set) => ({
      // Default settings
      handedness: "right",
      qualityOverride: "auto",
      particleDensity: 1.0,

      // Actions
      setHandedness: (handedness) => set({ handedness }),
      setQualityOverride: (qualityOverride) => set({ qualityOverride }),
      setParticleDensity: (particleDensity) => set({ particleDensity }),
    }),
    {
      name: "sdf-labeler-spray-effect",
    },
  ),
);
