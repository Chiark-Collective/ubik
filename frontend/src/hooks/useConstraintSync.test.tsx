// ABOUTME: Unit tests for useConstraintSync hook
// ABOUTME: Tests API sync for constraint creation and deletion

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useConstraintSync } from './useConstraintSync'
import { useLabelStore, type BoxConstraint } from '../stores/labelStore'
import type { ReactNode } from 'react'

// Mock fetch globally
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useConstraintSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset label store
    useLabelStore.setState({
      constraintsByProject: {},
      undoStack: [],
      redoStack: [],
      maxHistory: 50,
    })

    // Mock the initial constraints loading query (runs on mount)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ constraints: [], total: 0 }),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createConstraint', () => {
    it('should return create and delete functions', () => {
      const { result } = renderHook(() => useConstraintSync('project-123'), {
        wrapper: createWrapper(),
      })

      expect(result.current.createConstraint).toBeInstanceOf(Function)
      expect(result.current.deleteConstraint).toBeInstanceOf(Function)
      expect(result.current.isCreating).toBe(false)
      expect(result.current.isDeleting).toBe(false)
    })

    it('should send box constraint to API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'box-1',
            type: 'box',
            sign: 'solid',
            weight: 1.0,
          }),
      })

      const { result } = renderHook(() => useConstraintSync('project-123'), {
        wrapper: createWrapper(),
      })

      const constraint: BoxConstraint = {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [1, 2, 3],
        halfExtents: [0.5, 0.5, 0.5],
      }

      result.current.createConstraint(constraint)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/v1/projects/project-123/constraints',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        )
      })

      // Verify body
      const callBody = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(callBody.type).toBe('box')
      expect(callBody.center).toEqual([1, 2, 3])
      expect(callBody.half_extents).toEqual([0.5, 0.5, 0.5])
    })

    it('should remove constraint from store on API error', async () => {
      // First, add constraint to store
      useLabelStore.getState().addConstraint('project-123', {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0, 0, 0],
        halfExtents: [1, 1, 1],
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Server error' }),
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useConstraintSync('project-123'), {
        wrapper: createWrapper(),
      })

      result.current.createConstraint({
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0, 0, 0],
        halfExtents: [1, 1, 1],
      })

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to create constraint:',
          expect.any(Error)
        )
      })

      // Constraint should be removed from store on error
      expect(useLabelStore.getState().getConstraints('project-123')).toHaveLength(0)

      consoleSpy.mockRestore()
    })

    it('should throw error when no project selected', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useConstraintSync(null), {
        wrapper: createWrapper(),
      })

      result.current.createConstraint({
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0, 0, 0],
        halfExtents: [1, 1, 1],
      })

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled()
      })

      // fetch should not have been called
      expect(mockFetch).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('deleteConstraint', () => {
    it('should send delete request to API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      })

      const { result } = renderHook(() => useConstraintSync('project-123'), {
        wrapper: createWrapper(),
      })

      result.current.deleteConstraint('constraint-456')

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/v1/projects/project-123/constraints/constraint-456',
          { method: 'DELETE' }
        )
      })
    })

    it('should log error on delete failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Not found' }),
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useConstraintSync('project-123'), {
        wrapper: createWrapper(),
      })

      result.current.deleteConstraint('nonexistent')

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to delete constraint:',
          expect.any(Error)
        )
      })

      consoleSpy.mockRestore()
    })
  })

  describe('constraint type handling', () => {
    it('should format sphere constraint correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'sphere-1' }),
      })

      const { result } = renderHook(() => useConstraintSync('project-123'), {
        wrapper: createWrapper(),
      })

      result.current.createConstraint({
        id: 'sphere-1',
        type: 'sphere',
        sign: 'empty',
        weight: 0.8,
        createdAt: Date.now(),
        center: [1, 2, 3],
        radius: 0.5,
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })

      const callBody = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(callBody.type).toBe('sphere')
      expect(callBody.center).toEqual([1, 2, 3])
      expect(callBody.radius).toBe(0.5)
    })

    it('should format halfspace constraint correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'halfspace-1' }),
      })

      const { result } = renderHook(() => useConstraintSync('project-123'), {
        wrapper: createWrapper(),
      })

      result.current.createConstraint({
        id: 'halfspace-1',
        type: 'halfspace',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        point: [0, 0, 0],
        normal: [0, 0, 1],
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })

      const callBody = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(callBody.type).toBe('halfspace')
      expect(callBody.point).toEqual([0, 0, 0])
      expect(callBody.normal).toEqual([0, 0, 1])
    })

    it('should format cylinder constraint correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'cylinder-1' }),
      })

      const { result } = renderHook(() => useConstraintSync('project-123'), {
        wrapper: createWrapper(),
      })

      result.current.createConstraint({
        id: 'cylinder-1',
        type: 'cylinder',
        sign: 'empty',
        weight: 1.0,
        createdAt: Date.now(),
        center: [1, 2, 3],
        radius: 0.5,
        height: 2.0,
        axis: [0, 1, 0],
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })

      const callBody = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(callBody.type).toBe('cylinder')
      expect(callBody.center).toEqual([1, 2, 3])
      expect(callBody.radius).toBe(0.5)
      expect(callBody.height).toBe(2.0)
      expect(callBody.axis).toEqual([0, 1, 0])
    })

    it('should format brush_stroke constraint correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'stroke-1' }),
      })

      const { result } = renderHook(() => useConstraintSync('project-123'), {
        wrapper: createWrapper(),
      })

      result.current.createConstraint({
        id: 'stroke-1',
        type: 'brush_stroke',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        strokePoints: [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
        radius: 0.1,
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })

      const callBody = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(callBody.type).toBe('brush_stroke')
      expect(callBody.stroke_points).toEqual([[0, 0, 0], [1, 0, 0], [2, 0, 0]])
      expect(callBody.radius).toBe(0.1)
    })
  })
})
