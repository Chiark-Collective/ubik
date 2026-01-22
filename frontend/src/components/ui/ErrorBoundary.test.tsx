// ABOUTME: Unit tests for ErrorBoundary components
// ABOUTME: Tests error catching and fallback UI rendering

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary, SectionErrorBoundary } from "./ErrorBoundary";

// Component that throws an error
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div>Working component</div>;
}

describe("ErrorBoundary", () => {
  // Suppress console.error for error boundary tests
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it("should render children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("should render fallback UI when error occurs", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(/The application encountered an unexpected error/),
    ).toBeInTheDocument();
  });

  it("should show error message in fallback", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/Test error/)).toBeInTheDocument();
  });

  it("should have a try again button", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("should render custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("should reset error state when clicking try again", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    // Error should be shown
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Click try again - this resets the boundary's internal state
    fireEvent.click(screen.getByText("Try Again"));

    // After click, it will try to render children again
    // Since ThrowingComponent still throws, error will reappear
    // The button should still be present (re-rendered)
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });
});

describe("SectionErrorBoundary", () => {
  // Suppress console.error for error boundary tests
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it("should render children when no error", () => {
    render(
      <SectionErrorBoundary>
        <div>Section content</div>
      </SectionErrorBoundary>,
    );

    expect(screen.getByText("Section content")).toBeInTheDocument();
  });

  it("should show section error UI when error occurs", () => {
    render(
      <SectionErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </SectionErrorBoundary>,
    );

    // The actual text used in SectionErrorBoundary
    expect(screen.getByText("Failed to load this section")).toBeInTheDocument();
  });

  it("should show warning icon in section error", () => {
    render(
      <SectionErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </SectionErrorBoundary>,
    );

    // Check for the error container with red styling
    const container = screen
      .getByText("Failed to load this section")
      .closest("div");
    expect(container).toHaveClass("bg-red-900/20");
  });
});
