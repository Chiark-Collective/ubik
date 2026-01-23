// ABOUTME: API client for SDF Labeler backend
// ABOUTME: Provides typed functions for all backend endpoints

const API_BASE = "/v1";

// Types matching backend models
export interface ProjectCreate {
  name: string;
  description?: string;
  config?: ProjectConfig;
}

export interface ProjectConfig {
  near_band?: number;
  tangential_jitter?: number;
  tsdf_trunc?: number;
  surface_anchor_ratio?: number;
  far_field_ratio?: number;
  knn_neighbors?: number;
  normal_orientation?: "mst" | "visibility" | "mixed";
  units?: "meters" | "millimeters" | "feet";
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  config: ProjectConfig;
  created_at: string;
  updated_at: string;
  point_cloud_id?: string;
  bounds_low?: [number, number, number];
  bounds_high?: [number, number, number];
  constraint_count: number;
  sample_count: number;
}

export interface PointCloudUploadResponse {
  id: string;
  filename: string;
  point_count: number;
  has_normals: boolean;
  bounds_low: [number, number, number];
  bounds_high: [number, number, number];
  format: string;
}

export interface PointCloudStats {
  point_count: number;
  has_normals: boolean;
  bounds_low: [number, number, number];
  bounds_high: [number, number, number];
  centroid: [number, number, number];
  estimated_density: number;
  octree_depth: number;
  octree_node_count: number;
  lod_levels: number;
}

export interface OctreeNodeInfo {
  node_id: string;
  level: number;
  bounds_low: [number, number, number];
  bounds_high: [number, number, number];
  point_count: number;
  children: string[];
}

export interface OctreeMetadata {
  root_id: string;
  bounds_low: [number, number, number];
  bounds_high: [number, number, number];
  total_points: number;
  max_depth: number;
  node_count: number;
  nodes: Record<string, OctreeNodeInfo>;
}

export interface TileData {
  node_id: string;
  point_count: number;
  positions: number[];
  normals?: number[];
  labels?: number[];
}

export type SamplingStrategy = "constant" | "density" | "inverse_square";

export interface SampleGenerationRequest {
  total_samples?: number;

  // Sampling strategy
  strategy?: SamplingStrategy;

  // CONSTANT strategy parameters
  samples_per_primitive?: number;

  // DENSITY strategy parameters
  samples_per_cubic_meter?: number;

  // INVERSE_SQUARE strategy parameters
  inverse_square_base_samples?: number;
  inverse_square_falloff?: number;

  include_surface?: boolean;
  far_direction?: "outward" | "inward" | "bidirectional";
  apply_clipping?: boolean;
  seed?: number;
}

export interface SamplePreview {
  surface_anchor_count: number;
  near_band_count: number;
  far_field_count: number;
  constraint_sample_count: number;
  total_count: number;
}

export interface SamplePoint {
  x: number;
  y: number;
  z: number;
  phi: number;
}

export interface SampleVisualizationData {
  samples: SamplePoint[];
  total_count: number;
  returned_count: number;
  phi_min: number;
  phi_max: number;
}

// API functions
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// Project endpoints
export async function createProject(data: ProjectCreate): Promise<Project> {
  return request("/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listProjects(): Promise<{
  projects: Project[];
  total: number;
}> {
  return request("/projects");
}

export async function getProject(projectId: string): Promise<Project> {
  return request(`/projects/${projectId}`);
}

export async function updateProject(
  projectId: string,
  config: ProjectConfig,
): Promise<Project> {
  return request(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(config),
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  await request(`/projects/${projectId}`, { method: "DELETE" });
}

// Point cloud endpoints
export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export async function uploadPointCloud(
  projectId: string,
  file: File,
  estimateNormals = true,
  normalK = 16,
  onProgress?: (progress: UploadProgress) => void,
): Promise<PointCloudUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams({
    estimate_normals: String(estimateNormals),
    normal_k: String(normalK),
  });

  // Use XMLHttpRequest for progress events if callback provided
  if (onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `${API_BASE}/projects/${projectId}/pointcloud?${params}`,
      );

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percent: Math.round((e.loaded / e.total) * 100),
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.detail || "Upload failed"));
          } catch {
            reject(new Error("Upload failed"));
          }
        }
      };

      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(formData);
    });
  }

  // Standard fetch for simple uploads
  const response = await fetch(
    `${API_BASE}/projects/${projectId}/pointcloud?${params}`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Upload failed" }));
    throw new Error(error.detail);
  }

  return response.json();
}

export async function getPointCloudStats(
  projectId: string,
): Promise<PointCloudStats> {
  return request(`/projects/${projectId}/pointcloud`);
}

export async function getOctreeMetadata(
  projectId: string,
): Promise<OctreeMetadata> {
  return request(`/projects/${projectId}/pointcloud/metadata`);
}

export async function getTile(
  projectId: string,
  level: number,
  x: number,
  y: number,
  z: number,
): Promise<TileData> {
  return request(
    `/projects/${projectId}/pointcloud/tiles/${level}/${x}/${y}/${z}`,
  );
}

// Sample generation endpoints
export async function previewSamples(
  projectId: string,
  req: SampleGenerationRequest,
): Promise<SamplePreview> {
  return request(`/projects/${projectId}/samples/preview`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function generateSamples(
  projectId: string,
  req: SampleGenerationRequest,
): Promise<{ sample_count: number; source_breakdown: Record<string, number> }> {
  return request(`/projects/${projectId}/samples/generate`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getSamples(
  projectId: string,
  limit: number = 10000,
): Promise<SampleVisualizationData> {
  return request(`/projects/${projectId}/samples?limit=${limit}`);
}

export async function exportParquet(projectId: string): Promise<Blob> {
  const response = await fetch(
    `${API_BASE}/projects/${projectId}/export/parquet`,
  );
  if (!response.ok) {
    throw new Error("Export failed");
  }
  return response.blob();
}

export async function exportConfig(
  projectId: string,
): Promise<Record<string, unknown>> {
  return request(`/projects/${projectId}/export/config`);
}

// Scenario types
export interface ScenarioInfo {
  name: string;
  description: string;
  category: "trenchfoot" | "sdf";
  preview_url?: string;
}

export interface ScenarioListResponse {
  scenarios: ScenarioInfo[];
  total: number;
}

export interface LoadScenarioResponse {
  status: string;
  scenario: string;
  category: string;
  point_count: number;
  has_mesh: boolean;
  bounds: {
    low: [number, number, number];
    high: [number, number, number];
  };
  metadata: Record<string, unknown>;
}

// Scenario endpoints
export async function listScenarios(
  category?: "trenchfoot" | "sdf",
): Promise<ScenarioListResponse> {
  const params = category ? `?category=${category}` : "";
  return request(`/scenarios${params}`);
}

export async function loadScenario(
  projectId: string,
  scenarioName: string,
  category: "trenchfoot" | "sdf" = "trenchfoot",
  variant: "culled" | "full" = "culled",
): Promise<LoadScenarioResponse> {
  const params = new URLSearchParams({
    scenario_name: scenarioName,
    category,
    variant,
  });
  return request(`/projects/${projectId}/load-scenario?${params}`, {
    method: "POST",
  });
}

// Constraint types (matching backend models)
export interface RayInfo {
  origin: [number, number, number];
  direction: [number, number, number];
  hit_distance: number;
  surface_normal?: [number, number, number];
  hit_point_index?: number;
  local_spacing?: number;
}

export interface ConstraintBase {
  id: string;
  type: string;
  name?: string;
  sign: "solid" | "empty" | "surface";
  weight: number;
  created_at: number;
}

export interface BoxConstraint extends ConstraintBase {
  type: "box";
  center: [number, number, number];
  half_extents: [number, number, number];
}

export interface SphereConstraint extends ConstraintBase {
  type: "sphere";
  center: [number, number, number];
  radius: number;
}

export interface HalfspaceConstraint extends ConstraintBase {
  type: "halfspace";
  point: [number, number, number];
  normal: [number, number, number];
}

export interface CylinderConstraint extends ConstraintBase {
  type: "cylinder";
  center: [number, number, number];
  radius: number;
  height: number;
  axis: [number, number, number];
}

export interface BrushStrokeConstraint extends ConstraintBase {
  type: "brush_stroke";
  stroke_points: [number, number, number][];
  radius: number;
}

export interface RayCarveConstraint extends ConstraintBase {
  type: "ray_carve";
  rays: RayInfo[];
  empty_band_width: number;
  surface_band_width: number;
  back_buffer_width: number;
  back_buffer_coefficient: number;
}

export type BackendConstraint =
  | BoxConstraint
  | SphereConstraint
  | HalfspaceConstraint
  | CylinderConstraint
  | BrushStrokeConstraint
  | RayCarveConstraint
  | (ConstraintBase & Record<string, unknown>);

export interface ConstraintsResponse {
  constraints: BackendConstraint[];
  total: number;
}

// Constraint endpoints
export async function getConstraints(
  projectId: string,
): Promise<ConstraintsResponse> {
  return request(`/projects/${projectId}/constraints`);
}

export async function clearConstraints(projectId: string): Promise<void> {
  await request(`/projects/${projectId}/constraints`, { method: "DELETE" });
}

// Utility to delete all projects
export async function deleteAllProjects(): Promise<void> {
  const { projects } = await listProjects();
  await Promise.all(projects.map((p) => deleteProject(p.id)));
}

// Auto-analysis types
export interface AutoAlgorithmStats {
  constraints_generated: number;
  coverage_description: string;
}

export interface AutoAnalysisSummary {
  total_constraints: number;
  solid_constraints: number;
  empty_constraints: number;
  algorithms_contributing: number;
}

export interface GeneratedConstraint {
  constraint: {
    type: string;
    sign: string;
    [key: string]: unknown;
  };
  algorithm: string;
  confidence: number;
  description: string;
}

export interface AutoAnalysisResult {
  analysis_id: string;
  computed_at: string;
  algorithms_run: string[];
  summary: AutoAnalysisSummary;
  algorithm_stats: Record<string, AutoAlgorithmStats>;
  generated_constraints: GeneratedConstraint[];
}

export interface AutoAnalysisOptions {
  // Voxel grid parameters
  min_gap_size?: number; // 0.01-1.0, default 0.10
  max_grid_dim?: number; // 50-500, default 200

  // Ray propagation
  cone_angle?: number; // 0-45, default 15.0

  // Normal offset
  normal_offset_pairs?: number; // 10-200, default 40

  // Filtering
  max_boxes?: number; // 5-100, default 30
  overlap_threshold?: number; // 0.1-0.9, default 0.5

  // IDW Normal sampling
  idw_sample_count?: number; // 100-10000, default 1000
  idw_max_distance?: number; // 0.05-2.0, default 0.5
  idw_power?: number; // 0.5-4.0, default 2.0

  // Hull filtering
  hull_filter_enabled?: boolean; // default true
  hull_alpha?: number; // 0.1-20.0, default 1.0

  // Flood fill output mode (EMPTY regions)
  flood_fill_output?: "boxes" | "samples" | "both"; // default "samples"
  flood_fill_sample_count?: number; // 50-5000, default 500

  // Voxel regions output mode (SOLID regions)
  voxel_regions_output?: "boxes" | "samples" | "both"; // default "samples"
  voxel_regions_sample_count?: number; // 50-5000, default 500
}

export interface ApplyConstraintsRequest {
  constraintIndices: number[];
}

export interface ApplyConstraintsResponse {
  status: string;
  constraints_added: number;
  constraint_ids: string[];
}

// Auto-analysis endpoints
export async function runAutoAnalysis(
  projectId: string,
  options?: {
    algorithms?: string[];
    recompute?: boolean;
    analysisOptions?: AutoAnalysisOptions;
  },
): Promise<AutoAnalysisResult> {
  const body: Record<string, unknown> = {};
  if (options?.algorithms) {
    body.algorithms = options.algorithms;
  }
  if (options?.recompute) {
    body.recompute = true;
  }
  if (options?.analysisOptions) {
    body.options = options.analysisOptions;
  }

  return request(`/projects/${projectId}/auto/analyze`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getAutoAnalysisResult(
  projectId: string,
): Promise<AutoAnalysisResult | null> {
  return request(`/projects/${projectId}/auto/result`);
}

export async function applyAutoConstraints(
  projectId: string,
  request: ApplyConstraintsRequest,
): Promise<ApplyConstraintsResponse> {
  return globalThis
    .fetch(`${API_BASE}/projects/${projectId}/auto/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ constraint_indices: request.constraintIndices }),
    })
    .then(async (res) => {
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${res.status}`);
      }
      return res.json();
    });
}

export async function clearAutoAnalysis(projectId: string): Promise<void> {
  await request(`/projects/${projectId}/auto`, { method: "DELETE" });
}

// Health check
export async function healthCheck(): Promise<{
  status: string;
  version: string;
}> {
  const response = await fetch("/health");
  return response.json();
}
