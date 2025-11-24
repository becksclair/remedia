import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import { useAtom } from "jotai";
import {
  alwaysOnTopAtom,
  downloadLocationAtom,
  downloadModeAtom,
  videoQualityAtom,
  maxResolutionAtom,
  videoFormatAtom,
  audioFormatAtom,
  audioQualityAtom,
  maxConcurrentDownloadsAtom,
  downloadRateLimitAtom,
  maxFileSizeAtom,
} from "@/state/settings-atoms";
import { useTauriApi } from "@/lib/TauriApiContext";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tauriApi = useTauriApi();
  const [alwaysOnTop, setAlwaysOnTop] = useAtom(alwaysOnTopAtom);
  const [isWayland, setIsWayland] = useState(false);
  const [outputLocation, setOutputLocation] = useAtom(downloadLocationAtom);

  // Advanced settings (Phase 3.2)
  const [downloadMode, setDownloadMode] = useAtom(downloadModeAtom);
  const [videoQuality, setVideoQuality] = useAtom(videoQualityAtom);
  const [maxResolution, setMaxResolution] = useAtom(maxResolutionAtom);
  const [videoFormat, setVideoFormat] = useAtom(videoFormatAtom);
  const [audioFormat, setAudioFormat] = useAtom(audioFormatAtom);
  const [audioQuality, setAudioQuality] = useAtom(audioQualityAtom);
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useAtom(
    maxConcurrentDownloadsAtom,
  );
  const [downloadRateLimit, setDownloadRateLimit] = useAtom(
    downloadRateLimitAtom,
  );
  const [maxFileSize, setMaxFileSize] = useAtom(maxFileSizeAtom);

  useEffect(() => {
    // Check if we're running on Wayland using the Rust backend
    tauriApi.commands
      .isWayland()
      .then((value) => {
        setIsWayland(value);
      })
      .catch((err) => {
        console.error("Failed to check Wayland status:", err);
      });
  }, [tauriApi.commands]);

  const handleAlwaysOnTopChange = async (checked: unknown) => {
    const boolValue = Boolean(checked);
    setAlwaysOnTop(boolValue);
    await tauriApi.commands.setAlwaysOnTop(boolValue);
  };

  const handleMaxConcurrentChange = async (value: string) => {
    const numValue = Number.parseInt(value, 10);
    setMaxConcurrentDownloads(numValue);
    try {
      await tauriApi.commands.setMaxConcurrentDownloads(numValue);
    } catch (err) {
      console.error("Failed to update max concurrent downloads:", err);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your download preferences and quality settings.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Window settings */}
          {isWayland ? (
            <Alert variant="destructive" className="text-left">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                "Stay on top" is not supported on Wayland yet.
              </AlertTitle>
              <AlertDescription>
                Try X11 or watch for Tauri updates.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex items-center gap-x-2">
              <Checkbox
                checked={alwaysOnTop}
                onCheckedChange={handleAlwaysOnTopChange}
                id="always-on-top-checkbox"
              />
              <label htmlFor="always-on-top-checkbox">Stay on top</label>
            </div>
          )}

          {/* Download location */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="download-location" className="text-right">
              Download location
            </Label>

            <Input
              type="text"
              id="download-location"
              className="text-sm col-span-2"
              placeholder="Download location..."
              value={outputLocation}
              onChange={(e) => setOutputLocation(e.target.value)}
            />

            <Button
              type="button"
              className="min-w-32"
              onClick={chooseOutputLocation}
            >
              Browse...
            </Button>
          </div>

          {/* Max concurrent downloads */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="max-concurrent" className="text-right">
              Concurrent downloads
            </Label>
            <Select
              value={maxConcurrentDownloads.toString()}
              onValueChange={handleMaxConcurrentChange}
            >
              <SelectTrigger id="max-concurrent" className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 (Sequential)</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3 (Default)</SelectItem>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="6">6</SelectItem>
                <SelectItem value="8">8</SelectItem>
                <SelectItem value="10">10</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Download Rate Limit */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="download-rate-limit" className="text-right">
              Rate Limit
            </Label>
            <Select
              value={downloadRateLimit}
              onValueChange={(value) => setDownloadRateLimit(value as any)}
            >
              <SelectTrigger id="download-rate-limit" className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unlimited">Unlimited</SelectItem>
                <SelectItem value="50K">50 KB/s</SelectItem>
                <SelectItem value="100K">100 KB/s</SelectItem>
                <SelectItem value="500K">500 KB/s</SelectItem>
                <SelectItem value="1M">1 MB/s</SelectItem>
                <SelectItem value="5M">5 MB/s</SelectItem>
                <SelectItem value="10M">10 MB/s</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Max File Size */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="max-file-size" className="text-right">
              Max File Size
            </Label>
            <Select
              value={maxFileSize}
              onValueChange={(value) => setMaxFileSize(value as any)}
            >
              <SelectTrigger id="max-file-size" className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unlimited">Unlimited</SelectItem>
                <SelectItem value="50M">50 MB</SelectItem>
                <SelectItem value="100M">100 MB</SelectItem>
                <SelectItem value="500M">500 MB</SelectItem>
                <SelectItem value="1G">1 GB</SelectItem>
                <SelectItem value="5G">5 GB</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Download mode */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="download-mode" className="text-right">
              Download mode
            </Label>
            <Select
              value={downloadMode}
              onValueChange={(value) => setDownloadMode(value as any)}
            >
              <SelectTrigger id="download-mode" className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="video">Video (with audio)</SelectItem>
                <SelectItem value="audio">Audio only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Video settings (only show when video mode) */}
          {downloadMode === "video" && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Video Settings</h3>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="video-quality" className="text-right">
                    Quality
                  </Label>
                  <Select
                    value={videoQuality}
                    onValueChange={(value) => setVideoQuality(value as any)}
                  >
                    <SelectTrigger id="video-quality" className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="best">Best</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="max-resolution" className="text-right">
                    Max resolution
                  </Label>
                  <Select
                    value={maxResolution}
                    onValueChange={(value) => setMaxResolution(value as any)}
                  >
                    <SelectTrigger id="max-resolution" className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-limit">No limit</SelectItem>
                      <SelectItem value="2160p">2160p (4K)</SelectItem>
                      <SelectItem value="1440p">1440p (2K)</SelectItem>
                      <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                      <SelectItem value="720p">720p (HD)</SelectItem>
                      <SelectItem value="480p">480p (SD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="video-format" className="text-right">
                    Format
                  </Label>
                  <Select
                    value={videoFormat}
                    onValueChange={(value) => setVideoFormat(value as any)}
                  >
                    <SelectTrigger id="video-format" className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="best">Best available</SelectItem>
                      <SelectItem value="mp4">MP4</SelectItem>
                      <SelectItem value="mkv">MKV</SelectItem>
                      <SelectItem value="webm">WebM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {/* Audio settings (show for both modes) */}
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Audio Settings</h3>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="audio-format" className="text-right">
                Format
              </Label>
              <Select
                value={audioFormat}
                onValueChange={(value) => setAudioFormat(value as any)}
              >
                <SelectTrigger id="audio-format" className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best">Best available</SelectItem>
                  <SelectItem value="mp3">MP3</SelectItem>
                  <SelectItem value="m4a">M4A</SelectItem>
                  <SelectItem value="opus">Opus</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="audio-quality" className="text-right">
                Quality
              </Label>
              <Select
                value={audioQuality}
                onValueChange={(value) => setAudioQuality(value as any)}
              >
                <SelectTrigger id="audio-quality" className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Best (320 kbps)</SelectItem>
                  <SelectItem value="2">High (256 kbps)</SelectItem>
                  <SelectItem value="5">Medium (192 kbps)</SelectItem>
                  <SelectItem value="9">Low (128 kbps)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
