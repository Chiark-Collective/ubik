// ABOUTME: Zustand store for seed placement and propagation state
// ABOUTME: Tracks placed seeds and propagation parameters

import { create } from "zustand";

export interface SeedPoint {
  position: [number, number, number];
  pointIndex?: number;
}

interface SeedState {
  // Placed seeds
  seeds: SeedPoint[];

  // Propagation settings
  propagationRadius: number;

  // Actions
  addSeed: (position: [number, number, number], pointIndex?: number) => void;
  removeSeed: (index: number) => void;
  clearSeeds: () => void;
  setPropagationRadius: (radius: number) => void;
}

export const useSeedStore = create<SeedState>((set) => ({
  seeds: [],
  propagationRadius: 0.5,

  addSeed: (position, pointIndex) =>
    set((state) => ({
      seeds: [...state.seeds, { position, pointIndex }],
    })),

  removeSeed: (index) =>
    set((state) => ({
      seeds: state.seeds.filter((_, i) => i !== index),
    })),

  clearSeeds: () => set({ seeds: [] }),

  setPropagationRadius: (radius) => set({ propagationRadius: radius }),
}));
