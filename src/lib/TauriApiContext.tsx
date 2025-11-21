/**
 * React Context for Tauri API Dependency Injection
 *
 * Provides Tauri API to components with ability to inject mocks for testing.
 */

import { createContext, useContext, type ReactNode } from "react";
import { tauriApi, type TauriApi } from "./tauri-api";

/**
 * Tauri API Context
 */
const TauriApiContext = createContext<TauriApi>(tauriApi);

/**
 * Provider component for Tauri API
 */
export function TauriApiProvider({
  children,
  api = tauriApi,
}: {
  children: ReactNode;
  api?: TauriApi;
}) {
  return (
    <TauriApiContext.Provider value={api}>{children}</TauriApiContext.Provider>
  );
}

/**
 * Hook to access Tauri API in components
 */
export function useTauriApi(): TauriApi {
  const api = useContext(TauriApiContext);
  if (!api) {
    throw new Error("useTauriApi must be used within TauriApiProvider");
  }
  return api;
}
