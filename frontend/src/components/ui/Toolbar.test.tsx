// ABOUTME: Unit tests for Toolbar component
// ABOUTME: Tests mode switching buttons (primary + dropdown) and undo/redo functionality

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toolbar } from './Toolbar'
import { useProjectStore } from '../../stores/projectStore'
import { useLabelStore } from '../../stores/labelStore'

describe('Toolbar', () => {
  beforeEach(() => {
    // Reset stores
    useProjectStore.setState({
      currentProjectId: 'test-project',
      activeLabel: 'solid',
      mode: 'orbit',
      brushRadius: 0.1,
      slicePlane: 'xy',
      slicePosition: 0,
    })

    useLabelStore.setState({
      constraintsByProject: {},
      undoStack: [],
      redoStack: [],
      maxHistory: 50,
    })
  })

  describe('branding', () => {
    it('should display app name', () => {
      render(<Toolbar />)

      expect(screen.getByText('SDF Labeler')).toBeInTheDocument()
    })
  })

  describe('primary mode buttons', () => {
    it('should render 5 primary mode buttons in toggle group', () => {
      render(<Toolbar />)

      // Mode buttons are toggle items, we check they're rendered
      const toggleGroup = screen.getByRole('group')
      expect(toggleGroup).toBeInTheDocument()

      // Should have 5 primary mode buttons (orbit, ray_scribble, click_pocket, auto, slice)
      const buttons = toggleGroup.querySelectorAll('[role="radio"]')
      expect(buttons).toHaveLength(5)
    })

    it('should have orbit as initial mode', () => {
      render(<Toolbar />)

      // The mode in the store should be 'orbit' by default
      expect(useProjectStore.getState().mode).toBe('orbit')
    })

    it('should switch to ray_scribble mode when clicked', () => {
      render(<Toolbar />)

      const toggleGroup = screen.getByRole('group')
      const buttons = toggleGroup.querySelectorAll('[role="radio"]')

      // Click ray_scribble mode button (second in primary group)
      fireEvent.click(buttons[1])

      expect(useProjectStore.getState().mode).toBe('ray_scribble')
    })

    it('should switch to click_pocket mode when clicked', () => {
      render(<Toolbar />)

      const toggleGroup = screen.getByRole('group')
      const buttons = toggleGroup.querySelectorAll('[role="radio"]')

      // Click click_pocket mode button (third in primary group)
      fireEvent.click(buttons[2])

      expect(useProjectStore.getState().mode).toBe('click_pocket')
    })

    it('should switch to slice mode when clicked', () => {
      render(<Toolbar />)

      const toggleGroup = screen.getByRole('group')
      const buttons = toggleGroup.querySelectorAll('[role="radio"]')

      // Click slice mode button (fourth in primary group)
      fireEvent.click(buttons[3])

      expect(useProjectStore.getState().mode).toBe('slice')
    })
  })

  describe('secondary modes dropdown', () => {
    it('should render secondary tools dropdown', () => {
      render(<Toolbar />)

      const dropdown = screen.getByTestId('secondary-tools-dropdown')
      expect(dropdown).toBeInTheDocument()
    })

    it('should highlight dropdown when secondary mode is active', () => {
      useProjectStore.setState({ mode: 'primitive' })
      render(<Toolbar />)

      const dropdown = screen.getByTestId('secondary-tools-dropdown')
      expect(dropdown.className).toContain('bg-blue-600')
    })

    it('should switch to primitive mode from dropdown', async () => {
      const user = userEvent.setup()
      render(<Toolbar />)

      // Open dropdown using userEvent for proper Radix handling
      const dropdownTrigger = screen.getByTestId('secondary-tools-dropdown')
      await user.click(dropdownTrigger)

      // Wait for dropdown content and click primitive option
      const primitiveOption = await screen.findByTestId('mode-primitive')
      await user.click(primitiveOption)

      expect(useProjectStore.getState().mode).toBe('primitive')
    })

    it('should switch to brush mode from dropdown', async () => {
      const user = userEvent.setup()
      render(<Toolbar />)

      const dropdownTrigger = screen.getByTestId('secondary-tools-dropdown')
      await user.click(dropdownTrigger)

      const brushOption = await screen.findByTestId('mode-brush')
      await user.click(brushOption)

      expect(useProjectStore.getState().mode).toBe('brush')
    })

    it('should switch to seed mode from dropdown', async () => {
      const user = userEvent.setup()
      render(<Toolbar />)

      const dropdownTrigger = screen.getByTestId('secondary-tools-dropdown')
      await user.click(dropdownTrigger)

      const seedOption = await screen.findByTestId('mode-seed')
      await user.click(seedOption)

      expect(useProjectStore.getState().mode).toBe('seed')
    })

    it('should switch to import mode from dropdown', async () => {
      const user = userEvent.setup()
      render(<Toolbar />)

      const dropdownTrigger = screen.getByTestId('secondary-tools-dropdown')
      await user.click(dropdownTrigger)

      const importOption = await screen.findByTestId('mode-import')
      await user.click(importOption)

      expect(useProjectStore.getState().mode).toBe('import')
    })
  })

  describe('undo/redo buttons', () => {
    // Helper to get undo/redo buttons by their icons/structure
    const getUndoRedoButtons = () => {
      // Get all buttons that are not in the toggle group or dropdown
      const allButtons = screen.getAllByRole('button')
      // Filter to find the undo (counter-clockwise) and redo (reset) buttons
      // They should be after the dropdown trigger
      const undoRedo = allButtons.filter(btn => {
        const testId = btn.getAttribute('data-testid')
        const isDropdown = testId === 'secondary-tools-dropdown'
        const isToggleItem = btn.getAttribute('role') === 'radio'
        return !isDropdown && !isToggleItem && !btn.textContent?.includes('?')
      })
      return undoRedo
    }

    it('should disable undo when stack is empty', () => {
      render(<Toolbar />)

      const buttons = getUndoRedoButtons()
      const undoButton = buttons[0]
      expect(undoButton).toBeDisabled()
    })

    it('should disable redo when stack is empty', () => {
      render(<Toolbar />)

      const buttons = getUndoRedoButtons()
      const redoButton = buttons[1]
      expect(redoButton).toBeDisabled()
    })

    it('should enable undo when stack has items', () => {
      // Add constraint then we'll have undo stack
      useLabelStore.getState().addConstraint('test-project', {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0, 0, 0],
        halfExtents: [1, 1, 1],
      })

      render(<Toolbar />)

      const buttons = getUndoRedoButtons()
      const undoButton = buttons[0]
      expect(undoButton).not.toBeDisabled()
    })

    it('should perform undo when clicked', () => {
      // Add constraint
      useLabelStore.getState().addConstraint('test-project', {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0, 0, 0],
        halfExtents: [1, 1, 1],
      })

      expect(useLabelStore.getState().getConstraints('test-project')).toHaveLength(1)

      render(<Toolbar />)

      const buttons = getUndoRedoButtons()
      const undoButton = buttons[0]
      fireEvent.click(undoButton)

      expect(useLabelStore.getState().getConstraints('test-project')).toHaveLength(0)
    })

    it('should enable redo after undo', () => {
      // Add constraint and undo
      useLabelStore.getState().addConstraint('test-project', {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0, 0, 0],
        halfExtents: [1, 1, 1],
      })
      useLabelStore.getState().undo('test-project')

      render(<Toolbar />)

      const buttons = getUndoRedoButtons()
      const redoButton = buttons[1]
      expect(redoButton).not.toBeDisabled()
    })

    it('should perform redo when clicked', () => {
      // Add constraint and undo
      useLabelStore.getState().addConstraint('test-project', {
        id: 'box-1',
        type: 'box',
        sign: 'solid',
        weight: 1.0,
        createdAt: Date.now(),
        center: [0, 0, 0],
        halfExtents: [1, 1, 1],
      })
      useLabelStore.getState().undo('test-project')

      expect(useLabelStore.getState().getConstraints('test-project')).toHaveLength(0)

      render(<Toolbar />)

      const buttons = getUndoRedoButtons()
      const redoButton = buttons[1]
      fireEvent.click(redoButton)

      expect(useLabelStore.getState().getConstraints('test-project')).toHaveLength(1)
    })
  })

  describe('help button', () => {
    it('should render help button', () => {
      render(<Toolbar />)

      // Help button has "?" text
      expect(screen.getByText('?')).toBeInTheDocument()
    })
  })
})
