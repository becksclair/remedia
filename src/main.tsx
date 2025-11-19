import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Player from "@/player";
import ErrorBoundary from "@/components/error-boundary";

console.log("ReMedia starting, pathname:", window.location.pathname);
console.log("Full URL:", window.location.href);

if (window.location.pathname === "/player") {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <Player />
      </ErrorBoundary>
    </React.StrictMode>,
  );
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
