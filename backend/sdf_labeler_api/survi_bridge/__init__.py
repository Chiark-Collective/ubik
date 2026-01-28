# ABOUTME: Survi integration bridge
# ABOUTME: Wrappers for survi sampling and normal estimation functions

"""
Bridge module for integrating with survi SDF sampling functions.

When survi is available, this module provides wrappers around:
- survi.sdf.sampling.sample_training_mixture()
- survi.sdf.sampling.sample_surface_anchors()
- survi.sdf.sampling.sample_band()
- survi.sdf.sampling.sample_far_field_global()
- survi.sdf.spec.SDFTaskSpec
- survi.sdf.normals.estimate_normals()

If survi is not installed, fallback implementations are used.
"""

import logging

logger = logging.getLogger(__name__)

SURVI_AVAILABLE = False

try:
    from survi.sdf.normals import estimate_normals, orient_normals
    from survi.sdf.sampling import (
        sample_band,
        sample_far_field_global,
        sample_surface_anchors,
        sample_training_mixture,
    )
    from survi.sdf.spec import SDF_COLUMNS, SDFTaskSpec

    SURVI_AVAILABLE = True
    logger.info("Survi integration available")
except ImportError:
    logger.warning("Survi not found - using fallback sampling implementations")

    # Fallback stubs
    def sample_training_mixture(*args, **kwargs):
        raise NotImplementedError("Survi not available - install survi for advanced sampling")

    def sample_surface_anchors(*args, **kwargs):
        raise NotImplementedError("Survi not available")

    def sample_band(*args, **kwargs):
        raise NotImplementedError("Survi not available")

    def sample_far_field_global(*args, **kwargs):
        raise NotImplementedError("Survi not available")

    def estimate_normals(*args, **kwargs):
        raise NotImplementedError("Survi not available")

    def orient_normals(*args, **kwargs):
        raise NotImplementedError("Survi not available")

    class SDFTaskSpec:
        pass

    SDF_COLUMNS = [
        "x",
        "y",
        "z",
        "phi",
        "nx",
        "ny",
        "nz",
        "weight",
        "source",
        "is_surface",
        "is_free",
    ]


__all__ = [
    "SURVI_AVAILABLE",
    "sample_training_mixture",
    "sample_surface_anchors",
    "sample_band",
    "sample_far_field_global",
    "SDFTaskSpec",
    "SDF_COLUMNS",
    "estimate_normals",
    "orient_normals",
]
