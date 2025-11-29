import { createElement, useEffect } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";

import { renderWithProviders, waitFor, act } from "@/test/test-utils";
import { useRemoteControl } from "./useRemoteControl";
import { TAURI_EVENT } from "@/types";

type HarnessProps = Parameters<typeof useRemoteControl>[0] & {
  onReady?: (remote: ReturnType<typeof useRemoteControl>) => void;
};

function RemoteControlHarness({ onReady, ...options }: HarnessProps) {
  const remote = useRemoteControl(options);

  useEffect(() => {
    onReady?.(remote);
  }, [onReady, remote]);

  return null;
}

async function setupRemoteControl(overrides: Partial<Parameters<typeof useRemoteControl>[0]> = {}) {
  const addMediaUrl = vi.fn();
  const removeAll = vi.fn();
  const setOutputLocation = vi.fn();
  const startAllDownloads = vi.fn().mockResolvedValue(undefined);
  const cancelAllDownloads = vi.fn().mockResolvedValue(undefined);
  const logAction = vi.fn();

  const props: HarnessProps = {
    addMediaUrl,
    removeAll,
    setOutputLocation,
    startAllDownloads,
    cancelAllDownloads,
    mediaListLength: 0,
    logAction,
    ...overrides,
  } as HarnessProps;

  const onReady = vi.fn();
  const renderResult = renderWithProviders(
    createElement(RemoteControlHarness, { ...props, onReady }),
  );
  await waitFor(() => expect(onReady).toHaveBeenCalled());

  const emit = (eventName: string, payload: unknown) => {
    const emitter = (
      window as typeof window & { __E2E_emitTauriEvent?: (event: string, payload: unknown) => void }
    ).__E2E_emitTauriEvent;
    if (typeof emitter !== "function") {
      throw new Error("__E2E_emitTauriEvent is not available");
    }
    act(() => {
      emitter(eventName, payload);
    });
  };

  const rerender = (changes: Partial<HarnessProps>) => {
    Object.assign(props, changes);
    act(() => {
      renderResult.rerender(createElement(RemoteControlHarness, { ...props, onReady }));
    });
  };

  return {
    emit,
    rerender,
    mocks: {
      addMediaUrl,
      removeAll,
      setOutputLocation,
      startAllDownloads,
      cancelAllDownloads,
      logAction,
    },
  };
}

describe("useRemoteControl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queues and starts downloads when remoteAddUrl fires", async () => {
    const { emit, mocks } = await setupRemoteControl({ mediaListLength: 1 });

    emit(TAURI_EVENT.remoteAddUrl, "https://example.com/remote");

    await waitFor(() =>
      expect(mocks.addMediaUrl).toHaveBeenCalledWith("https://example.com/remote"),
    );
    await waitFor(() => expect(mocks.startAllDownloads).toHaveBeenCalledTimes(1));
    expect(mocks.logAction).toHaveBeenCalledWith("remote-add-url", "https://example.com/remote");
  });

  it("starts downloads when remoteStartDownloads fires", async () => {
    const { emit, mocks } = await setupRemoteControl({ mediaListLength: 2 });

    emit(TAURI_EVENT.remoteStartDownloads, undefined);

    await waitFor(() => expect(mocks.startAllDownloads).toHaveBeenCalledTimes(1));
    expect(mocks.logAction).toHaveBeenCalledWith("remote-start-downloads");
  });

  it("cancels downloads when remoteCancelDownloads fires", async () => {
    const { emit, mocks } = await setupRemoteControl();

    emit(TAURI_EVENT.remoteCancelDownloads, undefined);

    await waitFor(() => expect(mocks.cancelAllDownloads).toHaveBeenCalledTimes(1));
    expect(mocks.logAction).toHaveBeenCalledWith("remote-cancel-downloads");
  });

  it("clears list and prevents auto-start after remoteClearList", async () => {
    const { emit, rerender, mocks } = await setupRemoteControl({ mediaListLength: 0 });

    emit(TAURI_EVENT.remoteAddUrl, "https://example.com/pending");
    emit(TAURI_EVENT.remoteClearList, undefined);

    expect(mocks.removeAll).toHaveBeenCalledTimes(1);
    expect(mocks.logAction).toHaveBeenCalledWith("remote-clear-list");

    rerender({ mediaListLength: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mocks.startAllDownloads).not.toHaveBeenCalled();
  });

  it("sets download directory when remoteSetDownloadDir fires", async () => {
    const { emit, mocks } = await setupRemoteControl();

    emit(TAURI_EVENT.remoteSetDownloadDir, "C:/Downloads");

    await waitFor(() => expect(mocks.setOutputLocation).toHaveBeenCalledWith("C:/Downloads"));
    expect(mocks.logAction).toHaveBeenCalledWith("remote-set-download-dir", "C:/Downloads");
  });
});
