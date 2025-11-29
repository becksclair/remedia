import { createContext, useCallback, useContext, type ReactNode } from "react";

import { useTauriApi } from "@/lib/TauriApiContext";
import type { PlaylistEntry } from "@/types";

interface PlaylistContextValue {
  expandPlaylist: (url: string) => Promise<PlaylistEntry[]>;
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export function PlaylistProvider({ children }: { children: ReactNode }) {
  const tauriApi = useTauriApi();

  const expandPlaylist = useCallback(
    async (url: string): Promise<PlaylistEntry[]> => {
      try {
        const entries = await tauriApi.commands.expandPlaylist(url);
        if (!Array.isArray(entries) || entries.length === 0) {
          return [];
        }
        return entries.filter((entry) => Boolean(entry?.url));
      } catch (error) {
        console.warn("expandPlaylist failed; falling back to single URL", {
          url,
          error,
        });
        return [];
      }
    },
    [tauriApi.commands],
  );

  return <PlaylistContext.Provider value={{ expandPlaylist }}>{children}</PlaylistContext.Provider>;
}

export function usePlaylistContext(): PlaylistContextValue {
  const ctx = useContext(PlaylistContext);
  if (!ctx) {
    throw new Error("usePlaylistContext must be used within a PlaylistProvider");
  }
  return ctx;
}
