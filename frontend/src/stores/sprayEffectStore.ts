// ABOUTME: Zustand store for spray paint effect settings
// ABOUTME: Manages handedness preference and quality tier override with persistence

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Handedness = 'left' | 'right'
export type QualityOverride = 'low' | 'medium' | 'high' | 'auto'

interface SprayEffectState {
  // Settings
  handedness: Handedness
  qualityOverride: QualityOverride

  // Actions
  setHandedness: (hand: Handedness) => void
  setQualityOverride: (tier: QualityOverride) => void
}

export const useSprayEffectStore = create<SprayEffectState>()(
  persist(
    (set) => ({
      // Default settings
      handedness: 'right',
      qualityOverride: 'auto',

      // Actions
      setHandedness: (handedness) => set({ handedness }),
      setQualityOverride: (qualityOverride) => set({ qualityOverride }),
    }),
    {
      name: 'sdf-labeler-spray-effect',
    }
  )
)
