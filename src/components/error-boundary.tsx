/**
 * ErrorBoundary Component
 *
 * Catches React errors and displays fallback UI to prevent app crashes.
 * Logs errors for debugging and provides recovery options.
 */

import React, { Component, type ReactNode } from "react";
import { Button } from "./ui/button";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary Component
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error to console
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div
          className="flex flex-col items-center justify-center h-screen p-8 bg-background text-foreground"
          role="alert"
          aria-live="assertive"
        >
          <div className="max-w-2xl w-full space-y-6">
            {/* Error Icon and Title */}
            <div className="flex items-center gap-4">
              <AlertCircle
                className="h-12 w-12 text-destructive"
                aria-hidden="true"
              />
              <div>
                <h1 className="text-2xl font-bold">Something went wrong</h1>
                <p className="text-muted-foreground">
                  An unexpected error occurred. You can try to recover or reload
                  the application.
                </p>
              </div>
            </div>

            {/* Error Details (Development) */}
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="bg-muted p-4 rounded-lg overflow-auto max-h-64">
                <summary className="cursor-pointer font-medium mb-2">
                  Error Details
                </summary>
                <div className="space-y-2 text-sm font-mono">
                  <div>
                    <strong>Error:</strong> {this.state.error.toString()}
                  </div>
                  {this.state.errorInfo && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="mt-2 whitespace-pre-wrap text-xs">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* Recovery Actions */}
            <div className="flex gap-4">
              <Button
                onClick={this.handleReset}
                variant="default"
                aria-label="Try to recover from error"
              >
                Try Again
              </Button>
              <Button
                onClick={this.handleReload}
                variant="outline"
                aria-label="Reload application"
              >
                Reload App
              </Button>
            </div>

            {/* Help Text */}
            <p className="text-sm text-muted-foreground">
              If this problem persists, please report it on{" "}
              <a
                href="https://github.com/becksclair/remedia/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                GitHub Issues
              </a>
              .
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
