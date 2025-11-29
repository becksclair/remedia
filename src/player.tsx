import { useState, useCallback, useMemo } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import _ReactPlayer from "react-player";
import { AlertCircle, Loader2, Music } from "lucide-react";
import { ErrorBoundary } from "./shared/error-boundary";
import { Button } from "./components/ui/button";

// Type workaround for react-player type issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = _ReactPlayer as any;

/** Audio file extensions for media type detection */
export const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|opus|ogg|wav|flac|wma|aiff?)$/i;

/** Audio-only platforms */
const AUDIO_PLATFORMS = /soundcloud\.com|audiomack\.com/i;

/** RedGifs URL pattern - needs special embed format */
export const REDGIFS_PATTERN = /redgifs\.com\/watch\/([a-zA-Z0-9]+)/i;

/** Transform URL to iframe-friendly embed format where needed */
export function getIframeUrl(url: string): string {
  const redGifsMatch = url.match(REDGIFS_PATTERN);
  if (redGifsMatch?.[1]) {
    return `https://www.redgifs.com/ifr/${redGifsMatch[1]}`;
  }
  return url;
}

/** Check if URL is audio-only content */
export function isAudioUrl(url: string): boolean {
  try {
    const pathname = new URL(url, "file://").pathname;
    if (AUDIO_EXTENSIONS.test(pathname)) return true;
  } catch {
    // Invalid URL, continue
  }
  return AUDIO_PLATFORMS.test(url);
}

/**
 * Media player component with fallback chain:
 * 1. react-player (native support for YouTube, Vimeo, etc.)
 * 2. iframe embed (for unsupported platforms)
 * 3. Error state with retry
 */
function Player() {
  const urlParams = new URLSearchParams(window.location.search);
  const raw = urlParams.get("url");
  const src = raw ? decodeURIComponent(raw) : null;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const iframeUrl = useMemo(() => (src ? getIframeUrl(src) : null), [src]);
  const isAudio = useMemo(() => (src ? isAudioUrl(src) : false), [src]);

  const handleReady = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  const handleStart = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any, data?: any) => {
      console.error("[Player] Error:", err, data);

      // Try iframe fallback before showing error
      if (!useIframeFallback) {
        setUseIframeFallback(true);
        setIsLoading(true);
        return;
      }

      // Both react-player and iframe failed
      const message =
        err?.message ||
        (typeof err === "string"
          ? err
          : "Failed to load media. The URL may be invalid or unsupported.");
      setError(message);
      setIsLoading(false);
    },
    [useIframeFallback],
  );

  const handleRetry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    setUseIframeFallback(false);
    setRetryKey((k) => k + 1);
  }, []);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setError("Failed to load media in iframe.");
    setIsLoading(false);
  }, []);

  // No URL provided
  if (!src) {
    return (
      <div className="w-screen h-screen bg-black flex flex-col items-center justify-center text-white gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg">Error: No URL provided</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="w-screen h-screen bg-black relative flex justify-center items-center">
        {/* Loading overlay */}
        {isLoading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/80">
            <Loader2 className="w-12 h-12 text-white animate-spin" />
            <p className="text-white mt-4">Loading {isAudio ? "audio" : "media"}...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/90 text-white gap-4 p-8">
            <AlertCircle className="w-12 h-12 text-red-500" />
            <p className="text-lg font-medium">Failed to load media</p>
            <p className="text-sm text-gray-400 text-center max-w-md">{error}</p>
            <p className="text-xs text-gray-500 text-center max-w-md break-all mt-2">URL: {src}</p>
            <Button onClick={handleRetry} variant="outline" className="mt-4">
              Try Again
            </Button>
          </div>
        )}

        {/* Iframe fallback (used when react-player fails) */}
        {!error && useIframeFallback && iframeUrl && (
          <iframe
            key={`iframe-${retryKey}`}
            src={iframeUrl}
            frameBorder="0"
            scrolling="no"
            allowFullScreen
            width="100%"
            height="100%"
            className="w-full h-full"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        )}

        {/* ReactPlayer (primary - handles YouTube, Vimeo, SoundCloud, direct files, etc.) */}
        {!error && !useIframeFallback && (
          <>
            {isAudio ? (
              <div className="flex flex-col items-center gap-6 p-8 w-full max-w-lg">
                <div className="w-48 h-48 rounded-2xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl">
                  <Music className="w-24 h-24 text-white/90" />
                </div>
                <ReactPlayer
                  key={retryKey}
                  src={src}
                  playing
                  controls
                  width="100%"
                  height={50}
                  onReady={handleReady}
                  onStart={handleStart}
                  onError={handleError}
                />
              </div>
            ) : (
              <ReactPlayer
                key={retryKey}
                src={src}
                playing
                controls
                width="100%"
                height="100%"
                onReady={handleReady}
                onStart={handleStart}
                onError={handleError}
              />
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default Player;
