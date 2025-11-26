import { useAtom } from "jotai";

import { Separator } from "@/components/ui/separator";
import { useTauriApi } from "@/lib/TauriApiContext";
import {
  downloadModeAtom,
  maxConcurrentDownloadsAtom,
  downloadRateLimitAtom,
  maxFileSizeAtom,
  type DownloadMode,
  type DownloadRateLimit,
  type MaxFileSize,
} from "@/state/settings-atoms";

import { SettingsSelect, type SelectOption } from "./SettingsSelect";

const DOWNLOAD_MODE_OPTIONS: SelectOption[] = [
  { value: "video", label: "Video (with audio)" },
  { value: "audio", label: "Audio only" },
];

const CONCURRENT_OPTIONS: SelectOption[] = [
  { value: "1", label: "1 (Sequential)" },
  { value: "2", label: "2" },
  { value: "3", label: "3 (Default)" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
  { value: "8", label: "8" },
  { value: "10", label: "10" },
];

const RATE_LIMIT_OPTIONS: SelectOption[] = [
  { value: "unlimited", label: "Unlimited" },
  { value: "50K", label: "50 KB/s" },
  { value: "100K", label: "100 KB/s" },
  { value: "500K", label: "500 KB/s" },
  { value: "1M", label: "1 MB/s" },
  { value: "5M", label: "5 MB/s" },
  { value: "10M", label: "10 MB/s" },
];

const MAX_FILE_SIZE_OPTIONS: SelectOption[] = [
  { value: "unlimited", label: "Unlimited" },
  { value: "50M", label: "50 MB" },
  { value: "100M", label: "100 MB" },
  { value: "500M", label: "500 MB" },
  { value: "1G", label: "1 GB" },
  { value: "5G", label: "5 GB" },
];

export function DownloadsTab() {
  const tauriApi = useTauriApi();
  const [downloadMode, setDownloadMode] = useAtom(downloadModeAtom);
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useAtom(
    maxConcurrentDownloadsAtom,
  );
  const [downloadRateLimit, setDownloadRateLimit] = useAtom(
    downloadRateLimitAtom,
  );
  const [maxFileSize, setMaxFileSize] = useAtom(maxFileSizeAtom);

  const handleMaxConcurrentChange = async (value: string) => {
    const numValue = Number.parseInt(value, 10);
    setMaxConcurrentDownloads(numValue);
    try {
      await tauriApi.commands.setMaxConcurrentDownloads(numValue);
    } catch (err) {
      console.error("Failed to update max concurrent downloads:", err);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSelect
        id="download-mode"
        label="Download mode"
        value={downloadMode}
        onChange={(v) => setDownloadMode(v as DownloadMode)}
        options={DOWNLOAD_MODE_OPTIONS}
        data-testid="settings-download-mode"
      />

      <SettingsSelect
        id="max-concurrent"
        label="Concurrent downloads"
        value={maxConcurrentDownloads.toString()}
        onChange={handleMaxConcurrentChange}
        options={CONCURRENT_OPTIONS}
        data-testid="settings-max-concurrent"
      />

      <Separator />

      <SettingsSelect
        id="download-rate-limit"
        label="Rate Limit"
        value={downloadRateLimit}
        onChange={(v) => setDownloadRateLimit(v as DownloadRateLimit)}
        options={RATE_LIMIT_OPTIONS}
        data-testid="settings-rate-limit"
      />

      <SettingsSelect
        id="max-file-size"
        label="Max File Size"
        value={maxFileSize}
        onChange={(v) => setMaxFileSize(v as MaxFileSize)}
        options={MAX_FILE_SIZE_OPTIONS}
        data-testid="settings-max-file-size"
      />
    </div>
  );
}
