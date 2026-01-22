// ABOUTME: Toast notification provider using Radix Toast
// ABOUTME: Renders toast notifications from the toast store

import * as Toast from "@radix-ui/react-toast";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  InfoCircledIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";

import { useToastStore, type ToastType } from "../../stores/toastStore";

const icons: Record<ToastType, typeof CheckCircledIcon> = {
  success: CheckCircledIcon,
  error: CrossCircledIcon,
  info: InfoCircledIcon,
  warning: ExclamationTriangleIcon,
};

const colors: Record<ToastType, { bg: string; icon: string; border: string }> =
  {
    success: {
      bg: "bg-green-900/90",
      icon: "text-green-400",
      border: "border-green-700",
    },
    error: {
      bg: "bg-red-900/90",
      icon: "text-red-400",
      border: "border-red-700",
    },
    info: {
      bg: "bg-blue-900/90",
      icon: "text-blue-400",
      border: "border-blue-700",
    },
    warning: {
      bg: "bg-yellow-900/90",
      icon: "text-yellow-400",
      border: "border-yellow-700",
    },
  };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <Toast.Provider swipeDirection="right">
      {children}

      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        const color = colors[toast.type];

        return (
          <Toast.Root
            key={toast.id}
            className={`
              ${color.bg} ${color.border}
              border rounded-lg shadow-lg p-4
              flex items-start gap-3
              data-[state=open]:animate-slideIn
              data-[state=closed]:animate-fadeOut
              data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]
              data-[swipe=cancel]:translate-x-0
              data-[swipe=end]:animate-swipeOut
            `}
            duration={toast.duration ?? 3000}
            onOpenChange={(open) => {
              if (!open) removeToast(toast.id);
            }}
          >
            <Icon className={`w-5 h-5 ${color.icon} flex-shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <Toast.Title className="font-medium text-white text-sm">
                {toast.title}
              </Toast.Title>
              {toast.description && (
                <Toast.Description className="text-gray-300 text-xs mt-1">
                  {toast.description}
                </Toast.Description>
              )}
            </div>
            <Toast.Close className="text-gray-400 hover:text-white p-1 -m-1">
              <CrossCircledIcon className="w-4 h-4" />
            </Toast.Close>
          </Toast.Root>
        );
      })}

      <Toast.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 w-80 max-w-[100vw] z-50 outline-none" />
    </Toast.Provider>
  );
}
