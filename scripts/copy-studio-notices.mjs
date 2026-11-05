import { copyFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
for (const name of ["LICENSE.md", "NOTICE.md", "THIRD_PARTY_NOTICES.md"]) {
  await copyFile(new URL(name, root), new URL(`studio/dist/${name}`, root));
}
