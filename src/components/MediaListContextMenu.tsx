/**
 * MediaListContextMenu Component
 *
 * Provides context menu for media list with bulk operations.
 */

import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface MediaListContextMenuProps {
  children: ReactNode;
  onDownloadAll: () => void;
  onCancelAll: () => void;
  onRemoveSelected: () => void;
  onRemoveAll: () => void;
  onCopyAllUrls: () => void;
  onShowDebugConsole: () => void;
}

/**
 * Media List Context Menu Component
 */
export function MediaListContextMenu({
  children,
  onDownloadAll,
  onCancelAll,
  onRemoveSelected,
  onRemoveAll,
  onCopyAllUrls,
  onShowDebugConsole,
}: MediaListContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger data-testid="media-context-trigger">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem data-testid="ctx-download-all" onClick={onDownloadAll}>
          Download All
        </ContextMenuItem>
        <ContextMenuItem data-testid="ctx-cancel-all" onClick={onCancelAll}>
          Cancel All
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="ctx-remove-selected"
          onClick={onRemoveSelected}
        >
          Remove Selected
        </ContextMenuItem>
        <ContextMenuItem data-testid="ctx-remove-all" onClick={onRemoveAll}>
          Remove All
        </ContextMenuItem>
        <ContextMenuItem data-testid="ctx-copy-all" onClick={onCopyAllUrls}>
          Copy All URLs
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="ctx-show-debug"
          onClick={onShowDebugConsole}
        >
          Show Debug Console
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
