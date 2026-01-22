// ABOUTME: Test setup file for Vitest
// ABOUTME: Configures testing-library and mock utilities

import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock crypto.randomUUID for constraint IDs
Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => `test-uuid-${Math.random().toString(36).substr(2, 9)}`,
  },
});

// Mock ResizeObserver
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock WebGL context for Three.js
HTMLCanvasElement.prototype.getContext = vi
  .fn()
  .mockImplementation((contextType: string) => {
    if (contextType === "webgl" || contextType === "webgl2") {
      return {
        canvas: { width: 100, height: 100 },
        getParameter: vi.fn(),
        getExtension: vi.fn(),
        createShader: vi.fn(),
        shaderSource: vi.fn(),
        compileShader: vi.fn(),
        getShaderParameter: vi.fn().mockReturnValue(true),
        createProgram: vi.fn(),
        attachShader: vi.fn(),
        linkProgram: vi.fn(),
        getProgramParameter: vi.fn().mockReturnValue(true),
        useProgram: vi.fn(),
        createBuffer: vi.fn(),
        bindBuffer: vi.fn(),
        bufferData: vi.fn(),
        enable: vi.fn(),
        disable: vi.fn(),
        clear: vi.fn(),
        viewport: vi.fn(),
        clearColor: vi.fn(),
        getShaderInfoLog: vi.fn(),
        getProgramInfoLog: vi.fn(),
      };
    }
    return null;
  });
