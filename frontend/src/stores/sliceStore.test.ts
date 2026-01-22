// ABOUTME: Unit tests for sliceStore
// ABOUTME: Tests slice painting mode tool, brush settings, and point selection

import { describe, it, expect, beforeEach } from "vitest";
import { useSliceStore } from "./sliceStore";

describe("sliceStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useSliceStore.setState({
      tool: "brush",
      brushSize: 20,
      selectedPointIndices: new Set(),
    });
  });

  describe("tool", () => {
    it("should initialize with brush tool", () => {
      expect(useSliceStore.getState().tool).toBe("brush");
    });

    it("should switch to lasso tool", () => {
      useSliceStore.getState().setTool("lasso");
      expect(useSliceStore.getState().tool).toBe("lasso");
    });

    it("should switch to eraser tool", () => {
      useSliceStore.getState().setTool("eraser");
      expect(useSliceStore.getState().tool).toBe("eraser");
    });

    it("should switch back to brush tool", () => {
      useSliceStore.getState().setTool("lasso");
      useSliceStore.getState().setTool("brush");
      expect(useSliceStore.getState().tool).toBe("brush");
    });
  });

  describe("brushSize", () => {
    it("should initialize with default brush size", () => {
      expect(useSliceStore.getState().brushSize).toBe(20);
    });

    it("should update brush size", () => {
      useSliceStore.getState().setBrushSize(50);
      expect(useSliceStore.getState().brushSize).toBe(50);
    });

    it("should accept small brush size", () => {
      useSliceStore.getState().setBrushSize(5);
      expect(useSliceStore.getState().brushSize).toBe(5);
    });

    it("should accept large brush size", () => {
      useSliceStore.getState().setBrushSize(100);
      expect(useSliceStore.getState().brushSize).toBe(100);
    });
  });

  describe("selectedPointIndices", () => {
    it("should initialize with empty selection", () => {
      expect(useSliceStore.getState().selectedPointIndices.size).toBe(0);
    });

    it("should add selected points", () => {
      useSliceStore.getState().addSelectedPoints([1, 2, 3]);
      expect(useSliceStore.getState().selectedPointIndices.size).toBe(3);
      expect(useSliceStore.getState().selectedPointIndices.has(1)).toBe(true);
      expect(useSliceStore.getState().selectedPointIndices.has(2)).toBe(true);
      expect(useSliceStore.getState().selectedPointIndices.has(3)).toBe(true);
    });

    it("should not duplicate points when adding", () => {
      useSliceStore.getState().addSelectedPoints([1, 2, 3]);
      useSliceStore.getState().addSelectedPoints([2, 3, 4]);
      expect(useSliceStore.getState().selectedPointIndices.size).toBe(4);
    });

    it("should remove selected points", () => {
      useSliceStore.getState().addSelectedPoints([1, 2, 3, 4, 5]);
      useSliceStore.getState().removeSelectedPoints([2, 4]);

      expect(useSliceStore.getState().selectedPointIndices.size).toBe(3);
      expect(useSliceStore.getState().selectedPointIndices.has(1)).toBe(true);
      expect(useSliceStore.getState().selectedPointIndices.has(2)).toBe(false);
      expect(useSliceStore.getState().selectedPointIndices.has(3)).toBe(true);
      expect(useSliceStore.getState().selectedPointIndices.has(4)).toBe(false);
      expect(useSliceStore.getState().selectedPointIndices.has(5)).toBe(true);
    });

    it("should not fail when removing non-existent points", () => {
      useSliceStore.getState().addSelectedPoints([1, 2]);
      useSliceStore.getState().removeSelectedPoints([99, 100]);
      expect(useSliceStore.getState().selectedPointIndices.size).toBe(2);
    });

    it("should clear all selected points", () => {
      useSliceStore.getState().addSelectedPoints([1, 2, 3, 4, 5]);
      useSliceStore.getState().clearSelectedPoints();
      expect(useSliceStore.getState().selectedPointIndices.size).toBe(0);
    });

    it("should set selected points replacing existing", () => {
      useSliceStore.getState().addSelectedPoints([1, 2, 3]);
      useSliceStore.getState().setSelectedPoints([10, 20, 30]);

      expect(useSliceStore.getState().selectedPointIndices.size).toBe(3);
      expect(useSliceStore.getState().selectedPointIndices.has(1)).toBe(false);
      expect(useSliceStore.getState().selectedPointIndices.has(10)).toBe(true);
      expect(useSliceStore.getState().selectedPointIndices.has(20)).toBe(true);
      expect(useSliceStore.getState().selectedPointIndices.has(30)).toBe(true);
    });
  });
});
