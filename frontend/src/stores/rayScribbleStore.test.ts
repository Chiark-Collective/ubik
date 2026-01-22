// ABOUTME: Unit tests for rayScribbleStore
// ABOUTME: Tests stroke management, settings, and ray operations

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useRayScribbleStore,
  type RayInfo,
  type RayStroke,
} from "./rayScribbleStore";

describe("rayScribbleStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useRayScribbleStore.setState({
      emptyBandWidth: 0.1,
      surfaceBandWidth: 0.02,
      backBufferWidth: 0.0,
      useAdaptiveBackBuffer: true,
      backBufferCoefficient: 1.0,
      strokes: [],
      isScribbling: false,
      currentStrokeRays: [],
    });
  });

  describe("settings", () => {
    it("should initialize with default empty band width", () => {
      expect(useRayScribbleStore.getState().emptyBandWidth).toBe(0.1);
    });

    it("should initialize with default surface band width", () => {
      expect(useRayScribbleStore.getState().surfaceBandWidth).toBe(0.02);
    });

    it("should update empty band width", () => {
      useRayScribbleStore.getState().setEmptyBandWidth(0.2);
      expect(useRayScribbleStore.getState().emptyBandWidth).toBe(0.2);
    });

    it("should update surface band width", () => {
      useRayScribbleStore.getState().setSurfaceBandWidth(0.05);
      expect(useRayScribbleStore.getState().surfaceBandWidth).toBe(0.05);
    });

    it("should initialize with default back buffer width of 0 (no bleed-through)", () => {
      expect(useRayScribbleStore.getState().backBufferWidth).toBe(0.0);
    });

    it("should update back buffer width", () => {
      useRayScribbleStore.getState().setBackBufferWidth(0.01);
      expect(useRayScribbleStore.getState().backBufferWidth).toBe(0.01);
    });

    it("should initialize with adaptive back buffer enabled", () => {
      expect(useRayScribbleStore.getState().useAdaptiveBackBuffer).toBe(true);
    });

    it("should toggle adaptive back buffer", () => {
      useRayScribbleStore.getState().setUseAdaptiveBackBuffer(false);
      expect(useRayScribbleStore.getState().useAdaptiveBackBuffer).toBe(false);

      useRayScribbleStore.getState().setUseAdaptiveBackBuffer(true);
      expect(useRayScribbleStore.getState().useAdaptiveBackBuffer).toBe(true);
    });

    it("should initialize with default back buffer coefficient of 1.0", () => {
      expect(useRayScribbleStore.getState().backBufferCoefficient).toBe(1.0);
    });

    it("should update back buffer coefficient", () => {
      useRayScribbleStore.getState().setBackBufferCoefficient(1.5);
      expect(useRayScribbleStore.getState().backBufferCoefficient).toBe(1.5);
    });
  });

  describe("stroke state", () => {
    it("should initialize with no strokes", () => {
      expect(useRayScribbleStore.getState().strokes).toHaveLength(0);
    });

    it("should initialize as not scribbling", () => {
      expect(useRayScribbleStore.getState().isScribbling).toBe(false);
    });

    it("should initialize with empty current stroke rays", () => {
      expect(useRayScribbleStore.getState().currentStrokeRays).toHaveLength(0);
    });
  });

  describe("startStroke", () => {
    it("should set isScribbling to true", () => {
      useRayScribbleStore.getState().startStroke();
      expect(useRayScribbleStore.getState().isScribbling).toBe(true);
    });

    it("should clear current stroke rays", () => {
      // Add some rays first
      useRayScribbleStore.setState({
        currentStrokeRays: [
          { origin: [0, 0, 0], direction: [1, 0, 0], hitDistance: 1.0 },
        ],
      });

      useRayScribbleStore.getState().startStroke();
      expect(useRayScribbleStore.getState().currentStrokeRays).toHaveLength(0);
    });
  });

  describe("addRayToStroke", () => {
    it("should add ray when scribbling", () => {
      useRayScribbleStore.getState().startStroke();

      const ray: RayInfo = {
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        hitDistance: 1.5,
      };
      useRayScribbleStore.getState().addRayToStroke(ray);

      expect(useRayScribbleStore.getState().currentStrokeRays).toHaveLength(1);
      expect(useRayScribbleStore.getState().currentStrokeRays[0]).toEqual(ray);
    });

    it("should not add ray when not scribbling", () => {
      const ray: RayInfo = {
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        hitDistance: 1.5,
      };
      useRayScribbleStore.getState().addRayToStroke(ray);

      expect(useRayScribbleStore.getState().currentStrokeRays).toHaveLength(0);
    });

    it("should add multiple rays to current stroke", () => {
      useRayScribbleStore.getState().startStroke();

      const rays: RayInfo[] = [
        { origin: [0, 0, 0], direction: [1, 0, 0], hitDistance: 1.0 },
        { origin: [0.1, 0, 0], direction: [1, 0, 0], hitDistance: 1.1 },
        { origin: [0.2, 0, 0], direction: [1, 0, 0], hitDistance: 1.2 },
      ];

      rays.forEach((ray) => useRayScribbleStore.getState().addRayToStroke(ray));

      expect(useRayScribbleStore.getState().currentStrokeRays).toHaveLength(3);
    });

    it("should preserve surface normal if provided", () => {
      useRayScribbleStore.getState().startStroke();

      const ray: RayInfo = {
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        hitDistance: 1.5,
        surfaceNormal: [0, 0, 1],
      };
      useRayScribbleStore.getState().addRayToStroke(ray);

      expect(
        useRayScribbleStore.getState().currentStrokeRays[0].surfaceNormal,
      ).toEqual([0, 0, 1]);
    });

    it("should preserve hitPointIndex if provided", () => {
      useRayScribbleStore.getState().startStroke();

      const ray: RayInfo = {
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        hitDistance: 1.5,
        hitPointIndex: 42,
      };
      useRayScribbleStore.getState().addRayToStroke(ray);

      expect(
        useRayScribbleStore.getState().currentStrokeRays[0].hitPointIndex,
      ).toBe(42);
    });

    it("should preserve localSpacing if provided", () => {
      useRayScribbleStore.getState().startStroke();

      const ray: RayInfo = {
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        hitDistance: 1.5,
        hitPointIndex: 42,
        localSpacing: 0.05,
      };
      useRayScribbleStore.getState().addRayToStroke(ray);

      expect(
        useRayScribbleStore.getState().currentStrokeRays[0].localSpacing,
      ).toBe(0.05);
    });
  });

  describe("endStroke", () => {
    beforeEach(() => {
      // Mock crypto.randomUUID
      vi.stubGlobal("crypto", {
        randomUUID: () => "test-uuid-1234",
      });
    });

    it("should return null when not scribbling", () => {
      const result = useRayScribbleStore.getState().endStroke();
      expect(result).toBeNull();
    });

    it("should return null when no rays in stroke", () => {
      useRayScribbleStore.getState().startStroke();
      const result = useRayScribbleStore.getState().endStroke();
      expect(result).toBeNull();
    });

    it("should create stroke and add to strokes list", () => {
      useRayScribbleStore.getState().startStroke();
      useRayScribbleStore.getState().addRayToStroke({
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        hitDistance: 1.0,
      });

      const stroke = useRayScribbleStore.getState().endStroke();

      expect(stroke).not.toBeNull();
      expect(stroke!.id).toBe("test-uuid-1234");
      expect(stroke!.rays).toHaveLength(1);
      expect(useRayScribbleStore.getState().strokes).toHaveLength(1);
    });

    it("should set isScribbling to false after ending", () => {
      useRayScribbleStore.getState().startStroke();
      useRayScribbleStore.getState().addRayToStroke({
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        hitDistance: 1.0,
      });
      useRayScribbleStore.getState().endStroke();

      expect(useRayScribbleStore.getState().isScribbling).toBe(false);
    });

    it("should clear current stroke rays after ending", () => {
      useRayScribbleStore.getState().startStroke();
      useRayScribbleStore.getState().addRayToStroke({
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        hitDistance: 1.0,
      });
      useRayScribbleStore.getState().endStroke();

      expect(useRayScribbleStore.getState().currentStrokeRays).toHaveLength(0);
    });

    it("should include createdAt timestamp", () => {
      useRayScribbleStore.getState().startStroke();
      useRayScribbleStore.getState().addRayToStroke({
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        hitDistance: 1.0,
      });

      const before = Date.now();
      const stroke = useRayScribbleStore.getState().endStroke();
      const after = Date.now();

      expect(stroke!.createdAt).toBeGreaterThanOrEqual(before);
      expect(stroke!.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe("cancelStroke", () => {
    it("should set isScribbling to false", () => {
      useRayScribbleStore.getState().startStroke();
      useRayScribbleStore.getState().cancelStroke();

      expect(useRayScribbleStore.getState().isScribbling).toBe(false);
    });

    it("should clear current stroke rays", () => {
      useRayScribbleStore.getState().startStroke();
      useRayScribbleStore.getState().addRayToStroke({
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        hitDistance: 1.0,
      });
      useRayScribbleStore.getState().cancelStroke();

      expect(useRayScribbleStore.getState().currentStrokeRays).toHaveLength(0);
    });

    it("should not add cancelled stroke to strokes list", () => {
      useRayScribbleStore.getState().startStroke();
      useRayScribbleStore.getState().addRayToStroke({
        origin: [0, 0, 0],
        direction: [1, 0, 0],
        hitDistance: 1.0,
      });
      useRayScribbleStore.getState().cancelStroke();

      expect(useRayScribbleStore.getState().strokes).toHaveLength(0);
    });
  });

  describe("addStroke", () => {
    it("should add a stroke directly", () => {
      const stroke: RayStroke = {
        id: "direct-stroke",
        rays: [{ origin: [0, 0, 0], direction: [1, 0, 0], hitDistance: 1.0 }],
        createdAt: Date.now(),
      };

      useRayScribbleStore.getState().addStroke(stroke);

      expect(useRayScribbleStore.getState().strokes).toHaveLength(1);
      expect(useRayScribbleStore.getState().strokes[0].id).toBe(
        "direct-stroke",
      );
    });
  });

  describe("removeStroke", () => {
    it("should remove a stroke by id", () => {
      const stroke1: RayStroke = {
        id: "stroke-1",
        rays: [{ origin: [0, 0, 0], direction: [1, 0, 0], hitDistance: 1.0 }],
        createdAt: Date.now(),
      };
      const stroke2: RayStroke = {
        id: "stroke-2",
        rays: [{ origin: [1, 0, 0], direction: [1, 0, 0], hitDistance: 1.0 }],
        createdAt: Date.now(),
      };

      useRayScribbleStore.getState().addStroke(stroke1);
      useRayScribbleStore.getState().addStroke(stroke2);
      useRayScribbleStore.getState().removeStroke("stroke-1");

      expect(useRayScribbleStore.getState().strokes).toHaveLength(1);
      expect(useRayScribbleStore.getState().strokes[0].id).toBe("stroke-2");
    });

    it("should not fail when removing non-existent stroke", () => {
      useRayScribbleStore.getState().removeStroke("non-existent");
      expect(useRayScribbleStore.getState().strokes).toHaveLength(0);
    });
  });

  describe("clearStrokes", () => {
    it("should remove all strokes", () => {
      const stroke1: RayStroke = {
        id: "stroke-1",
        rays: [{ origin: [0, 0, 0], direction: [1, 0, 0], hitDistance: 1.0 }],
        createdAt: Date.now(),
      };
      const stroke2: RayStroke = {
        id: "stroke-2",
        rays: [{ origin: [1, 0, 0], direction: [1, 0, 0], hitDistance: 1.0 }],
        createdAt: Date.now(),
      };

      useRayScribbleStore.getState().addStroke(stroke1);
      useRayScribbleStore.getState().addStroke(stroke2);
      useRayScribbleStore.getState().clearStrokes();

      expect(useRayScribbleStore.getState().strokes).toHaveLength(0);
    });
  });
});
