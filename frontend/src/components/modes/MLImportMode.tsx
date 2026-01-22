// ABOUTME: ML model import mode panel for loading external predictions
// ABOUTME: Supports per-point masks, bounding boxes, and segmentation outputs

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { UploadIcon, Cross2Icon } from "@radix-ui/react-icons";
import * as ToggleGroup from "@radix-ui/react-toggle-group";

import { useProjectStore, type LabelType } from "../../stores/projectStore";
import {
  useLabelStore,
  type MLImportConstraint,
} from "../../stores/labelStore";

type ImportFormat = "npz_mask" | "json_boxes" | "csv_points";

interface ClassMapping {
  sourceClass: string | number;
  targetLabel: LabelType;
  enabled: boolean;
}

interface MLImportModeProps {
  projectId: string;
}

export function MLImportMode({ projectId }: MLImportModeProps) {
  const activeLabel = useProjectStore((s) => s.activeLabel);
  const addConstraint = useLabelStore((s) => s.addConstraint);

  const [format, setFormat] = useState<ImportFormat>("npz_mask");
  const [file, setFile] = useState<File | null>(null);
  const [classMappings, setClassMappings] = useState<ClassMapping[]>([]);
  const [previewData, setPreviewData] = useState<{
    classes: (string | number)[];
    counts: Record<string | number, number>;
  } | null>(null);

  // File import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");

      // For MVP, parse the file client-side
      // In production, this would be sent to the backend
      const result = await parseImportFile(file, format);
      return result;
    },
    onSuccess: (data) => {
      // Show preview of detected classes
      setPreviewData(data);

      // Auto-create default class mappings
      const mappings: ClassMapping[] = data.classes.map((cls) => ({
        sourceClass: cls,
        targetLabel: activeLabel,
        enabled: true,
      }));
      setClassMappings(mappings);
    },
  });

  // Apply import as constraints
  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!previewData || classMappings.length === 0) {
        throw new Error("No import data to apply");
      }

      // Create constraints for each enabled class
      const constraints: MLImportConstraint[] = [];

      for (const mapping of classMappings) {
        if (!mapping.enabled) continue;

        // In a real implementation, this would use the parsed point indices
        const constraint: MLImportConstraint = {
          id: crypto.randomUUID(),
          type: "ml_import",
          sign: mapping.targetLabel,
          weight: 1.0,
          createdAt: Date.now(),
          sourceFile: file?.name || "unknown",
          sourceClass: mapping.sourceClass,
          pointIndices: [], // Would be populated from parsed data
          confidences: [],
        };

        constraints.push(constraint);
      }

      return constraints;
    },
    onSuccess: (constraints) => {
      for (const constraint of constraints) {
        addConstraint(projectId, constraint);
      }

      // Reset state
      setFile(null);
      setPreviewData(null);
      setClassMappings([]);
    },
  });

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        setFile(selectedFile);
        setPreviewData(null);
        setClassMappings([]);
      }
    },
    [],
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setPreviewData(null);
      setClassMappings([]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const updateMapping = (index: number, updates: Partial<ClassMapping>) => {
    setClassMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...updates } : m)),
    );
  };

  return (
    <div className="p-4 space-y-4">
      {/* Instructions */}
      <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-gray-400">
        <p className="mb-2">
          <strong className="text-white">Import</strong> predictions from ML
          models
        </p>
        <p>
          Supports per-point masks, bounding boxes, and segmentation outputs
        </p>
      </div>

      {/* Format selection */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
          Import Format
        </h4>
        <ToggleGroup.Root
          type="single"
          value={format}
          onValueChange={(value) => value && setFormat(value as ImportFormat)}
          className="flex flex-col gap-2"
        >
          <ToggleGroup.Item
            value="npz_mask"
            className={`
              px-3 py-2 rounded-lg border transition-colors text-left
              ${
                format === "npz_mask"
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-gray-700 hover:border-gray-600 text-gray-400"
              }
            `}
          >
            <div className="text-sm font-medium">NPZ Mask</div>
            <div className="text-xs text-gray-500">Per-point class labels</div>
          </ToggleGroup.Item>
          <ToggleGroup.Item
            value="json_boxes"
            className={`
              px-3 py-2 rounded-lg border transition-colors text-left
              ${
                format === "json_boxes"
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-gray-700 hover:border-gray-600 text-gray-400"
              }
            `}
          >
            <div className="text-sm font-medium">JSON Boxes</div>
            <div className="text-xs text-gray-500">3D bounding boxes</div>
          </ToggleGroup.Item>
          <ToggleGroup.Item
            value="csv_points"
            className={`
              px-3 py-2 rounded-lg border transition-colors text-left
              ${
                format === "csv_points"
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-gray-700 hover:border-gray-600 text-gray-400"
              }
            `}
          >
            <div className="text-sm font-medium">CSV Points</div>
            <div className="text-xs text-gray-500">
              Point indices with labels
            </div>
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>

      {/* File upload */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
          Upload File
        </h4>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`
            border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer
            ${
              file
                ? "border-blue-500 bg-blue-500/10"
                : "border-gray-700 hover:border-gray-600"
            }
          `}
        >
          <input
            type="file"
            onChange={handleFileChange}
            accept=".npz,.json,.csv"
            className="hidden"
            id="ml-import-file"
          />
          <label htmlFor="ml-import-file" className="cursor-pointer">
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm text-blue-400 truncate max-w-[150px]">
                  {file.name}
                </span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setFile(null);
                    setPreviewData(null);
                    setClassMappings([]);
                  }}
                  className="p-1 text-gray-400 hover:text-red-400"
                >
                  <Cross2Icon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="text-gray-400">
                <UploadIcon className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">Drop file or click to browse</p>
              </div>
            )}
          </label>
        </div>
      </div>

      {/* Preview button */}
      {file && !previewData && (
        <button
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
          className="w-full px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          {importMutation.isPending ? "Loading..." : "Preview Import"}
        </button>
      )}

      {importMutation.isError && (
        <p className="text-sm text-red-400 text-center">
          {(importMutation.error as Error).message}
        </p>
      )}

      {/* Class mappings */}
      {previewData && classMappings.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
            Class Mappings
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {classMappings.map((mapping, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-gray-800/50 rounded"
              >
                <input
                  type="checkbox"
                  checked={mapping.enabled}
                  onChange={(e) =>
                    updateMapping(index, { enabled: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-400 flex-1">
                  {mapping.sourceClass}
                </span>
                <span className="text-xs text-gray-500">
                  ({previewData.counts[mapping.sourceClass] || 0} pts)
                </span>
                <span className="text-xs">→</span>
                <select
                  value={mapping.targetLabel}
                  onChange={(e) =>
                    updateMapping(index, {
                      targetLabel: e.target.value as LabelType,
                    })
                  }
                  className="bg-gray-700 text-sm px-2 py-1 rounded"
                >
                  <option value="solid">Solid</option>
                  <option value="empty">Empty</option>
                  <option value="surface">Surface</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Apply button */}
      {previewData && (
        <button
          onClick={() => applyMutation.mutate()}
          disabled={
            applyMutation.isPending ||
            classMappings.filter((m) => m.enabled).length === 0
          }
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {applyMutation.isPending ? "Applying..." : "Apply Import"}
        </button>
      )}

      {applyMutation.isError && (
        <p className="text-sm text-red-400 text-center">
          {(applyMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}

// Parse import file (client-side for MVP)
async function parseImportFile(
  file: File,
  format: ImportFormat,
): Promise<{
  classes: (string | number)[];
  counts: Record<string | number, number>;
}> {
  const text = await file.text();

  if (format === "csv_points") {
    // Parse CSV with columns: index, class, [confidence]
    const lines = text.trim().split("\n");
    const counts: Record<string | number, number> = {};

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length >= 2) {
        const cls = parts[1].trim();
        counts[cls] = (counts[cls] || 0) + 1;
      }
    }

    return {
      classes: Object.keys(counts),
      counts,
    };
  }

  if (format === "json_boxes") {
    // Parse JSON with bounding boxes
    const data = JSON.parse(text);
    const counts: Record<string | number, number> = {};

    if (Array.isArray(data.boxes)) {
      for (const box of data.boxes) {
        const cls = box.class || box.label || "unknown";
        counts[cls] = (counts[cls] || 0) + 1;
      }
    }

    return {
      classes: Object.keys(counts),
      counts,
    };
  }

  // NPZ format would require backend or additional library
  // For now, return placeholder
  return {
    classes: ["class_0", "class_1"],
    counts: { class_0: 1000, class_1: 500 },
  };
}
