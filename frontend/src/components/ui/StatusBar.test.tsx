// ABOUTME: Unit tests for StatusBar component
// ABOUTME: Tests display of mode, point counts, and constraint stats

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "./StatusBar";
import { useProjectStore } from "../../stores/projectStore";
import { useLabelStore } from "../../stores/labelStore";

describe("StatusBar", () => {
  beforeEach(() => {
    // Reset stores
    useProjectStore.setState({
      currentProjectId: null,
      activeLabel: "solid",
      mode: "orbit",
      brushRadius: 0.1,
      slicePlane: "xy",
      slicePosition: 0,
      pointCloudLoaded: false,
      visiblePointCount: 0,
      totalPointCount: 0,
      selectedPointIndices: new Set(),
    });

    useLabelStore.setState({
      constraintsByProject: {},
      undoStack: [],
      redoStack: [],
      maxHistory: 50,
    });
  });

  describe("mode display", () => {
    it("should display Navigate for orbit mode", () => {
      render(<StatusBar />);

      expect(screen.getByText("Mode:")).toBeInTheDocument();
      expect(screen.getByText("Navigate")).toBeInTheDocument();
    });

    it("should display Place Primitive for primitive mode", () => {
      useProjectStore.setState({ mode: "primitive" });
      render(<StatusBar />);

      expect(screen.getByText("Place Primitive")).toBeInTheDocument();
    });

    it("should display Slice Paint for slice mode", () => {
      useProjectStore.setState({ mode: "slice" });
      render(<StatusBar />);

      expect(screen.getByText("Slice Paint")).toBeInTheDocument();
    });

    it("should display 3D Brush for brush mode", () => {
      useProjectStore.setState({ mode: "brush" });
      render(<StatusBar />);

      expect(screen.getByText("3D Brush")).toBeInTheDocument();
    });

    it("should display Seed & Propagate for seed mode", () => {
      useProjectStore.setState({ mode: "seed" });
      render(<StatusBar />);

      expect(screen.getByText("Seed & Propagate")).toBeInTheDocument();
    });

    it("should display Import ML for import mode", () => {
      useProjectStore.setState({ mode: "import" });
      render(<StatusBar />);

      expect(screen.getByText("Import ML")).toBeInTheDocument();
    });
  });

  describe("point cloud stats", () => {
    it('should show "No point cloud loaded" when not loaded', () => {
      render(<StatusBar />);

      expect(screen.getByText("No point cloud loaded")).toBeInTheDocument();
    });

    it("should show visible and total point counts when loaded", () => {
      useProjectStore.setState({
        pointCloudLoaded: true,
        visiblePointCount: 50000,
        totalPointCount: 100000,
      });
      render(<StatusBar />);

      expect(screen.getByText("Visible:")).toBeInTheDocument();
      expect(screen.getByText("50.0K")).toBeInTheDocument();
      expect(screen.getByText("100.0K")).toBeInTheDocument();
    });

    it("should format large point counts with M suffix", () => {
      useProjectStore.setState({
        pointCloudLoaded: true,
        visiblePointCount: 2500000,
        totalPointCount: 5000000,
      });
      render(<StatusBar />);

      expect(screen.getByText("2.5M")).toBeInTheDocument();
      expect(screen.getByText("5.0M")).toBeInTheDocument();
    });

    it("should show small point counts as raw numbers", () => {
      useProjectStore.setState({
        pointCloudLoaded: true,
        visiblePointCount: 500,
        totalPointCount: 999,
      });
      render(<StatusBar />);

      expect(screen.getByText("500")).toBeInTheDocument();
      expect(screen.getByText("999")).toBeInTheDocument();
    });

    it("should show selected point count", () => {
      useProjectStore.setState({
        pointCloudLoaded: true,
        visiblePointCount: 1000,
        totalPointCount: 1000,
        selectedPointIndices: new Set([1, 2, 3, 4, 5]),
      });
      render(<StatusBar />);

      expect(screen.getByText("Selected:")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });

  describe("constraint count", () => {
    it("should show 0 constraints when none exist", () => {
      useProjectStore.setState({ currentProjectId: "project-1" });
      render(<StatusBar />);

      expect(screen.getByText("Constraints:")).toBeInTheDocument();
      expect(screen.getByText("0")).toBeInTheDocument();
    });

    it("should show constraint count", () => {
      useProjectStore.setState({ currentProjectId: "project-1" });
      useLabelStore.setState({
        constraintsByProject: {
          "project-1": [
            {
              id: "1",
              type: "box",
              sign: "solid",
              weight: 1,
              createdAt: Date.now(),
              center: [0, 0, 0],
              halfExtents: [1, 1, 1],
            },
            {
              id: "2",
              type: "sphere",
              sign: "empty",
              weight: 1,
              createdAt: Date.now(),
              center: [0, 0, 0],
              radius: 0.5,
            },
          ],
        },
        undoStack: [],
        redoStack: [],
        maxHistory: 50,
      });
      render(<StatusBar />);

      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  describe("labeled points", () => {
    it("should count labeled points from seed propagation (not brush strokes)", () => {
      useProjectStore.setState({
        currentProjectId: "project-1",
        pointCloudLoaded: true,
        visiblePointCount: 1000,
        totalPointCount: 1000,
      });
      useLabelStore.setState({
        constraintsByProject: {
          "project-1": [
            {
              id: "1",
              type: "seed_propagation",
              sign: "solid",
              weight: 1,
              createdAt: Date.now(),
              seedPoint: [0, 0, 0] as [number, number, number],
              propagationRadius: 0.5,
              propagatedIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
              confidences: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            },
            {
              id: "2",
              type: "brush_stroke",
              sign: "empty",
              weight: 1,
              createdAt: Date.now(),
              strokePoints: [
                [0, 0, 0],
                [1, 0, 0],
                [2, 0, 0],
              ] as [number, number, number][],
              radius: 0.1,
            },
          ],
        },
        undoStack: [],
        redoStack: [],
        maxHistory: 50,
      });
      render(<StatusBar />);

      expect(screen.getByText("Labeled:")).toBeInTheDocument();
      // Only seed propagation contributes to labeled count (10 points)
      // Brush strokes define volumetric regions, not point selections
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("(1.0%)")).toBeInTheDocument();
    });
  });

  describe("version", () => {
    it("should display version number", () => {
      render(<StatusBar />);

      expect(screen.getByText("v0.1.0")).toBeInTheDocument();
    });
  });
});
