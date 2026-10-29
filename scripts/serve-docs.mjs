import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
};

/** Development only: never accepts an external bind address or silently changes ports. */
export function parseDevArgs(args) {
  let port = 4173;
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split("=", 2);
    if (flag === "--strictPort" || flag === "--no-browser") continue;
    if (flag !== "--port" && flag !== "--host") throw new Error(`Unknown option: ${flag}`);
    const value = inline ?? args[++i];
    if (flag === "--host") {
      if (value !== "127.0.0.1")
        throw new Error("Documentation development binds only to 127.0.0.1.");
    } else {
      if (!/^\d+$/.test(value ?? "")) throw new Error("--port needs a decimal port number.");
      port = Number(value);
      if (port < 1 || port > 65535) throw new Error("--port must be between 1 and 65535.");
    }
  }
  return { host: "127.0.0.1", port };
}

/** Serve only known built asset types, with no source-directory or directory-listing fallback. */
export async function createDocsServer(directory) {
  const root = await realpath(directory);
  await stat(resolve(root, "index.html"));
  return createServer(async (request, response) => {
    const reply = (status, body, headers = {}) => {
      response.writeHead(status, {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Type": "text/plain; charset=utf-8",
        ...headers,
      });
      response.end(request.method === "HEAD" ? undefined : body);
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      reply(405, "Method not allowed", { Allow: "GET, HEAD" });
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    } catch {
      reply(400, "Invalid path");
      return;
    }
    if (pathname === "/") pathname = "/index.html";
    if (
      pathname.includes("\\") ||
      pathname.includes("\0") ||
      pathname.split("/").some((part) => part.startsWith("."))
    ) {
      reply(404, "Not found");
      return;
    }
    const type = types[extname(pathname)];
    if (!type) {
      reply(404, "Not found");
      return;
    }
    try {
      const file = await realpath(resolve(root, `.${pathname}`));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) {
        reply(404, "Not found");
        return;
      }
      const data = await readFile(file);
      reply(200, data, { "Content-Type": type, "Content-Length": String(data.length) });
    } catch {
      reply(404, "Not found");
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { host, port } = parseDevArgs(process.argv.slice(2));
    const server = await createDocsServer(new URL("../.docs-site", import.meta.url));
    server.on("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    server.listen(port, host, () =>
      console.log(`Fast UX local documentation: http://${host}:${port}/`),
    );
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
