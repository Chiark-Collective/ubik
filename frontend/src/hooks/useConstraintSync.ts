// ABOUTME: Hook for syncing constraints with the backend API
// ABOUTME: Provides mutations for creating, updating, and deleting constraints, and loads constraints on project selection

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLabelStore, type Constraint } from "../stores/labelStore";
import { getConstraints, type BackendConstraint } from "../services/api";

const API_BASE = "/v1";

// Transform backend snake_case to frontend camelCase
function transformConstraint(backend: BackendConstraint): Constraint {
  const base = {
    id: backend.id,
    type: backend.type,
    name: backend.name,
    sign: backend.sign,
    weight: backend.weight,
    createdAt: backend.created_at,
  };

  switch (backend.type) {
    case "box":
      return {
        ...base,
        type: "box",
        center: backend.center,
        halfExtents: backend.half_extents,
      } as Constraint;

    case "sphere":
      return {
        ...base,
        type: "sphere",
        center: backend.center,
        radius: backend.radius,
      } as Constraint;

    case "halfspace":
      return {
        ...base,
        type: "halfspace",
        point: backend.point,
        normal: backend.normal,
      } as Constraint;

    case "cylinder":
      return {
        ...base,
        type: "cylinder",
        center: backend.center,
        radius: backend.radius,
        height: backend.height,
        axis: backend.axis,
      } as Constraint;

    case "brush_stroke":
      return {
        ...base,
        type: "brush_stroke",
        strokePoints: backend.stroke_points,
        radius: backend.radius,
      } as Constraint;

    case "ray_carve": {
      const rayCarve = backend as import("../services/api").RayCarveConstraint;
      return {
        ...base,
        type: "ray_carve",
        rays: rayCarve.rays.map((r) => ({
          origin: r.origin,
          direction: r.direction,
          hitDistance: r.hit_distance,
          surfaceNormal: r.surface_normal,
          hitPointIndex: r.hit_point_index,
          localSpacing: r.local_spacing,
        })),
        emptyBandWidth: rayCarve.empty_band_width,
        surfaceBandWidth: rayCarve.surface_band_width,
        backBufferWidth: rayCarve.back_buffer_width,
        backBufferCoefficient: rayCarve.back_buffer_coefficient,
      } as Constraint;
    }

    case "sample_point": {
      // Backend returns position and distance directly (no snake_case conversion needed)
      const samplePoint = backend as unknown as {
        position: [number, number, number];
        distance: number;
      };
      // Debug: log sample_point transformation
      if (!samplePoint.position) {
        console.warn(
          "[useConstraintSync] sample_point missing position:",
          backend,
        );
      }
      return {
        ...base,
        type: "sample_point",
        position: samplePoint.position || [0, 0, 0],
        distance: samplePoint.distance || 0,
      } as Constraint;
    }

    default:
      // For other types (seed_propagation, ml_import, pocket, slice_selection),
      // pass through with basic transforms
      return {
        ...base,
        ...backend,
      } as Constraint;
  }
}

interface RayInfoRequest {
  origin: [number, number, number];
  direction: [number, number, number];
  hit_distance: number;
  surface_normal?: [number, number, number];
  hit_point_index?: number;
  local_spacing?: number;
}

interface ConstraintCreateRequest {
  type: string;
  name?: string;
  sign: "solid" | "empty" | "surface";
  weight: number;
  center?: [number, number, number];
  half_extents?: [number, number, number];
  radius?: number;
  height?: number;
  axis?: [number, number, number];
  point?: [number, number, number];
  normal?: [number, number, number];
  stroke_points?: [number, number, number][];
  // Ray carve fields
  rays?: RayInfoRequest[];
  empty_band_width?: number;
  surface_band_width?: number;
  back_buffer_width?: number;
  back_buffer_coefficient?: number;
}

async function createConstraint(
  projectId: string,
  constraint: ConstraintCreateRequest,
): Promise<Constraint> {
  const response = await fetch(
    `${API_BASE}/projects/${projectId}/constraints`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(constraint),
    },
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Failed to create constraint" }));
    throw new Error(error.detail);
  }

  return response.json();
}

async function deleteConstraintApi(
  projectId: string,
  constraintId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/projects/${projectId}/constraints/${constraintId}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Failed to delete constraint" }));
    throw new Error(error.detail);
  }
}

export function useConstraintSync(projectId: string | null) {
  const queryClient = useQueryClient();
  const removeConstraintFromStore = useLabelStore((s) => s.removeConstraint);
  const setConstraints = useLabelStore((s) => s.setConstraints);

  // Track which projects have been initially loaded to avoid overwriting optimistic updates
  const loadedProjectsRef = useRef<Set<string>>(new Set());

  // Fetch constraints from backend when projectId changes
  const { data: constraintsData, isLoading: isLoadingConstraints } = useQuery({
    queryKey: ["constraints", projectId],
    queryFn: () => (projectId ? getConstraints(projectId) : null),
    enabled: !!projectId,
    // Disable automatic refetching to prevent race conditions with optimistic updates
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Sync fetched constraints to store only on initial load for each project
  useEffect(() => {
    if (projectId && constraintsData?.constraints) {
      // Only sync if we haven't loaded this project's constraints yet
      if (!loadedProjectsRef.current.has(projectId)) {
        loadedProjectsRef.current.add(projectId);
        const transformed =
          constraintsData.constraints.map(transformConstraint);
        setConstraints(projectId, transformed);
      }
    }
  }, [projectId, constraintsData, setConstraints]);

  const createMutation = useMutation({
    mutationFn: async (constraint: Constraint) => {
      if (!projectId) throw new Error("No project selected");

      // Convert store constraint to API format
      const request: ConstraintCreateRequest = {
        type: constraint.type,
        name: constraint.name,
        sign: constraint.sign,
        weight: constraint.weight,
      };

      if (constraint.type === "box") {
        request.center = constraint.center;
        request.half_extents = constraint.halfExtents;
      } else if (constraint.type === "sphere") {
        request.center = constraint.center;
        request.radius = constraint.radius;
      } else if (constraint.type === "halfspace") {
        request.point = constraint.point;
        request.normal = constraint.normal;
      } else if (constraint.type === "cylinder") {
        request.center = constraint.center;
        request.radius = constraint.radius;
        request.height = constraint.height;
        request.axis = constraint.axis;
      } else if (constraint.type === "brush_stroke") {
        request.stroke_points = constraint.strokePoints;
        request.radius = constraint.radius;
      } else if (constraint.type === "ray_carve") {
        request.rays = constraint.rays.map((r) => ({
          origin: r.origin,
          direction: r.direction,
          hit_distance: r.hitDistance,
          surface_normal: r.surfaceNormal,
          hit_point_index: r.hitPointIndex,
          local_spacing: r.localSpacing,
        }));
        request.empty_band_width = constraint.emptyBandWidth;
        request.surface_band_width = constraint.surfaceBandWidth;
        request.back_buffer_width = constraint.backBufferWidth;
        request.back_buffer_coefficient = constraint.backBufferCoefficient;
      }

      return createConstraint(projectId, request);
    },
    onSuccess: () => {
      // Constraint already added to store optimistically
      // Invalidate constraints query so it refetches with the new constraint from backend
      queryClient.invalidateQueries({ queryKey: ["constraints", projectId] });
    },
    onError: (error, constraint) => {
      // Remove from store on failure
      if (projectId) {
        removeConstraintFromStore(projectId, constraint.id);
      }
      console.error("Failed to create constraint:", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (constraintId: string) => {
      if (!projectId) throw new Error("No project selected");
      return deleteConstraintApi(projectId, constraintId);
    },
    onSuccess: () => {
      // Invalidate constraints query so it refetches without the deleted constraint
      queryClient.invalidateQueries({ queryKey: ["constraints", projectId] });
    },
    onError: (error) => {
      console.error("Failed to delete constraint:", error);
    },
  });

  // Force refresh constraints from backend (used after external updates like auto-analysis apply)
  const refreshConstraints = () => {
    if (projectId) {
      // Clear the loaded state so useEffect will resync when query refetches
      loadedProjectsRef.current.delete(projectId);
      queryClient.invalidateQueries({ queryKey: ["constraints", projectId] });
    }
  };

  return {
    createConstraint: createMutation.mutate,
    deleteConstraint: deleteMutation.mutate,
    refreshConstraints,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isLoadingConstraints,
  };
}
