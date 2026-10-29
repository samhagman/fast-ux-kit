import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DocsApp } from "./App.js";
import "../../src/components.css";
import "../../src/styles.css";
import "./docs.css";
import "./gallery.css";
import "./outliner-lab.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DocsApp />
  </StrictMode>,
);
