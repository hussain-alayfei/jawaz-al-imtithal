import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
/* Fonts are self-hosted and bundled, so the interface never waits on a third-party CDN. */
import "@fontsource/noto-naskh-arabic/arabic-500.css";
import "@fontsource/noto-naskh-arabic/arabic-600.css";
import "@fontsource/noto-naskh-arabic/arabic-700.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/latin-400.css";
import "@fontsource/ibm-plex-sans-arabic/latin-500.css";
import "@fontsource/ibm-plex-sans-arabic/latin-600.css";
import "./brand/tokens.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
