// ABOUTME: Zustand store for primitive placement mode state
// ABOUTME: Tracks primitive type, placement state, and editing

import { create } from "zustand";

export type PrimitiveType = "box" | "sphere" | "halfspace" | "cylinder";

export interface PlacingPrimitive {
  type: PrimitiveType;
  position: [number, number, number];
  // Box/Cylinder
  halfExtents?: [number, number, number];
  // Sphere
  radius?: number;
  // Halfspace
  normal?: [number, number, number];
  // Cylinder
  height?: number;
}

interface PrimitiveState {
  // Current primitive type to place
  primitiveType: PrimitiveType;

  // Primitive being placed (not yet committed)
  placingPrimitive: PlacingPrimitive | null;

  // Currently selected constraint ID for editing
  selectedConstraintId: string | null;

  // Placement settings
  defaultSize: number;
  snapToGrid: boolean;
  gridSize: number;

  // Transform mode for TransformControls
  transformMode: "translate" | "rotate" | "scale";

  // Actions
  setPrimitiveType: (type: PrimitiveType) => void;
  startPlacing: (position: [number, number, number]) => void;
  updatePlacing: (updates: Partial<PlacingPrimitive>) => void;
  cancelPlacing: () => void;
  confirmPlacing: () => PlacingPrimitive | null;

  selectConstraint: (id: string | null) => void;
  setDefaultSize: (size: number) => void;
  setSnapToGrid: (snap: boolean) => void;
  setGridSize: (size: number) => void;
  setTransformMode: (mode: "translate" | "rotate" | "scale") => void;
}

export const usePrimitiveStore = create<PrimitiveState>((set, get) => ({
  primitiveType: "box",
  placingPrimitive: null,
  selectedConstraintId: null,
  defaultSize: 1.0,
  snapToGrid: false,
  gridSize: 0.5,
  transformMode: "translate",

  setPrimitiveType: (type) => set({ primitiveType: type }),

  startPlacing: (position) => {
    const state = get();
    const size = state.defaultSize;

    // Snap position if enabled
    let snappedPosition = position;
    if (state.snapToGrid) {
      snappedPosition = position.map(
        (v) => Math.round(v / state.gridSize) * state.gridSize,
      ) as [number, number, number];
    }

    let primitive: PlacingPrimitive;

    switch (state.primitiveType) {
      case "box":
        primitive = {
          type: "box",
          position: snappedPosition,
          halfExtents: [size / 2, size / 2, size / 2],
        };
        break;
      case "sphere":
        primitive = {
          type: "sphere",
          position: snappedPosition,
          radius: size / 2,
        };
        break;
      case "halfspace":
        primitive = {
          type: "halfspace",
          position: snappedPosition,
          normal: [0, 0, 1], // Default: pointing up
        };
        break;
      case "cylinder":
        primitive = {
          type: "cylinder",
          position: snappedPosition,
          radius: size / 2,
          height: size,
        };
        break;
    }

    set({ placingPrimitive: primitive, selectedConstraintId: null });
  },

  updatePlacing: (updates) => {
    const current = get().placingPrimitive;
    if (!current) return;

    set({
      placingPrimitive: { ...current, ...updates },
    });
  },

  cancelPlacing: () => set({ placingPrimitive: null }),

  confirmPlacing: () => {
    const primitive = get().placingPrimitive;
    set({ placingPrimitive: null });
    return primitive;
  },

  selectConstraint: (id) =>
    set({ selectedConstraintId: id, placingPrimitive: null }),

  setDefaultSize: (size) => set({ defaultSize: size }),
  setSnapToGrid: (snap) => set({ snapToGrid: snap }),
  setGridSize: (size) => set({ gridSize: size }),
  setTransformMode: (mode) => set({ transformMode: mode }),
}));
