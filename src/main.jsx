import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Import the service worker register for PWA
import { registerSW } from "virtual:pwa-register";

// Call it once to enable offline + install prompt
registerSW();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
