import React, { type JSX } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Player from "@/player";
import { DebugConsole } from "@/components/debug-console";
import ErrorBoundary from "@/components/error-boundary";
import { TauriApiProvider } from "@/lib/TauriApiContext";
import { tauriApi } from "@/lib/tauri-api";
import { mockTauriApi } from "@/lib/tauri-api.mock";
import { isTauriRuntime } from "@/utils/env";
import { installRemoteUI } from "@/testing/remote-ui";

console.log("ReMedia starting, pathname:", window.location.pathname);
console.log("Full URL:", window.location.href);

const apiToUse = isTauriRuntime() ? tauriApi : mockTauriApi;

// Install remote UI helpers for dev/e2e (no-op in production unless explicitly enabled)
installRemoteUI();

function renderWithApi(node: JSX.Element) {
  return (
    <React.StrictMode>
      <ErrorBoundary>
        <TauriApiProvider api={apiToUse}>{node}</TauriApiProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

if (window.location.pathname === "/player") {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    renderWithApi(<Player />),
  );
} else if (window.location.pathname === "/debug") {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    renderWithApi(<DebugConsole />),
  );
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    renderWithApi(<App />),
  );
}
