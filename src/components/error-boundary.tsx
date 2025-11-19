import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
}

type ErrorFallbackProps = Readonly<{
  error: Error;
  errorInfo: React.ErrorInfo;
}>;

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  override render() {
    if (this.state.hasError && this.state.error && this.state.errorInfo) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return (
        <FallbackComponent
          error={this.state.error}
          errorInfo={this.state.errorInfo}
        />
      );
    }

    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-red-600 p-5 text-center text-white">
          <h2>Something went wrong, but error details are not available</h2>
        </div>
      );
    }

    return this.props.children;
  }
}

function DefaultErrorFallback({ error, errorInfo }: ErrorFallbackProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-red-600 p-5 text-center text-white">
      <h2>Something went wrong</h2>
      <details className="mt-3 whitespace-pre-wrap text-left">
        <summary className="mb-2 cursor-pointer">
          Click for error details
        </summary>
        <strong>Error:</strong> {error.toString()}
        <br />
        <strong>Stack trace:</strong>
        <pre className="max-h-52 overflow-auto text-xs">
          {errorInfo.componentStack}
        </pre>
      </details>
    </div>
  );
}

export default ErrorBoundary;
