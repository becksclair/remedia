import { invoke } from "@tauri-apps/api/core";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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
} from "@/state/settings-atoms";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [alwaysOnTop, setAlwaysOnTop] = useAtom(alwaysOnTopAtom);
  const [isWayland, setIsWayland] = useState(false);
  const [outputLocation, setOutputLocation] = useAtom(downloadLocationAtom);
  const [downloadMode, setDownloadMode] = useAtom(downloadModeAtom);
  const [videoQuality, setVideoQuality] = useAtom(videoQualityAtom);
  const [maxResolution, setMaxResolution] = useAtom(maxResolutionAtom);
  const [videoFormat, setVideoFormat] = useAtom(videoFormatAtom);
  const [audioFormat, setAudioFormat] = useAtom(audioFormatAtom);
  const [audioQuality, setAudioQuality] = useAtom(audioQualityAtom);

  useEffect(() => {
    // Check if we're running on Wayland using the Rust backend
    invoke("is_wayland")
      .then((value: unknown) => {
        setIsWayland(Boolean(value));
      })
      .catch((err) => {
        console.error("Failed to check Wayland status:", err);
      });
  }, []);

  const handleAlwaysOnTopChange = async (checked: unknown) => {
    const boolValue = Boolean(checked);
    setAlwaysOnTop(boolValue);
    await invoke("set_always_on_top", { alwaysOnTop: boolValue });
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
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure download preferences and quality settings.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
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

          <div className="space-y-3">
            <Label className="text-left font-medium">Download Mode</Label>
            <RadioGroup
              value={downloadMode}
              onValueChange={(value) =>
                setDownloadMode(value as "video" | "audio" | "both")
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="video" id="video" />
                <Label htmlFor="video">Video</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="audio" id="audio" />
                <Label htmlFor="audio">Audio only</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="both" id="both" />
                <Label htmlFor="both">Video + Audio</Label>
              </div>
            </RadioGroup>
          </div>

          {downloadMode !== "audio" && (
            <div className="space-y-3">
              <Label className="text-left font-medium">Video Options</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="video-quality" className="text-sm">
                    Quality
                  </Label>
                  <Select
                    value={videoQuality}
                    onValueChange={(value) =>
                      setVideoQuality(
                        value as "best" | "high" | "medium" | "low",
                      )
                    }
                  >
                    <SelectTrigger id="video-quality">
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
                <div>
                  <Label htmlFor="max-resolution" className="text-sm">
                    Max Resolution
                  </Label>
                  <Select
                    value={maxResolution}
                    onValueChange={(value) =>
                      setMaxResolution(
                        value as
                          | "2160p"
                          | "1440p"
                          | "1080p"
                          | "720p"
                          | "480p"
                          | "no-limit",
                      )
                    }
                  >
                    <SelectTrigger id="max-resolution">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-limit">No limit</SelectItem>
                      <SelectItem value="2160p">4K (2160p)</SelectItem>
                      <SelectItem value="1440p">1440p</SelectItem>
                      <SelectItem value="1080p">1080p</SelectItem>
                      <SelectItem value="720p">720p</SelectItem>
                      <SelectItem value="480p">480p</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="video-format" className="text-sm">
                    Format
                  </Label>
                  <Select
                    value={videoFormat}
                    onValueChange={(value) =>
                      setVideoFormat(value as "mp4" | "mkv" | "webm" | "best")
                    }
                  >
                    <SelectTrigger id="video-format">
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
            </div>
          )}

          {downloadMode !== "video" && (
            <div className="space-y-3">
              <Label className="text-left font-medium">Audio Options</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="audio-format" className="text-sm">
                    Format
                  </Label>
                  <Select
                    value={audioFormat}
                    onValueChange={(value) =>
                      setAudioFormat(value as "mp3" | "m4a" | "opus" | "best")
                    }
                  >
                    <SelectTrigger id="audio-format">
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
                <div>
                  <Label htmlFor="audio-quality" className="text-sm">
                    Quality
                  </Label>
                  <Select
                    value={audioQuality}
                    onValueChange={(value) =>
                      setAudioQuality(
                        value as "best" | "high" | "medium" | "low",
                      )
                    }
                  >
                    <SelectTrigger id="audio-quality">
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
              </div>
            </div>
          )}
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
