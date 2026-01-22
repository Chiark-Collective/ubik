// ABOUTME: Unit tests for projectStore
// ABOUTME: Tests project state management and mode switching

import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "./projectStore";

describe("projectStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useProjectStore.setState({
      currentProjectId: null,
      activeLabel: "solid",
      mode: "orbit",
      brushRadius: 0.1,
      slicePlane: "xy",
      slicePosition: 0,
    });
  });

  describe("currentProjectId", () => {
    it("should initialize with null project", () => {
      expect(useProjectStore.getState().currentProjectId).toBeNull();
    });

    it("should set current project", () => {
      useProjectStore.getState().setCurrentProject("project-123");
      expect(useProjectStore.getState().currentProjectId).toBe("project-123");
    });

    it("should clear current project", () => {
      useProjectStore.getState().setCurrentProject("project-123");
      useProjectStore.getState().setCurrentProject(null);
      expect(useProjectStore.getState().currentProjectId).toBeNull();
    });
  });

  describe("activeLabel", () => {
    it("should initialize with solid label", () => {
      expect(useProjectStore.getState().activeLabel).toBe("solid");
    });

    it("should set active label to solid", () => {
      useProjectStore.getState().setActiveLabel("solid");
      expect(useProjectStore.getState().activeLabel).toBe("solid");
    });

    it("should set active label to empty", () => {
      useProjectStore.getState().setActiveLabel("empty");
      expect(useProjectStore.getState().activeLabel).toBe("empty");
    });

    it("should set active label to surface", () => {
      useProjectStore.getState().setActiveLabel("surface");
      expect(useProjectStore.getState().activeLabel).toBe("surface");
    });
  });

  describe("mode", () => {
    it("should initialize with orbit mode", () => {
      expect(useProjectStore.getState().mode).toBe("orbit");
    });

    it("should switch to primitive mode", () => {
      useProjectStore.getState().setMode("primitive");
      expect(useProjectStore.getState().mode).toBe("primitive");
    });

    it("should switch to slice mode", () => {
      useProjectStore.getState().setMode("slice");
      expect(useProjectStore.getState().mode).toBe("slice");
    });

    it("should switch to brush mode", () => {
      useProjectStore.getState().setMode("brush");
      expect(useProjectStore.getState().mode).toBe("brush");
    });

    it("should switch to seed mode", () => {
      useProjectStore.getState().setMode("seed");
      expect(useProjectStore.getState().mode).toBe("seed");
    });

    it("should switch to import mode", () => {
      useProjectStore.getState().setMode("import");
      expect(useProjectStore.getState().mode).toBe("import");
    });

    it("should switch back to orbit mode", () => {
      useProjectStore.getState().setMode("primitive");
      useProjectStore.getState().setMode("orbit");
      expect(useProjectStore.getState().mode).toBe("orbit");
    });
  });

  describe("brushRadius", () => {
    it("should initialize with default brush radius", () => {
      expect(useProjectStore.getState().brushRadius).toBe(0.1);
    });

    it("should update brush radius", () => {
      useProjectStore.getState().setBrushRadius(0.5);
      expect(useProjectStore.getState().brushRadius).toBe(0.5);
    });

    it("should accept small brush radius", () => {
      useProjectStore.getState().setBrushRadius(0.01);
      expect(useProjectStore.getState().brushRadius).toBe(0.01);
    });

    it("should accept large brush radius", () => {
      useProjectStore.getState().setBrushRadius(2.0);
      expect(useProjectStore.getState().brushRadius).toBe(2.0);
    });
  });

  describe("slicePlane", () => {
    it("should initialize with xy plane", () => {
      expect(useProjectStore.getState().slicePlane).toBe("xy");
    });

    it("should switch to xz plane", () => {
      useProjectStore.getState().setSlicePlane("xz");
      expect(useProjectStore.getState().slicePlane).toBe("xz");
    });

    it("should switch to yz plane", () => {
      useProjectStore.getState().setSlicePlane("yz");
      expect(useProjectStore.getState().slicePlane).toBe("yz");
    });
  });

  describe("slicePosition", () => {
    it("should initialize with position 0", () => {
      expect(useProjectStore.getState().slicePosition).toBe(0);
    });

    it("should update slice position", () => {
      useProjectStore.getState().setSlicePosition(0.5);
      expect(useProjectStore.getState().slicePosition).toBe(0.5);
    });

    it("should accept negative positions", () => {
      useProjectStore.getState().setSlicePosition(-1.5);
      expect(useProjectStore.getState().slicePosition).toBe(-1.5);
    });
  });
});
