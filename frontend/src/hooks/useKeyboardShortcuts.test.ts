// ABOUTME: Unit tests for useKeyboardShortcuts hook
// ABOUTME: Tests keyboard shortcuts for mode switching and tool selection

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useProjectStore } from "../stores/projectStore";
import { useLabelStore } from "../stores/labelStore";
import { usePrimitiveStore } from "../stores/primitiveStore";

function fireKeyDown(
  key: string,
  options: {
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
  } = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    bubbles: true,
  });
  window.dispatchEvent(event);
}

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    // Reset all stores
    useProjectStore.setState({
      currentProjectId: "test-project",
      activeLabel: "solid",
      mode: "orbit",
      brushRadius: 0.1,
      slicePlane: "xy",
      slicePosition: 0,
    });

    useLabelStore.setState({
      constraintsByProject: {},
      undoStack: [],
      redoStack: [],
      maxHistory: 50,
    });

    usePrimitiveStore.setState({
      primitiveType: "box",
      placingPrimitive: null,
      selectedConstraintId: null,
      defaultSize: 1.0,
      snapToGrid: false,
      gridSize: 0.5,
      transformMode: "translate",
    });
  });

  describe("mode switching", () => {
    describe("primary modes", () => {
      it("should switch to ray_scribble mode with R key", () => {
        renderHook(() => useKeyboardShortcuts());

        act(() => fireKeyDown("r"));

        expect(useProjectStore.getState().mode).toBe("ray_scribble");
      });

      it("should switch to click_pocket mode with C key", () => {
        renderHook(() => useKeyboardShortcuts());

        act(() => fireKeyDown("c"));

        expect(useProjectStore.getState().mode).toBe("click_pocket");
      });

      it("should switch to slice mode with S key", () => {
        renderHook(() => useKeyboardShortcuts());

        act(() => fireKeyDown("s"));

        expect(useProjectStore.getState().mode).toBe("slice");
      });
    });

    describe("secondary modes", () => {
      it("should switch to primitive mode with P key", () => {
        renderHook(() => useKeyboardShortcuts());

        act(() => fireKeyDown("p"));

        expect(useProjectStore.getState().mode).toBe("primitive");
      });

      it("should switch to brush mode with B key (outside primitive mode)", () => {
        renderHook(() => useKeyboardShortcuts());

        act(() => fireKeyDown("b"));

        expect(useProjectStore.getState().mode).toBe("brush");
      });

      it("should switch to seed mode with G key", () => {
        renderHook(() => useKeyboardShortcuts());

        act(() => fireKeyDown("g"));

        expect(useProjectStore.getState().mode).toBe("seed");
      });

      it("should switch to import mode with I key", () => {
        renderHook(() => useKeyboardShortcuts());

        act(() => fireKeyDown("i"));

        expect(useProjectStore.getState().mode).toBe("import");
      });
    });

    describe("escape", () => {
      it("should return to orbit mode with Escape", () => {
        useProjectStore.setState({ mode: "primitive" });
        renderHook(() => useKeyboardShortcuts());

        act(() => fireKeyDown("Escape"));

        expect(useProjectStore.getState().mode).toBe("orbit");
      });

      it("should not switch mode when already in orbit and pressing Escape", () => {
        renderHook(() => useKeyboardShortcuts());

        act(() => fireKeyDown("Escape"));

        expect(useProjectStore.getState().mode).toBe("orbit");
      });
    });
  });

  describe("label toggling", () => {
    it("should cycle from solid to empty with Tab", () => {
      renderHook(() => useKeyboardShortcuts());
      expect(useProjectStore.getState().activeLabel).toBe("solid");

      act(() => {
        fireKeyDown("Tab");
      });
      expect(useProjectStore.getState().activeLabel).toBe("empty");
    });

    it("should cycle from empty to surface with Tab", () => {
      useProjectStore.setState({ activeLabel: "empty" });
      renderHook(() => useKeyboardShortcuts());

      act(() => {
        fireKeyDown("Tab");
      });
      expect(useProjectStore.getState().activeLabel).toBe("surface");
    });

    it("should cycle from surface to solid with Tab", () => {
      useProjectStore.setState({ activeLabel: "surface" });
      renderHook(() => useKeyboardShortcuts());

      act(() => {
        fireKeyDown("Tab");
      });
      expect(useProjectStore.getState().activeLabel).toBe("solid");
    });
  });

  describe("primitive mode shortcuts", () => {
    beforeEach(() => {
      useProjectStore.setState({ mode: "primitive" });
    });

    it("should set box type with B key in primitive mode", () => {
      usePrimitiveStore.setState({ primitiveType: "sphere" });
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("b"));

      expect(usePrimitiveStore.getState().primitiveType).toBe("box");
    });

    it("should set sphere type with O key in primitive mode", () => {
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("o"));

      expect(usePrimitiveStore.getState().primitiveType).toBe("sphere");
    });

    it("should set halfspace type with H key in primitive mode", () => {
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("h"));

      expect(usePrimitiveStore.getState().primitiveType).toBe("halfspace");
    });

    it("should set cylinder type with Y key in primitive mode", () => {
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("y"));

      expect(usePrimitiveStore.getState().primitiveType).toBe("cylinder");
    });

    it("should not set primitive type with O/H/Y outside primitive mode", () => {
      useProjectStore.setState({ mode: "orbit" });
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("o"));
      expect(usePrimitiveStore.getState().primitiveType).toBe("box");

      act(() => fireKeyDown("h"));
      expect(usePrimitiveStore.getState().primitiveType).toBe("box");

      act(() => fireKeyDown("y"));
      expect(usePrimitiveStore.getState().primitiveType).toBe("box");
    });

    it("should switch to click_pocket mode with C key even in primitive mode", () => {
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("c"));

      // C is now a global shortcut for click_pocket, not cylinder
      expect(useProjectStore.getState().mode).toBe("click_pocket");
    });
  });

  describe("brush mode shortcuts", () => {
    beforeEach(() => {
      useProjectStore.setState({ mode: "brush", brushRadius: 0.5 });
    });

    it("should decrease brush size with [ key", () => {
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("["));

      expect(useProjectStore.getState().brushRadius).toBeCloseTo(0.45);
    });

    it("should increase brush size with ] key", () => {
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("]"));

      expect(useProjectStore.getState().brushRadius).toBeCloseTo(0.55);
    });

    it("should not go below minimum brush size", () => {
      useProjectStore.setState({ brushRadius: 0.01 });
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("["));

      expect(useProjectStore.getState().brushRadius).toBe(0.01);
    });

    it("should not go above maximum brush size", () => {
      useProjectStore.setState({ brushRadius: 2.0 });
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("]"));

      expect(useProjectStore.getState().brushRadius).toBe(2.0);
    });
  });

  describe("slice mode shortcuts", () => {
    beforeEach(() => {
      useProjectStore.setState({ mode: "slice" });
    });

    it("should switch to XY plane with 1 key", () => {
      useProjectStore.setState({ slicePlane: "xz" });
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("1"));

      expect(useProjectStore.getState().slicePlane).toBe("xy");
    });

    it("should switch to XZ plane with 2 key", () => {
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("2"));

      expect(useProjectStore.getState().slicePlane).toBe("xz");
    });

    it("should switch to YZ plane with 3 key", () => {
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("3"));

      expect(useProjectStore.getState().slicePlane).toBe("yz");
    });

    it("should not switch planes outside slice mode", () => {
      useProjectStore.setState({ mode: "orbit", slicePlane: "xy" });
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("2"));

      expect(useProjectStore.getState().slicePlane).toBe("xy");
    });
  });

  describe("undo/redo", () => {
    beforeEach(() => {
      // Add a constraint so we have something to undo
      useLabelStore.getState().addConstraint("test-project", {
        id: "box-1",
        type: "box",
        sign: "solid",
        weight: 1.0,
        createdAt: Date.now(),
        center: [0, 0, 0],
        halfExtents: [1, 1, 1],
      });
    });

    it("should undo with Ctrl+Z", () => {
      renderHook(() => useKeyboardShortcuts());

      expect(
        useLabelStore.getState().getConstraints("test-project"),
      ).toHaveLength(1);

      act(() => fireKeyDown("z", { ctrlKey: true }));

      expect(
        useLabelStore.getState().getConstraints("test-project"),
      ).toHaveLength(0);
    });

    it("should redo with Ctrl+Shift+Z", () => {
      renderHook(() => useKeyboardShortcuts());

      act(() => fireKeyDown("z", { ctrlKey: true }));
      expect(
        useLabelStore.getState().getConstraints("test-project"),
      ).toHaveLength(0);

      act(() => fireKeyDown("z", { ctrlKey: true, shiftKey: true }));
      expect(
        useLabelStore.getState().getConstraints("test-project"),
      ).toHaveLength(1);
    });

    it("should not undo/redo without project", () => {
      useProjectStore.setState({ currentProjectId: null });
      renderHook(() => useKeyboardShortcuts());

      // Should not throw
      act(() => fireKeyDown("z", { ctrlKey: true }));
      expect(
        useLabelStore.getState().getConstraints("test-project"),
      ).toHaveLength(1);
    });
  });

  describe("input handling", () => {
    it("should not process shortcuts when typing in input", () => {
      renderHook(() => useKeyboardShortcuts());

      // Create and focus an input element
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      // Dispatch a keyboard event from the input
      const event = new KeyboardEvent("keydown", {
        key: "p",
        bubbles: true,
      });
      Object.defineProperty(event, "target", { value: input, writable: false });
      act(() => input.dispatchEvent(event));

      // Mode should not change
      expect(useProjectStore.getState().mode).toBe("orbit");

      document.body.removeChild(input);
    });
  });
});
