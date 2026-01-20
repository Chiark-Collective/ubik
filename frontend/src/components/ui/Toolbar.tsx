// ABOUTME: Top toolbar with mode selection and global actions
// ABOUTME: Provides interaction mode toggle and undo/redo buttons

import { useCallback } from 'react'
import {
  CursorArrowIcon,
  BoxIcon,
  ShadowIcon,
  CircleIcon,
  MixIcon,
  UploadIcon,
  ResetIcon,
  CounterClockwiseClockIcon,
  Pencil2Icon,
  Component1Icon,
  DotsHorizontalIcon,
  ChevronDownIcon,
  MagicWandIcon,
} from '@radix-ui/react-icons'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

import { useProjectStore, type InteractionMode, SECONDARY_MODES } from '../../stores/projectStore'
import { useLabelStore } from '../../stores/labelStore'

interface ModeConfig {
  value: InteractionMode
  icon: typeof CursorArrowIcon
  label: string
  shortcut: string
  ariaLabel: string
}

const primaryModes: ModeConfig[] = [
  { value: 'orbit', icon: CursorArrowIcon, label: 'Navigate', shortcut: 'Esc', ariaLabel: 'Orbit' },
  { value: 'ray_scribble', icon: Pencil2Icon, label: 'Ray Scribble', shortcut: 'R', ariaLabel: 'Ray Scribble' },
  { value: 'click_pocket', icon: Component1Icon, label: 'Click Pocket', shortcut: 'C', ariaLabel: 'Click Pocket' },
  { value: 'slice', icon: ShadowIcon, label: 'Slice Paint', shortcut: 'S', ariaLabel: 'Slice' },
  { value: 'auto', icon: MagicWandIcon, label: 'Auto Analysis', shortcut: 'A', ariaLabel: 'Auto' },
]

const secondaryModes: ModeConfig[] = [
  { value: 'primitive', icon: BoxIcon, label: 'Place Primitives', shortcut: 'P', ariaLabel: 'Primitive' },
  { value: 'brush', icon: CircleIcon, label: '3D Brush', shortcut: 'B', ariaLabel: 'Brush' },
  { value: 'seed', icon: MixIcon, label: 'Seed & Propagate', shortcut: 'G', ariaLabel: 'Seed' },
  { value: 'import', icon: UploadIcon, label: 'Import ML', shortcut: 'I', ariaLabel: 'Import' },
]

export function Toolbar() {
  const mode = useProjectStore((s) => s.mode)
  const setMode = useProjectStore((s) => s.setMode)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)

  const canUndo = useLabelStore((s) => s.canUndo())
  const canRedo = useLabelStore((s) => s.canRedo())
  const undo = useLabelStore((s) => s.undo)
  const redo = useLabelStore((s) => s.redo)

  const handleUndo = useCallback(() => {
    if (currentProjectId) {
      undo(currentProjectId)
    }
  }, [currentProjectId, undo])

  const handleRedo = useCallback(() => {
    if (currentProjectId) {
      redo(currentProjectId)
    }
  }, [currentProjectId, redo])

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-900 border-b border-gray-800">
        {/* Logo/Title */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-orange-500" />
          <span className="font-semibold text-white">SDF Labeler</span>
        </div>

        <div className="w-px h-6 bg-gray-700" />

        {/* Primary mode selection */}
        <ToggleGroup.Root
          type="single"
          value={mode}
          onValueChange={(value) => value && setMode(value as InteractionMode)}
          className="flex gap-1"
        >
          {primaryModes.map(({ value, icon: Icon, label, shortcut, ariaLabel }) => (
            <Tooltip.Root key={value}>
              <Tooltip.Trigger asChild>
                <ToggleGroup.Item
                  value={value}
                  aria-label={ariaLabel}
                  data-testid={`mode-${value}`}
                  className={`
                    p-2 rounded transition-colors
                    ${mode === value
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                </ToggleGroup.Item>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="px-3 py-2 text-sm bg-gray-800 rounded shadow-lg border border-gray-700"
                  sideOffset={5}
                >
                  <div className="flex items-center gap-2">
                    <span>{label}</span>
                    <kbd className="px-1.5 py-0.5 text-xs bg-gray-700 rounded">{shortcut}</kbd>
                  </div>
                  <Tooltip.Arrow className="fill-gray-800" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          ))}
        </ToggleGroup.Root>

        {/* Secondary modes dropdown */}
        <DropdownMenu.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <DropdownMenu.Trigger asChild>
                <button
                  data-testid="secondary-tools-dropdown"
                  className={`
                    p-2 rounded transition-colors flex items-center gap-1
                    ${SECONDARY_MODES.includes(mode)
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }
                  `}
                >
                  <DotsHorizontalIcon className="w-5 h-5" />
                  <ChevronDownIcon className="w-3 h-3" />
                </button>
              </DropdownMenu.Trigger>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="px-3 py-2 text-sm bg-gray-800 rounded shadow-lg border border-gray-700"
                sideOffset={5}
              >
                Advanced Tools
                <Tooltip.Arrow className="fill-gray-800" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[180px] bg-gray-800 rounded-md shadow-lg border border-gray-700 p-1"
              sideOffset={5}
            >
              {secondaryModes.map(({ value, icon: Icon, label, shortcut, ariaLabel: _ariaLabel }) => (
                <DropdownMenu.Item
                  key={value}
                  data-testid={`mode-${value}`}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded cursor-pointer outline-none
                    ${mode === value
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }
                  `}
                  onSelect={() => setMode(value)}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1">{label}</span>
                  <kbd className="px-1.5 py-0.5 text-xs bg-gray-900 rounded">{shortcut}</kbd>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <div className="w-px h-6 bg-gray-700" />

        {/* Undo/Redo */}
        <div className="flex gap-1">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className={`
                  p-2 rounded transition-colors
                  ${canUndo
                    ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                    : 'text-gray-600 cursor-not-allowed'
                  }
                `}
              >
                <CounterClockwiseClockIcon className="w-5 h-5" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="px-3 py-2 text-sm bg-gray-800 rounded shadow-lg border border-gray-700"
                sideOffset={5}
              >
                <div className="flex items-center gap-2">
                  <span>Undo</span>
                  <kbd className="px-1.5 py-0.5 text-xs bg-gray-700 rounded">⌘Z</kbd>
                </div>
                <Tooltip.Arrow className="fill-gray-800" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                className={`
                  p-2 rounded transition-colors
                  ${canRedo
                    ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                    : 'text-gray-600 cursor-not-allowed'
                  }
                `}
              >
                <ResetIcon className="w-5 h-5" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="px-3 py-2 text-sm bg-gray-800 rounded shadow-lg border border-gray-700"
                sideOffset={5}
              >
                <div className="flex items-center gap-2">
                  <span>Redo</span>
                  <kbd className="px-1.5 py-0.5 text-xs bg-gray-700 rounded">⌘⇧Z</kbd>
                </div>
                <Tooltip.Arrow className="fill-gray-800" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Help */}
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded">
              <span className="text-sm">?</span>
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="px-3 py-2 text-sm bg-gray-800 rounded shadow-lg border border-gray-700"
              sideOffset={5}
            >
              Keyboard Shortcuts
              <Tooltip.Arrow className="fill-gray-800" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    </Tooltip.Provider>
  )
}
