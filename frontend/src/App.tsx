// ABOUTME: Main application component
// ABOUTME: Combines 3D viewport with UI panels for SDF labeling

import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stats, GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREE from 'three'
import { Leva } from 'leva'
import { Suspense } from 'react'

import { ToastProvider } from './components/ui/ToastProvider'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { PointCloudViewer } from './components/canvas/PointCloudViewer'
import { SelectionVolume } from './components/canvas/SelectionVolume'
import { PrimitivePlacer } from './components/canvas/PrimitivePlacer'
import { BrushPainter } from './components/canvas/BrushPainter'
import { RayScribblePainter } from './components/canvas/RayScribblePainter'
import { PocketDetector } from './components/canvas/PocketDetector'
import { SeedPlacer } from './components/canvas/SeedPlacer'
import { SampleViewer } from './components/canvas/SampleViewer'
import { useBrushStore } from './stores/brushStore'
import { useSeedStore } from './stores/seedStore'
import { Toolbar } from './components/ui/Toolbar'
import { ProjectPanel } from './components/ui/ProjectPanel'
import { LabelPanel } from './components/ui/LabelPanel'
import { StatusBar } from './components/ui/StatusBar'
import { PrimitiveOverlay } from './components/ui/PrimitiveOverlay'
import { useProjectStore } from './stores/projectStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

function Scene() {
  const projectId = useProjectStore((s) => s.currentProjectId)
  const mode = useProjectStore((s) => s.mode)
  const depthAware = useBrushStore((s) => s.depthAware)
  const seeds = useSeedStore((s) => s.seeds)
  const addSeed = useSeedStore((s) => s.addSeed)
  const propagationRadius = useSeedStore((s) => s.propagationRadius)

  // Navigation always available via right-click (rotate) and middle-click (pan)
  // Left-click is reserved for tool interactions

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />

      {/* 3D grid reference - 10m cube with 1m cells */}
      <group>
        {/* XZ plane (floor) */}
        <gridHelper args={[10, 10, '#444444', '#333333']} />
        {/* XY plane (back wall) */}
        <gridHelper args={[10, 10, '#444444', '#333333']} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -5]} />
        {/* YZ plane (side wall) */}
        <gridHelper args={[10, 10, '#444444', '#333333']} rotation={[0, 0, Math.PI / 2]} position={[-5, 0, 0]} />
      </group>

      {/* Point cloud viewer */}
      {projectId && (
        <Suspense fallback={null}>
          <PointCloudViewer projectId={projectId} />
        </Suspense>
      )}

      {/* Selection volume visualization */}
      <SelectionVolume />

      {/* Primitive placer (when in primitive mode) */}
      {projectId && <PrimitivePlacer projectId={projectId} />}

      {/* Brush painter (when in brush mode) */}
      {projectId && (
        <BrushPainter
          projectId={projectId}
          depthAware={depthAware}
        />
      )}

      {/* Ray scribble painter (when in ray_scribble mode) */}
      {projectId && <RayScribblePainter projectId={projectId} />}

      {/* Pocket detector (when in click_pocket mode) */}
      {projectId && <PocketDetector projectId={projectId} />}

      {/* Seed placer (when in seed mode) */}
      {projectId && (
        <SeedPlacer
          projectId={projectId}
          seeds={seeds}
          onAddSeed={addSeed}
          propagationRadius={propagationRadius}
        />
      )}

      {/* Sample visualization */}
      {projectId && <SampleViewer projectId={projectId} />}

      {/* Camera controls - always enabled, right-click to rotate, middle-click to pan */}
      {/* In Orbit mode, left-click also rotates for convenience */}
      <OrbitControls
        makeDefault
        mouseButtons={{
          LEFT: mode === 'orbit' ? THREE.MOUSE.ROTATE : (undefined as unknown as THREE.MOUSE),
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
      />

      {/* Gizmo helper */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#f87171', '#4ade80', '#60a5fa']} labelColor="white" />
      </GizmoHelper>

      {/* Performance stats (dev only) - positioned via CSS in index.css */}
      {import.meta.env.DEV && <Stats className="stats-panel" />}
    </>
  )
}

export default function App() {
  // Global keyboard shortcuts
  useKeyboardShortcuts()

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="flex flex-col h-screen bg-gray-950">
          {/* Top toolbar */}
          <Toolbar />

          {/* Main content area */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left panel - Project & file management */}
            <ProjectPanel />

            {/* 3D Viewport */}
            <div className="flex-1 relative canvas-container">
              <Canvas
                camera={{ position: [5, 5, 5], fov: 50 }}
                gl={{
                  antialias: true,
                  alpha: false,
                  powerPreference: 'high-performance',
                  preserveDrawingBuffer: true,
                }}
                dpr={[1, 2]}
                onCreated={({ gl }) => {
                  // Handle WebGL context loss
                  const canvas = gl.domElement
                  canvas.addEventListener('webglcontextlost', (e) => {
                    e.preventDefault()
                    console.error('WebGL context lost')
                  })
                  canvas.addEventListener('webglcontextrestored', () => {
                    console.log('WebGL context restored')
                  })
                }}
              >
                <color attach="background" args={['#0f0f0f']} />
                <Scene />
              </Canvas>

              {/* Primitive mode overlay UI */}
              <PrimitiveOverlay />

              {/* Grid scale hint */}
              <div className="absolute bottom-2 left-2 text-xs text-gray-500 pointer-events-none select-none">
                Grid: 1m cells
              </div>

              {/* Leva controls (debug panel) */}
              <Leva
                collapsed
                flat
                titleBar={{ title: 'Debug Controls' }}
                theme={{
                  colors: {
                    elevation1: '#1f1f1f',
                    elevation2: '#2a2a2a',
                    elevation3: '#3a3a3a',
                  },
                }}
              />
            </div>

            {/* Right panel - Label controls */}
            <LabelPanel />
          </div>

          {/* Status bar */}
          <StatusBar />
        </div>
      </ToastProvider>
    </ErrorBoundary>
  )
}
