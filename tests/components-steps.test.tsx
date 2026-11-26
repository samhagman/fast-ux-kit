import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, cleanup, render } from "@testing-library/react";
import { Steps, type StepsItem } from "../src/components/specialized.js";

void dom;
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

const setup = [
  { id: "create", title: "Create account", description: "Choose a name and a password." },
  { id: "invite", title: "Invite your team", description: "Add people by email." },
  { id: "review", title: "Review", error: true },
  { id: "done", title: "Done" },
];

const history: StepsItem[] = [
  {
    id: "created",
    title: "Created in draft",
    meta: "ada · 14:01:48",
    aside: "#1",
    icon: <svg data-testid="created-icon" />,
  },
  {
    id: "submit",
    title: (
      <>
        <code>SUBMIT</code> · draft → review
      </>
    ),
    meta: "ada · 14:01:52",
    aside: "#2",
  },
  {
    id: "ask",
    title: "Asked the owner: Approve?",
    description: "Closes after 24 h",
    status: "waiting",
    statusLabel: "waiting for an answer",
    aside: "#3",
  },
  { id: "answer", title: "Answered approve", meta: "grace · 14:20:03", aside: "#4" },
];

function states(container: HTMLElement) {
  return Array.from(container.querySelectorAll("li")).map((row) => row.getAttribute("data-state"));
}

test("the progress variant is the default and renders the same markup", () => {
  for (const value of [0, 1, 2, 4]) {
    for (const orientation of ["vertical", "horizontal"] as const) {
      const plain = renderToString(
        <Steps label="Setup" items={setup} value={value} orientation={orientation} />,
      );
      const named = renderToString(
        <Steps
          label="Setup"
          items={setup}
          value={value}
          orientation={orientation}
          variant="progress"
        />,
      );
      assert.equal(named, plain);
    }
  }
});

test("an item's status overrides its position, and error still works", () => {
  const view = render(
    <Steps
      label="Setup"
      value={1}
      items={[
        { id: "a", title: "Account", status: "upcoming" },
        { id: "b", title: "Team", status: "complete" },
        { id: "c", title: "Review", status: "current" },
        { id: "d", title: "Billing", error: true },
        { id: "e", title: "Done", error: true, status: "waiting" },
      ]}
    />,
  );
  assert.deepEqual(states(view.container), ["upcoming", "complete", "current", "error", "waiting"]);
  const rows = Array.from(view.container.querySelectorAll("li"));
  // aria-current follows the resolved state, not the position.
  assert.deepEqual(
    rows.map((row) => row.getAttribute("aria-current")),
    [null, null, "step", null, null],
  );
  // The connector below a step fills only when that step is complete.
  assert.deepEqual(
    rows.map((row) => row.hasAttribute("data-complete")),
    [false, true, false, false, false],
  );
});

test("waiting steps and custom icons render in the marker", () => {
  const view = render(
    <Steps
      label="Approval"
      value={0}
      items={[
        { id: "a", title: "Sent", icon: <svg data-testid="sent-icon" /> },
        { id: "b", title: "Owner", status: "waiting" },
      ]}
    />,
  );
  const icon = view.getByTestId("sent-icon");
  const marker = icon.closest("[data-state]")!;
  assert.equal(marker.getAttribute("aria-hidden"), "true");
  assert.equal(marker.tagName, "SPAN");
  const waiting = view.container.querySelectorAll("li")[1]!;
  assert.equal(waiting.getAttribute("data-state"), "waiting");
  const waitingMarker = waiting.querySelector('span[aria-hidden="true"]')!;
  assert.equal(waitingMarker.getAttribute("data-state"), "waiting");
  assert.match(String(waitingMarker.getAttribute("class")), /\bborder-dashed\b/);
  assert.match(String(waitingMarker.getAttribute("class")), /\bborder-signal\b/);
  assert.equal(waitingMarker.textContent, "2");
  assert.match(String(waiting.textContent), /\(waiting\)/);
});

test("statusLabel replaces the screen-reader state", () => {
  const view = render(
    <Steps
      label="Setup"
      value={1}
      onValueChange={() => {}}
      items={[
        { id: "a", title: "Account", statusLabel: "done on Monday" },
        { id: "b", title: "Review", status: "waiting", statusLabel: "waiting for an answer" },
      ]}
    />,
  );
  assert.ok(view.getByRole("button", { name: "Account (done on Monday)" }));
  assert.ok(view.getByRole("button", { name: "Review (waiting for an answer)" }));
  const hidden = Array.from(view.container.querySelectorAll(".sr-only")).map((n) => n.textContent);
  assert.deepEqual(hidden, [" (done on Monday)", " (waiting for an answer)"]);
});

test("rich titles, meta lines and trailing asides render", () => {
  const view = render(<Steps label="History" variant="log" items={history} />);
  const code = view.getByText("SUBMIT");
  assert.equal(code.tagName, "CODE");
  assert.ok(view.getByText("ada · 14:01:52"));
  assert.ok(view.getByText("Closes after 24 h"));
  const aside = view.getByText("#3");
  assert.equal(aside.getAttribute("data-slot"), "steps-aside");
  assert.match(String(aside.getAttribute("class")), /\bms-auto\b/);
  assert.match(String(aside.getAttribute("class")), /\btabular-nums\b/);
  const meta = view.getByText("grace · 14:20:03");
  assert.equal(meta.getAttribute("data-slot"), "steps-meta");
  // Meta and aside sit with their own entry.
  const rows = Array.from(view.container.querySelectorAll("li"));
  assert.ok(rows[3]!.contains(meta));
  assert.ok(rows[2]!.contains(aside));
  // An entry without them renders neither part.
  const plain = render(<Steps label="Plain" items={[{ id: "a", title: "A" }]} />);
  assert.equal(plain.container.querySelector('[data-slot="steps-meta"]'), null);
  assert.equal(plain.container.querySelector('[data-slot="steps-aside"]'), null);
});

test("the log variant is a named, read-only log with each entry's own state", () => {
  const picked: number[] = [];
  const view = render(
    <Steps
      label="Document history"
      variant="log"
      value={1}
      onValueChange={(i) => picked.push(i)}
      orientation="horizontal"
      items={history}
    />,
  );
  const log = view.getByRole("log", { name: "Document history" });
  assert.equal(log.getAttribute("data-slot"), "steps");
  assert.equal(log.getAttribute("data-variant"), "log");
  // Horizontal is a progress layout: a log always reads top to bottom.
  assert.equal(log.getAttribute("data-orientation"), "vertical");
  assert.equal(view.queryAllByRole("navigation").length, 0);
  assert.equal(view.queryAllByRole("button").length, 0);
  assert.equal(view.container.querySelector("[aria-current]"), null);
  assert.equal(view.container.querySelector("[tabindex]"), null);
  // The list keeps its own semantics inside the log region.
  const list = view.getByRole("list");
  assert.equal(list.tagName, "OL");
  assert.ok(log.contains(list));
  assert.equal(view.getAllByRole("listitem").length, 4);
  // Without a status an entry is complete, whatever `value` says.
  assert.deepEqual(states(view.container), ["complete", "complete", "waiting", "complete"]);
  assert.ok(view.getByTestId("created-icon"));
  assert.match(String(view.container.textContent), /\(waiting for an answer\)/);
  assert.match(String(view.container.textContent), /Answered approve \(completed\)/);
  assert.deepEqual(picked, []);
});

test("in a log the connector below each entry follows that entry's state", () => {
  const view = render(
    <Steps
      label="Run"
      variant="log"
      items={[
        { id: "a", title: "Started" },
        { id: "b", title: "Asked", status: "waiting" },
        { id: "c", title: "Failed", status: "error" },
        { id: "d", title: "Running", status: "current" },
        { id: "e", title: "Next", status: "upcoming" },
        { id: "f", title: "Last" },
      ]}
    />,
  );
  const lines = Array.from(view.container.querySelectorAll("li")).map((row) =>
    String(row.getAttribute("class")),
  );
  assert.match(lines[0]!, /\bafter:bg-primary\b/);
  assert.match(lines[1]!, /\bafter:border-dashed\b/);
  assert.match(lines[1]!, /\bafter:border-signal\b/);
  assert.match(lines[2]!, /\bafter:bg-destructive\b/);
  assert.match(lines[3]!, /\bafter:bg-signal\b/);
  assert.match(lines[4]!, /\bafter:bg-border\b/);
  // The last entry has no connector.
  assert.doesNotMatch(lines[5]!, /after:content-/);
  for (const line of lines) assert.doesNotMatch(line, /data-\[complete\]/);
});

test("server markup hydrates unchanged for both variants", async () => {
  const tree = (
    <>
      <Steps label="Setup" items={setup} value={1} onValueChange={() => {}} />
      <Steps label="Checkout" items={setup} value={2} orientation="horizontal" />
      <Steps label="History" variant="log" items={history} />
    </>
  );
  const html = renderToString(tree);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  // Compare the DOM's own serialization before and after, so entity spelling can't differ.
  const server = container.innerHTML;
  assert.match(server, /role="log"/);
  const recoverable: unknown[] = [];
  const consoleErrors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void consoleErrors.push(args);
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: (error) => void recoverable.push(error),
      });
    });
  } finally {
    console.error = original;
  }
  assert.deepEqual(recoverable, []);
  assert.deepEqual(consoleErrors, []);
  assert.equal(container.innerHTML, server);
  await act(async () => root!.unmount());
  container.remove();
});

test("log and progress parts use logical properties, so RTL mirrors them", () => {
  const view = render(
    <div dir="rtl">
      <Steps label="History" variant="log" items={history} />
      <Steps
        label="Setup"
        items={[{ id: "a", title: "A", meta: "m", aside: "#1" }, ...setup]}
        value={1}
      />
    </div>,
  );
  const physical =
    /(?:^|\s|:)(?:ml|mr|pl|pr|left|right|text-left|text-right|border-l|border-r|rounded-l|rounded-r)-/;
  for (const element of Array.from(view.container.querySelectorAll("[class]")))
    assert.doesNotMatch(String(element.getAttribute("class")), physical);
  for (const aside of view.getAllByText(/^#\d$/))
    assert.match(String(aside.getAttribute("class")), /\bms-auto\b/);
  const rows = Array.from(view.container.querySelectorAll("li"));
  for (const row of rows.filter((_, i) => i !== 3 && i !== rows.length - 1))
    assert.match(String(row.getAttribute("class")), /after:start-\[/);
});
