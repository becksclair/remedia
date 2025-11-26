import { useAtom } from "jotai";

import { Separator } from "@/components/ui/separator";
import {
  downloadModeAtom,
  videoQualityAtom,
  maxResolutionAtom,
  videoFormatAtom,
  audioFormatAtom,
  audioQualityAtom,
  type VideoQuality,
  type MaxResolution,
  type VideoFormat,
  type AudioFormat,
  type AudioQuality,
} from "@/state/settings-atoms";

import { SettingsSelect, type SelectOption } from "./SettingsSelect";

const VIDEO_QUALITY_OPTIONS: SelectOption[] = [
  { value: "best", label: "Best" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const MAX_RESOLUTION_OPTIONS: SelectOption[] = [
  { value: "no-limit", label: "No limit" },
  { value: "2160p", label: "2160p (4K)" },
  { value: "1440p", label: "1440p (2K)" },
  { value: "1080p", label: "1080p (Full HD)" },
  { value: "720p", label: "720p (HD)" },
  { value: "480p", label: "480p (SD)" },
];

const VIDEO_FORMAT_OPTIONS: SelectOption[] = [
  { value: "best", label: "Best available" },
  { value: "mp4", label: "MP4" },
  { value: "mkv", label: "MKV" },
  { value: "webm", label: "WebM" },
];

const AUDIO_FORMAT_OPTIONS: SelectOption[] = [
  { value: "best", label: "Best available" },
  { value: "mp3", label: "MP3" },
  { value: "m4a", label: "M4A" },
  { value: "opus", label: "Opus" },
];

const AUDIO_QUALITY_OPTIONS: SelectOption[] = [
  { value: "0", label: "Best (320 kbps)" },
  { value: "2", label: "High (256 kbps)" },
  { value: "5", label: "Medium (192 kbps)" },
  { value: "9", label: "Low (128 kbps)" },
];

export function QualityTab() {
  const [downloadMode] = useAtom(downloadModeAtom);
  const [videoQuality, setVideoQuality] = useAtom(videoQualityAtom);
  const [maxResolution, setMaxResolution] = useAtom(maxResolutionAtom);
  const [videoFormat, setVideoFormat] = useAtom(videoFormatAtom);
  const [audioFormat, setAudioFormat] = useAtom(audioFormatAtom);
  const [audioQuality, setAudioQuality] = useAtom(audioQualityAtom);

  return (
    <div className="space-y-6">
      {/* Video settings (only show when video mode) */}
      {downloadMode === "video" && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Video Settings</h3>

          <SettingsSelect
            id="video-quality"
            label="Quality"
            value={videoQuality}
            onChange={(v) => setVideoQuality(v as VideoQuality)}
            options={VIDEO_QUALITY_OPTIONS}
            data-testid="settings-video-quality"
          />

          <SettingsSelect
            id="max-resolution"
            label="Max resolution"
            value={maxResolution}
            onChange={(v) => setMaxResolution(v as MaxResolution)}
            options={MAX_RESOLUTION_OPTIONS}
            data-testid="settings-max-resolution"
          />

          <SettingsSelect
            id="video-format"
            label="Format"
            value={videoFormat}
            onChange={(v) => setVideoFormat(v as VideoFormat)}
            options={VIDEO_FORMAT_OPTIONS}
            data-testid="settings-video-format"
          />

          <Separator />
        </div>
      )}

      {/* Audio settings (show for both modes) */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Audio Settings</h3>

        <SettingsSelect
          id="audio-format"
          label="Format"
          value={audioFormat}
          onChange={(v) => setAudioFormat(v as AudioFormat)}
          options={AUDIO_FORMAT_OPTIONS}
          data-testid="settings-audio-format"
        />

        <SettingsSelect
          id="audio-quality"
          label="Quality"
          value={audioQuality}
          onChange={(v) => setAudioQuality(v as AudioQuality)}
          options={AUDIO_QUALITY_OPTIONS}
          data-testid="settings-audio-quality"
        />
      </div>
    </div>
  );
}
