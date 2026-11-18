/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // design-canvas holds local design boards (not part of the app); do not reload on their changes.
    watch: { ignored: ["**/design-canvas/**"] },
  },
  test: {
    exclude: ["**/node_modules/**", "**/design-canvas/**"],
  },
  build: {
    outDir: "dist/client",
    sourcemap: true,
  },
});
