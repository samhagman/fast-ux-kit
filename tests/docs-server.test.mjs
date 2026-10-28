import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { parseDevArgs, createDocsServer } from "../scripts/serve-docs.mjs";

test("docs dev CLI honors both port syntaxes and accepts only loopback", () => {
  assert.deepEqual(parseDevArgs([]), { host: "127.0.0.1", port: 4173 });
  assert.equal(parseDevArgs(["--port", "5271", "--host", "127.0.0.1"]).port, 5271);
  assert.equal(parseDevArgs(["--port=5272", "--host=127.0.0.1", "--strictPort"]).port, 5272);
  for (const args of [
    ["--host", "0.0.0.0"],
    ["--host", "localhost"],
    ["--port"],
    ["--port", "0"],
    ["--port", "65536"],
    ["--port", "1e3"],
    ["--root", "/"],
  ]) {
    assert.throws(() => parseDevArgs(args));
  }
});

test("docs dev server serves exact built bytes without exposing source, directories or symlink escapes", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "fast-ux-docs-server-"));
  const root = join(fixture, "built");
  await mkdir(join(root, "chunks"), { recursive: true });
  await writeFile(join(root, "index.html"), "<!doctype html><h1>Local docs</h1>");
  await writeFile(join(root, "chunks", "demo.js"), "export const ready = true;");
  await writeFile(join(root, "clip.wav"), Uint8Array.from([0, 255, 127, 128]));
  await writeFile(join(fixture, "outside.txt"), "OUTSIDE");
  await writeFile(join(root, ".private.txt"), "HIDDEN");
  await symlink(join(fixture, "outside.txt"), join(root, "escape.txt"));
  const server = await createDocsServer(root);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(address.address, "127.0.0.1");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Local docs/);
    assert.equal(page.headers.get("Cache-Control"), "no-store");
    assert.equal(page.headers.get("X-Content-Type-Options"), "nosniff");
    const chunk = await fetch(`${base}/chunks/demo.js?fresh=1`);
    assert.equal(chunk.headers.get("Content-Type"), "application/javascript; charset=utf-8");
    assert.equal(await chunk.text(), "export const ready = true;");
    const audio = await fetch(`${base}/clip.wav`);
    assert.deepEqual(
      new Uint8Array(await audio.arrayBuffer()),
      Uint8Array.from([0, 255, 127, 128]),
    );
    const head = await fetch(`${base}/clip.wav`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    for (const path of [
      "/chunks/",
      "/src/App.tsx",
      "/.private.txt",
      "/escape.txt",
      "/missing",
      "/constructor",
      "/%2e%2e%2foutside.txt",
    ])
      assert.equal((await fetch(base + path)).status, 404, path);
    assert.equal((await fetch(`${base}/%ZZ`)).status, 400);
    const post = await fetch(base, { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("Allow"), "GET, HEAD");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(fixture, { recursive: true, force: true });
  }
});
