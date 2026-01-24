# ABOUTME: Module entry point for running CLI via python -m
# ABOUTME: Enables: python -m sdf_labeler_api.cli

import sys

from sdf_labeler_api.cli import main

if __name__ == "__main__":
    sys.exit(main())
