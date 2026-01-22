// ABOUTME: Unit tests for Spinner and LoadingButton components
// ABOUTME: Tests loading state rendering and button behavior

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Spinner, LoadingButton } from "./Spinner";

describe("Spinner", () => {
  it("should render an SVG element", () => {
    const { container } = render(<Spinner />);

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should render with default (medium) size", () => {
    const { container } = render(<Spinner />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("w-6", "h-6");
  });

  it("should render small size", () => {
    const { container } = render(<Spinner size="sm" />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("w-4", "h-4");
  });

  it("should render medium size", () => {
    const { container } = render(<Spinner size="md" />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("w-6", "h-6");
  });

  it("should render large size", () => {
    const { container } = render(<Spinner size="lg" />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("w-8", "h-8");
  });

  it("should have animate-spin class for animation", () => {
    const { container } = render(<Spinner />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("animate-spin");
  });

  it("should apply custom className", () => {
    const { container } = render(<Spinner className="text-blue-500" />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("text-blue-500");
  });
});

describe("LoadingButton", () => {
  it("should render children when not loading", () => {
    render(<LoadingButton loading={false}>Click me</LoadingButton>);

    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("should show spinner when loading", () => {
    const { container } = render(
      <LoadingButton loading={true}>Click me</LoadingButton>,
    );

    // Check for spinner SVG
    const spinner = container.querySelector("svg.animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("should not show spinner when not loading", () => {
    const { container } = render(
      <LoadingButton loading={false}>Click me</LoadingButton>,
    );

    const spinner = container.querySelector("svg.animate-spin");
    expect(spinner).not.toBeInTheDocument();
  });

  it("should hide text visually when loading", () => {
    render(<LoadingButton loading={true}>Click me</LoadingButton>);

    const textSpan = screen.getByText("Click me");
    expect(textSpan).toHaveClass("opacity-0");
  });

  it("should show text normally when not loading", () => {
    render(<LoadingButton loading={false}>Click me</LoadingButton>);

    const textSpan = screen.getByText("Click me");
    expect(textSpan).not.toHaveClass("opacity-0");
  });

  it("should be disabled when loading", () => {
    render(<LoadingButton loading={true}>Click me</LoadingButton>);

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("should be disabled when disabled prop is true", () => {
    render(
      <LoadingButton loading={false} disabled={true}>
        Click me
      </LoadingButton>,
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("should be enabled when not loading and not disabled", () => {
    render(
      <LoadingButton loading={false} disabled={false}>
        Click me
      </LoadingButton>,
    );

    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("should call onClick when clicked and not loading", () => {
    const handleClick = vi.fn();
    render(
      <LoadingButton loading={false} onClick={handleClick}>
        Click me
      </LoadingButton>,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("should not call onClick when loading", () => {
    const handleClick = vi.fn();
    render(
      <LoadingButton loading={true} onClick={handleClick}>
        Click me
      </LoadingButton>,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("should apply custom className", () => {
    render(
      <LoadingButton loading={false} className="custom-class">
        Click me
      </LoadingButton>,
    );

    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });

  it("should pass through other button props", () => {
    render(
      <LoadingButton loading={false} type="submit" name="submitBtn">
        Submit
      </LoadingButton>,
    );

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("name", "submitBtn");
  });

  it("should use small spinner size", () => {
    const { container } = render(
      <LoadingButton loading={true}>Click me</LoadingButton>,
    );

    const spinner = container.querySelector("svg.animate-spin");
    expect(spinner).toHaveClass("w-4", "h-4");
  });
});
