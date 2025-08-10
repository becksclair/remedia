import ReactPlayer from "react-player"
import { useState } from "react"

function Player() {
	const urlParams = new URLSearchParams(window.location.search)
	const encodedUrl = urlParams.get("url")
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	if (!encodedUrl) {
		return (
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					height: "100vh",
					background: "#000",
					color: "#fff"
				}}>
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
		<div
			style={{
				width: "100vw",
				height: "100vh",
				background: "#000",
				position: "relative",
				display: "flex",
				justifyContent: "center",
				alignItems: "center"
			}}>
			{loading && !error && (
				<div
					style={{
						position: "absolute",
						color: "#fff",
						fontSize: "18px",
						zIndex: 10
					}}>
					Loading video...
				</div>
			)}
			{error ? (
				<div
					style={{
						color: "#ff6b6b",
						textAlign: "center",
						padding: "20px",
						fontSize: "16px",
						maxWidth: "80%"
					}}>
					<div style={{ fontSize: "24px", marginBottom: "10px" }}>⚠️</div>
					<div>{error}</div>
					<div style={{ marginTop: "10px", fontSize: "14px", color: "#ccc" }}>URL: {url}</div>
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
	)
}

export default Player
