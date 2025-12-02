/**
 * Centralized Error Handling System
 *
 * Provides categorized error handling with toast notifications
 * and recovery strategies for different error types.
 */

import { toast } from "sonner";

export enum ErrorCategory {
  NETWORK = "network",
  VALIDATION = "validation",
  SYSTEM = "system",
  DOWNLOAD = "download",
  UNKNOWN = "unknown",
}

export enum ErrorSeverity {
  DEBUG = "debug",
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface StructuredLogEntry {
  timestamp: number;
  level: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  context?: Record<string, any>;
  error_details?: string;
}

export interface AppError {
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context?: Record<string, any>;
  recoverable?: boolean;
  retryAction?: () => Promise<void>;
}

/**
 * Create a structured log entry
 */
function createLogEntry(
  level: ErrorSeverity,
  category: ErrorCategory,
  message: string,
  context?: Record<string, any>,
  error_details?: string,
): StructuredLogEntry {
  return {
    timestamp: Date.now(),
    level,
    category,
    message,
    context,
    error_details,
  };
}

/**
 * Safe JSON serialization with circular reference protection and BigInt handling
 */
function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj);
  } catch (primaryError) {
    // Log minimal serialization error
    console.error(
      "JSON.stringify failed, falling back to safe serializer:",
      primaryError instanceof Error ? primaryError.message : String(primaryError),
    );

    try {
      const seen = new WeakSet();
      return JSON.stringify(obj, (_key, val) => {
        if (val != null && typeof val === "object") {
          if (seen.has(val)) {
            return "[Circular]";
          }
          seen.add(val);
        }
        // Convert BigInt to string
        if (typeof val === "bigint") {
          return val.toString() + "n";
        }
        return val;
      });
    } catch (fallbackError) {
      // Final fallback: convert to string representation
      console.error(
        "Safe serializer failed, using string fallback:",
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      );
      return String(obj);
    }
  }
}

/**
 * Write structured log to console with consistent format
 */
function writeStructuredLog(entry: StructuredLogEntry): void {
  const logMethod =
    entry.level === ErrorSeverity.CRITICAL || entry.level === ErrorSeverity.HIGH
      ? console.error
      : entry.level === ErrorSeverity.MEDIUM
        ? console.warn
        : entry.level === ErrorSeverity.DEBUG
          ? console.debug
          : console.log;

  logMethod(safeStringify(entry));
}

/**
 * Categorize errors based on message and type
 */
function categorizeError(error: unknown): ErrorCategory {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("connection")
    ) {
      return ErrorCategory.NETWORK;
    }
    if (
      message.includes("validation") ||
      message.includes("invalid") ||
      message.includes("required")
    ) {
      return ErrorCategory.VALIDATION;
    }
    if (message.includes("download") || message.includes("yt-dlp") || message.includes("media")) {
      return ErrorCategory.DOWNLOAD;
    }
    if (message.includes("system") || message.includes("permission") || message.includes("file")) {
      return ErrorCategory.SYSTEM;
    }
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Determine error severity based on category and message
 */
function getSeverity(_error: unknown, category: ErrorCategory): ErrorSeverity {
  if (category === ErrorCategory.SYSTEM) return ErrorSeverity.HIGH;
  if (category === ErrorCategory.DOWNLOAD) return ErrorSeverity.MEDIUM;
  if (category === ErrorCategory.NETWORK) return ErrorSeverity.MEDIUM;
  if (category === ErrorCategory.VALIDATION) return ErrorSeverity.LOW;
  return ErrorSeverity.MEDIUM;
}

/**
 * Get user-friendly error message
 */
function getUserMessage(error: unknown, category: ErrorCategory): string {
  if (error instanceof Error) {
    // Return user-friendly messages for common errors
    switch (category) {
      case ErrorCategory.NETWORK:
        return "Network connection issue. Please check your internet connection.";
      case ErrorCategory.VALIDATION:
        return "Invalid input. Please check your settings and try again.";
      case ErrorCategory.DOWNLOAD:
        return "Download failed. The media might be unavailable or the URL is invalid.";
      case ErrorCategory.SYSTEM:
        return "System error. Please check file permissions and try again.";
      default:
        return error.message || "An unexpected error occurred.";
    }
  }

  return "An unexpected error occurred.";
}

/**
 * Get toast options based on error severity
 */
function getToastOptions(severity: ErrorSeverity): {
  duration: number;
  action?: {
    label: string;
    onClick: () => void;
  };
} {
  switch (severity) {
    case ErrorSeverity.DEBUG:
    case ErrorSeverity.LOW:
      return { duration: 3000 };
    case ErrorSeverity.MEDIUM:
      return { duration: 5000 };
    case ErrorSeverity.HIGH:
      return { duration: 8000 };
    case ErrorSeverity.CRITICAL:
      return { duration: 0 }; // Stays until manually dismissed
    default:
      return { duration: 5000 };
  }
}

/**
 * Main error handler function
 */
export function handleError(
  error: unknown,
  context?: Record<string, any>,
  retryAction?: () => Promise<void>,
): void {
  const category = categorizeError(error);
  const severity = getSeverity(error, category);
  const message = getUserMessage(error, category);
  const toastOptions = getToastOptions(severity);

  // Create structured log entry
  const logEntry = createLogEntry(
    severity,
    category,
    message,
    context,
    error instanceof Error ? error.stack || error.message : String(error),
  );

  // Write structured log
  writeStructuredLog(logEntry);

  // Add retry action if provided and error is recoverable
  if (retryAction && (category === ErrorCategory.NETWORK || category === ErrorCategory.DOWNLOAD)) {
    toastOptions.action = {
      label: "Retry",
      onClick: () => {
        toast.loading("Retrying...", { id: "retry-action" });
        retryAction().catch((retryError) => {
          toast.dismiss("retry-action");
          handleError(retryError, context);
        });
      },
    };
  }

  // Show appropriate toast based on severity
  switch (severity) {
    case ErrorSeverity.LOW:
      toast.info(message, toastOptions);
      break;
    case ErrorSeverity.MEDIUM:
      toast.warning(message, toastOptions);
      break;
    case ErrorSeverity.HIGH:
    case ErrorSeverity.CRITICAL:
      toast.error(message, toastOptions);
      break;
    default:
      toast(message, toastOptions);
  }
}

/**
 * Convenience functions for structured logging
 */
export const StructuredLogger = {
  error: (
    category: ErrorCategory,
    message: string,
    context?: Record<string, any>,
    errorDetails?: string,
  ) => {
    const entry = createLogEntry(ErrorSeverity.HIGH, category, message, context, errorDetails);
    writeStructuredLog(entry);
  },

  warn: (category: ErrorCategory, message: string, context?: Record<string, any>) => {
    const entry = createLogEntry(ErrorSeverity.MEDIUM, category, message, context);
    writeStructuredLog(entry);
  },

  info: (category: ErrorCategory, message: string, context?: Record<string, any>) => {
    const entry = createLogEntry(ErrorSeverity.LOW, category, message, context);
    writeStructuredLog(entry);
  },

  debug: (category: ErrorCategory, message: string, context?: Record<string, any>) => {
    const entry = createLogEntry(ErrorSeverity.DEBUG, category, message, context);
    writeStructuredLog(entry);
  },
};

/**
 * Specific error handlers for common scenarios
 */
export const ErrorHandlers = {
  network: (error: unknown, retryAction?: () => Promise<void>) =>
    handleError(error, { type: "network" }, retryAction),

  download: (error: unknown, url?: string, retryAction?: () => Promise<void>) =>
    handleError(error, { type: "download", url }, retryAction),

  validation: (error: unknown, field?: string) => handleError(error, { type: "validation", field }),

  system: (error: unknown, operation?: string) => handleError(error, { type: "system", operation }),

  unknown: (error: unknown) => handleError(error, { type: "unknown" }),
};

/**
 * Error boundary fallback component helper
 */
export function getErrorBoundaryMessage(error: Error): {
  title: string;
  message: string;
  canRecover: boolean;
} {
  const category = categorizeError(error);

  switch (category) {
    case ErrorCategory.NETWORK:
      return {
        title: "Connection Error",
        message:
          "Unable to connect to our services. Please check your internet connection and refresh the page.",
        canRecover: true,
      };
    case ErrorCategory.SYSTEM:
      return {
        title: "System Error",
        message: "A system error occurred. Please restart the application.",
        canRecover: false,
      };
    default:
      return {
        title: "Something went wrong",
        message: "An unexpected error occurred. Please refresh the page and try again.",
        canRecover: true,
      };
  }
}
