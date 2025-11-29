import { createContext, useCallback, useContext, type ReactNode } from "react";

import { useTauriApi } from "@/lib/TauriApiContext";
import type { PlaylistExpansion } from "@/types";

interface PlaylistContextValue {
  expandPlaylist: (url: string) => Promise<PlaylistExpansion>;
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

const EMPTY_EXPANSION: PlaylistExpansion = { entries: [] };

export function PlaylistProvider({ children }: { children: ReactNode }) {
  const tauriApi = useTauriApi();

  const expandPlaylist = useCallback(
    async (url: string): Promise<PlaylistExpansion> => {
      try {
        const expansion = await tauriApi.commands.expandPlaylist(url);
        if (!expansion || !Array.isArray(expansion.entries)) {
          return EMPTY_EXPANSION;
        }
        return {
          playlistName: expansion.playlistName,
          uploader: expansion.uploader,
          entries: expansion.entries.filter((entry) => Boolean(entry?.url)),
        };
      } catch (error) {
        console.warn("expandPlaylist failed; falling back to single URL", {
          url,
          error,
        });
        return EMPTY_EXPANSION;
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
