/**
 * Tiny environment helpers shared across frontend.
 */

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.__TAURI__) || Boolean(window.__TAURI_INTERNALS__);
}

export function isWebRuntime(): boolean {
  return !isTauriRuntime();
}
