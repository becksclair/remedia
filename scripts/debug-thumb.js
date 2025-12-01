// Capture thumbnail state and emit a unified debug-snapshot event via Tauri.
(() => {
  const img = document.querySelector('[data-testid="row-0-thumb"]');
  const mediaList = window.__DEBUG_MEDIA_LIST;

  const domSrc = img ? img.getAttribute("src") || img.src || "NO_SRC" : "NO_IMG";
  const isRedGifs = domSrc.includes("redgifs.com");
  const isPlaceholder = domSrc.includes("w3.org/2000/svg") || !domSrc.startsWith("http");

  const stateThumbnail = mediaList?.[0]?.thumbnail || "NO_STATE_THUMB";
  const stateIsRedGifs = stateThumbnail.includes?.("redgifs.com") || false;

  const data = {
    domSrc: domSrc.substring(0, 100),
    stateThumbnail:
      typeof stateThumbnail === "string" ? stateThumbnail.substring(0, 100) : stateThumbnail,
    isRedGifs,
    isPlaceholder,
    stateIsRedGifs,
    mediaListLength: mediaList?.length || 0,
    timestamp: Date.now(),
  };

  const snapshot = {
    kind: "thumbnail",
    data,
  };

  // Store result for retrieval/debugging in the page
  window.__DEBUG_RESULT = JSON.stringify(snapshot);
  console.log("[debug-thumb] captured snapshot:", snapshot);

  // Try to emit via Tauri event (backend will forward to WebSocket)
  try {
    const emit = window.__TAURI__?.event?.emit;
    if (emit) {
      emit("debug-snapshot", snapshot);
      console.log("[debug-thumb] emitted debug-snapshot via Tauri event");
    } else {
      console.log("[debug-thumb] Tauri event.emit not available");
    }
  } catch (e) {
    console.log("[debug-thumb] Tauri emit failed:", e.message || e);
  }
})();
