// ABOUTME: Left sidebar panel for project and file management
// ABOUTME: Allows creating projects and uploading point clouds

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PlusIcon,
  FileIcon,
  TrashIcon,
  UploadIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
} from "@radix-ui/react-icons";
import * as Dialog from "@radix-ui/react-dialog";

import { useProjectStore } from "../../stores/projectStore";
import { toast } from "../../stores/toastStore";
import {
  listProjects,
  createProject,
  deleteProject,
  deleteAllProjects,
  uploadPointCloud,
  listScenarios,
  loadScenario,
  type ProjectCreate,
  type UploadProgress,
} from "../../services/api";

export function ProjectPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);

  // Fetch projects from backend
  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const projects = data?.projects ?? [];

  // Collapsed state - just show toggle button
  if (collapsed) {
    return (
      <div className="w-10 flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-800">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 m-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
          title="Expand panel"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded"
            title="Collapse panel"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="font-medium text-sm">Projects</span>
        </div>
        <CreateProjectDialog />
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-sm text-gray-500">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No projects yet</div>
        ) : (
          <>
            <ul className="py-2">
              {projects.map((project) => (
                <ProjectItem
                  key={project.id}
                  project={project}
                  isSelected={project.id === currentProjectId}
                  onSelect={() => setCurrentProject(project.id)}
                />
              ))}
            </ul>
            <div className="px-4 pb-2">
              <DeleteAllProjectsButton projectCount={projects.length} />
            </div>
          </>
        )}
      </div>

      {/* Upload/Scenarios section */}
      <div className="border-t border-gray-800">
        {currentProjectId ? (
          <DataSourceTabs projectId={currentProjectId} />
        ) : (
          <div className="p-4">
            <p className="text-xs text-gray-500 mb-2">
              Select or create a project to load data
            </p>
            <button
              className="w-full px-3 py-2 text-xs font-medium text-gray-400 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
              disabled
            >
              Demo Data ✨
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type DataSourceTab = "upload" | "scenarios";

function DataSourceTabs({ projectId }: { projectId: string }) {
  // Default to scenarios tab for easier discovery
  const [activeTab, setActiveTab] = useState<DataSourceTab>("scenarios");

  return (
    <div>
      {/* Tab buttons */}
      <div className="flex border-b border-gray-800">
        <button
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "upload"
              ? "text-blue-400 border-b-2 border-blue-400"
              : "text-gray-500 hover:text-gray-300"
          }`}
          onClick={() => setActiveTab("upload")}
        >
          Upload File
        </button>
        <button
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "scenarios"
              ? "text-blue-400 border-b-2 border-blue-400"
              : "text-gray-500 hover:text-gray-300"
          }`}
          onClick={() => setActiveTab("scenarios")}
        >
          Demo Data ✨
        </button>
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === "upload" ? (
          <UploadDropzone projectId={projectId} />
        ) : (
          <ScenarioBrowser projectId={projectId} />
        )}
      </div>
    </div>
  );
}

interface ProjectItemProps {
  project: any;
  isSelected: boolean;
  onSelect: () => void;
}

function ProjectItem({ project, isSelected, onSelect }: ProjectItemProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.info("Project deleted");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete project", error.message);
    },
  });

  return (
    <li
      className={`
        flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors
        ${isSelected ? "bg-blue-600/20 text-blue-400" : "hover:bg-gray-800"}
      `}
      onClick={onSelect}
    >
      <ChevronRightIcon
        className={`w-4 h-4 transition-transform ${isSelected ? "rotate-90" : ""}`}
      />
      <FileIcon className="w-4 h-4" />
      <span className="flex-1 text-sm truncate">{project.name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm("Delete this project?")) {
            deleteMutation.mutate();
          }
        }}
        className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100"
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </li>
  );
}

function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);

  const createMutation = useMutation({
    mutationFn: (data: ProjectCreate) => createProject(data),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setCurrentProject(project.id);
      setOpen(false);
      setName("");
      toast.success("Project created", `"${project.name}" is ready`);
    },
    onError: (error: Error) => {
      toast.error("Failed to create project", error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      createMutation.mutate({ name: name.trim() });
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          data-testid="create-project-button"
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 p-6 bg-gray-900 rounded-lg border border-gray-700 shadow-xl">
          <Dialog.Title className="text-lg font-medium mb-4">
            New Project
          </Dialog.Title>
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={!name.trim() || createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface UploadDropzoneProps {
  projectId: string;
}

function UploadDropzone({ projectId }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  const queryClient = useQueryClient();
  const updateProject = useProjectStore((s) => s.updateProject);

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadPointCloud(projectId, file, true, 16, (progress) => {
        setUploadProgress(progress);
      }),
    onSuccess: (result) => {
      setUploadProgress(null);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({
        queryKey: ["octree-metadata", projectId],
      });
      updateProject(projectId, {
        pointCloudId: result.id,
        pointCount: result.point_count,
        hasNormals: result.has_normals,
        boundsLow: result.bounds_low,
        boundsHigh: result.bounds_high,
      });
      toast.success(
        "Point cloud uploaded",
        `${result.point_count.toLocaleString()} points loaded`,
      );
    },
    onError: (error: Error) => {
      setUploadProgress(null);
      toast.error("Upload failed", error.message);
    },
  });

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        uploadMutation.mutate(file);
      }
    },
    [uploadMutation],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadMutation.mutate(file);
      }
    },
    [uploadMutation],
  );

  const isUploading = uploadMutation.isPending;

  return (
    <div
      className={`
        p-4 border-2 border-dashed rounded-lg text-center transition-colors
        ${isDragging ? "border-blue-500 bg-blue-500/10" : "border-gray-700 hover:border-gray-600"}
        ${isUploading ? "pointer-events-none" : ""}
      `}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {isUploading ? (
        <>
          <div className="mb-2">
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress?.percent ?? 0}%` }}
              />
            </div>
          </div>
          <p className="text-sm text-gray-400">
            Uploading... {uploadProgress?.percent ?? 0}%
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {uploadProgress
              ? `${(uploadProgress.loaded / 1024 / 1024).toFixed(1)} MB / ${(uploadProgress.total / 1024 / 1024).toFixed(1)} MB`
              : ""}
          </p>
        </>
      ) : (
        <>
          <UploadIcon className="w-8 h-8 mx-auto mb-2 text-gray-500" />
          <p className="text-sm text-gray-400 mb-2">Drop point cloud here</p>
          <label className="text-xs text-blue-400 hover:underline cursor-pointer">
            or browse files
            <input
              type="file"
              accept=".ply,.las,.laz,.csv,.npz,.parquet"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
          <p className="text-xs text-gray-600 mt-2">
            PLY, LAS, LAZ, CSV, NPZ, Parquet
          </p>
        </>
      )}
    </div>
  );
}

interface ScenarioBrowserProps {
  projectId: string;
}

function ScenarioBrowser({ projectId }: ScenarioBrowserProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    "trenchfoot" | "sdf"
  >("trenchfoot");
  const queryClient = useQueryClient();
  const updateProject = useProjectStore((s) => s.updateProject);

  const { data, isLoading } = useQuery({
    queryKey: ["scenarios", selectedCategory],
    queryFn: () => listScenarios(selectedCategory),
  });

  const loadMutation = useMutation({
    mutationFn: ({
      name,
      category,
    }: {
      name: string;
      category: "trenchfoot" | "sdf";
    }) => loadScenario(projectId, name, category),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({
        queryKey: ["octree-metadata", projectId],
      });
      updateProject(projectId, {
        pointCloudId: result.scenario,
        pointCount: result.point_count,
        hasNormals: true,
        boundsLow: result.bounds.low,
        boundsHigh: result.bounds.high,
      });
      toast.success(
        "Scenario loaded",
        `${result.scenario}: ${result.point_count.toLocaleString()} points`,
      );
    },
    onError: (error: Error) => {
      toast.error("Failed to load scenario", error.message);
    },
  });

  const scenarios = data?.scenarios ?? [];

  return (
    <div>
      {/* Category selector */}
      <div className="flex gap-2 mb-3">
        <button
          className={`px-2 py-1 text-xs rounded ${
            selectedCategory === "trenchfoot"
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
          onClick={() => setSelectedCategory("trenchfoot")}
        >
          Trenchfoot
        </button>
        <button
          className={`px-2 py-1 text-xs rounded ${
            selectedCategory === "sdf"
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
          onClick={() => setSelectedCategory("sdf")}
        >
          SDF Shapes
        </button>
      </div>

      {/* Scenario list */}
      {isLoading ? (
        <p className="text-xs text-gray-500">Loading scenarios...</p>
      ) : scenarios.length === 0 ? (
        <p className="text-xs text-gray-500">No scenarios available</p>
      ) : (
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {scenarios.map((scenario) => (
            <li key={scenario.name}>
              <button
                className="w-full text-left px-2 py-1.5 text-xs rounded bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-50"
                onClick={() =>
                  loadMutation.mutate({
                    name: scenario.name,
                    category: scenario.category,
                  })
                }
                disabled={loadMutation.isPending}
              >
                <span className="font-medium text-gray-200">
                  {scenario.name}
                </span>
                {scenario.description && (
                  <span className="block text-gray-500 truncate">
                    {scenario.description}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {loadMutation.isPending && (
        <p className="text-xs text-blue-400 mt-2">Loading scenario...</p>
      )}
    </div>
  );
}

interface DeleteAllProjectsButtonProps {
  projectCount: number;
}

function DeleteAllProjectsButton({
  projectCount,
}: DeleteAllProjectsButtonProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const clearAllProjects = useProjectStore((s) => s.clearAllProjects);

  const deleteMutation = useMutation({
    mutationFn: deleteAllProjects,
    onSuccess: () => {
      clearAllProjects();
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.info("All projects deleted");
      setOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Failed to delete projects", error.message);
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="w-full text-xs text-red-400 hover:text-red-300 py-1 transition-colors">
          Delete All Projects
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 p-6 bg-gray-900 rounded-lg border border-gray-700 shadow-xl">
          <Dialog.Title className="text-lg font-medium mb-2 text-red-400">
            Delete All Projects?
          </Dialog.Title>
          <Dialog.Description className="text-sm text-gray-400 mb-4">
            This will permanently delete all {projectCount} project
            {projectCount !== 1 ? "s" : ""} and their data.
            <span className="block mt-2 font-semibold text-red-400">
              This action cannot be undone.
            </span>
          </Dialog.Description>
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete All"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
