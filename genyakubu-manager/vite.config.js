/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";

export default defineConfig({
  plugins: [react()],
  base: "/genekibu-kanri/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split vendor dependencies into their own chunks so page navigation
        // doesn't re-download React/Firebase when a lazy view loads.
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("firebase")) return "firebase";
            if (id.includes("react-dom") || id.includes("scheduler")) {
              return "react-dom";
            }
            if (
              id.includes("/react/") ||
              id.endsWith("/react") ||
              id.includes("react/jsx-runtime") ||
              id.includes("react/jsx-dev-runtime")
            ) {
              return "react";
            }
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,ts,jsx,tsx}"],
    setupFiles: ["src/test-setup.js"],
  },
});

