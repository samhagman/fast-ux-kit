"use client";

/**
 * Editorial UI: forms for explaining something on a page. Atoms sit inside a sentence, molecules
 * are one block in the reading column, and organisms shape the page.
 *
 * This entry depends on React alone and has its own stylesheet (`/editorial.css`), so a static
 * site can server-render an article without the app component layer.
 */
export * from "./atoms.js";
export * from "./molecules.js";
export * from "./organisms.js";
export * from "./autoplay.js";
export * from "./tokenize.js";
export * from "./manifest.js";
