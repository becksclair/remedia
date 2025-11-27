/**
 * MediaListContextMenu Component
 *
 * Provides context menu for media list with bulk operations.
 * Features icons, keyboard shortcuts, visual grouping, and smart disabled states.
 */

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { flushSync } from "react-dom";
import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import {
  Download,
  Play,
  XCircle,
  Trash2,
  Copy,
  RotateCcw,
  Terminal,
  ExternalLink,
} from "lucide-react";

interface MediaListContextMenuProps {
  children: ReactNode;
  onDownloadAll: () => void;
  onDownloadSelected: () => void;
  onCancelAll: () => void;
  onPreviewSelected: () => void;
  onRemoveSelected: () => void;
  onRemoveAll: () => void;
  onRetryFailed: () => void;
  onCopySelectedUrls: () => void;
  onCopyAllUrls: () => void;
  onOpenInBrowser: () => void;
  onShowDebugConsole: () => void;
  hasSelection: boolean;
  hasItems: boolean;
  hasFailed: boolean;
}

/**
 * Media List Context Menu Component
 */
export function MediaListContextMenu({
  children,
  onDownloadAll,
  onDownloadSelected,
  onCancelAll,
  onPreviewSelected,
  onRemoveSelected,
  onRemoveAll,
  onRetryFailed,
  onCopySelectedUrls,
  onCopyAllUrls,
  onOpenInBrowser,
  onShowDebugConsole,
  hasSelection,
  hasItems,
  hasFailed,
}: MediaListContextMenuProps) {
  const [open, setOpen] = useState(false);

  const handleContextMenuCapture = (event: ReactMouseEvent): void => {
    // If menu is already open, close first and re-dispatch a synthetic contextmenu
    // so Radix positions against the latest pointer location.
    const target = (event.target as HTMLElement) ?? document.body;
    if (!open) return;

    event.preventDefault();
    const { clientX, clientY } = event;

    flushSync(() => setOpen(false));

    // Re-dispatch in next frame to let Radix capture fresh coordinates
    requestAnimationFrame(() => {
      const synthetic = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        button: 2,
        buttons: 2,
      });
      target.dispatchEvent(synthetic);
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ContextMenu open={open} onOpenChange={setOpen}>
        <ContextMenuTrigger
          data-testid="media-context-trigger"
          className="flex-1 min-h-0 flex flex-col"
          onContextMenuCapture={handleContextMenuCapture}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56 bg-popover/95 backdrop-blur-sm border-border/50">
          {hasSelection && (
            <>
              {/* Selection Actions */}
              <ContextMenuLabel className="text-xs text-muted-foreground/70 font-semibold uppercase tracking-wider">
                Selection
              </ContextMenuLabel>
              <ContextMenuItem
                data-testid="ctx-download-selected"
                onClick={onDownloadSelected}
                disabled={!hasSelection}
                className="gap-3"
              >
                <Download className="size-4 text-primary" />
                Download Selected
                <ContextMenuShortcut>?D</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem
                data-testid="ctx-preview-selected"
                onClick={onPreviewSelected}
                disabled={!hasSelection}
                className="gap-3"
              >
                <Play className="size-4 text-emerald-500" />
                Preview Selected
                <ContextMenuShortcut>?P</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem
                data-testid="ctx-open-browser"
                onClick={onOpenInBrowser}
                disabled={!hasSelection}
                className="gap-3"
              >
                <ExternalLink className="size-4 text-sky-500" />
                Open in Browser
                <ContextMenuShortcut>?O</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem
                data-testid="ctx-copy-selected"
                onClick={onCopySelectedUrls}
                disabled={!hasSelection}
                className="gap-3"
              >
                <Copy className="size-4 text-muted-foreground" />
                Copy URLs
                <ContextMenuShortcut>?C</ContextMenuShortcut>
              </ContextMenuItem>

              <ContextMenuSeparator />
            </>
          )}

          {/* Bulk Actions */}
          <ContextMenuLabel className="text-xs text-muted-foreground/70 font-semibold uppercase tracking-wider">
            Bulk Actions
          </ContextMenuLabel>
          <ContextMenuItem
            data-testid="ctx-download-all"
            onClick={onDownloadAll}
            disabled={!hasItems}
            className="gap-3"
          >
            <Download className="size-4 text-primary" />
            Download All
            <ContextMenuShortcut>⇧⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            data-testid="ctx-cancel-all"
            onClick={onCancelAll}
            disabled={!hasItems}
            className="gap-3"
          >
            <XCircle className="size-4 text-amber-500" />
            Cancel All Downloads
            <ContextMenuShortcut>Esc</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            data-testid="ctx-retry-failed"
            onClick={onRetryFailed}
            disabled={!hasFailed}
            className="gap-3"
          >
            <RotateCcw className="size-4 text-orange-500" />
            Retry Failed
            <ContextMenuShortcut>⌘R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            data-testid="ctx-copy-all"
            onClick={onCopyAllUrls}
            disabled={!hasItems}
            className="gap-3"
          >
            <Copy className="size-4 text-muted-foreground" />
            Copy All URLs
            <ContextMenuShortcut>⇧⌘C</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* Destructive Actions */}
          <ContextMenuItem
            data-testid="ctx-remove-selected"
            onClick={onRemoveSelected}
            disabled={!hasSelection}
            variant="destructive"
            className="gap-3"
          >
            <Trash2 className="size-4" />
            Remove Selected
            <ContextMenuShortcut>Del</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            data-testid="ctx-remove-all"
            onClick={onRemoveAll}
            disabled={!hasItems}
            variant="destructive"
            className="gap-3"
          >
            <Trash2 className="size-4" />
            Clear All
            <ContextMenuShortcut>⇧Del</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* Developer Actions */}
          <ContextMenuItem
            data-testid="ctx-show-debug"
            onClick={onShowDebugConsole}
            className="gap-3"
          >
            <Terminal className="size-4 text-violet-500" />
            Debug Console
            <ContextMenuShortcut>⌘`</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
