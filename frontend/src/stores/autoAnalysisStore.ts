// ABOUTME: Zustand store for auto-analysis state
// ABOUTME: Manages generated constraints, selection state, and approval workflow

import { create } from 'zustand'

export type AlgorithmType = 'pocket' | 'normal_offset' | 'flood_fill' | 'voxel_regions'

export interface GeneratedConstraint {
  constraint: {
    type: string
    sign: 'solid' | 'empty'
    [key: string]: unknown
  }
  algorithm: AlgorithmType
  confidence: number
  description: string
}

export interface AlgorithmStats {
  constraintsGenerated: number
  coverageDescription: string
}

export interface AnalysisSummary {
  totalConstraints: number
  solidConstraints: number
  emptyConstraints: number
  algorithmsContributing: number
}

export interface AutoAnalysisResult {
  analysisId: string
  computedAt: string
  algorithmsRun: string[]
  summary: AnalysisSummary
  algorithmStats: Record<string, AlgorithmStats>
  generatedConstraints: GeneratedConstraint[]
}

interface AutoAnalysisState {
  // Analysis result
  result: AutoAnalysisResult | null
  isAnalyzing: boolean
  analyzeError: string | null

  // Constraint selection state
  selectedIndices: Set<number>

  // Apply state
  isApplying: boolean
  applyError: string | null

  // Actions - Analysis
  setResult: (result: AutoAnalysisResult | null) => void
  setIsAnalyzing: (analyzing: boolean) => void
  setAnalyzeError: (error: string | null) => void

  // Actions - Selection
  toggleConstraint: (index: number) => void
  selectAll: () => void
  deselectAll: () => void
  selectByAlgorithm: (algorithm: AlgorithmType) => void
  deselectByAlgorithm: (algorithm: AlgorithmType) => void

  // Actions - Apply
  setIsApplying: (applying: boolean) => void
  setApplyError: (error: string | null) => void

  // Utility
  getSelectedConstraints: () => GeneratedConstraint[]
  reset: () => void
}

export const useAutoAnalysisStore = create<AutoAnalysisState>((set, get) => ({
  // Initial state
  result: null,
  isAnalyzing: false,
  analyzeError: null,
  selectedIndices: new Set<number>(),
  isApplying: false,
  applyError: null,

  // Actions - Analysis
  setResult: (result) => {
    // When new results come in, select all by default
    const indices = new Set<number>()
    if (result) {
      for (let i = 0; i < result.generatedConstraints.length; i++) {
        indices.add(i)
      }
    }
    set({ result, selectedIndices: indices })
  },
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  setAnalyzeError: (error) => set({ analyzeError: error }),

  // Actions - Selection
  toggleConstraint: (index) =>
    set((state) => {
      const newIndices = new Set(state.selectedIndices)
      if (newIndices.has(index)) {
        newIndices.delete(index)
      } else {
        newIndices.add(index)
      }
      return { selectedIndices: newIndices }
    }),

  selectAll: () =>
    set((state) => {
      const indices = new Set<number>()
      if (state.result) {
        for (let i = 0; i < state.result.generatedConstraints.length; i++) {
          indices.add(i)
        }
      }
      return { selectedIndices: indices }
    }),

  deselectAll: () => set({ selectedIndices: new Set<number>() }),

  selectByAlgorithm: (algorithm) =>
    set((state) => {
      const newIndices = new Set(state.selectedIndices)
      if (state.result) {
        state.result.generatedConstraints.forEach((c, i) => {
          if (c.algorithm === algorithm) {
            newIndices.add(i)
          }
        })
      }
      return { selectedIndices: newIndices }
    }),

  deselectByAlgorithm: (algorithm) =>
    set((state) => {
      const newIndices = new Set(state.selectedIndices)
      if (state.result) {
        state.result.generatedConstraints.forEach((c, i) => {
          if (c.algorithm === algorithm) {
            newIndices.delete(i)
          }
        })
      }
      return { selectedIndices: newIndices }
    }),

  // Actions - Apply
  setIsApplying: (applying) => set({ isApplying: applying }),
  setApplyError: (error) => set({ applyError: error }),

  // Utility
  getSelectedConstraints: () => {
    const state = get()
    if (!state.result) return []
    return Array.from(state.selectedIndices)
      .sort((a, b) => a - b)
      .map((i) => state.result!.generatedConstraints[i])
  },

  reset: () =>
    set({
      result: null,
      isAnalyzing: false,
      analyzeError: null,
      selectedIndices: new Set<number>(),
      isApplying: false,
      applyError: null,
    }),
}))
