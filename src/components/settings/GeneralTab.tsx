import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";
import { AlertCircle } from "lucide-react";
import { useAtom } from "jotai";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useTauriApi } from "@/lib/TauriApiContext";
import { ErrorHandlers } from "@/shared/error-handler";
import {
  alwaysOnTopAtom,
  downloadLocationAtom,
  themeAtom,
  appendUniqueIdAtom,
  uniqueIdTypeAtom,
  type Theme,
  type UniqueIdType,
} from "@/state/settings-atoms";

import { SettingsSelect, type SelectOption } from "./SettingsSelect";
import { SettingsCheckbox } from "./SettingsCheckbox";

const THEME_OPTIONS: SelectOption[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const UNIQUE_ID_OPTIONS: SelectOption[] = [
  { value: "native", label: "Native (video ID)" },
  { value: "hash", label: "Short Hash (8 chars)" },
];

export function GeneralTab() {
  const tauriApi = useTauriApi();
  const [alwaysOnTop, setAlwaysOnTop] = useAtom(alwaysOnTopAtom);
  const [isWayland, setIsWayland] = useState(false);
  const [outputLocation, setOutputLocation] = useAtom(downloadLocationAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  const [appendUniqueId, setAppendUniqueId] = useAtom(appendUniqueIdAtom);
  const [uniqueIdType, setUniqueIdType] = useAtom(uniqueIdTypeAtom);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    tauriApi.commands
      .isWayland()
      .then(setIsWayland)
      .catch((err) => console.error("Failed to check Wayland status:", err));
  }, [tauriApi.commands]);

  const handleAlwaysOnTopChange = async (checked: boolean) => {
    setAlwaysOnTop(checked);
    await tauriApi.commands.setAlwaysOnTop(checked);
  };

  const handleCheckForUpdates = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const update = await check();

      if (!update) {
        toast.info("You are on the latest version.");
        return;
      }

      toast.message("Downloading and installing update...", {
        id: "updater-progress",
      });

      await update.downloadAndInstall();
      await update.close();

      toast.success("Update installed. Please restart ReMedia to apply it.", {
        id: "updater-progress",
      });
    } catch (error) {
      toast.dismiss("updater-progress");
      ErrorHandlers.system(error, "check for updates");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const chooseOutputLocation = async () => {
    const directory = await openDialog({
      defaultPath: outputLocation,
      directory: true,
      multiple: false,
      title: "Choose location to save downloads",
    });
    if (directory && typeof directory === "string") {
      setOutputLocation(directory);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSelect
        id="theme"
        label="Theme"
        value={theme}
        onChange={(v) => setTheme(v as Theme)}
        options={THEME_OPTIONS}
        data-testid="settings-theme"
      />

      {isWayland ? (
        <Alert variant="destructive" className="text-left">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>"Stay on top" is not supported on Wayland yet.</AlertTitle>
          <AlertDescription>Try X11 or watch for Tauri updates.</AlertDescription>
        </Alert>
      ) : (
        <SettingsCheckbox
          id="always-on-top-checkbox"
          label="Stay on top"
          checked={alwaysOnTop}
          onChange={handleAlwaysOnTopChange}
          data-testid="settings-always-on-top"
        />
      )}

      <Separator />

      {/* Download location */}
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="download-location" className="text-right">
          Download location
        </Label>
        <Input
          type="text"
          id="download-location"
          data-testid="settings-download-location"
          data-dialog-initial-focus
          className="text-sm col-span-2"
          placeholder="Download location..."
          value={outputLocation}
          onChange={(e) => setOutputLocation(e.target.value)}
        />
        <Button
          type="button"
          className="min-w-32"
          onClick={chooseOutputLocation}
          data-testid="settings-browse"
        >
          Browse...
        </Button>
      </div>

      {/* Append unique ID to filenames */}
      <div className="space-y-3">
        <SettingsCheckbox
          id="append-unique-id-checkbox"
          label="Append unique ID to filenames"
          description="prevents overwrites"
          checked={appendUniqueId}
          onChange={setAppendUniqueId}
          data-testid="settings-append-unique-id"
        />

        {appendUniqueId && (
          <div className="ml-6 space-y-3">
            <SettingsSelect
              id="unique-id-type"
              label="ID Type"
              value={uniqueIdType}
              onChange={(v) => setUniqueIdType(v as UniqueIdType)}
              options={UNIQUE_ID_OPTIONS}
              data-testid="settings-unique-id-type"
            />
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Preview:</span>{" "}
              <code className="bg-muted px-1 py-0.5 rounded">
                My Video [{uniqueIdType === "native" ? "dQw4w9WgXcQ" : "k8df92a1"}].mp4
              </code>
            </div>
          </div>
        )}
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          <div className="font-medium">Updates</div>
          <div className="text-xs">Check for a newer version of ReMedia.</div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleCheckForUpdates}
          disabled={checkingUpdate}
          data-testid="settings-check-updates"
        >
          {checkingUpdate ? "Checking..." : "Check for updates"}
        </Button>
      </div>
    </div>
  );
}
