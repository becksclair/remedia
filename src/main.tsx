import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import Player from "@/player"

if (window.location.pathname === "/player") {
	ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
		<React.StrictMode>
			<Player />
		</React.StrictMode>
	)
} else {
	ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>
	)
}
