# ABOUTME: Configuration management for SDF Labeler API
# ABOUTME: Uses pydantic-settings for environment variable loading

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="SDF_LABELER_",
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # Storage settings
    data_dir: Path = Path.home() / ".sdf-labeler" / "data"
    max_upload_size_mb: int = 500

    # Point cloud settings
    octree_node_target: int = 65536  # Target points per octree leaf node
    octree_max_depth: int = 12
    default_normal_k: int = 16

    # Pocket detection settings
    pocket_voxel_target: int = 256  # Target voxels along longest axis
    pocket_min_voxel_size: float = 0.001  # Minimum voxel size in world units
    pocket_max_voxels_per_axis: int = 512  # Hard limit to prevent OOM
    pocket_occupancy_dilation: int = 1  # Voxels to dilate around points
    pocket_min_volume_voxels: int = 8  # Minimum pocket size to report

    # CORS settings
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    cors_allow_all: bool = False  # Allow all origins (for API mode behind proxy)

    # Survi integration (optional)
    survi_path: Path | None = None

    # Docker/deployment settings
    serve_frontend: bool = False  # Enable static file serving for webapp mode
    frontend_dist_path: Path = Path("/app/frontend/dist")  # Path to frontend build

    def ensure_data_dir(self) -> Path:
        """Ensure data directory exists and return it."""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir


settings = Settings()
