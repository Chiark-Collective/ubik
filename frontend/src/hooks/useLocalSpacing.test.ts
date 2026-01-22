// ABOUTME: Tests for the useLocalSpacing hook
// ABOUTME: Verifies KD-tree building, spacing computation, and fallback behavior

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLocalSpacing } from "./useLocalSpacing";

// Mock requestIdleCallback for testing
const mockIdleCallbacks: Array<(deadline: IdleDeadline) => void> = [];
let idleTimeRemaining = 50; // Simulate 50ms of idle time

beforeEach(() => {
  mockIdleCallbacks.length = 0;
  idleTimeRemaining = 50;

  // @ts-expect-error - mocking browser API
  global.requestIdleCallback = vi.fn(
    (callback: (deadline: IdleDeadline) => void) => {
      mockIdleCallbacks.push(callback);
      return mockIdleCallbacks.length;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper to flush idle callbacks
function flushIdleCallbacks(maxIterations = 100): void {
  let iterations = 0;
  while (mockIdleCallbacks.length > 0 && iterations < maxIterations) {
    const callback = mockIdleCallbacks.shift();
    if (callback) {
      callback({
        timeRemaining: () => idleTimeRemaining,
        didTimeout: false,
      });
    }
    iterations++;
  }
}

// Create a simple grid of points for testing
function createGridPoints(size: number): Float32Array {
  const points: number[] = [];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        points.push(x, y, z);
      }
    }
  }
  return new Float32Array(points);
}

describe("useLocalSpacing", () => {
  it("should return not ready when positions is null", () => {
    const { result } = renderHook(() => useLocalSpacing(null));

    expect(result.current.isReady).toBe(false);
    expect(result.current.isComputing).toBe(false);
    expect(result.current.globalMean).toBe(null);
  });

  it("should return not ready when positions is empty", () => {
    const { result } = renderHook(() => useLocalSpacing(new Float32Array(0)));

    expect(result.current.isReady).toBe(false);
    expect(result.current.isComputing).toBe(false);
    expect(result.current.globalMean).toBe(null);
  });

  it("should start computing when given valid positions", async () => {
    const positions = createGridPoints(3); // 27 points in a 3x3x3 grid

    const { result } = renderHook(() => useLocalSpacing(positions));

    // Should start computing
    await waitFor(() => {
      expect(result.current.isComputing).toBe(true);
    });
  });

  it("should complete computation and provide spacing values", async () => {
    // Create a simple grid - spacing should be approximately 1.0 for interior points
    const positions = createGridPoints(3); // 27 points, spacing = 1.0

    const { result } = renderHook(() => useLocalSpacing(positions));

    // Wait for computation to start
    await waitFor(() => {
      expect(result.current.isComputing).toBe(true);
    });

    // Flush all idle callbacks to complete computation
    flushIdleCallbacks();

    // Should be ready now
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
      expect(result.current.isComputing).toBe(false);
    });

    // Global mean should be around 1.0 (the grid spacing)
    expect(result.current.globalMean).not.toBeNull();
    expect(result.current.globalMean).toBeGreaterThan(0.5);
    expect(result.current.globalMean).toBeLessThan(2.0);

    // getSpacing should return values
    const spacing = result.current.getSpacing(0);
    expect(spacing).not.toBeNull();
    expect(spacing).toBeGreaterThan(0);
  });

  it("should return null for out-of-range point index", async () => {
    const positions = createGridPoints(2); // 8 points

    const { result } = renderHook(() => useLocalSpacing(positions));

    // Wait for computation to complete
    await waitFor(() => {
      expect(result.current.isComputing).toBe(true);
    });
    flushIdleCallbacks();
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Out of range indices should return null
    expect(result.current.getSpacing(-1)).toBeNull();
    expect(result.current.getSpacing(100)).toBeNull();
  });

  it("should update progress during computation", async () => {
    // Create more points to see progress updates
    const positions = createGridPoints(5); // 125 points

    const { result } = renderHook(() => useLocalSpacing(positions));

    await waitFor(() => {
      expect(result.current.isComputing).toBe(true);
    });

    // Progress should start at 0
    expect(result.current.progress).toBe(0);

    // Run one idle callback to advance progress
    if (mockIdleCallbacks.length > 0) {
      const callback = mockIdleCallbacks.shift();
      if (callback) {
        callback({
          timeRemaining: () => 50,
          didTimeout: false,
        });
      }
    }

    // Progress should have advanced
    await waitFor(() => {
      expect(result.current.progress).toBeGreaterThan(0);
    });
  });

  it("should reset when positions change", async () => {
    const positions1 = createGridPoints(2); // 8 points
    const positions2 = createGridPoints(3); // 27 points

    const { result, rerender } = renderHook(
      ({ positions }) => useLocalSpacing(positions),
      { initialProps: { positions: positions1 } },
    );

    // Complete first computation
    await waitFor(() => {
      expect(result.current.isComputing).toBe(true);
    });
    flushIdleCallbacks();
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Change positions
    rerender({ positions: positions2 });

    // Should reset and start computing again
    await waitFor(() => {
      expect(result.current.isReady).toBe(false);
      expect(result.current.isComputing).toBe(true);
    });

    // Complete new computation
    flushIdleCallbacks();
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Mean might be slightly different due to different point count
    expect(result.current.globalMean).not.toBeNull();
  });
});
