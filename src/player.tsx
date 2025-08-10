import ReactPlayer from "react-player"
import { useState, useEffect } from "react"
import ErrorBoundary from "./components/error-boundary"

function Player() {
	const urlParams = new URLSearchParams(window.location.search)
	const encodedUrl = urlParams.get("url")
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		console.log("Player component mounted")
		console.log("Raw URL param:", encodedUrl)
		if (encodedUrl) {
			const decodedUrl = decodeURIComponent(encodedUrl)
			console.log("Decoded URL:", decodedUrl)
		}
	}, [encodedUrl])

	if (!encodedUrl) {
		return (
			<div className="flex justify-center items-center h-screen bg-black text-white">
				Error: No URL provided
			</div>
		)
	}

	const url = decodeURIComponent(encodedUrl)

	const handleReady = () => {
		setLoading(false)
		setError(null)
	}

	const handleError = (error: unknown) => {
		console.error("ReactPlayer error:", error)
		setLoading(false)
		setError("Failed to load video. The URL might not be supported or the video might be unavailable.")
	}

	const handleBuffer = () => {
		setLoading(true)
	}

	const handleBufferEnd = () => {
		setLoading(false)
	}

	return (
		<ErrorBoundary>
			<div className="w-screen h-screen bg-black relative flex justify-center items-center">
				{loading && !error && (
					<div className="absolute text-white text-lg z-10">
						Loading video...
					</div>
				)}
				{error ? (
					<div className="text-red-400 text-center p-5 text-base max-w-[80%]">
						<div className="text-2xl mb-2.5">⚠️</div>
						<div>{error}</div>
						<div className="mt-2.5 text-sm text-gray-300">URL: {url}</div>
						<div className="mt-2.5 text-xs text-gray-500">
							Check the console for more details
						</div>
					</div>
				) : (
					<ReactPlayer
						url={url}
						controls
						width="100%"
						height="100%"
						onReady={handleReady}
						onError={handleError}
						onBuffer={handleBuffer}
						onBufferEnd={handleBufferEnd}
						config={{
							file: {
								attributes: {
									controlsList: "nodownload"
								}
							}
						}}
					/>
				)}
			</div>
		</ErrorBoundary>
	)
}

export default Player
