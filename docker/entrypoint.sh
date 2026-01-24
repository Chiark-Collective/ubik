#!/bin/bash
# ABOUTME: Docker entrypoint script for SDF Labeler
# ABOUTME: Handles mode switching: webapp, api, pipeline, cli

set -e

MODE="${1:-webapp}"
shift || true

case "$MODE" in
    webapp)
        echo "Starting SDF Labeler in webapp mode..."
        echo "  - Frontend: enabled"
        echo "  - API: http://0.0.0.0:${SDF_LABELER_PORT:-8000}"

        export SDF_LABELER_SERVE_FRONTEND=true
        exec uvicorn sdf_labeler_api.app:app \
            --host "${SDF_LABELER_HOST:-0.0.0.0}" \
            --port "${SDF_LABELER_PORT:-8000}" \
            "$@"
        ;;

    api)
        echo "Starting SDF Labeler in API-only mode..."
        echo "  - Frontend: disabled"
        echo "  - API: http://0.0.0.0:${SDF_LABELER_PORT:-8000}"

        export SDF_LABELER_SERVE_FRONTEND=false
        export SDF_LABELER_CORS_ALLOW_ALL=true
        exec uvicorn sdf_labeler_api.app:app \
            --host "${SDF_LABELER_HOST:-0.0.0.0}" \
            --port "${SDF_LABELER_PORT:-8000}" \
            "$@"
        ;;

    pipeline)
        if [ -z "$1" ]; then
            echo "Error: Pipeline mode requires a YAML file path"
            echo "Usage: docker run sdf-labeler pipeline /data/pipeline.yml"
            exit 1
        fi

        PIPELINE_FILE="$1"
        shift

        echo "Running pipeline: $PIPELINE_FILE"
        exec python -m sdf_labeler_api.cli pipeline "$PIPELINE_FILE" "$@"
        ;;

    cli)
        echo "Running CLI command..."
        exec python -m sdf_labeler_api.cli "$@"
        ;;

    *)
        # If unknown mode, assume it's a direct command
        echo "Running: $MODE $@"
        exec "$MODE" "$@"
        ;;
esac
