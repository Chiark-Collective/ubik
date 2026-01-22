// ABOUTME: Zustand store for toast notifications
// ABOUTME: Manages toast queue and provides helper functions

import { create } from "zustand";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

let toastIdCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++toastIdCounter}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearToasts: () => {
    set({ toasts: [] });
  },
}));

// Convenience functions for common toast types
export const toast = {
  success: (title: string, description?: string) => {
    useToastStore.getState().addToast({ type: "success", title, description });
  },
  error: (title: string, description?: string) => {
    useToastStore
      .getState()
      .addToast({ type: "error", title, description, duration: 5000 });
  },
  info: (title: string, description?: string) => {
    useToastStore.getState().addToast({ type: "info", title, description });
  },
  warning: (title: string, description?: string) => {
    useToastStore.getState().addToast({ type: "warning", title, description });
  },
};
