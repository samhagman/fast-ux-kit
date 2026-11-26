import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import * as Components from "../src/components/index.js";
import { CodeBlock, CommandLine } from "../src/components/index.js";

const copied: string[] = [];
let refuse = false;
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: async (text: string) => {
      if (refuse) throw new Error("Clipboard permission denied");
      copied.push(text);
    },
  },
});
afterEach(async () => {
  refuse = false;
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

const command = "npm install @example/notes --save-dev";

test("a command line copies the command alone, never its prompt", async () => {
  const view = render(<CommandLine label="Install command" command={command} prompt />);
  const box = view.getByRole("group", { name: "Install command" });
  const prompt = box.querySelector('[data-slot="command-line-prompt"]')!;
  assert.equal(prompt.textContent, "$");
  assert.equal(prompt.getAttribute("aria-hidden"), "true", "the prompt is decoration");
  assert.match(prompt.className, /select-none/, "selecting the box by hand skips the prompt");
  assert.equal(box.querySelector("code")?.textContent, command);
  fireEvent.click(view.getByRole("button", { name: "Copy" }));
  await waitFor(() => assert.equal(copied.at(-1), command));
});

test("a custom prompt is shown, and no prompt is drawn unless asked for", () => {
  const custom = render(<CommandLine label="Console" command="help" prompt=">" />);
  assert.equal(
    custom.container.querySelector('[data-slot="command-line-prompt"]')?.textContent,
    ">",
  );
  cleanup();
  const bare = render(<CommandLine label="Console" command="help" />);
  assert.equal(bare.container.querySelector('[data-slot="command-line-prompt"]'), null);
});

test("a copy is announced, shown on the button for a moment, then reset", async () => {
  const view = render(
    <CommandLine
      label="Install command"
      command={command}
      copiedLabel="Command copied"
      resetDelay={40}
    />,
  );
  const button = view.getByRole("button", { name: "Copy" });
  const status = view.getByRole("status");
  assert.equal(status.textContent, "");
  fireEvent.click(button);
  await waitFor(() => assert.equal(status.textContent, "Command copied"));
  assert.equal(button.getAttribute("data-copied"), "true");
  // The button keeps its name, so a screen reader hears the confirmation once, from the status.
  assert.equal(button.getAttribute("aria-label"), "Copy");
  const shown = Array.from(button.querySelectorAll("[data-label]")).filter(
    (label) => !/\binvisible\b/.test(label.className),
  );
  assert.deepEqual(
    shown.map((label) => label.textContent),
    ["Command copied"],
  );
  await waitFor(() => assert.equal(status.textContent, ""));
  assert.equal(button.getAttribute("data-copied"), null);
});

test("a refused copy says so and selects the command for a manual copy", async () => {
  refuse = true;
  const errors: string[] = [];
  const view = render(
    <CommandLine
      label="Install command"
      command={command}
      prompt
      onError={(error) => errors.push(error.message)}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Copy" }));
  await waitFor(() =>
    assert.equal(view.getByRole("status").textContent, "Copy failed. The command is selected."),
  );
  assert.deepEqual(errors, ["Clipboard permission denied"]);
  assert.equal(document.getSelection()?.toString(), command, "the selection leaves out the prompt");
});

test("the label names the box and the copy text is configurable", () => {
  const view = render(
    <CommandLine label="Commande d'installation" command={command} copyLabel="Copier" />,
  );
  assert.ok(view.getByRole("group", { name: "Commande d'installation" }));
  assert.ok(view.getByRole("button", { name: "Copier" }));
});

test("a long command scrolls inside its own track while the button stays outside it", () => {
  const widths = Object.getOwnPropertyDescriptors(dom.window.HTMLElement.prototype);
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get() {
      return this.textContent.length * 8;
    },
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 160;
    },
  });
  try {
    const view = render(<CommandLine label="Install command" command={command} prompt />);
    const box = view.getByRole("group", { name: "Install command" });
    const track = box.querySelector<HTMLElement>('[data-slot="command-line-scroll"]')!;
    assert.match(track.className, /overflow-x-auto/);
    assert.match(track.className, /overflow-y-hidden/);
    assert.match(track.className, /whitespace-pre/);
    assert.match(track.className, /fux-command-line-scroll/, "the thin scrollbar rule applies");
    assert.equal(track.getAttribute("dir"), "ltr", "a command reads left to right in any page");
    assert.ok(track.contains(box.querySelector("code")));
    const button = view.getByRole("button", { name: "Copy" });
    assert.ok(!track.contains(button), "the button never scrolls away with the command");
    assert.equal(button.parentElement, box);
    // Overflowing content can be scrolled from the keyboard.
    assert.equal(track.tabIndex, 0);
    cleanup();
    const short = render(<CommandLine label="Short" command="ls" />);
    const shortTrack = short.container.querySelector('[data-slot="command-line-scroll"]')!;
    assert.equal(shortTrack.getAttribute("tabindex"), null, "no extra tab stop when it fits");
  } finally {
    for (const name of ["scrollWidth", "clientWidth"] as const) {
      const original = widths[name];
      if (original) Object.defineProperty(dom.window.HTMLElement.prototype, name, original);
    }
  }
});

test("the command line uses logical spacing and server-renders the same markup every time", () => {
  const element = <CommandLine label="Install command" command={command} prompt />;
  const html = renderToStaticMarkup(element);
  assert.equal(renderToStaticMarkup(element), html);
  assert.doesNotMatch(html, /\b(?:pl|pr|ml|mr|left|right|rounded-[lr])-/, "no physical sides");
  const track = html.match(/<div[^>]*data-slot="command-line-scroll"[^>]*>/)?.[0];
  assert.ok(track);
  assert.doesNotMatch(track, /tabindex/, "focusability waits for a measured overflow");
  assert.match(html, /role="status"/);
});

test("the command line is a catalog family in the Code category", () => {
  const entry = Components.componentManifest.find((item) => item.name === "CommandLine");
  assert.ok(entry);
  assert.equal(entry.category, "Code");
  assert.equal(entry.exportName, "CommandLine");
});

const listing = "const total = 1;\nconst next = total + 1;\n\n";

test("a code block has no copy button unless it is copyable", () => {
  const view = render(<CodeBlock code={listing} language="ts" filename="a.ts" />);
  assert.equal(view.container.querySelector("button"), null);
  assert.equal(view.container.querySelector('[role="status"]'), null);
});

test("a copyable code block copies the listing without line numbers", async () => {
  const view = render(
    <CodeBlock code={listing} language="ts" filename="a.ts" startLine={9} copyable />,
  );
  const head = view.container.querySelector(".fux-code-head")!;
  const button = view.getByRole("button", { name: "Copy" });
  assert.ok(head.contains(button), "the action sits in the header bar");
  assert.equal(head.lastElementChild?.contains(button), true, "at the bar's inline end");
  fireEvent.click(button);
  await waitFor(() => assert.equal(copied.at(-1), "const total = 1;\nconst next = total + 1;"));
  await waitFor(() => assert.equal(view.getByRole("status").textContent, "Copied"));
  assert.equal(button.getAttribute("data-copied"), "");
});

test("a copyable code block without a file name still gets a header for its action", async () => {
  const view = render(
    <CodeBlock code="echo hi" language="shell" copyable copyLabel="Copy code" copiedLabel="Done" />,
  );
  const head = view.container.querySelector(".fux-code-head");
  assert.ok(head);
  assert.equal(head.querySelector(".fux-code-file"), null);
  fireEvent.click(view.getByRole("button", { name: "Copy code" }));
  await waitFor(() => assert.equal(view.getByRole("status").textContent, "Done"));
  assert.equal(copied.at(-1), "echo hi");
});

test("a copyable code block renders inert and style-free on the server", () => {
  const html = renderToStaticMarkup(<CodeBlock code="a" filename="a.ts" copyable />);
  assert.match(html, /<button type="button" class="fux-code-copy"[^>]*disabled=""/);
  assert.doesNotMatch(html, /\sstyle=/);
  assert.doesNotMatch(html, /<script/);
});
