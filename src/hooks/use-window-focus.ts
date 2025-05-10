import { useEffect } from "react";

export function useWindowFocus(callback: () => void) {
	useEffect(() => {
		window.addEventListener("focus", callback);
		return () => window.removeEventListener("focus", callback);
	}, [callback]);
}
