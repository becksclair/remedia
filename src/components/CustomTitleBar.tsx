// src/App.tsx or a dedicated TitleBar.tsx component
import { Window } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { tauriApi } from "@/lib/tauri-api";

function CustomTitleBar() {
  const [wslBehavior, setWslBehavior] = useState<string | null>(null);

  useEffect(() => {
    // Detect WSL environment on component mount
    const detectWsl = async () => {
      try {
        const behavior = await tauriApi.commands.getWslWindowCloseBehavior();
        setWslBehavior(behavior);
      } catch (error) {
        console.warn("Failed to detect WSL environment:", error);
      }
    };

    void detectWsl();
  }, []);

  const handleMinimize = () => Window.getCurrent().minimize();
  const handleToggleMaximize = () => Window.getCurrent().toggleMaximize();

  const handleClose = async () => {
    if (wslBehavior === null) {
      console.warn("WSL detection still in progress, ignoring close attempt");
      return;
    }

    if (wslBehavior === "wsl2") {
      // In WSL2, use the quit command instead of window.close()
      // This ensures proper application termination
      try {
        await tauriApi.commands.quit();
      } catch (error) {
        console.error("Failed to quit application in WSL2:", error);
        // Fallback to regular close if quit fails
        void Window.getCurrent().close();
      }
    } else {
      // Standard close behavior for native/WSL1 environments
      void Window.getCurrent().close();
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="custom-titlebar h-8 bg-primary text-white flex justify-between items-center px-2 py-2"
    >
      <div className="title text-white font-bold">ReMedia</div>
      <div className="window-controls">
        <button
          type="button"
          className="mr-2 border-white border rounded-md p-1"
          onClick={handleMinimize}
          aria-label="Minimize window"
          title="Minimize"
        >
          <span aria-hidden="true">_</span>
        </button>
        <button
          type="button"
          className="mr-2 border-white border rounded-md p-1"
          onClick={handleToggleMaximize}
          aria-label="Toggle maximize window"
          title="Maximize"
        >
          <span aria-hidden="true">[]</span>
        </button>
        <button
          type="button"
          className={`mr-2 border-white border rounded-md p-1 ${wslBehavior === null ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={wslBehavior === null ? undefined : handleClose}
          aria-label={wslBehavior === null ? "Initializing, please wait..." : "Close window"}
          title={wslBehavior === null ? "Initializing..." : "Close"}
          disabled={wslBehavior === null}
        >
          <span aria-hidden="true">X</span>
        </button>
      </div>
    </div>
  );
}

export { CustomTitleBar };
