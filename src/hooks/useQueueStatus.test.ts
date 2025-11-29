import { describe, it, expect, beforeEach } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

import { useQueueStatus } from "./useQueueStatus";
import { TauriApiProvider } from "@/lib/TauriApiContext";
import { mockTauriApi, mockState } from "@/lib/tauri-api.mock";
import { TAURI_EVENT } from "@/types";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(TauriApiProvider, { api: mockTauriApi, children });

describe("useQueueStatus", () => {
  beforeEach(() => {
    mockState.reset();
  });

  it("fetches queue stats on mount", async () => {
    mockState.queuedDownloads = [0, 1, 2];
    mockState.activeDownloads.add(3);
    mockState.maxConcurrentDownloads = 4;

    const { result } = renderHook(() => useQueueStatus(), { wrapper });

    await waitFor(() => {
      expect(result.current.queueStats).toEqual({ queued: 3, active: 1, maxConcurrent: 4 });
    });
  });

  it("updates queue stats when events fire", async () => {
    const { result } = renderHook(() => useQueueStatus(), { wrapper });

    mockState.queuedDownloads = [0];
    act(() => {
      mockState.emitEvent(TAURI_EVENT.downloadQueued, 1);
    });
    await waitFor(() =>
      expect(result.current.queueStats).toEqual({ queued: 1, active: 0, maxConcurrent: 3 }),
    );

    mockState.queuedDownloads = [];
    mockState.activeDownloads.add(1);
    act(() => {
      mockState.emitEvent(TAURI_EVENT.downloadStarted, 1);
    });
    await waitFor(() =>
      expect(result.current.queueStats).toEqual({ queued: 0, active: 1, maxConcurrent: 3 }),
    );

    mockState.activeDownloads.delete(1);
    act(() => {
      mockState.emitEvent(TAURI_EVENT.downloadComplete, 1);
    });
    await waitFor(() =>
      expect(result.current.queueStats).toEqual({ queued: 0, active: 0, maxConcurrent: 3 }),
    );
  });

  it("refreshes queue stats on demand", async () => {
    const { result } = renderHook(() => useQueueStatus(), { wrapper });

    mockState.queuedDownloads = [0];
    mockState.activeDownloads.add(1);
    mockState.maxConcurrentDownloads = 2;

    await act(async () => {
      await result.current.refreshQueueStatus();
    });

    expect(result.current.queueStats).toEqual({ queued: 1, active: 1, maxConcurrent: 2 });
  });
});
