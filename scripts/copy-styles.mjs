import { copyFile } from "node:fs/promises";
for (const file of [
  "styles.css",
  "tokens.css",
  "components.css",
  "components/ark-specialized.css",
  "components/ark-advanced.css",
  "react/editor.css",
]) {
  await copyFile(
    new URL(`../src/${file}`, import.meta.url),
    new URL(`../dist/${file}`, import.meta.url),
  );
}
