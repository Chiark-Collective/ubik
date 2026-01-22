// ABOUTME: React error boundary component
// ABOUTME: Catches React errors and displays a fallback UI

import { Component, type ReactNode } from "react";
import { ExclamationTriangleIcon, ReloadIcon } from "@radix-ui/react-icons";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-950 text-white p-8">
          <div className="max-w-md text-center">
            <ExclamationTriangleIcon className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-gray-400 mb-4">
              The application encountered an unexpected error.
            </p>
            {this.state.error && (
              <pre className="text-left text-xs bg-gray-900 p-4 rounded-lg overflow-auto max-h-32 mb-4 text-red-400">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              <ReloadIcon className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Smaller error boundary for sections
export function SectionErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex items-center justify-center p-4 bg-red-900/20 border border-red-800 rounded-lg">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-400 mr-2" />
          <span className="text-red-400 text-sm">
            Failed to load this section
          </span>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
