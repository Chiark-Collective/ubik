// ABOUTME: Unit tests for API client
// ABOUTME: Tests all backend API endpoint functions

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  uploadPointCloud,
  getPointCloudStats,
  getOctreeMetadata,
  getTile,
  previewSamples,
  generateSamples,
  exportParquet,
  exportConfig,
  healthCheck,
  type ProjectCreate,
  type ProjectConfig,
  type SampleGenerationRequest,
} from "./api";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Helper to create mock response
function mockJsonResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  };
}

describe("API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Project endpoints", () => {
    it("should create a project", async () => {
      const mockProject = {
        id: "proj-123",
        name: "Test Project",
        config: {},
        created_at: "2025-01-01",
        updated_at: "2025-01-01",
        constraint_count: 0,
        sample_count: 0,
      };

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockProject));

      const data: ProjectCreate = { name: "Test Project" };
      const result = await createProject(data);

      expect(mockFetch).toHaveBeenCalledWith("/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      expect(result.id).toBe("proj-123");
      expect(result.name).toBe("Test Project");
    });

    it("should list projects", async () => {
      const mockResponse = {
        projects: [{ id: "proj-1", name: "Project 1" }],
        total: 1,
      };

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResponse));

      const result = await listProjects();

      expect(mockFetch).toHaveBeenCalledWith("/v1/projects", {
        headers: { "Content-Type": "application/json" },
      });
      expect(result.projects).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("should get a single project", async () => {
      const mockProject = { id: "proj-123", name: "Test" };

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockProject));

      const result = await getProject("proj-123");

      expect(mockFetch).toHaveBeenCalledWith("/v1/projects/proj-123", {
        headers: { "Content-Type": "application/json" },
      });
      expect(result.id).toBe("proj-123");
    });

    it("should update a project", async () => {
      const mockProject = { id: "proj-123", name: "Updated" };
      const config: ProjectConfig = { near_band: 0.05 };

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockProject));

      const result = await updateProject("proj-123", config);

      expect(mockFetch).toHaveBeenCalledWith("/v1/projects/proj-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      expect(result.id).toBe("proj-123");
    });

    it("should delete a project", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}));

      await deleteProject("proj-123");

      expect(mockFetch).toHaveBeenCalledWith("/v1/projects/proj-123", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ detail: "Not found" }),
      });

      await expect(getProject("nonexistent")).rejects.toThrow("Not found");
    });

    it("should handle error without detail", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("Parse error")),
      });

      await expect(getProject("proj-123")).rejects.toThrow("Unknown error");
    });
  });

  describe("Point cloud endpoints", () => {
    it("should get point cloud stats", async () => {
      const mockStats = {
        point_count: 1000,
        has_normals: true,
        bounds_low: [0, 0, 0],
        bounds_high: [1, 1, 1],
        centroid: [0.5, 0.5, 0.5],
        estimated_density: 1000,
        octree_depth: 3,
        octree_node_count: 15,
        lod_levels: 4,
      };

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockStats));

      const result = await getPointCloudStats("proj-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "/v1/projects/proj-123/pointcloud",
        {
          headers: { "Content-Type": "application/json" },
        },
      );
      expect(result.point_count).toBe(1000);
      expect(result.has_normals).toBe(true);
    });

    it("should get octree metadata", async () => {
      const mockMetadata = {
        root_id: "r",
        bounds_low: [0, 0, 0],
        bounds_high: [1, 1, 1],
        total_points: 1000,
        max_depth: 3,
        node_count: 15,
        nodes: {},
      };

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockMetadata));

      const result = await getOctreeMetadata("proj-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "/v1/projects/proj-123/pointcloud/metadata",
        {
          headers: { "Content-Type": "application/json" },
        },
      );
      expect(result.root_id).toBe("r");
      expect(result.total_points).toBe(1000);
    });

    it("should get a tile", async () => {
      const mockTile = {
        node_id: "r0",
        point_count: 100,
        positions: [0, 0, 0, 1, 1, 1],
        normals: [0, 0, 1, 0, 0, 1],
      };

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockTile));

      const result = await getTile("proj-123", 1, 0, 0, 0);

      expect(mockFetch).toHaveBeenCalledWith(
        "/v1/projects/proj-123/pointcloud/tiles/1/0/0/0",
        { headers: { "Content-Type": "application/json" } },
      );
      expect(result.node_id).toBe("r0");
      expect(result.point_count).toBe(100);
    });
  });

  describe("Sample endpoints", () => {
    it("should preview samples", async () => {
      const mockPreview = {
        surface_anchor_count: 100,
        near_band_count: 200,
        far_field_count: 50,
        constraint_sample_count: 150,
        total_count: 500,
      };

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockPreview));

      const request: SampleGenerationRequest = { total_samples: 500 };
      const result = await previewSamples("proj-123", request);

      expect(mockFetch).toHaveBeenCalledWith(
        "/v1/projects/proj-123/samples/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      expect(result.total_count).toBe(500);
    });

    it("should generate samples", async () => {
      const mockResult = {
        sample_count: 500,
        source_breakdown: { surface: 100, near_band: 200, far_field: 200 },
      };

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResult));

      const request: SampleGenerationRequest = { total_samples: 500 };
      const result = await generateSamples("proj-123", request);

      expect(mockFetch).toHaveBeenCalledWith(
        "/v1/projects/proj-123/samples/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      expect(result.sample_count).toBe(500);
    });
  });

  describe("Export endpoints", () => {
    it("should export parquet", async () => {
      const mockBlob = new Blob(["data"], { type: "application/octet-stream" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      const result = await exportParquet("proj-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "/v1/projects/proj-123/export/parquet",
      );
      expect(result).toBeInstanceOf(Blob);
    });

    it("should throw on export parquet error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(exportParquet("proj-123")).rejects.toThrow("Export failed");
    });

    it("should export config", async () => {
      const mockConfig = { model: "vif", params: {} };

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockConfig));

      const result = await exportConfig("proj-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "/v1/projects/proj-123/export/config",
        {
          headers: { "Content-Type": "application/json" },
        },
      );
      expect(result).toEqual(mockConfig);
    });
  });

  describe("Health check", () => {
    it("should check health", async () => {
      const mockHealth = { status: "healthy", version: "0.1.0" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHealth),
      });

      const result = await healthCheck();

      expect(mockFetch).toHaveBeenCalledWith("/health");
      expect(result.status).toBe("healthy");
      expect(result.version).toBe("0.1.0");
    });
  });

  describe("Upload with progress", () => {
    it("should upload without progress callback", async () => {
      const mockResponse = {
        id: "pc-123",
        filename: "test.ply",
        point_count: 1000,
        has_normals: true,
        bounds_low: [0, 0, 0],
        bounds_high: [1, 1, 1],
        format: "ply",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const file = new File(["test"], "test.ply", {
        type: "application/octet-stream",
      });
      const result = await uploadPointCloud("proj-123", file);

      expect(mockFetch).toHaveBeenCalledWith(
        "/v1/projects/proj-123/pointcloud?estimate_normals=true&normal_k=16",
        expect.objectContaining({
          method: "POST",
          body: expect.any(FormData),
        }),
      );
      expect(result.id).toBe("pc-123");
      expect(result.point_count).toBe(1000);
    });

    it("should upload with custom parameters", async () => {
      const mockResponse = {
        id: "pc-123",
        filename: "test.csv",
        point_count: 500,
        has_normals: false,
        bounds_low: [0, 0, 0],
        bounds_high: [1, 1, 1],
        format: "csv",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const file = new File(["x,y,z\n0,0,0"], "test.csv", { type: "text/csv" });
      const result = await uploadPointCloud("proj-123", file, false, 20);

      expect(mockFetch).toHaveBeenCalledWith(
        "/v1/projects/proj-123/pointcloud?estimate_normals=false&normal_k=20",
        expect.anything(),
      );
      expect(result.has_normals).toBe(false);
    });

    it("should throw on upload error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ detail: "Invalid file format" }),
      });

      const file = new File(["bad"], "bad.xyz");

      await expect(uploadPointCloud("proj-123", file)).rejects.toThrow(
        "Invalid file format",
      );
    });
  });
});
