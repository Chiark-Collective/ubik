// ABOUTME: Zustand store for 3D brush painting mode state
// ABOUTME: Tracks brush settings like depth awareness

import { create } from "zustand";

interface BrushState {
  // Depth-aware painting (only visible points)
  depthAware: boolean;

  // Actions
  setDepthAware: (value: boolean) => void;
}

export const useBrushStore = create<BrushState>((set) => ({
  depthAware: false,

  setDepthAware: (value) => set({ depthAware: value }),
}));
