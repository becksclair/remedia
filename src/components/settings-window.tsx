import { Settings, Download, Sliders, X } from "lucide-react";
import { Window } from "@tauri-apps/api/window";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { GeneralTab, DownloadsTab, QualityTab } from "./settings";
import { useTheme } from "@/hooks/useTheme";
import { isTauriRuntime } from "@/utils/env";

type SettingsWindowProps = {
  onClose?: () => void;
};

type CloseSettingsWindowParams = {
  onClose?: () => void;
};

/**
 * Closes the settings window based on the runtime environment.
 * 
 * Priority order:
 * 1. Calls onClose callback if provided
 * 2. In Tauri runtime: closes the current window
 * 3. In web runtime: navigates away from /settings or attempts to close the window
 * 
 * @param params - Configuration object containing optional onClose callback
 */
function closeSettingsWindow({ onClose }: CloseSettingsWindowParams): void {
  if (onClose) {
    onClose();
    return;
  }

  if (isTauriRuntime()) {
    Window.getCurrent()
      .close()
      .catch((err) => {
        console.error("Failed to close settings window:", err);
      });
    return;
  }

  // Web runtime fallback
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (window.location.pathname === "/settings") {
      window.location.assign("/");
      return;
    }

    if (typeof window.close === "function") {
      window.close();
    }
  } catch (err) {
    console.error("Failed to close settings window:", err);
  }
}

export function SettingsWindow({ onClose }: SettingsWindowProps) {
  useTheme();

  const handleClose = () => {
    closeSettingsWindow({ onClose });
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl h-screen flex flex-col">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Configure your download preferences and quality settings.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          data-testid="settings-window-close"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <Tabs defaultValue="general" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general" className="gap-2">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="downloads" className="gap-2">
            <Download className="h-4 w-4" />
            Downloads
          </TabsTrigger>
          <TabsTrigger value="quality" className="gap-2">
            <Sliders className="h-4 w-4" />
            Quality
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto pt-4">
          <TabsContent value="general" className="mt-0">
            <GeneralTab />
          </TabsContent>

          <TabsContent value="downloads" className="mt-0">
            <DownloadsTab />
          </TabsContent>

          <TabsContent value="quality" className="mt-0">
            <QualityTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
