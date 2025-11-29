import { useCallback } from "react";

import { useTauriApi } from "@/lib/TauriApiContext";
import { ErrorHandlers } from "@/shared/error-handler";
import { getSelectedIndices, type VideoInfo } from "@/utils/media-helpers";
import { PREVIEW_WINDOW_HEIGHT, PREVIEW_WINDOW_WIDTH } from "@/utils/constants";

interface UsePreviewLauncherOptions {
  mediaList: VideoInfo[];
  rowSelection: Record<string, boolean>;
  notificationPermission: boolean;
}

export function usePreviewLauncher({
  mediaList,
  rowSelection,
  notificationPermission,
}: UsePreviewLauncherOptions) {
  const tauriApi = useTauriApi();

  const preview = useCallback(async () => {
    const selectedRowIndices = getSelectedIndices(rowSelection);

    if (selectedRowIndices.length === 0) {
      ErrorHandlers.validation(new Error("Please select one or more items to preview"), "preview");
      return;
    }

    try {
      for (const rowIndex of selectedRowIndices) {
        const selectedItem = mediaList[rowIndex];
        if (!selectedItem?.url) continue;

        const previewLabel = `preview-win-${rowIndex}-${Date.now()}`;
        const win = tauriApi.window.createWindow(previewLabel, {
          url: `/player?url=${encodeURIComponent(selectedItem.url)}`,
          width: PREVIEW_WINDOW_WIDTH,
          height: PREVIEW_WINDOW_HEIGHT,
          title: selectedItem.title ? `Preview: ${selectedItem.title}` : "ReMedia Preview",
        });

        void win.once("tauri://error", (error: unknown) => {
          console.error("Error creating preview window:", error);
        });
      }

      if (notificationPermission) {
        tauriApi.notification.sendNotification({
          body: `Loading ${selectedRowIndices.length} media preview(s)...`,
          title: "Remedia",
        });
      }
    } catch (error) {
      console.error("Error opening preview window:", error);
      ErrorHandlers.system(error, "open preview window");
    }
  }, [mediaList, notificationPermission, rowSelection, tauriApi.notification, tauriApi.window]);

  return { preview };
}
