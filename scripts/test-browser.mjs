import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";

const cwd = process.cwd(),
  directory = await mkdtemp(path.join(tmpdir(), "fast-ux-browser-"));
const artifacts = path.resolve(process.env.BROWSER_ARTIFACTS ?? path.join(directory, "artifacts"));
await mkdir(artifacts, { recursive: true });
await build({
  entryPoints: [path.join(cwd, "tests/browser/fixture.tsx")],
  bundle: true,
  format: "iife",
  outfile: path.join(directory, "bundle.js"),
  platform: "browser",
  sourcemap: false,
  define: { "process.env.NODE_ENV": '"development"' },
});
await writeFile(
  path.join(directory, "index.html"),
  `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="bundle.css"><style>body{margin:0;background:#f7f5f1;color:#232829;font:18px/1.5 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:28px 16px 80px}h1{font-size:30px;line-height:1.15;letter-spacing:-.04em;margin:0 0 8px}.intro{color:#58615f;font-size:16px;margin:0 0 24px}.fast-ux-outliner{background:#fff;border:1px solid #dddeda;border-radius:12px;padding:12px}.fast-ux-editor{padding:8px}.fast-ux-editor__toolbar{font-size:14px}button{font:inherit}</style></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`,
);
const chrome = spawn(
  process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--disable-background-networking",
    "--remote-debugging-pipe",
    `--user-data-dir=${path.join(directory, "profile")}`,
  ],
  {
    env: { ...process.env, HOME: directory, XDG_CONFIG_HOME: directory, XDG_CACHE_HOME: directory },
    stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
  },
);
let serial = 0,
  buffer = "",
  session,
  stderr = "",
  exited = false;
const pending = new Map(),
  events = [],
  checks = [];
chrome.stderr.on("data", (chunk) => {
  stderr += chunk;
});
chrome.on("exit", (code, signal) => {
  exited = true;
  for (const item of pending.values()) {
    clearTimeout(item.timeout);
    item.reject(new Error(`Chromium could not remain running (${code ?? signal}): ${stderr}`));
  }
  pending.clear();
});
chrome.stdio[3].on("error", (error) => console.error("CDP write", error.message));
chrome.stdio[4].on("error", (error) => console.error("CDP read", error.message));
chrome.stdio[4].on("data", (chunk) => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf("\0")) >= 0) {
    const raw = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    if (!raw) continue;
    const message = JSON.parse(raw);
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) continue;
      pending.delete(message.id);
      clearTimeout(item.timeout);
      message.error
        ? item.reject(new Error(JSON.stringify(message.error)))
        : item.resolve(message.result);
    } else events.push(message);
  }
});
const command = (method, params = {}, inSession = true) =>
  new Promise((resolve, reject) => {
    if (exited) {
      reject(new Error("Chromium is not running."));
      return;
    }
    const id = ++serial,
      timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out: ${method}\n${stderr.slice(-1000)}`));
      }, 10000);
    pending.set(id, { resolve, reject, timeout });
    chrome.stdio[3].write(
      JSON.stringify({
        id,
        method,
        params,
        ...(inSession && session ? { sessionId: session } : {}),
      }) + "\0",
    );
  });
const evaluate = async (expression) => {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const settle = () =>
  evaluate(
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 20))))",
  );
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
};
const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    windowsVirtualKeyCode,
    modifiers,
  });
  await command("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode,
    modifiers,
  });
  await settle();
};
const click = async (selector) => {
  const point = await evaluate(
    `(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing click target');const r=element.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  await command("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    ...point,
  });
  await command("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    ...point,
  });
  await settle();
};
const screenshot = async (name) => {
  const image = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(path.join(artifacts, name), Buffer.from(image.data, "base64"));
};
try {
  const version = await command("Browser.getVersion", {}, false);
  const target = await command("Target.createTarget", { url: "about:blank" }, false);
  session = (
    await command("Target.attachToTarget", { targetId: target.targetId, flatten: true }, false)
  ).sessionId;
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await command("Page.navigate", { url: `file://${path.join(directory, "index.html")}` });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await evaluate("!!window.outlineSmoke")) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await settle();
  check(
    "reader has no text input or contenteditable",
    await evaluate("document.querySelectorAll('textarea,[contenteditable]').length===0"),
  );
  check(
    "reader Markdown is semantic rather than source",
    await evaluate("!!document.querySelector('h2') && !!document.querySelector('table')"),
  );
  check(
    "reader disclosure has actual 44px target",
    await evaluate(
      "[...document.querySelectorAll('.fast-ux-outliner__toggle')].every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44})",
    ),
  );
  check(
    "reader disclosure is at right edge in LTR",
    await evaluate(
      "(()=>{const b=document.querySelector('.fast-ux-outliner__toggle'),r=b.closest('.fast-ux-outliner__row').getBoundingClientRect();return b.getBoundingClientRect().right>r.left+r.width*.7})()",
    ),
  );
  check(
    "390px reader has no page-level horizontal overflow",
    await evaluate("document.documentElement.scrollWidth<=390"),
  );
  await screenshot("reader-mobile.png");
  await click('[aria-label="Collapse Field notes"]');
  check(
    "native pointer folds reader without input activation",
    await evaluate(
      "document.querySelector('[aria-label=\"Expand Field notes\"]')!==null && !document.querySelector('textarea')",
    ),
  );
  await evaluate("outlineSmoke.show('editor')");
  await settle();
  await evaluate(
    "(()=>{const t=document.querySelector('textarea');t.focus();t.setSelectionRange(2,2)})()",
  );
  await key("Enter", "Enter", 13);
  check(
    "native Enter splits and focuses the created row",
    await evaluate(
      "outlineSmoke.ref.current.getState().nodes[0].text==='Al'&&document.activeElement.value==='pha'&&document.activeElement.selectionStart===0",
    ),
  );
  await command("Input.insertText", { text: "🧭" });
  await settle();
  check(
    "native rapid Unicode input reaches created row",
    await evaluate("outlineSmoke.ref.current.getState().nodes[1].text==='🧭pha'"),
  );
  await evaluate("document.activeElement.setSelectionRange(0,0)");
  await key("Backspace", "Backspace", 8);
  check(
    "native Backspace merge preserves text/caret",
    await evaluate(
      "outlineSmoke.ref.current.getState().nodes[0].text==='Al🧭pha'&&document.activeElement.selectionStart===2",
    ),
  );
  await key("z", "KeyZ", 90, 2);
  check(
    "native Ctrl+Z reverses merge",
    await evaluate("outlineSmoke.ref.current.getState().nodes.length===4"),
  );
  await evaluate(
    "outlineSmoke.show('editor',[{id:'a',text:'@al'},{id:'b',text:'Task',checked:false}])",
  );
  await settle();
  await evaluate(
    "(()=>{const t=document.querySelector('textarea');t.focus();t.setSelectionRange(3,3)})()",
  );
  await key(" ", "Space", 32, 2);
  check(
    "completion popup is rendered and input owns focus",
    await evaluate(
      "document.querySelectorAll('[role=option]').length===2&&document.activeElement.tagName==='TEXTAREA'",
    ),
  );
  check(
    "completion popup fits narrow viewport",
    await evaluate(
      "(()=>{const r=document.querySelector('[role=listbox]').getBoundingClientRect();return r.left>=0&&r.right<=390&&r.top>=0})()",
    ),
  );
  await key("Enter", "Enter", 13);
  check(
    "completion Enter accepts without splitting",
    await evaluate(
      "outlineSmoke.ref.current.getState().nodes.length===2&&outlineSmoke.ref.current.getState().nodes[0].text==='@alice'",
    ),
  );
  await key("F1", "F1", 112, 1);
  check(
    "native keyboard info uses interactive named dialog",
    await evaluate("!!document.querySelector('[role=dialog] a')"),
  );
  await key("Escape", "Escape", 27);
  check("Escape dismisses info", await evaluate("!document.querySelector('[role=dialog]')"));
  check(
    "task label is an actual 44px hit target",
    await evaluate(
      "(()=>{const r=document.querySelector('.fast-ux-editor__task').getBoundingClientRect();return r.width>=44&&r.height>=44})()",
    ),
  );
  await screenshot("editor-mobile.png");
  const exceptions = events.filter((event) => event.method === "Runtime.exceptionThrown");
  check("no uncaught browser exception", exceptions.length === 0);
  const report = {
    browser: version.product,
    viewport: { width: 390, height: 844 },
    checks,
    artifacts,
    limits: [
      "Headless Chromium emulation is not an Android device or TalkBack test.",
      "No real IME, system clipboard retention or touch scroll/drag certification.",
    ],
  };
  await writeFile(path.join(artifacts, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await command("Browser.close", {}, false).catch(() => {});
  chrome.kill();
}
