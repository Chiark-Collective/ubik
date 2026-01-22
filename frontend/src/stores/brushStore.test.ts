// ABOUTME: Unit tests for brushStore
// ABOUTME: Tests 3D brush painting mode settings

import { describe, it, expect, beforeEach } from "vitest";
import { useBrushStore } from "./brushStore";

describe("brushStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useBrushStore.setState({
      depthAware: false,
    });
  });

  describe("depthAware", () => {
    it("should initialize with depth aware disabled", () => {
      expect(useBrushStore.getState().depthAware).toBe(false);
    });

    it("should enable depth aware painting", () => {
      useBrushStore.getState().setDepthAware(true);
      expect(useBrushStore.getState().depthAware).toBe(true);
    });

    it("should disable depth aware painting", () => {
      useBrushStore.getState().setDepthAware(true);
      useBrushStore.getState().setDepthAware(false);
      expect(useBrushStore.getState().depthAware).toBe(false);
    });

    it("should toggle depth aware state", () => {
      expect(useBrushStore.getState().depthAware).toBe(false);
      useBrushStore.getState().setDepthAware(true);
      expect(useBrushStore.getState().depthAware).toBe(true);
      useBrushStore.getState().setDepthAware(false);
      expect(useBrushStore.getState().depthAware).toBe(false);
    });
  });
});
