// ABOUTME: Unit tests for seedStore
// ABOUTME: Tests seed placement and propagation settings

import { describe, it, expect, beforeEach } from "vitest";
import { useSeedStore } from "./seedStore";

describe("seedStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useSeedStore.setState({
      seeds: [],
      propagationRadius: 0.5,
    });
  });

  describe("seeds", () => {
    it("should initialize with empty seeds array", () => {
      expect(useSeedStore.getState().seeds).toEqual([]);
    });

    it("should add a seed with position only", () => {
      useSeedStore.getState().addSeed([1, 2, 3]);

      const seeds = useSeedStore.getState().seeds;
      expect(seeds).toHaveLength(1);
      expect(seeds[0].position).toEqual([1, 2, 3]);
      expect(seeds[0].pointIndex).toBeUndefined();
    });

    it("should add a seed with position and point index", () => {
      useSeedStore.getState().addSeed([1, 2, 3], 42);

      const seeds = useSeedStore.getState().seeds;
      expect(seeds).toHaveLength(1);
      expect(seeds[0].position).toEqual([1, 2, 3]);
      expect(seeds[0].pointIndex).toBe(42);
    });

    it("should add multiple seeds", () => {
      useSeedStore.getState().addSeed([1, 0, 0]);
      useSeedStore.getState().addSeed([0, 1, 0]);
      useSeedStore.getState().addSeed([0, 0, 1]);

      expect(useSeedStore.getState().seeds).toHaveLength(3);
    });

    it("should remove seed by index", () => {
      useSeedStore.getState().addSeed([1, 0, 0]);
      useSeedStore.getState().addSeed([0, 1, 0]);
      useSeedStore.getState().addSeed([0, 0, 1]);

      useSeedStore.getState().removeSeed(1);

      const seeds = useSeedStore.getState().seeds;
      expect(seeds).toHaveLength(2);
      expect(seeds[0].position).toEqual([1, 0, 0]);
      expect(seeds[1].position).toEqual([0, 0, 1]);
    });

    it("should not remove anything with out of bounds index", () => {
      useSeedStore.getState().addSeed([1, 0, 0]);

      useSeedStore.getState().removeSeed(5);

      expect(useSeedStore.getState().seeds).toHaveLength(1);
    });

    it("should clear all seeds", () => {
      useSeedStore.getState().addSeed([1, 0, 0]);
      useSeedStore.getState().addSeed([0, 1, 0]);
      useSeedStore.getState().addSeed([0, 0, 1]);

      useSeedStore.getState().clearSeeds();

      expect(useSeedStore.getState().seeds).toEqual([]);
    });
  });

  describe("propagationRadius", () => {
    it("should initialize with default radius", () => {
      expect(useSeedStore.getState().propagationRadius).toBe(0.5);
    });

    it("should update propagation radius", () => {
      useSeedStore.getState().setPropagationRadius(1.5);
      expect(useSeedStore.getState().propagationRadius).toBe(1.5);
    });

    it("should accept small radius", () => {
      useSeedStore.getState().setPropagationRadius(0.1);
      expect(useSeedStore.getState().propagationRadius).toBe(0.1);
    });

    it("should accept large radius", () => {
      useSeedStore.getState().setPropagationRadius(10.0);
      expect(useSeedStore.getState().propagationRadius).toBe(10.0);
    });
  });
});
