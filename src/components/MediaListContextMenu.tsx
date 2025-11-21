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
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onDownloadAll}>Download All</ContextMenuItem>
        <ContextMenuItem onClick={onCancelAll}>Cancel All</ContextMenuItem>
        <ContextMenuItem onClick={onRemoveSelected}>
          Remove Selected
        </ContextMenuItem>
        <ContextMenuItem onClick={onRemoveAll}>Remove All</ContextMenuItem>
        <ContextMenuItem onClick={onCopyAllUrls}>Copy All URLs</ContextMenuItem>
        <ContextMenuItem onClick={onShowDebugConsole}>
          Show Debug Console
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
