// ABOUTME: Unit tests for labelStore
// ABOUTME: Tests constraint management and undo/redo functionality

import { describe, it, expect, beforeEach } from 'vitest'
import { useLabelStore } from './labelStore'
import type { BoxConstraint, SphereConstraint } from './labelStore'

describe('labelStore', () => {
  const projectId = 'test-project-id'

  beforeEach(() => {
    // Reset store state before each test
    useLabelStore.setState({
      constraintsByProject: {},
      undoStack: [],
      redoStack: [],
      maxHistory: 50,
    })
  })

  describe('addConstraint', () => {
    it('should add a constraint to a project', () => {
      const constraint: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        name: 'Test Box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(projectId, constraint)

      const constraints = useLabelStore.getState().getConstraints(projectId)
      expect(constraints).toHaveLength(1)
      expect(constraints[0]).toEqual(constraint)
    })

    it('should add multiple constraints', () => {
      const box: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      const sphere: SphereConstraint = {
        id: 'sphere-1',
        type: 'sphere',
        sign: 'empty',
        weight: 0.8,
        createdAt: Date.now(),
        center: [0.3, 0.3, 0.3],
        radius: 0.2,
      }

      useLabelStore.getState().addConstraint(projectId, box)
      useLabelStore.getState().addConstraint(projectId, sphere)

      const constraints = useLabelStore.getState().getConstraints(projectId)
      expect(constraints).toHaveLength(2)
    })

    it('should push to undo stack', () => {
      const constraint: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(projectId, constraint)

      expect(useLabelStore.getState().undoStack).toHaveLength(1)
      expect(useLabelStore.getState().undoStack[0].type).toBe('add')
    })

    it('should clear redo stack on new action', () => {
      const constraint1: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      const constraint2: BoxConstraint = {
        id: 'box-2',
        type: 'box',
        sign: 'empty',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.3, 0.3, 0.3],
        halfExtents: [0.1, 0.1, 0.1],
      }

      // Add first, undo it
      useLabelStore.getState().addConstraint(projectId, constraint1)
      useLabelStore.getState().undo(projectId)

      expect(useLabelStore.getState().redoStack).toHaveLength(1)

      // Add another constraint
      useLabelStore.getState().addConstraint(projectId, constraint2)

      // Redo stack should be cleared
      expect(useLabelStore.getState().redoStack).toHaveLength(0)
    })
  })

  describe('removeConstraint', () => {
    it('should remove a constraint by id', () => {
      const constraint: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(projectId, constraint)
      useLabelStore.getState().removeConstraint(projectId, 'box-1')

      const constraints = useLabelStore.getState().getConstraints(projectId)
      expect(constraints).toHaveLength(0)
    })

    it('should not remove other constraints', () => {
      const box1: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      const box2: BoxConstraint = {
        id: 'box-2',
        type: 'box',
        sign: 'empty',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.3, 0.3, 0.3],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(projectId, box1)
      useLabelStore.getState().addConstraint(projectId, box2)
      useLabelStore.getState().removeConstraint(projectId, 'box-1')

      const constraints = useLabelStore.getState().getConstraints(projectId)
      expect(constraints).toHaveLength(1)
      expect(constraints[0].id).toBe('box-2')
    })
  })

  describe('updateConstraint', () => {
    it('should update an existing constraint', () => {
      const constraint: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        name: 'Original',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(projectId, constraint)

      const updated: BoxConstraint = {
        ...constraint,
        name: 'Updated',
        weight: 2.0,
      }

      useLabelStore.getState().updateConstraint(projectId, updated)

      const constraints = useLabelStore.getState().getConstraints(projectId)
      expect(constraints[0].name).toBe('Updated')
      expect(constraints[0].weight).toBe(2.0)
    })
  })

  describe('undo/redo', () => {
    it('should undo add operation', () => {
      const constraint: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(projectId, constraint)
      expect(useLabelStore.getState().getConstraints(projectId)).toHaveLength(1)

      useLabelStore.getState().undo(projectId)
      expect(useLabelStore.getState().getConstraints(projectId)).toHaveLength(0)
    })

    it('should redo undone operation', () => {
      const constraint: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(projectId, constraint)
      useLabelStore.getState().undo(projectId)
      useLabelStore.getState().redo(projectId)

      expect(useLabelStore.getState().getConstraints(projectId)).toHaveLength(1)
    })

    it('should undo remove operation', () => {
      const constraint: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(projectId, constraint)
      useLabelStore.getState().removeConstraint(projectId, 'box-1')
      expect(useLabelStore.getState().getConstraints(projectId)).toHaveLength(0)

      useLabelStore.getState().undo(projectId)
      expect(useLabelStore.getState().getConstraints(projectId)).toHaveLength(1)
    })

    it('should report canUndo and canRedo correctly', () => {
      expect(useLabelStore.getState().canUndo()).toBe(false)
      expect(useLabelStore.getState().canRedo()).toBe(false)

      const constraint: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(projectId, constraint)
      expect(useLabelStore.getState().canUndo()).toBe(true)
      expect(useLabelStore.getState().canRedo()).toBe(false)

      useLabelStore.getState().undo(projectId)
      expect(useLabelStore.getState().canUndo()).toBe(false)
      expect(useLabelStore.getState().canRedo()).toBe(true)
    })
  })

  describe('getConstraints', () => {
    it('should return empty array for unknown project', () => {
      const constraints = useLabelStore.getState().getConstraints('unknown-project')
      expect(constraints).toEqual([])
    })

    it('should isolate constraints by project', () => {
      const project1 = 'project-1'
      const project2 = 'project-2'

      const box1: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      const box2: BoxConstraint = {
        id: 'box-2',
        type: 'box',
        sign: 'empty',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.3, 0.3, 0.3],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(project1, box1)
      useLabelStore.getState().addConstraint(project2, box2)

      expect(useLabelStore.getState().getConstraints(project1)).toHaveLength(1)
      expect(useLabelStore.getState().getConstraints(project2)).toHaveLength(1)
      expect(useLabelStore.getState().getConstraints(project1)[0].id).toBe('box-1')
      expect(useLabelStore.getState().getConstraints(project2)[0].id).toBe('box-2')
    })
  })

  describe('clearConstraints', () => {
    it('should clear all constraints for a project', () => {
      const box: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(projectId, box)
      useLabelStore.getState().clearConstraints(projectId)

      expect(useLabelStore.getState().getConstraints(projectId)).toHaveLength(0)
    })

    it('should clear undo/redo stacks', () => {
      const box: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0.5, 0.5, 0.5],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(projectId, box)
      useLabelStore.getState().undo(projectId)
      useLabelStore.getState().clearConstraints(projectId)

      expect(useLabelStore.getState().undoStack).toHaveLength(0)
      expect(useLabelStore.getState().redoStack).toHaveLength(0)
    })
  })

  describe('setConstraints', () => {
    it('should bulk set constraints for a project', () => {
      const constraints: BoxConstraint[] = [
        {
          id: 'box-1',
          type: 'box',
          sign: 'solid',
          weight: 1.0,
          createdAt: Date.now(),
          center: [0, 0, 0],
          halfExtents: [0.1, 0.1, 0.1],
        },
        {
          id: 'box-2',
          type: 'box',
          sign: 'empty',
          weight: 1.0,
          createdAt: Date.now(),
          center: [1, 0, 0],
          halfExtents: [0.1, 0.1, 0.1],
        },
      ]

      useLabelStore.getState().setConstraints(projectId, constraints)

      expect(useLabelStore.getState().getConstraints(projectId)).toHaveLength(2)
      expect(useLabelStore.getState().getConstraints(projectId)[0].id).toBe('box-1')
      expect(useLabelStore.getState().getConstraints(projectId)[1].id).toBe('box-2')
    })

    it('should replace existing constraints', () => {
      const oldBox: BoxConstraint = {
        id: 'old-box',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0, 0, 0],
        halfExtents: [0.1, 0.1, 0.1],
      }

      useLabelStore.getState().addConstraint(projectId, oldBox)

      const newConstraints: BoxConstraint[] = [
        {
          id: 'new-box',
          type: 'box',
          sign: 'empty',
          weight: 1.0,
          createdAt: Date.now(),
          center: [1, 1, 1],
          halfExtents: [0.2, 0.2, 0.2],
        },
      ]

      useLabelStore.getState().setConstraints(projectId, newConstraints)

      expect(useLabelStore.getState().getConstraints(projectId)).toHaveLength(1)
      expect(useLabelStore.getState().getConstraints(projectId)[0].id).toBe('new-box')
    })

    it('should not affect undo/redo stacks', () => {
      const constraints: BoxConstraint[] = [
        {
          id: 'box-1',
          type: 'box',
          sign: 'solid',
          weight: 1.0,
          createdAt: Date.now(),
          center: [0, 0, 0],
          halfExtents: [0.1, 0.1, 0.1],
        },
      ]

      useLabelStore.getState().setConstraints(projectId, constraints)

      // setConstraints should not populate undo stack
      expect(useLabelStore.getState().undoStack).toHaveLength(0)
      expect(useLabelStore.getState().redoStack).toHaveLength(0)
    })
  })
})
