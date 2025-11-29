/**
 * DownloadControls Component
 *
 * Displays global progress bar and control buttons for downloads.
 */

import { Button } from "./ui/button";
import { Progress } from "./ui/progress";

interface DownloadControlsProps {
  globalProgress: number;
  globalDownloading: boolean;
  completedCount?: number;
  totalCount?: number;
  queuedCount?: number;
  activeCount?: number;
  maxConcurrent?: number;
  onDownload: () => void;
  onCancel: () => void;
  onPreview: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

/**
 * Download Controls Component
 */
export function DownloadControls({
  globalProgress,
  globalDownloading,
  completedCount,
  totalCount,
  queuedCount,
  activeCount,
  maxConcurrent,
  onDownload,
  onCancel,
  onPreview,
  onSettings,
  onQuit,
}: DownloadControlsProps) {
  return (
    <section className="flex-none flex flex-col gap-y-4">
      <div className="my-3">
        <div
          role="status"
          aria-live="polite"
          aria-label={`Download progress: ${globalProgress}%`}
          className="sr-only"
        >
          Download progress: {globalProgress}%
        </div>
        <Progress
          data-testid="global-progress"
          value={globalProgress}
          max={100}
          className="w-full"
          aria-label={`Global download progress: ${globalProgress}%`}
        />
        {typeof completedCount === "number" && typeof totalCount === "number" && totalCount > 0 && (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="download-stats">
            Downloaded: {completedCount} / {totalCount}
          </p>
        )}
        {typeof queuedCount === "number" && typeof activeCount === "number" && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="queue-stats">
            Queue: {queuedCount} queued, {activeCount} active
            {typeof maxConcurrent === "number" && maxConcurrent > 0
              ? ` (limit ${maxConcurrent})`
              : null}
          </p>
        )}
      </div>

      <div className="flex justify-center gap-x-4 mb-3">
        <Button
          type="button"
          className="min-w-32"
          disabled={globalDownloading}
          onClick={onDownload}
          aria-label="Start download"
          data-testid="download-all"
        >
          Download
        </Button>

        {globalDownloading && (
          <Button
            type="button"
            className="min-w-32"
            disabled={!globalDownloading}
            onClick={onCancel}
            aria-label="Cancel all downloads"
            data-testid="cancel-all"
          >
            Cancel
          </Button>
        )}

        <Button
          type="button"
          className="min-w-32"
          onClick={onPreview}
          aria-label="Preview selected media"
          data-testid="preview-selected"
        >
          Preview
        </Button>

        <Button
          type="button"
          className="min-w-32"
          onClick={onSettings}
          aria-label="Open settings"
          data-testid="open-settings"
        >
          Settings
        </Button>

        <Button
          type="button"
          className="min-w-32"
          onClick={onQuit}
          aria-label="Quit application"
          data-testid="quit-app"
        >
          Quit
        </Button>
      </div>
    </section>
  );
}
