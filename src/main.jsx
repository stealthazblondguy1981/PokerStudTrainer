import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// If you kept index.css from Vite, it’s fine to leave it.
// Tailwind is loaded via CDN in index.html, so no extra CSS import needed.

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
