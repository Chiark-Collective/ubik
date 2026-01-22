// ABOUTME: Zustand store for pocket detection state
// ABOUTME: Manages detected pockets, selection state, and toggle status

import { create } from "zustand";

export interface PocketInfo {
  pocketId: number;
  voxelCount: number;
  centroid: [number, number, number];
  boundsLow: [number, number, number];
  boundsHigh: [number, number, number];
  volumeEstimate: number;
  isToggledSolid: boolean;
}

export interface VoxelGridMetadata {
  resolution: [number, number, number];
  voxelSize: number;
  boundsLow: [number, number, number];
  boundsHigh: [number, number, number];
  occupiedCount: number;
  emptyCount: number;
  outsideCount: number;
  pocketCount: number;
}

export interface PocketAnalysis {
  gridMetadata: VoxelGridMetadata;
  pockets: PocketInfo[];
  computedAt: string;
}

interface PocketState {
  // Analysis result
  analysis: PocketAnalysis | null;
  isAnalyzing: boolean;
  analyzeError: string | null;

  // Selection
  selectedPocketId: number | null;
  hoveredPocketId: number | null;

  // Local toggle state (overrides what's in analysis until synced)
  localToggles: Record<number, boolean>;

  // Actions
  setAnalysis: (analysis: PocketAnalysis | null) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  setAnalyzeError: (error: string | null) => void;

  setSelectedPocketId: (id: number | null) => void;
  setHoveredPocketId: (id: number | null) => void;

  togglePocket: (pocketId: number) => void;
  isPocketSolid: (pocketId: number) => boolean;

  reset: () => void;
}

export const usePocketStore = create<PocketState>((set, get) => ({
  // Initial state
  analysis: null,
  isAnalyzing: false,
  analyzeError: null,
  selectedPocketId: null,
  hoveredPocketId: null,
  localToggles: {},

  // Actions
  setAnalysis: (analysis) => set({ analysis, localToggles: {} }),
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  setAnalyzeError: (error) => set({ analyzeError: error }),

  setSelectedPocketId: (id) => set({ selectedPocketId: id }),
  setHoveredPocketId: (id) => set({ hoveredPocketId: id }),

  togglePocket: (pocketId) => {
    const state = get();
    const currentState = state.isPocketSolid(pocketId);
    set({
      localToggles: {
        ...state.localToggles,
        [pocketId]: !currentState,
      },
    });
  },

  isPocketSolid: (pocketId) => {
    const state = get();
    // Local toggle takes precedence
    if (pocketId in state.localToggles) {
      return state.localToggles[pocketId];
    }
    // Fall back to analysis state
    const pocket = state.analysis?.pockets.find((p) => p.pocketId === pocketId);
    return pocket?.isToggledSolid ?? false;
  },

  reset: () =>
    set({
      analysis: null,
      isAnalyzing: false,
      analyzeError: null,
      selectedPocketId: null,
      hoveredPocketId: null,
      localToggles: {},
    }),
}));
