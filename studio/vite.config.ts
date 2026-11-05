import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "@base-ui/react",
      "prosemirror-model",
      "prosemirror-state",
      "prosemirror-view",
    ],
    alias: {
      "/src/registry": path.resolve(__dirname, "../src"),
      "/src/components/ui": path.resolve(__dirname, "../src/components/ui"),
      "@fux/core": path.resolve(__dirname, "../src/core/index.ts"),
      "@fux/text-geometry": path.resolve(__dirname, "../src/react/text-geometry.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
