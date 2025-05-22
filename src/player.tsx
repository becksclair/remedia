import ReactPlayer from "react-player"

function Player() {
	const urlParams = new URLSearchParams(window.location.search)
	const url = urlParams.get("url")

	if (url === null || !url) {
		return <div>Error: No URL provided</div>
	}

	return (
			<ReactPlayer url={url} controls width="100%" height="100%" />
	)
}

export default Player
