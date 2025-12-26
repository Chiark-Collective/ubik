// ABOUTME: Zustand store for project state management
// ABOUTME: Tracks current project, point cloud, and UI state

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type InteractionMode =
  | 'orbit'        // Default camera control
  | 'ray_scribble' // NEW: Ray-scribble annotation
  | 'click_pocket' // NEW: Click to detect pockets
  | 'slice'        // 2D slice painting
  | 'primitive'    // Place boxes/spheres/etc
  | 'brush'        // 3D brush selection
  | 'seed'         // Seed + propagate
  | 'import'       // ML model import

// Mode categorization for UI organization
export const PRIMARY_MODES: InteractionMode[] = ['orbit', 'ray_scribble', 'click_pocket', 'slice']
export const SECONDARY_MODES: InteractionMode[] = ['primitive', 'brush', 'seed', 'import']

export type LabelType = 'solid' | 'empty' | 'surface'

export interface Project {
  id: string
  name: string
  description?: string
  pointCloudId?: string
  pointCount?: number
  hasNormals?: boolean
  boundsLow?: [number, number, number]
  boundsHigh?: [number, number, number]
  createdAt: string
  updatedAt: string
}

interface ProjectState {
  // Current project
  currentProjectId: string | null
  projects: Project[]

  // Interaction mode
  mode: InteractionMode
  activeLabel: LabelType

  // Point cloud state
  pointCloudLoaded: boolean
  visiblePointCount: number
  totalPointCount: number
  pointCloudPositions: Float32Array | null  // Consolidated positions from all loaded tiles

  // Selection state
  selectedPointIndices: Set<number>
  brushRadius: number

  // Slice view state
  slicePlane: 'xy' | 'xz' | 'yz'
  slicePosition: number
  sliceThickness: number

  // Sample visualization
  showSamples: boolean

  // Actions
  setCurrentProject: (projectId: string | null) => void
  addProject: (project: Project) => void
  updateProject: (projectId: string, updates: Partial<Project>) => void
  removeProject: (projectId: string) => void

  setMode: (mode: InteractionMode) => void
  setActiveLabel: (label: LabelType) => void

  setPointCloudLoaded: (loaded: boolean) => void
  setVisiblePointCount: (count: number) => void
  setTotalPointCount: (count: number) => void
  setPointCloudPositions: (positions: Float32Array | null) => void

  selectPoints: (indices: number[]) => void
  deselectPoints: (indices: number[]) => void
  clearSelection: () => void
  setBrushRadius: (radius: number) => void

  setSlicePlane: (plane: 'xy' | 'xz' | 'yz') => void
  setSlicePosition: (position: number) => void
  setSliceThickness: (thickness: number) => void

  setShowSamples: (show: boolean) => void

  clearAllProjects: () => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      // Initial state
      currentProjectId: null,
      projects: [],

      mode: 'orbit',
      activeLabel: 'solid',

      pointCloudLoaded: false,
      visiblePointCount: 0,
      totalPointCount: 0,
      pointCloudPositions: null,

      selectedPointIndices: new Set(),
      brushRadius: 0.1,

      slicePlane: 'xy',
      slicePosition: 0,
      sliceThickness: 0.1,

      showSamples: false,

      // Actions
      setCurrentProject: (projectId) =>
        set({ currentProjectId: projectId }),

      addProject: (project) =>
        set((state) => ({
          projects: [...state.projects, project],
        })),

      updateProject: (projectId, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, ...updates } : p
          ),
        })),

      removeProject: (projectId) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== projectId),
          currentProjectId:
            state.currentProjectId === projectId ? null : state.currentProjectId,
        })),

      setMode: (mode) => set({ mode }),
      setActiveLabel: (activeLabel) => set({ activeLabel }),

      setPointCloudLoaded: (loaded) => set({ pointCloudLoaded: loaded }),
      setVisiblePointCount: (count) => set({ visiblePointCount: count }),
      setTotalPointCount: (count) => set({ totalPointCount: count }),
      setPointCloudPositions: (positions) => set({ pointCloudPositions: positions }),

      selectPoints: (indices) =>
        set((state) => {
          const newSet = new Set(state.selectedPointIndices)
          indices.forEach((i) => newSet.add(i))
          return { selectedPointIndices: newSet }
        }),

      deselectPoints: (indices) =>
        set((state) => {
          const newSet = new Set(state.selectedPointIndices)
          indices.forEach((i) => newSet.delete(i))
          return { selectedPointIndices: newSet }
        }),

      clearSelection: () => set({ selectedPointIndices: new Set() }),

      setBrushRadius: (radius) => set({ brushRadius: radius }),

      setSlicePlane: (plane) => set({ slicePlane: plane }),
      setSlicePosition: (position) => set({ slicePosition: position }),
      setSliceThickness: (thickness) => set({ sliceThickness: thickness }),

      setShowSamples: (show) => set({ showSamples: show }),

      clearAllProjects: () =>
        set({
          projects: [],
          currentProjectId: null,
          pointCloudLoaded: false,
          pointCloudPositions: null,
        }),
    }),
    {
      name: 'sdf-labeler-project-store',
      partialize: (state) => ({
        // Only persist these fields
        projects: state.projects,
        currentProjectId: state.currentProjectId,
        brushRadius: state.brushRadius,
        sliceThickness: state.sliceThickness,
      }),
    }
  )
)
