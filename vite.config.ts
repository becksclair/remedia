import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const ReactCompilerConfig = {
  /* ... */
};

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", ReactCompilerConfig]],
      },
    }),
    tailwindcss(),
  ],

  // 3. resolve paths for tailwind
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // 2. tauri expects a fixed port, fail if that port is not available
  build: {
    // HLS.js (~520 kB) and DASH.js (~986 kB) are monolithic media player libs
    // that can't be split further. They're lazy-loaded by react-player.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            // Media players - largest chunks, split separately
            if (id.includes("hls.js")) return "hls";
            if (id.includes("dashjs")) return "dash";
            // React core
            if (id.includes("react-dom")) return "react-dom";
            if (id.includes("/react/")) return "react";
            // React Player
            if (id.includes("react-player")) return "react-player";
            // Radix UI components
            if (id.includes("@radix-ui")) return "radix-ui";
            // TanStack
            if (id.includes("@tanstack")) return "tanstack";
            // Icons
            if (id.includes("lucide-react")) return "lucide";
            // State management
            if (id.includes("jotai")) return "jotai";
            // Tauri APIs
            if (id.includes("@tauri-apps")) return "tauri";
          }
        },
      },
    },
  },
  server: {
    hmr: host
      ? {
          host,
          port: 1421,
          protocol: "ws",
        }
      : undefined,
    host: host || false,
    port: 1420,
    strictPort: true,
    cors: {
      origin: true, // Allow all origins
      credentials: true,
    },
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
