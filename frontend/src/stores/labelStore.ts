// ABOUTME: Zustand store for label and constraint management
// ABOUTME: Handles undo/redo and constraint operations

import { create } from 'zustand'

export type ConstraintType =
  | 'box'
  | 'sphere'
  | 'halfspace'
  | 'cylinder'
  | 'brush_stroke'
  | 'seed_propagation'
  | 'ml_import'
  | 'ray_carve'
  | 'pocket'
  | 'slice_selection'

export type SignConvention = 'solid' | 'empty' | 'surface'

export interface BaseConstraint {
  id: string
  type: ConstraintType
  name?: string
  sign: SignConvention
  weight: number
  createdAt: number
}

export interface BoxConstraint extends BaseConstraint {
  type: 'box'
  center: [number, number, number]
  halfExtents: [number, number, number]
}

export interface SphereConstraint extends BaseConstraint {
  type: 'sphere'
  center: [number, number, number]
  radius: number
}

export interface HalfspaceConstraint extends BaseConstraint {
  type: 'halfspace'
  point: [number, number, number]
  normal: [number, number, number]
}

export interface CylinderConstraint extends BaseConstraint {
  type: 'cylinder'
  center: [number, number, number]
  axis: [number, number, number]
  radius: number
  height: number
}

export interface BrushStrokeConstraint extends BaseConstraint {
  type: 'brush_stroke'
  strokePoints: [number, number, number][]  // Path of brush center positions
  radius: number                             // Brush radius
}

export interface SeedPropagationConstraint extends BaseConstraint {
  type: 'seed_propagation'
  seedPoint: [number, number, number]
  propagationRadius: number
  propagatedIndices: number[]
  confidences: number[]
}

export interface MLImportConstraint extends BaseConstraint {
  type: 'ml_import'
  sourceFile: string
  sourceClass: string | number
  pointIndices: number[]
  confidences: number[]
}

export interface RayInfo {
  origin: [number, number, number]
  direction: [number, number, number]
  hitDistance: number
  surfaceNormal?: [number, number, number]
  hitPointIndex?: number    // Index into consolidated positions for spacing lookup
  localSpacing?: number     // Local point spacing at hit point (k-NN mean distance)
}

export interface RayCarveConstraint extends BaseConstraint {
  type: 'ray_carve'
  rays: RayInfo[]
  emptyBandWidth: number
  surfaceBandWidth: number
  backBufferWidth: number         // Fixed distance past hit (fallback)
  backBufferCoefficient: number   // Multiplier for per-ray localSpacing
}

export interface PocketConstraint extends BaseConstraint {
  type: 'pocket'
  pocketId: number
  voxelCount: number
  centroid: [number, number, number]
  boundsLow: [number, number, number]
  boundsHigh: [number, number, number]
  volumeEstimate: number
}

export interface SliceSelectionConstraint extends BaseConstraint {
  type: 'slice_selection'
  pointIndices: number[]
  slicePlane: 'xy' | 'xz' | 'yz'
  slicePosition: number
}

export type Constraint =
  | BoxConstraint
  | SphereConstraint
  | HalfspaceConstraint
  | CylinderConstraint
  | BrushStrokeConstraint
  | SeedPropagationConstraint
  | MLImportConstraint
  | RayCarveConstraint
  | PocketConstraint
  | SliceSelectionConstraint

interface LabelAction {
  id: string
  type: 'add' | 'remove' | 'update'
  constraint: Constraint
  timestamp: number
}

interface LabelState {
  // Constraints by project
  constraintsByProject: Record<string, Constraint[]>

  // Undo/redo stacks
  undoStack: LabelAction[]
  redoStack: LabelAction[]
  maxHistory: number

  // Actions
  addConstraint: (projectId: string, constraint: Constraint) => void
  removeConstraint: (projectId: string, constraintId: string) => void
  updateConstraint: (projectId: string, constraint: Constraint) => void
  getConstraints: (projectId: string) => Constraint[]

  undo: (projectId: string) => void
  redo: (projectId: string) => void
  canUndo: () => boolean
  canRedo: () => boolean

  clearConstraints: (projectId: string) => void
  setConstraints: (projectId: string, constraints: Constraint[]) => void
}

export const useLabelStore = create<LabelState>((set, get) => ({
  constraintsByProject: {},
  undoStack: [],
  redoStack: [],
  maxHistory: 50,

  addConstraint: (projectId, constraint) => {
    const action: LabelAction = {
      id: crypto.randomUUID(),
      type: 'add',
      constraint,
      timestamp: Date.now(),
    }

    set((state) => {
      const existing = state.constraintsByProject[projectId] || []
      return {
        constraintsByProject: {
          ...state.constraintsByProject,
          [projectId]: [...existing, constraint],
        },
        undoStack: [...state.undoStack.slice(-state.maxHistory + 1), action],
        redoStack: [], // Clear redo stack on new action
      }
    })
  },

  removeConstraint: (projectId, constraintId) => {
    const state = get()
    const existing = state.constraintsByProject[projectId] || []
    const constraint = existing.find((c) => c.id === constraintId)

    if (!constraint) return

    const action: LabelAction = {
      id: crypto.randomUUID(),
      type: 'remove',
      constraint,
      timestamp: Date.now(),
    }

    set((state) => ({
      constraintsByProject: {
        ...state.constraintsByProject,
        [projectId]: existing.filter((c) => c.id !== constraintId),
      },
      undoStack: [...state.undoStack.slice(-state.maxHistory + 1), action],
      redoStack: [],
    }))
  },

  updateConstraint: (projectId, constraint) => {
    const state = get()
    const existing = state.constraintsByProject[projectId] || []
    const oldConstraint = existing.find((c) => c.id === constraint.id)

    if (!oldConstraint) return

    const action: LabelAction = {
      id: crypto.randomUUID(),
      type: 'update',
      constraint: oldConstraint, // Store old version for undo
      timestamp: Date.now(),
    }

    set((state) => ({
      constraintsByProject: {
        ...state.constraintsByProject,
        [projectId]: existing.map((c) =>
          c.id === constraint.id ? constraint : c
        ),
      },
      undoStack: [...state.undoStack.slice(-state.maxHistory + 1), action],
      redoStack: [],
    }))
  },

  getConstraints: (projectId) => {
    return get().constraintsByProject[projectId] || []
  },

  undo: (projectId) => {
    const state = get()
    const action = state.undoStack[state.undoStack.length - 1]

    if (!action) return

    set((state) => {
      const existing = state.constraintsByProject[projectId] || []
      let newConstraints: Constraint[]

      switch (action.type) {
        case 'add':
          // Undo add = remove
          newConstraints = existing.filter((c) => c.id !== action.constraint.id)
          break
        case 'remove':
          // Undo remove = add back
          newConstraints = [...existing, action.constraint]
          break
        case 'update':
          // Undo update = restore old version
          newConstraints = existing.map((c) =>
            c.id === action.constraint.id ? action.constraint : c
          )
          break
        default:
          newConstraints = existing
      }

      return {
        constraintsByProject: {
          ...state.constraintsByProject,
          [projectId]: newConstraints,
        },
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, action],
      }
    })
  },

  redo: (projectId) => {
    const state = get()
    const action = state.redoStack[state.redoStack.length - 1]

    if (!action) return

    set((state) => {
      const existing = state.constraintsByProject[projectId] || []
      let newConstraints: Constraint[]

      switch (action.type) {
        case 'add':
          // Redo add
          newConstraints = [...existing, action.constraint]
          break
        case 'remove':
          // Redo remove
          newConstraints = existing.filter((c) => c.id !== action.constraint.id)
          break
        case 'update':
          // Redo update (would need to store new version too for proper redo)
          newConstraints = existing
          break
        default:
          newConstraints = existing
      }

      return {
        constraintsByProject: {
          ...state.constraintsByProject,
          [projectId]: newConstraints,
        },
        undoStack: [...state.undoStack, action],
        redoStack: state.redoStack.slice(0, -1),
      }
    })
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  clearConstraints: (projectId) => {
    set((state) => ({
      constraintsByProject: {
        ...state.constraintsByProject,
        [projectId]: [],
      },
      undoStack: [],
      redoStack: [],
    }))
  },

  setConstraints: (projectId, constraints) => {
    // Bulk set constraints without affecting undo/redo (used for loading from backend)
    set((state) => ({
      constraintsByProject: {
        ...state.constraintsByProject,
        [projectId]: constraints,
      },
      // Don't modify undo/redo - this is a load, not a user action
    }))
  },
}))
