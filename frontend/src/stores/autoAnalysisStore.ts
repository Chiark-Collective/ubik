// ABOUTME: Zustand store for auto-analysis state
// ABOUTME: Manages generated constraints, selection state, and approval workflow

import { create } from "zustand";

export type AlgorithmType =
  | "pocket"
  | "flood_fill"
  | "voxel_regions"
  | "normal_idw";

export interface GeneratedConstraint {
  constraint: {
    type: string;
    sign: "solid" | "empty";
    [key: string]: unknown;
  };
  algorithm: AlgorithmType;
  confidence: number;
  description: string;
}

export interface AlgorithmStats {
  constraintsGenerated: number;
  coverageDescription: string;
}

export interface AnalysisSummary {
  totalConstraints: number;
  solidConstraints: number;
  emptyConstraints: number;
  algorithmsContributing: number;
}

export interface AutoAnalysisResult {
  analysisId: string;
  computedAt: string;
  algorithmsRun: string[];
  summary: AnalysisSummary;
  algorithmStats: Record<string, AlgorithmStats>;
  generatedConstraints: GeneratedConstraint[];
}

export interface AutoAnalysisOptions {
  // Voxel grid parameters
  min_gap_size: number; // 0.01-1.0, default 0.10
  max_grid_dim: number; // 50-500, default 200

  // Ray propagation
  cone_angle: number; // 0-45, default 15.0

  // Filtering
  max_boxes: number; // 5-100, default 15
  overlap_threshold: number; // 0.1-0.9, default 0.5

  // IDW Normal sampling
  idw_sample_count: number; // 100-10000, default 1000
  idw_max_distance: number; // 0.05-2.0, default 0.5
  idw_power: number; // 0.5-4.0, default 2.0

  // Hull filtering - removes constraints outside X-Y alpha shape
  hull_filter_enabled: boolean; // default true
  hull_alpha: number; // 0.1-20.0, default 2.0 (smaller = tighter fit)

  // Flood fill output mode (EMPTY regions)
  flood_fill_output: "boxes" | "samples" | "both"; // default "samples"
  flood_fill_sample_count: number; // 50-5000, default 500

  // Voxel regions output mode (SOLID regions)
  voxel_regions_output: "boxes" | "samples" | "both"; // default "samples"
  voxel_regions_sample_count: number; // 50-5000, default 500
}

export const DEFAULT_OPTIONS: AutoAnalysisOptions = {
  min_gap_size: 0.1,
  max_grid_dim: 200,
  cone_angle: 15.0,
  max_boxes: 30,
  overlap_threshold: 0.5,
  idw_sample_count: 1000,
  idw_max_distance: 0.5,
  idw_power: 2.0,
  hull_filter_enabled: true,
  hull_alpha: 1.0,
  flood_fill_output: "samples",
  flood_fill_sample_count: 500,
  voxel_regions_output: "samples",
  voxel_regions_sample_count: 500,
};

interface AutoAnalysisState {
  // Analysis result
  result: AutoAnalysisResult | null;
  isAnalyzing: boolean;
  analyzeError: string | null;

  // Constraint selection state
  selectedIndices: Set<number>;

  // Options state
  options: AutoAnalysisOptions;

  // Apply state
  isApplying: boolean;
  applyError: string | null;

  // Actions - Analysis
  setResult: (result: AutoAnalysisResult | null) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  setAnalyzeError: (error: string | null) => void;

  // Actions - Options
  setOptions: (options: Partial<AutoAnalysisOptions>) => void;
  resetOptions: () => void;

  // Actions - Selection
  toggleConstraint: (index: number) => void;
  selectAll: () => void;
  deselectAll: () => void;
  selectByAlgorithm: (algorithm: AlgorithmType) => void;
  deselectByAlgorithm: (algorithm: AlgorithmType) => void;

  // Actions - Apply
  setIsApplying: (applying: boolean) => void;
  setApplyError: (error: string | null) => void;

  // Utility
  getSelectedConstraints: () => GeneratedConstraint[];
  reset: () => void;
}

export const useAutoAnalysisStore = create<AutoAnalysisState>((set, get) => ({
  // Initial state
  result: null,
  isAnalyzing: false,
  analyzeError: null,
  selectedIndices: new Set<number>(),
  options: { ...DEFAULT_OPTIONS },
  isApplying: false,
  applyError: null,

  // Actions - Analysis
  setResult: (result) => {
    // When new results come in, select all by default
    const indices = new Set<number>();
    if (result) {
      for (let i = 0; i < result.generatedConstraints.length; i++) {
        indices.add(i);
      }
    }
    set({ result, selectedIndices: indices });
  },
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  setAnalyzeError: (error) => set({ analyzeError: error }),

  // Actions - Selection
  toggleConstraint: (index) =>
    set((state) => {
      const newIndices = new Set(state.selectedIndices);
      if (newIndices.has(index)) {
        newIndices.delete(index);
      } else {
        newIndices.add(index);
      }
      return { selectedIndices: newIndices };
    }),

  selectAll: () =>
    set((state) => {
      const indices = new Set<number>();
      if (state.result) {
        for (let i = 0; i < state.result.generatedConstraints.length; i++) {
          indices.add(i);
        }
      }
      return { selectedIndices: indices };
    }),

  deselectAll: () => set({ selectedIndices: new Set<number>() }),

  selectByAlgorithm: (algorithm) =>
    set((state) => {
      const newIndices = new Set(state.selectedIndices);
      if (state.result) {
        state.result.generatedConstraints.forEach((c, i) => {
          if (c.algorithm === algorithm) {
            newIndices.add(i);
          }
        });
      }
      return { selectedIndices: newIndices };
    }),

  deselectByAlgorithm: (algorithm) =>
    set((state) => {
      const newIndices = new Set(state.selectedIndices);
      if (state.result) {
        state.result.generatedConstraints.forEach((c, i) => {
          if (c.algorithm === algorithm) {
            newIndices.delete(i);
          }
        });
      }
      return { selectedIndices: newIndices };
    }),

  // Actions - Options
  setOptions: (newOptions) =>
    set((state) => ({
      options: { ...state.options, ...newOptions },
    })),
  resetOptions: () => set({ options: { ...DEFAULT_OPTIONS } }),

  // Actions - Apply
  setIsApplying: (applying) => set({ isApplying: applying }),
  setApplyError: (error) => set({ applyError: error }),

  // Utility
  getSelectedConstraints: () => {
    const state = get();
    if (!state.result) return [];
    return Array.from(state.selectedIndices)
      .sort((a, b) => a - b)
      .map((i) => state.result!.generatedConstraints[i]);
  },

  reset: () =>
    set({
      result: null,
      isAnalyzing: false,
      analyzeError: null,
      selectedIndices: new Set<number>(),
      options: { ...DEFAULT_OPTIONS },
      isApplying: false,
      applyError: null,
    }),
}));
