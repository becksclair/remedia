import { atomWithStorage } from "jotai/utils";

export const alwaysOnTopAtom = atomWithStorage("alwaysOnTop", false);
export const downloadLocationAtom = atomWithStorage<string>(
  "downloadLocation",
  "",
);

export const downloadModeAtom = atomWithStorage<"video" | "audio" | "both">(
  "downloadMode",
  "video",
);

export const videoQualityAtom = atomWithStorage<
  "best" | "high" | "medium" | "low"
>("videoQuality", "best");

export const maxResolutionAtom = atomWithStorage<
  "2160p" | "1440p" | "1080p" | "720p" | "480p" | "no-limit"
>("maxResolution", "no-limit");

export const videoFormatAtom = atomWithStorage<"mp4" | "mkv" | "webm" | "best">(
  "videoFormat",
  "best",
);

export const audioFormatAtom = atomWithStorage<"mp3" | "m4a" | "opus" | "best">(
  "audioFormat",
  "best",
);

export const audioQualityAtom = atomWithStorage<
  "best" | "high" | "medium" | "low"
>("audioQuality", "best");
