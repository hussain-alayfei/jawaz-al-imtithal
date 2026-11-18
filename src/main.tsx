import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
/* Fonts are self-hosted and bundled, so the interface never waits on a third-party CDN. */
import "@fontsource/almarai/arabic-300.css";
import "@fontsource/almarai/arabic-400.css";
import "@fontsource/almarai/arabic-700.css";
import "@fontsource/almarai/arabic-800.css";
import "@fontsource/almarai/latin-400.css";
import "@fontsource/almarai/latin-700.css";
import "@fontsource/almarai/latin-800.css";
import "./brand/tokens.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
