// ABOUTME: Zustand store for slice painting mode state
// ABOUTME: Tracks slice tool, brush size, selection, and 2D painting settings

import { create } from "zustand";

export type SliceTool = "brush" | "lasso" | "eraser";

interface SliceState {
  // Current tool
  tool: SliceTool;

  // Brush settings
  brushSize: number;

  // Selected point indices from slice painting
  selectedPointIndices: Set<number>;

  // Actions
  setTool: (tool: SliceTool) => void;
  setBrushSize: (size: number) => void;

  // Selection actions
  addSelectedPoints: (indices: number[]) => void;
  removeSelectedPoints: (indices: number[]) => void;
  clearSelectedPoints: () => void;
  setSelectedPoints: (indices: number[]) => void;
}

export const useSliceStore = create<SliceState>((set) => ({
  tool: "brush",
  brushSize: 20,
  selectedPointIndices: new Set(),

  setTool: (tool) => set({ tool }),
  setBrushSize: (size) => set({ brushSize: size }),

  addSelectedPoints: (indices) =>
    set((state) => {
      const newSet = new Set(state.selectedPointIndices);
      indices.forEach((i) => newSet.add(i));
      return { selectedPointIndices: newSet };
    }),

  removeSelectedPoints: (indices) =>
    set((state) => {
      const newSet = new Set(state.selectedPointIndices);
      indices.forEach((i) => newSet.delete(i));
      return { selectedPointIndices: newSet };
    }),

  clearSelectedPoints: () => set({ selectedPointIndices: new Set() }),

  setSelectedPoints: (indices) =>
    set({ selectedPointIndices: new Set(indices) }),
}));
