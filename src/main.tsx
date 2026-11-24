import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
/* Fonts are self-hosted and bundled, so the interface never waits on a third-party CDN (see fonts.css). */
import "./brand/fonts.css";
import "./brand/tokens.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
