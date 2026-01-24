# ABOUTME: Makefile for sdf-labeler project
# ABOUTME: Provides commands for development, testing, and running the application

.PHONY: help install install-backend install-frontend dev dev-backend dev-frontend \
        dev-down dev-restart test test-backend test-frontend test-e2e test-e2e-headed \
        lint format clean docker-build docker-run docker-run-api docker-stop

SHELL := /bin/bash

# Colors for output
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

help:
	@echo "$(CYAN)SDF Labeler - Development Commands$(RESET)"
	@echo ""
	@echo "$(GREEN)Setup:$(RESET)"
	@echo "  make install          Install all dependencies"
	@echo "  make install-backend  Install backend dependencies"
	@echo "  make install-frontend Install frontend dependencies"
	@echo ""
	@echo "$(GREEN)Development:$(RESET)"
	@echo "  make dev              Run both backend and frontend"
	@echo "  make dev-backend      Run backend only (port 8001)"
	@echo "  make dev-frontend     Run frontend only (port 5173)"
	@echo "  make dev-down         Stop all dev servers"
	@echo "  make dev-restart      Stop and restart with clean slate"
	@echo ""
	@echo "$(GREEN)Testing:$(RESET)"
	@echo "  make test             Run all unit tests"
	@echo "  make test-backend     Run backend tests"
	@echo "  make test-frontend    Run frontend unit tests"
	@echo "  make test-e2e         Run E2E tests (Playwright)"
	@echo "  make test-e2e-headed  Run E2E tests with browser visible"
	@echo ""
	@echo "$(GREEN)Code Quality:$(RESET)"
	@echo "  make lint             Run linters"
	@echo "  make format           Format code"
	@echo ""
	@echo "$(GREEN)Docker:$(RESET)"
	@echo "  make docker-build     Build Docker image"
	@echo "  make docker-run       Run webapp mode (port 8000)"
	@echo "  make docker-run-api   Run API-only mode (port 8001)"
	@echo "  make docker-stop      Stop Docker container"
	@echo ""
	@echo "$(GREEN)Cleanup:$(RESET)"
	@echo "  make clean            Remove build artifacts"

# =============================================================================
# Installation
# =============================================================================

install: install-backend install-frontend

install-backend:
	@echo "$(CYAN)Installing backend dependencies...$(RESET)"
	cd backend && uv sync

install-frontend:
	@echo "$(CYAN)Installing frontend dependencies...$(RESET)"
	cd frontend && npm install

# =============================================================================
# Development
# =============================================================================

dev:
	@echo "$(CYAN)Starting development servers...$(RESET)"
	@echo "$(YELLOW)Backend: http://localhost:8001$(RESET)"
	@echo "$(YELLOW)Frontend: http://localhost:5173$(RESET)"
	@$(MAKE) -j2 dev-backend dev-frontend

dev-backend:
	cd backend && uv run uvicorn sdf_labeler_api.app:app --reload --host 0.0.0.0 --port 8001

dev-frontend:
	cd frontend && npm run dev

dev-down:
	@echo "$(CYAN)Stopping dev servers...$(RESET)"
	@-pkill -f "uvicorn sdf_labeler_api.app:app.*--port 8001" 2>/dev/null || true
	@-pkill -f "vite.*sdf-labeler" 2>/dev/null || true
	@-pkill -f "node.*vite.*frontend" 2>/dev/null || true
	@sleep 1
	@echo "$(GREEN)Dev servers stopped$(RESET)"

dev-restart: dev-down
	@echo "$(CYAN)Restarting with clean slate...$(RESET)"
	@sleep 1
	@$(MAKE) dev

# =============================================================================
# Testing
# =============================================================================

test: test-backend test-frontend

test-backend:
	@echo "$(CYAN)Running backend tests...$(RESET)"
	cd backend && uv run pytest tests/ -v

test-frontend:
	@echo "$(CYAN)Running frontend unit tests...$(RESET)"
	cd frontend && npm test -- --run

test-e2e:
	@echo "$(CYAN)Running E2E tests...$(RESET)"
	cd frontend && npm run test:e2e

test-e2e-headed:
	@echo "$(CYAN)Running E2E tests with browser...$(RESET)"
	cd frontend && npm run test:e2e:headed

test-e2e-ui:
	@echo "$(CYAN)Running E2E tests with UI...$(RESET)"
	cd frontend && npm run test:e2e:ui

# =============================================================================
# Code Quality
# =============================================================================

lint:
	@echo "$(CYAN)Linting backend...$(RESET)"
	cd backend && uv run ruff check .
	@echo "$(CYAN)Linting frontend...$(RESET)"
	cd frontend && npm run lint

format:
	@echo "$(CYAN)Formatting backend...$(RESET)"
	cd backend && uv run ruff format .
	@echo "$(CYAN)Formatting frontend...$(RESET)"
	cd frontend && npm run format

# =============================================================================
# Docker
# =============================================================================

docker-build:
	@echo "$(CYAN)Building Docker image...$(RESET)"
	docker build -t sdf-labeler:latest .

docker-run:
	@echo "$(CYAN)Running in webapp mode...$(RESET)"
	@echo "$(YELLOW)Access at: http://localhost:8000$(RESET)"
	docker-compose up

docker-run-api:
	@echo "$(CYAN)Running in API-only mode...$(RESET)"
	@echo "$(YELLOW)API at: http://localhost:8001$(RESET)"
	docker-compose -f docker-compose.yml -f docker-compose.api.yml up

docker-stop:
	@echo "$(CYAN)Stopping Docker containers...$(RESET)"
	docker-compose down

# =============================================================================
# Cleanup
# =============================================================================

clean:
	@echo "$(CYAN)Cleaning build artifacts...$(RESET)"
	rm -rf backend/.pytest_cache backend/__pycache__ backend/**/__pycache__
	rm -rf backend/.ruff_cache
	rm -rf frontend/node_modules frontend/dist
	rm -rf .artifacts
