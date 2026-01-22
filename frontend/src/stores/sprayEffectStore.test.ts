// ABOUTME: Unit tests for sprayEffectStore
// ABOUTME: Tests handedness and quality override settings with persistence

import { describe, it, expect, beforeEach } from "vitest";
import { useSprayEffectStore } from "./sprayEffectStore";

describe("sprayEffectStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useSprayEffectStore.setState({
      handedness: "right",
      qualityOverride: "auto",
      particleDensity: 1.0,
    });
  });

  describe("handedness", () => {
    it("should initialize with right-handed as default", () => {
      expect(useSprayEffectStore.getState().handedness).toBe("right");
    });

    it("should update handedness to left", () => {
      useSprayEffectStore.getState().setHandedness("left");
      expect(useSprayEffectStore.getState().handedness).toBe("left");
    });

    it("should update handedness back to right", () => {
      useSprayEffectStore.getState().setHandedness("left");
      useSprayEffectStore.getState().setHandedness("right");
      expect(useSprayEffectStore.getState().handedness).toBe("right");
    });
  });

  describe("qualityOverride", () => {
    it("should initialize with auto as default", () => {
      expect(useSprayEffectStore.getState().qualityOverride).toBe("auto");
    });

    it("should update quality override to low", () => {
      useSprayEffectStore.getState().setQualityOverride("low");
      expect(useSprayEffectStore.getState().qualityOverride).toBe("low");
    });

    it("should update quality override to medium", () => {
      useSprayEffectStore.getState().setQualityOverride("medium");
      expect(useSprayEffectStore.getState().qualityOverride).toBe("medium");
    });

    it("should update quality override to high", () => {
      useSprayEffectStore.getState().setQualityOverride("high");
      expect(useSprayEffectStore.getState().qualityOverride).toBe("high");
    });

    it("should update quality override back to auto", () => {
      useSprayEffectStore.getState().setQualityOverride("high");
      useSprayEffectStore.getState().setQualityOverride("auto");
      expect(useSprayEffectStore.getState().qualityOverride).toBe("auto");
    });
  });

  describe("particleDensity", () => {
    it("should initialize with 1.0 as default", () => {
      expect(useSprayEffectStore.getState().particleDensity).toBe(1.0);
    });

    it("should update particle density", () => {
      useSprayEffectStore.getState().setParticleDensity(2.0);
      expect(useSprayEffectStore.getState().particleDensity).toBe(2.0);
    });

    it("should allow low density values", () => {
      useSprayEffectStore.getState().setParticleDensity(0.1);
      expect(useSprayEffectStore.getState().particleDensity).toBe(0.1);
    });

    it("should allow high density values", () => {
      useSprayEffectStore.getState().setParticleDensity(3.0);
      expect(useSprayEffectStore.getState().particleDensity).toBe(3.0);
    });
  });

  describe("persistence", () => {
    it("should have persist middleware configured with correct name", () => {
      // The store should have the persist API available
      const store = useSprayEffectStore;
      expect(store.persist).toBeDefined();
      expect(store.persist.getOptions().name).toBe("sdf-labeler-spray-effect");
    });
  });
});
