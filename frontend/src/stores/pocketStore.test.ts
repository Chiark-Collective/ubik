// ABOUTME: Unit tests for pocketStore
// ABOUTME: Tests pocket detection state, selection, and toggle functionality

import { describe, it, expect, beforeEach } from "vitest";
import { usePocketStore, type PocketAnalysis } from "./pocketStore";

describe("pocketStore", () => {
  const createMockAnalysis = (): PocketAnalysis => ({
    gridMetadata: {
      resolution: [64, 64, 64],
      voxelSize: 0.05,
      boundsLow: [0, 0, 0],
      boundsHigh: [3.2, 3.2, 3.2],
      occupiedCount: 5000,
      emptyCount: 1000,
      outsideCount: 256000,
      pocketCount: 2,
    },
    pockets: [
      {
        pocketId: 1,
        voxelCount: 500,
        centroid: [0.5, 0.5, 0.5],
        boundsLow: [0.2, 0.2, 0.2],
        boundsHigh: [0.8, 0.8, 0.8],
        volumeEstimate: 0.0625,
        isToggledSolid: false,
      },
      {
        pocketId: 2,
        voxelCount: 300,
        centroid: [1.5, 1.5, 1.5],
        boundsLow: [1.2, 1.2, 1.2],
        boundsHigh: [1.8, 1.8, 1.8],
        volumeEstimate: 0.0375,
        isToggledSolid: true,
      },
    ],
    computedAt: "2024-01-15T12:00:00Z",
  });

  beforeEach(() => {
    // Reset store to initial state
    usePocketStore.getState().reset();
  });

  describe("initial state", () => {
    it("should initialize with no analysis", () => {
      expect(usePocketStore.getState().analysis).toBeNull();
    });

    it("should initialize as not analyzing", () => {
      expect(usePocketStore.getState().isAnalyzing).toBe(false);
    });

    it("should initialize with no error", () => {
      expect(usePocketStore.getState().analyzeError).toBeNull();
    });

    it("should initialize with no selection", () => {
      expect(usePocketStore.getState().selectedPocketId).toBeNull();
    });

    it("should initialize with no hover", () => {
      expect(usePocketStore.getState().hoveredPocketId).toBeNull();
    });

    it("should initialize with empty local toggles", () => {
      expect(usePocketStore.getState().localToggles).toEqual({});
    });
  });

  describe("setAnalysis", () => {
    it("should set analysis data", () => {
      const analysis = createMockAnalysis();
      usePocketStore.getState().setAnalysis(analysis);

      expect(usePocketStore.getState().analysis).toEqual(analysis);
    });

    it("should clear local toggles when setting analysis", () => {
      usePocketStore.setState({ localToggles: { 1: true } });
      usePocketStore.getState().setAnalysis(createMockAnalysis());

      expect(usePocketStore.getState().localToggles).toEqual({});
    });

    it("should accept null to clear analysis", () => {
      usePocketStore.getState().setAnalysis(createMockAnalysis());
      usePocketStore.getState().setAnalysis(null);

      expect(usePocketStore.getState().analysis).toBeNull();
    });
  });

  describe("setIsAnalyzing", () => {
    it("should set analyzing state to true", () => {
      usePocketStore.getState().setIsAnalyzing(true);
      expect(usePocketStore.getState().isAnalyzing).toBe(true);
    });

    it("should set analyzing state to false", () => {
      usePocketStore.getState().setIsAnalyzing(true);
      usePocketStore.getState().setIsAnalyzing(false);
      expect(usePocketStore.getState().isAnalyzing).toBe(false);
    });
  });

  describe("setAnalyzeError", () => {
    it("should set error message", () => {
      usePocketStore.getState().setAnalyzeError("Network error");
      expect(usePocketStore.getState().analyzeError).toBe("Network error");
    });

    it("should clear error with null", () => {
      usePocketStore.getState().setAnalyzeError("Some error");
      usePocketStore.getState().setAnalyzeError(null);
      expect(usePocketStore.getState().analyzeError).toBeNull();
    });
  });

  describe("selection", () => {
    it("should set selected pocket id", () => {
      usePocketStore.getState().setSelectedPocketId(1);
      expect(usePocketStore.getState().selectedPocketId).toBe(1);
    });

    it("should clear selection with null", () => {
      usePocketStore.getState().setSelectedPocketId(1);
      usePocketStore.getState().setSelectedPocketId(null);
      expect(usePocketStore.getState().selectedPocketId).toBeNull();
    });

    it("should set hovered pocket id", () => {
      usePocketStore.getState().setHoveredPocketId(2);
      expect(usePocketStore.getState().hoveredPocketId).toBe(2);
    });

    it("should clear hover with null", () => {
      usePocketStore.getState().setHoveredPocketId(2);
      usePocketStore.getState().setHoveredPocketId(null);
      expect(usePocketStore.getState().hoveredPocketId).toBeNull();
    });
  });

  describe("togglePocket", () => {
    it("should toggle pocket from empty to solid", () => {
      usePocketStore.getState().setAnalysis(createMockAnalysis());
      usePocketStore.getState().togglePocket(1);

      expect(usePocketStore.getState().isPocketSolid(1)).toBe(true);
    });

    it("should toggle pocket from solid to empty", () => {
      usePocketStore.getState().setAnalysis(createMockAnalysis());
      // Pocket 2 starts as isToggledSolid: true
      usePocketStore.getState().togglePocket(2);

      expect(usePocketStore.getState().isPocketSolid(2)).toBe(false);
    });

    it("should toggle back and forth", () => {
      usePocketStore.getState().setAnalysis(createMockAnalysis());

      usePocketStore.getState().togglePocket(1);
      expect(usePocketStore.getState().isPocketSolid(1)).toBe(true);

      usePocketStore.getState().togglePocket(1);
      expect(usePocketStore.getState().isPocketSolid(1)).toBe(false);
    });

    it("should store toggles in localToggles", () => {
      usePocketStore.getState().setAnalysis(createMockAnalysis());
      usePocketStore.getState().togglePocket(1);

      expect(usePocketStore.getState().localToggles[1]).toBe(true);
    });
  });

  describe("isPocketSolid", () => {
    it("should return false for unknown pocket without analysis", () => {
      expect(usePocketStore.getState().isPocketSolid(999)).toBe(false);
    });

    it("should return analysis state when no local toggle", () => {
      usePocketStore.getState().setAnalysis(createMockAnalysis());

      // Pocket 1 starts as isToggledSolid: false
      expect(usePocketStore.getState().isPocketSolid(1)).toBe(false);

      // Pocket 2 starts as isToggledSolid: true
      expect(usePocketStore.getState().isPocketSolid(2)).toBe(true);
    });

    it("should prefer local toggle over analysis state", () => {
      usePocketStore.getState().setAnalysis(createMockAnalysis());
      usePocketStore.setState({ localToggles: { 1: true } });

      // Pocket 1 would be false from analysis, but local toggle says true
      expect(usePocketStore.getState().isPocketSolid(1)).toBe(true);
    });

    it("should handle false local toggle overriding true analysis", () => {
      usePocketStore.getState().setAnalysis(createMockAnalysis());
      usePocketStore.setState({ localToggles: { 2: false } });

      // Pocket 2 is true in analysis, but local toggle says false
      expect(usePocketStore.getState().isPocketSolid(2)).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset all state to initial values", () => {
      // Set various state
      usePocketStore.getState().setAnalysis(createMockAnalysis());
      usePocketStore.getState().setIsAnalyzing(true);
      usePocketStore.getState().setAnalyzeError("Error");
      usePocketStore.getState().setSelectedPocketId(1);
      usePocketStore.getState().setHoveredPocketId(2);
      usePocketStore.getState().togglePocket(1);

      // Reset
      usePocketStore.getState().reset();

      // Verify all reset
      expect(usePocketStore.getState().analysis).toBeNull();
      expect(usePocketStore.getState().isAnalyzing).toBe(false);
      expect(usePocketStore.getState().analyzeError).toBeNull();
      expect(usePocketStore.getState().selectedPocketId).toBeNull();
      expect(usePocketStore.getState().hoveredPocketId).toBeNull();
      expect(usePocketStore.getState().localToggles).toEqual({});
    });
  });
});
