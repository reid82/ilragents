"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center"
          style={{ background: "var(--surface-0)" }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
            style={{ background: "var(--surface-3)", color: "var(--text-secondary)" }}
          >
            !
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Something went wrong
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 text-sm rounded-lg text-white"
            style={{
              background: "linear-gradient(135deg, var(--primary), var(--primary-hover))",
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
