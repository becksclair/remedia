/**
 * StartupErrorDialog Component
 *
 * Displays a user-friendly error message when critical app initialization fails.
 * This is used for startup errors like queue pump initialization failure.
 *
 * Features:
 * - 30-second auto-dismiss countdown (in case error was transient)
 * - Pin button to disable auto-dismiss for investigation
 * - Copy error button for bug reports
 */

import { useState, useEffect } from "react";
import type { JSX } from "react";
import { AlertCircle, Copy, X, Pin, PinOff } from "lucide-react";

/** Auto-dismiss after 30 seconds unless pinned */
const AUTO_DISMISS_SECONDS = 30;

interface StartupErrorDialogProps {
  isOpen: boolean;
  errorMessage: string;
  onDismiss: () => void;
}

export function StartupErrorDialog({
  isOpen,
  errorMessage,
  onDismiss,
}: StartupErrorDialogProps): JSX.Element | null {
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS);
  const [pinned, setPinned] = useState(false);

  // Reset countdown when dialog opens
  useEffect(() => {
    if (isOpen) {
      setCountdown(AUTO_DISMISS_SECONDS);
      setPinned(false);
    }
  }, [isOpen]);

  // Countdown timer for auto-dismiss
  useEffect(() => {
    if (!isOpen || pinned || countdown <= 0) return;

    const timer = setTimeout(() => {
      setCountdown((c) => c - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isOpen, pinned, countdown]);

  // Auto-dismiss when countdown reaches 0
  useEffect(() => {
    if (countdown === 0 && !pinned && isOpen) {
      onDismiss();
    }
  }, [countdown, pinned, isOpen, onDismiss]);

  if (!isOpen) return null;

  const handleCopyError = async () => {
    try {
      await navigator.clipboard.writeText(errorMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy error message:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl max-w-md w-full mx-4">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-shrink-0">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Startup Error
            </h2>
            <div className="ml-auto flex items-center gap-2">
              {/* Pin button to disable auto-dismiss */}
              <button
                onClick={() => setPinned(!pinned)}
                className={`p-1 rounded transition-colors ${
                  pinned
                    ? "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30"
                    : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                }`}
                aria-label={pinned ? "Unpin dialog" : "Pin dialog to prevent auto-dismiss"}
                title={pinned ? "Unpin (enable auto-dismiss)" : "Pin to keep open"}
              >
                {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              </button>
              {/* Countdown indicator */}
              {!pinned && (
                <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                  {countdown}s
                </span>
              )}
              <button
                onClick={onDismiss}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Error message */}
          <div className="mb-4">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              ReMedia failed to initialize a critical subsystem and cannot start:
            </p>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 mb-3">
              <code className="text-xs text-red-800 dark:text-red-200 break-words">
                {errorMessage}
              </code>
            </div>
          </div>

          {/* Recovery suggestions */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
              Troubleshooting:
            </p>
            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
              <li>Restart the application</li>
              <li>Check the application logs for more details</li>
              <li>Ensure yt-dlp is properly installed and accessible</li>
              <li>Try updating to the latest version of ReMedia</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleCopyError}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            >
              <Copy className="w-4 h-4" />
              {copied ? "Copied!" : "Copy Error"}
            </button>
            <button
              onClick={onDismiss}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded"
            >
              Dismiss
            </button>
          </div>

          {/* Recovery hint */}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">
            Restart the application after fixing the issue
          </p>
        </div>
      </div>
    </div>
  );
}
