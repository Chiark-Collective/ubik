// ABOUTME: Zustand store for ray-scribble mode state
// ABOUTME: Manages stroke data, band widths, and scribbling state

import { create } from "zustand";

export interface RayInfo {
  origin: [number, number, number];
  direction: [number, number, number];
  hitDistance: number;
  surfaceNormal?: [number, number, number];
  hitPointIndex?: number; // Index into consolidated positions for spacing lookup
  localSpacing?: number; // Local point spacing at hit point (k-NN mean distance)
}

export interface RayStroke {
  id: string;
  rays: RayInfo[];
  createdAt: number;
}

interface RayScribbleState {
  // Settings
  emptyBandWidth: number;
  surfaceBandWidth: number;
  backBufferWidth: number; // Distance past hit to sample (0 = no bleed-through)
  useAdaptiveBackBuffer: boolean; // Use local spacing instead of fixed width
  backBufferCoefficient: number; // Multiplier for local spacing (0.5 to 2.0)

  // Stroke state
  strokes: RayStroke[];
  isScribbling: boolean;
  currentStrokeRays: RayInfo[];

  // Actions
  setEmptyBandWidth: (width: number) => void;
  setSurfaceBandWidth: (width: number) => void;
  setBackBufferWidth: (width: number) => void;
  setUseAdaptiveBackBuffer: (use: boolean) => void;
  setBackBufferCoefficient: (coeff: number) => void;

  startStroke: () => void;
  addRayToStroke: (ray: RayInfo) => void;
  endStroke: () => RayStroke | null;
  cancelStroke: () => void;

  addStroke: (stroke: RayStroke) => void;
  removeStroke: (strokeId: string) => void;
  clearStrokes: () => void;
}

export const useRayScribbleStore = create<RayScribbleState>((set, get) => ({
  // Default settings
  emptyBandWidth: 0.1,
  surfaceBandWidth: 0.02,
  backBufferWidth: 0.0, // Distance past hit (fallback when adaptive is off)
  useAdaptiveBackBuffer: true, // Use local spacing by default
  backBufferCoefficient: 1.0, // 1.0x local spacing

  // Initial state
  strokes: [],
  isScribbling: false,
  currentStrokeRays: [],

  // Setting actions
  setEmptyBandWidth: (width) => set({ emptyBandWidth: width }),
  setSurfaceBandWidth: (width) => set({ surfaceBandWidth: width }),
  setBackBufferWidth: (width) => set({ backBufferWidth: width }),
  setUseAdaptiveBackBuffer: (use) => set({ useAdaptiveBackBuffer: use }),
  setBackBufferCoefficient: (coeff) => set({ backBufferCoefficient: coeff }),

  // Stroke actions
  startStroke: () => set({ isScribbling: true, currentStrokeRays: [] }),

  addRayToStroke: (ray) => {
    const state = get();
    if (!state.isScribbling) return;
    set({ currentStrokeRays: [...state.currentStrokeRays, ray] });
  },

  endStroke: () => {
    const state = get();
    if (!state.isScribbling || state.currentStrokeRays.length === 0) {
      set({ isScribbling: false, currentStrokeRays: [] });
      return null;
    }

    const stroke: RayStroke = {
      id: crypto.randomUUID(),
      rays: state.currentStrokeRays,
      createdAt: Date.now(),
    };

    set({
      isScribbling: false,
      currentStrokeRays: [],
      strokes: [...state.strokes, stroke],
    });

    return stroke;
  },

  cancelStroke: () => set({ isScribbling: false, currentStrokeRays: [] }),

  addStroke: (stroke) => set((s) => ({ strokes: [...s.strokes, stroke] })),

  removeStroke: (strokeId) =>
    set((s) => ({ strokes: s.strokes.filter((st) => st.id !== strokeId) })),

  clearStrokes: () => set({ strokes: [] }),
}));
