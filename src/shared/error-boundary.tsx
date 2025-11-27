/**
 * Enhanced Error Boundary Component
 *
 * Catches React errors and displays user-friendly messages
 * with recovery options based on error categorization.
 */

import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { getErrorBoundaryMessage } from "./error-handler";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });

    // Log detailed error information
    console.error("Error Boundary caught an error:", {
      error,
      errorInfo,
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorInfo = getErrorBoundaryMessage(this.state.error);

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="space-y-2">
              <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
              <h1 className="text-2xl font-bold text-foreground">{errorInfo.title}</h1>
              <p className="text-muted-foreground">{errorInfo.message}</p>
            </div>

            <div className="space-y-3">
              {errorInfo.canRecover && (
                <Button onClick={this.handleReset} className="w-full" variant="default">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
              )}

              <Button onClick={this.handleReload} className="w-full" variant="outline">
                Reload Application
              </Button>
            </div>

            {process.env.NODE_ENV === "development" && (
              <details className="text-left text-xs text-muted-foreground">
                <summary className="cursor-pointer font-mono">Error Details</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
