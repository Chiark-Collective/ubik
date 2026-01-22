// ABOUTME: Global keyboard shortcuts hook
// ABOUTME: Handles mode switching, undo/redo, and tool shortcuts

import { useEffect } from "react";

import { useProjectStore, type LabelType } from "../stores/projectStore";
import { useLabelStore } from "../stores/labelStore";
import { usePrimitiveStore } from "../stores/primitiveStore";

export function useKeyboardShortcuts() {
  const mode = useProjectStore((s) => s.mode);
  const setMode = useProjectStore((s) => s.setMode);
  const activeLabel = useProjectStore((s) => s.activeLabel);
  const setActiveLabel = useProjectStore((s) => s.setActiveLabel);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const brushRadius = useProjectStore((s) => s.brushRadius);
  const setBrushRadius = useProjectStore((s) => s.setBrushRadius);

  const undo = useLabelStore((s) => s.undo);
  const redo = useLabelStore((s) => s.redo);

  const setPrimitiveType = usePrimitiveStore((s) => s.setPrimitiveType);
  const cancelPlacing = usePrimitiveStore((s) => s.cancelPlacing);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Meta/Ctrl key combinations
      if (e.metaKey || e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case "z":
            e.preventDefault();
            if (e.shiftKey) {
              // Redo
              if (currentProjectId) redo(currentProjectId);
            } else {
              // Undo
              if (currentProjectId) undo(currentProjectId);
            }
            break;
        }
        return;
      }

      // Mode switching (without modifiers)
      switch (e.key.toLowerCase()) {
        // Global mode shortcuts
        case "escape":
          e.preventDefault();
          if (mode !== "orbit") {
            setMode("orbit");
            cancelPlacing();
          }
          break;

        // Primary modes
        case "r":
          e.preventDefault();
          setMode("ray_scribble");
          break;

        case "c":
          e.preventDefault();
          setMode("click_pocket");
          break;

        case "s":
          // Only switch mode if not Ctrl+S (save)
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setMode("slice");
          }
          break;

        case "a":
          e.preventDefault();
          setMode("auto");
          break;

        // Secondary modes
        case "p":
          e.preventDefault();
          setMode("primitive");
          break;

        case "b":
          e.preventDefault();
          if (mode === "primitive") {
            // In primitive mode, B = box
            setPrimitiveType("box");
          } else {
            // Otherwise, B = brush mode
            setMode("brush");
          }
          break;

        case "g":
          e.preventDefault();
          setMode("seed");
          break;

        case "i":
          e.preventDefault();
          setMode("import");
          break;

        // Toggle label type
        case "tab":
          e.preventDefault();
          const labels: LabelType[] = ["solid", "empty", "surface"];
          const currentIndex = labels.indexOf(activeLabel);
          const nextIndex = (currentIndex + 1) % labels.length;
          setActiveLabel(labels[nextIndex]);
          break;

        // Primitive type shortcuts (when in primitive mode)
        case "o":
          if (mode === "primitive") {
            e.preventDefault();
            setPrimitiveType("sphere");
          }
          break;

        case "h":
          if (mode === "primitive") {
            e.preventDefault();
            setPrimitiveType("halfspace");
          }
          break;

        case "y":
          // Y for cYlinder (C is now click_pocket)
          if (mode === "primitive") {
            e.preventDefault();
            setPrimitiveType("cylinder");
          }
          break;

        // Brush size (when in brush mode)
        case "[":
          if (mode === "brush") {
            e.preventDefault();
            setBrushRadius(Math.max(0.01, brushRadius - 0.05));
          }
          break;

        case "]":
          if (mode === "brush") {
            e.preventDefault();
            setBrushRadius(Math.min(2, brushRadius + 0.05));
          }
          break;

        // Slice plane switching (when in slice mode)
        case "1":
          if (mode === "slice") {
            e.preventDefault();
            useProjectStore.getState().setSlicePlane("xy");
          }
          break;

        case "2":
          if (mode === "slice") {
            e.preventDefault();
            useProjectStore.getState().setSlicePlane("xz");
          }
          break;

        case "3":
          if (mode === "slice") {
            e.preventDefault();
            useProjectStore.getState().setSlicePlane("yz");
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    mode,
    setMode,
    activeLabel,
    setActiveLabel,
    currentProjectId,
    undo,
    redo,
    setPrimitiveType,
    cancelPlacing,
    brushRadius,
    setBrushRadius,
  ]);
}
