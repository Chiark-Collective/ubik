// ABOUTME: Unit tests for toastStore
// ABOUTME: Tests toast notification state management

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useToastStore, toast } from "./toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    // Reset store state
    useToastStore.setState({ toasts: [] });
    // Clear any timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("addToast", () => {
    it("should add a toast to the store", () => {
      useToastStore.getState().addToast({
        type: "success",
        title: "Test Toast",
      });

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].title).toBe("Test Toast");
      expect(toasts[0].type).toBe("success");
    });

    it("should generate unique IDs", () => {
      useToastStore.getState().addToast({ type: "info", title: "Toast 1" });
      useToastStore.getState().addToast({ type: "info", title: "Toast 2" });

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].id).not.toBe(toasts[1].id);
    });

    it("should include description when provided", () => {
      useToastStore.getState().addToast({
        type: "error",
        title: "Error",
        description: "Something went wrong",
      });

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].description).toBe("Something went wrong");
    });

    it("should include duration when provided", () => {
      useToastStore.getState().addToast({
        type: "warning",
        title: "Warning",
        duration: 5000,
      });

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].duration).toBe(5000);
    });

    it("should not have duration when not provided", () => {
      useToastStore.getState().addToast({
        type: "info",
        title: "Info",
      });

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].duration).toBeUndefined();
    });
  });

  describe("removeToast", () => {
    it("should remove a toast by ID", () => {
      useToastStore.getState().addToast({ type: "info", title: "Toast 1" });
      useToastStore.getState().addToast({ type: "info", title: "Toast 2" });

      const toastId = useToastStore.getState().toasts[0].id;
      useToastStore.getState().removeToast(toastId);

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].title).toBe("Toast 2");
    });

    it("should not error when removing non-existent toast", () => {
      useToastStore.getState().addToast({ type: "info", title: "Toast 1" });

      // Should not throw
      useToastStore.getState().removeToast("non-existent-id");

      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });

  describe("clearToasts", () => {
    it("should remove all toasts", () => {
      useToastStore.getState().addToast({ type: "info", title: "Toast 1" });
      useToastStore.getState().addToast({ type: "info", title: "Toast 2" });
      useToastStore.getState().addToast({ type: "info", title: "Toast 3" });

      useToastStore.getState().clearToasts();

      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  describe("toast helpers", () => {
    it("should create success toast", () => {
      toast.success("Success!", "Operation completed");

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].type).toBe("success");
      expect(toasts[0].title).toBe("Success!");
      expect(toasts[0].description).toBe("Operation completed");
    });

    it("should create error toast with longer duration", () => {
      toast.error("Error!", "Something failed");

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].type).toBe("error");
      expect(toasts[0].duration).toBe(5000);
    });

    it("should create info toast", () => {
      toast.info("Info", "Just letting you know");

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].type).toBe("info");
    });

    it("should create warning toast", () => {
      toast.warning("Warning", "Be careful");

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].type).toBe("warning");
    });

    it("should work without description", () => {
      toast.success("Just a title");

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].description).toBeUndefined();
    });
  });

  describe("multiple toasts", () => {
    it("should maintain order of toasts", () => {
      toast.info("First");
      toast.info("Second");
      toast.info("Third");

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].title).toBe("First");
      expect(toasts[1].title).toBe("Second");
      expect(toasts[2].title).toBe("Third");
    });

    it("should allow mixing toast types", () => {
      toast.success("Success");
      toast.error("Error");
      toast.warning("Warning");
      toast.info("Info");

      const toasts = useToastStore.getState().toasts;
      expect(toasts.map((t) => t.type)).toEqual([
        "success",
        "error",
        "warning",
        "info",
      ]);
    });
  });
});
