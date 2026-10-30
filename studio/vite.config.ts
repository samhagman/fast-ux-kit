import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@fux/core": path.resolve(__dirname, "../src/core/index.ts"),
      "@fux/text-geometry": path.resolve(__dirname, "../src/react/text-geometry.ts"),
      "@fux/examples": path.resolve(__dirname, "../examples"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
