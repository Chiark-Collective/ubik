# ABOUTME: Plotly-based visualization utility for SDF samples
# ABOUTME: Generates interactive HTML point cloud visualizations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


def create_visualization(
    samples_path: Path,
    surface_path: Path | None = None,
    output_path: Path | None = None,
    sample_fraction: float = 1.0,
    point_size: int = 3,
) -> Path:
    """Create an interactive 3D visualization of SDF samples.

    Args:
        samples_path: Path to parquet file with SDF samples
        surface_path: Optional path to surface point cloud (ply, parquet, csv)
        output_path: Output HTML path (default: samples_path with .html extension)
        sample_fraction: Fraction of points to display (for large clouds)
        point_size: Size of points in the visualization

    Returns:
        Path to the generated HTML file
    """
    try:
        import plotly.graph_objects as go
    except ImportError as err:
        raise ImportError(
            "plotly is required for visualization. Install with: pip install plotly"
        ) from err

    # Load samples
    df = pd.read_parquet(samples_path)
    print(f"Loaded {len(df)} samples from {samples_path}")

    # Subsample if needed
    if sample_fraction < 1.0:
        df = df.sample(frac=sample_fraction, random_state=42)
        print(f"Subsampled to {len(df)} points ({sample_fraction * 100:.0f}%)")

    # Split into empty and solid
    empty_mask = df["is_free"].fillna(False).astype(bool)
    solid_mask = ~empty_mask
    surface_mask = df["is_surface"].fillna(False).astype(bool)

    empty_df = df[empty_mask & ~surface_mask]
    solid_df = df[solid_mask & ~surface_mask]
    sample_surface_df = df[surface_mask]

    print(f"  Empty (far-field): {len(empty_df)}")
    print(f"  Solid (far-field): {len(solid_df)}")
    print(f"  Surface samples: {len(sample_surface_df)}")

    # Create figure
    fig = go.Figure()

    # Add empty samples (blue)
    if len(empty_df) > 0:
        fig.add_trace(
            go.Scatter3d(
                x=empty_df["x"],
                y=empty_df["y"],
                z=empty_df["z"],
                mode="markers",
                marker=dict(
                    size=point_size,
                    color=empty_df["phi"],
                    colorscale="Blues",
                    cmin=0,
                    cmax=empty_df["phi"].quantile(0.95),
                    opacity=0.7,
                    colorbar=dict(title="φ (empty)", x=1.0, len=0.4, y=0.8),
                ),
                name=f"Empty ({len(empty_df)})",
                hovertemplate="x: %{x:.3f}<br>y: %{y:.3f}<br>z: %{z:.3f}<br>φ: %{marker.color:.3f}<extra>Empty</extra>",
            )
        )

    # Add solid samples (red/orange)
    if len(solid_df) > 0:
        fig.add_trace(
            go.Scatter3d(
                x=solid_df["x"],
                y=solid_df["y"],
                z=solid_df["z"],
                mode="markers",
                marker=dict(
                    size=point_size,
                    color=solid_df["phi"],
                    colorscale="Reds_r",  # Reversed so more negative = darker
                    cmin=solid_df["phi"].quantile(0.05),
                    cmax=0,
                    opacity=0.7,
                    colorbar=dict(title="φ (solid)", x=1.15, len=0.4, y=0.8),
                ),
                name=f"Solid ({len(solid_df)})",
                hovertemplate="x: %{x:.3f}<br>y: %{y:.3f}<br>z: %{z:.3f}<br>φ: %{marker.color:.3f}<extra>Solid</extra>",
            )
        )

    # Add surface samples from the parquet (green)
    if len(sample_surface_df) > 0:
        fig.add_trace(
            go.Scatter3d(
                x=sample_surface_df["x"],
                y=sample_surface_df["y"],
                z=sample_surface_df["z"],
                mode="markers",
                marker=dict(
                    size=point_size + 1,
                    color="green",
                    opacity=0.9,
                ),
                name=f"Surface samples ({len(sample_surface_df)})",
                hovertemplate="x: %{x:.3f}<br>y: %{y:.3f}<br>z: %{z:.3f}<extra>Surface</extra>",
            )
        )

    # Load and add external surface point cloud if provided
    if surface_path is not None:
        surface_pts = _load_surface_points(surface_path, sample_fraction)
        if surface_pts is not None and len(surface_pts) > 0:
            print(f"Loaded {len(surface_pts)} surface points from {surface_path}")
            fig.add_trace(
                go.Scatter3d(
                    x=surface_pts[:, 0],
                    y=surface_pts[:, 1],
                    z=surface_pts[:, 2],
                    mode="markers",
                    marker=dict(
                        size=point_size - 1,
                        color="gray",
                        opacity=0.4,
                    ),
                    name=f"Point cloud ({len(surface_pts)})",
                    hovertemplate="x: %{x:.3f}<br>y: %{y:.3f}<br>z: %{z:.3f}<extra>Surface</extra>",
                )
            )

    # Layout
    fig.update_layout(
        title=dict(
            text=f"SDF Samples: {samples_path.stem}",
            x=0.5,
        ),
        scene=dict(
            xaxis_title="X",
            yaxis_title="Y",
            zaxis_title="Z",
            aspectmode="data",
        ),
        legend=dict(
            yanchor="top",
            y=0.99,
            xanchor="left",
            x=0.01,
        ),
        margin=dict(l=0, r=0, t=40, b=0),
    )

    # Determine output path
    if output_path is None:
        output_path = samples_path.with_suffix(".html")

    # Write HTML
    fig.write_html(output_path, include_plotlyjs="cdn")
    print(f"Wrote visualization to {output_path}")

    return output_path


def _load_surface_points(path: Path, sample_fraction: float = 1.0) -> np.ndarray | None:
    """Load surface points from various formats."""
    suffix = path.suffix.lower()

    try:
        if suffix == ".parquet":
            df = pd.read_parquet(path)
            if "x" in df.columns and "y" in df.columns and "z" in df.columns:
                pts = df[["x", "y", "z"]].values
            else:
                return None
        elif suffix == ".ply":
            import trimesh

            mesh = trimesh.load(path)
            if hasattr(mesh, "vertices"):
                pts = np.array(mesh.vertices)
            else:
                return None
        elif suffix == ".csv":
            df = pd.read_csv(path)
            if "x" in df.columns and "y" in df.columns and "z" in df.columns:
                pts = df[["x", "y", "z"]].values
            else:
                # Assume first 3 columns are x, y, z
                pts = df.iloc[:, :3].values
        elif suffix in (".las", ".laz"):
            import laspy

            las = laspy.read(path)
            pts = np.column_stack([las.x, las.y, las.z])
        elif suffix == ".npz":
            data = np.load(path)
            if "points" in data:
                pts = data["points"]
            elif "xyz" in data:
                pts = data["xyz"]
            else:
                # Try first array
                pts = data[list(data.keys())[0]]
                if pts.ndim != 2 or pts.shape[1] < 3:
                    return None
                pts = pts[:, :3]
        else:
            print(f"Unsupported surface format: {suffix}")
            return None

        # Subsample
        if sample_fraction < 1.0 and len(pts) > 1000:
            n_keep = int(len(pts) * sample_fraction)
            indices = np.random.choice(len(pts), n_keep, replace=False)
            pts = pts[indices]

        return pts

    except Exception as e:
        print(f"Error loading surface points: {e}")
        return None


def main():
    """CLI entry point for visualization."""
    parser = argparse.ArgumentParser(
        description="Visualize SDF samples as interactive 3D point cloud",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic visualization
  sdf-labeler visualize samples.parquet

  # With surface point cloud overlay
  sdf-labeler visualize samples.parquet --surface pointcloud.ply

  # Subsample large datasets
  sdf-labeler visualize samples.parquet --sample 0.1 --point-size 2

  # Custom output path
  sdf-labeler visualize samples.parquet -o my_viz.html
""",
    )
    parser.add_argument("samples", type=Path, help="Path to samples parquet file")
    parser.add_argument(
        "--surface", "-s", type=Path, help="Optional surface point cloud (ply, parquet, csv, las)"
    )
    parser.add_argument("--output", "-o", type=Path, help="Output HTML path")
    parser.add_argument(
        "--sample",
        type=float,
        default=1.0,
        help="Fraction of points to display (0.0-1.0, default: 1.0)",
    )
    parser.add_argument("--point-size", type=int, default=3, help="Point size (default: 3)")
    parser.add_argument("--open", action="store_true", help="Open in browser after creation")

    args = parser.parse_args()

    if not args.samples.exists():
        print(f"Error: samples file not found: {args.samples}")
        return 1

    if args.surface and not args.surface.exists():
        print(f"Error: surface file not found: {args.surface}")
        return 1

    output_path = create_visualization(
        samples_path=args.samples,
        surface_path=args.surface,
        output_path=args.output,
        sample_fraction=args.sample,
        point_size=args.point_size,
    )

    if args.open:
        import webbrowser

        webbrowser.open(f"file://{output_path.absolute()}")

    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
