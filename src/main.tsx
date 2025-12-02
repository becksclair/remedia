import React, { type JSX } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
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
import { Toaster } from "sonner";

type MockState = typeof mockState;

declare global {
  interface Window {
    __E2E_mockState?: MockState;
  }
}

console.log("ReMedia starting");
console.log("- pathname:", window.location.pathname);
console.log("- href:", window.location.href);

// Get window label for fallback routing
const getWindowLabel = async (): Promise<string | null> => {
  if (isTauriRuntime()) {
    try {
      const currentWindow = getCurrentWebviewWindow();
      return currentWindow.label;
    } catch {
      return null;
    }
  }
  return null;
};

const apiToUse = isTauriRuntime() ? tauriApi : mockTauriApi;

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

// Initialize routing with window label fallback
const initializeRouting = async () => {
  const windowLabel = await getWindowLabel();
  console.log("- window label:", windowLabel);

  const pathname = window.location.pathname;
  console.log("- pathname:", pathname);

  // Route by window label first (more reliable), then fallback to pathname
  if (windowLabel === "debug-console" || pathname === "/debug") {
    console.log("✓ Rendering DebugConsole component");
    createRoot(document.getElementById("root")!).render(renderWithApi(<DebugConsole />));
  } else if (windowLabel === "settings" || pathname === "/settings") {
    console.log("✓ Rendering SettingsWindow component");
    createRoot(document.getElementById("root")!).render(renderWithApi(<SettingsWindow />));
  } else if (pathname === "/player") {
    console.log("✓ Rendering Player component");
    createRoot(document.getElementById("root")!).render(renderWithApi(<Player />));
  } else {
    console.log("✓ Rendering main App component");
    createRoot(document.getElementById("root")!).render(renderWithApi(<App />));
  }
};

// Render a fallback error UI when routing fails
const renderErrorFallback = (error: unknown) => {
  console.error("Failed to initialize routing:", error);
  const root = document.getElementById("root");
  if (root) {
    createRoot(root).render(
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full space-y-4 text-center">
          <h1 className="text-2xl font-bold text-foreground">Application Error</h1>
          <p className="text-muted-foreground">
            Failed to initialize the application. Please try refreshing the page.
          </p>
          <p className="text-sm text-muted-foreground">
            Error: {error instanceof Error ? error.message : String(error)}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            Reload Application
          </button>
        </div>
      </div>,
    );
  }
};

// Initialize routing
if (isTauriRuntime()) {
  initializeRouting().catch(renderErrorFallback);
} else {
  // For web/non-Tauri environment, use pathname only
  if (window.location.pathname === "/player") {
    createRoot(document.getElementById("root")!).render(renderWithApi(<Player />));
  } else if (window.location.pathname === "/debug") {
    createRoot(document.getElementById("root")!).render(renderWithApi(<DebugConsole />));
  } else if (window.location.pathname === "/settings") {
    createRoot(document.getElementById("root")!).render(renderWithApi(<SettingsWindow />));
  } else {
    createRoot(document.getElementById("root")!).render(renderWithApi(<App />));
  }
}
