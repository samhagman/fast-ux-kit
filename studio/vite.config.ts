import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Libraries the kit loads lazily (on first use) are pre-bundled up front: discovered mid-session,
  // the dev server re-optimises and rejects the in-flight import ("Outdated Optimize Dep").
  optimizeDeps: {
    include: [
      "signature_pad",
      "elkjs/lib/elk.bundled.js",
      "micromark",
      "micromark-extension-gfm-strikethrough",
    ],
  },
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
