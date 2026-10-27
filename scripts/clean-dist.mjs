import { rm } from "node:fs/promises";
// Only generated output in this package; never infer a path from user input.
await rm(new URL("../dist/", import.meta.url), { recursive: true, force: true });
