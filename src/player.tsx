import { useState, useCallback, useMemo } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import _ReactPlayer from "react-player";
import { AlertCircle, Loader2, Music } from "lucide-react";
import ErrorBoundary from "./components/error-boundary";
import { Button } from "./components/ui/button";

// Type workaround for react-player type issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = _ReactPlayer as any;

/** Audio file extensions for media type detection */
const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|opus|ogg|wav|flac|wma|aiff?)$/i;

/** Audio-only platforms */
const AUDIO_PLATFORMS = /soundcloud\.com|audiomack\.com/i;

/** Check if URL is audio-only content */
function isAudioUrl(url: string): boolean {
  // Check file extension
  try {
    const pathname = new URL(url, "file://").pathname;
    if (AUDIO_EXTENSIONS.test(pathname)) return true;
  } catch {
    // Invalid URL, continue checking
  }
  // Check platform
  return AUDIO_PLATFORMS.test(url);
}

function Player() {
  const urlParams = new URLSearchParams(window.location.search);
  const raw = urlParams.get("url");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const src = raw ? decodeURIComponent(raw) : null;

  // Detect if this is audio-only content
  const isAudio = useMemo(() => (src ? isAudioUrl(src) : false), [src]);

  const handleError = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any, data?: any) => {
      console.error("Player error:", err, data);
      const message =
        err?.message ||
        (typeof err === "string"
          ? err
          : "Failed to load media. The URL may be invalid or unsupported.");
      setError(message);
      setIsLoading(false);
    },
    [],
  );

  const handleReady = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  const handleBuffer = useCallback(() => {
    setIsLoading(true);
  }, []);

  const handleBufferEnd = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleRetry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    setRetryKey((k) => k + 1);
  }, []);

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
        {/* Loading spinner */}
        {isLoading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/80">
            <Loader2 className="w-12 h-12 text-white animate-spin" />
            <p className="text-white mt-4">
              Loading {isAudio ? "audio" : "media"}...
            </p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/90 text-white gap-4 p-8">
            <AlertCircle className="w-12 h-12 text-red-500" />
            <p className="text-lg font-medium">Failed to load media</p>
            <p className="text-sm text-gray-400 text-center max-w-md">
              {error}
            </p>
            <p className="text-xs text-gray-500 text-center max-w-md break-all mt-2">
              URL: {src}
            </p>
            <Button onClick={handleRetry} variant="outline" className="mt-4">
              Try Again
            </Button>
          </div>
        )}

        {/* ReactPlayer - handles YouTube, Vimeo, SoundCloud, direct files, etc. */}
        {!error && (
          <>
            {isAudio ? (
              <div className="flex flex-col items-center gap-6 p-8 w-full max-w-lg">
                <div className="w-48 h-48 rounded-2xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl">
                  <Music className="w-24 h-24 text-white/90" />
                </div>
                <ReactPlayer
                  key={retryKey}
                  url={src}
                  playing
                  controls
                  width="100%"
                  height={50}
                  onReady={handleReady}
                  onError={handleError}
                  onBuffer={handleBuffer}
                  onBufferEnd={handleBufferEnd}
                />
              </div>
            ) : (
              <ReactPlayer
                key={retryKey}
                url={src}
                playing
                controls
                width="100%"
                height="100%"
                onReady={handleReady}
                onError={handleError}
                onBuffer={handleBuffer}
                onBufferEnd={handleBufferEnd}
              />
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default Player;
