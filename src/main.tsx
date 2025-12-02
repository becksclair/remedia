import React, { type JSX } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Player from "@/player";
import { DebugConsole } from "@/components/debug-console";
import { SettingsWindow } from "@/components/settings-window";
import { ErrorBoundary } from "@/shared/error-boundary";
import { TauriApiProvider } from "@/lib/TauriApiContext";
import { PlaylistProvider } from "@/lib/PlaylistContext";
import { tauriApi } from "@/lib/tauri-api";
import { mockTauriApi, mockState } from "@/lib/tauri-api.mock";
import { isTauriRuntime } from "@/utils/env";
import { installRemoteUI } from "@/testing/remote-ui";
import { Toaster } from "sonner";

type MockState = typeof mockState;

declare global {
  interface Window {
    __E2E_mockState?: MockState;
  }
}

console.log("ReMedia starting, pathname:", window.location.pathname);
console.log("Full URL:", window.location.href);

const apiToUse = isTauriRuntime() ? tauriApi : mockTauriApi;

// Install remote UI helpers for dev/e2e (no-op in production unless explicitly enabled)
installRemoteUI();

if (typeof window !== "undefined" && !isTauriRuntime()) {
  window.__E2E_mockState = mockState;
}

function renderWithApi(node: JSX.Element) {
  return (
    <React.StrictMode>
      <ErrorBoundary>
        <TauriApiProvider api={apiToUse}>
          <PlaylistProvider>
            {node}
            <Toaster
              position="bottom-right"
              richColors
              closeButton
              expand={false}
              duration={5000}
            />
          </PlaylistProvider>
        </TauriApiProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

if (window.location.pathname === "/player") {
  createRoot(document.getElementById("root")!).render(renderWithApi(<Player />));
} else if (window.location.pathname === "/debug") {
  createRoot(document.getElementById("root")!).render(renderWithApi(<DebugConsole />));
} else if (window.location.pathname === "/settings") {
  createRoot(document.getElementById("root")!).render(renderWithApi(<SettingsWindow />));
} else {
  createRoot(document.getElementById("root")!).render(renderWithApi(<App />));
}
