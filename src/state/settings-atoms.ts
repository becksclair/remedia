import { atomWithStorage } from "jotai/utils";

export const alwaysOnTopAtom = atomWithStorage("alwaysOnTop", false);
export const downloadLocationAtom = atomWithStorage<string>(
  "downloadLocation",
  "",
);
