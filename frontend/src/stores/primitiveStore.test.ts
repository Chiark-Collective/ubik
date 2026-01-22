// ABOUTME: Unit tests for primitiveStore
// ABOUTME: Tests primitive placement state management

import { describe, it, expect, beforeEach } from "vitest";
import { usePrimitiveStore } from "./primitiveStore";

describe("primitiveStore", () => {
  beforeEach(() => {
    // Reset store to initial state
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

  describe("primitiveType", () => {
    it("should initialize with box type", () => {
      expect(usePrimitiveStore.getState().primitiveType).toBe("box");
    });

    it("should switch to sphere", () => {
      usePrimitiveStore.getState().setPrimitiveType("sphere");
      expect(usePrimitiveStore.getState().primitiveType).toBe("sphere");
    });

    it("should switch to halfspace", () => {
      usePrimitiveStore.getState().setPrimitiveType("halfspace");
      expect(usePrimitiveStore.getState().primitiveType).toBe("halfspace");
    });

    it("should switch to cylinder", () => {
      usePrimitiveStore.getState().setPrimitiveType("cylinder");
      expect(usePrimitiveStore.getState().primitiveType).toBe("cylinder");
    });
  });

  describe("placingPrimitive", () => {
    it("should initialize with null primitive", () => {
      expect(usePrimitiveStore.getState().placingPrimitive).toBeNull();
    });

    it("should create box primitive on startPlacing", () => {
      usePrimitiveStore.getState().setPrimitiveType("box");
      usePrimitiveStore.getState().startPlacing([1, 2, 3]);

      const primitive = usePrimitiveStore.getState().placingPrimitive;
      expect(primitive).not.toBeNull();
      expect(primitive?.type).toBe("box");
      expect(primitive?.position).toEqual([1, 2, 3]);
      expect(primitive?.halfExtents).toBeDefined();
    });

    it("should create sphere primitive on startPlacing", () => {
      usePrimitiveStore.getState().setPrimitiveType("sphere");
      usePrimitiveStore.getState().startPlacing([1, 2, 3]);

      const primitive = usePrimitiveStore.getState().placingPrimitive;
      expect(primitive?.type).toBe("sphere");
      expect(primitive?.radius).toBeDefined();
    });

    it("should create halfspace primitive on startPlacing", () => {
      usePrimitiveStore.getState().setPrimitiveType("halfspace");
      usePrimitiveStore.getState().startPlacing([1, 2, 3]);

      const primitive = usePrimitiveStore.getState().placingPrimitive;
      expect(primitive?.type).toBe("halfspace");
      expect(primitive?.normal).toEqual([0, 0, 1]);
    });

    it("should create cylinder primitive on startPlacing", () => {
      usePrimitiveStore.getState().setPrimitiveType("cylinder");
      usePrimitiveStore.getState().startPlacing([1, 2, 3]);

      const primitive = usePrimitiveStore.getState().placingPrimitive;
      expect(primitive?.type).toBe("cylinder");
      expect(primitive?.radius).toBeDefined();
      expect(primitive?.height).toBeDefined();
    });

    it("should clear primitive on cancelPlacing", () => {
      usePrimitiveStore.getState().startPlacing([1, 2, 3]);
      usePrimitiveStore.getState().cancelPlacing();
      expect(usePrimitiveStore.getState().placingPrimitive).toBeNull();
    });

    it("should return and clear primitive on confirmPlacing", () => {
      usePrimitiveStore.getState().startPlacing([1, 2, 3]);
      const result = usePrimitiveStore.getState().confirmPlacing();

      expect(result).not.toBeNull();
      expect(result?.type).toBe("box");
      expect(usePrimitiveStore.getState().placingPrimitive).toBeNull();
    });

    it("should update placing primitive", () => {
      usePrimitiveStore.getState().startPlacing([1, 2, 3]);
      usePrimitiveStore.getState().updatePlacing({ position: [4, 5, 6] });

      expect(usePrimitiveStore.getState().placingPrimitive?.position).toEqual([
        4, 5, 6,
      ]);
    });
  });

  describe("selectedConstraintId", () => {
    it("should initialize with null", () => {
      expect(usePrimitiveStore.getState().selectedConstraintId).toBeNull();
    });

    it("should select constraint", () => {
      usePrimitiveStore.getState().selectConstraint("constraint-123");
      expect(usePrimitiveStore.getState().selectedConstraintId).toBe(
        "constraint-123",
      );
    });

    it("should clear placingPrimitive when selecting constraint", () => {
      usePrimitiveStore.getState().startPlacing([1, 2, 3]);
      usePrimitiveStore.getState().selectConstraint("constraint-123");

      expect(usePrimitiveStore.getState().placingPrimitive).toBeNull();
    });

    it("should deselect constraint", () => {
      usePrimitiveStore.getState().selectConstraint("constraint-123");
      usePrimitiveStore.getState().selectConstraint(null);
      expect(usePrimitiveStore.getState().selectedConstraintId).toBeNull();
    });
  });

  describe("settings", () => {
    it("should update default size", () => {
      usePrimitiveStore.getState().setDefaultSize(2.0);
      expect(usePrimitiveStore.getState().defaultSize).toBe(2.0);
    });

    it("should use default size when placing", () => {
      usePrimitiveStore.getState().setDefaultSize(2.0);
      usePrimitiveStore.getState().setPrimitiveType("sphere");
      usePrimitiveStore.getState().startPlacing([0, 0, 0]);

      expect(usePrimitiveStore.getState().placingPrimitive?.radius).toBe(1.0); // size/2
    });

    it("should toggle snap to grid", () => {
      usePrimitiveStore.getState().setSnapToGrid(true);
      expect(usePrimitiveStore.getState().snapToGrid).toBe(true);
    });

    it("should snap position when enabled", () => {
      usePrimitiveStore.getState().setSnapToGrid(true);
      usePrimitiveStore.getState().setGridSize(0.5);
      usePrimitiveStore.getState().startPlacing([0.3, 0.7, 1.2]);

      // 0.3 -> 0.5, 0.7 -> 0.5, 1.2 -> 1.0
      expect(usePrimitiveStore.getState().placingPrimitive?.position).toEqual([
        0.5, 0.5, 1.0,
      ]);
    });

    it("should update grid size", () => {
      usePrimitiveStore.getState().setGridSize(0.25);
      expect(usePrimitiveStore.getState().gridSize).toBe(0.25);
    });

    it("should update transform mode", () => {
      usePrimitiveStore.getState().setTransformMode("rotate");
      expect(usePrimitiveStore.getState().transformMode).toBe("rotate");
    });
  });
});
