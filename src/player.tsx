import ReactPlayer from "react-player"
import ErrorBoundary from "./components/error-boundary"

function Player() {
	const urlParams = new URLSearchParams(window.location.search)
	const raw = urlParams.get("url")

	if (!raw) {
		return <div>Error: No URL provided</div>
	}

	const src = decodeURIComponent(raw)

	return (
		<ErrorBoundary>
			<div className="w-screen h-screen bg-black relative flex justify-center items-center">
					<ReactPlayer
						url={src}
						controls
						width="100%"
						height="100%"
						config={{
							file: {
								attributes: {
									controlsList: "nodownload"
								}
							}
						}}
					/>
			</div>
		</ErrorBoundary>
	)
}

export default Player
