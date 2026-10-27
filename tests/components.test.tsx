import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";

// Browser globals must exist before React Aria's DOM feature checks initialize.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://reader.test/",
  pretendToBeVisual: true,
});
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "Element",
  "Node",
  "NodeFilter",
  "Document",
  "DocumentFragment",
  "SVGElement",
  "MutationObserver",
  "Event",
  "CustomEvent",
  "EventTarget",
  "FocusEvent",
  "KeyboardEvent",
  "MouseEvent",
] as const) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}
for (const name of ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"] as const) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: dom.window[name].bind(dom.window),
  });
}
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
// jsdom lacks CSS.escape; React Aria uses it when looking up CSP metadata.
Object.defineProperty(globalThis, "CSS", {
  configurable: true,
  value: {
    escape: (value: string) =>
      [...String(value)]
        .map((char) =>
          /[a-zA-Z0-9_-]/.test(char) ? char : `\\${char.codePointAt(0)!.toString(16)} `,
        )
        .join(""),
  },
});
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { Button, IconButton, Field, Checkbox, Pagination, Link, ModalDialog, Stack, Row, Panel } =
  await import("../src/components/index.js");
const browserErrors: unknown[] = [];
dom.window.addEventListener("error", (event) => browserErrors.push(event.error));
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught browser errors");
});

test("RAC and Ark controls share classes and react to their own event system", async () => {
  let presses = 0;
  const pages: number[] = [];
  const view = render(
    <>
      <Button variant="primary" onPress={() => presses++}>
        Save
      </Button>
      <Pagination label="Results" count={30} onPageChange={(page) => pages.push(page)} />
    </>,
  );
  const save = view.getByRole("button", { name: "Save" });
  const next = view.getByRole("button", { name: "Next" });
  assert.equal(save.className, next.className);
  assert.equal(save.getAttribute("data-variant"), "primary");
  fireEvent.click(save);
  assert.equal(presses, 1);
  assert.ok((view.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled);
  await act(async () => {
    fireEvent.click(next);
  });
  assert.deepEqual(pages, [2]);
  await act(async () => {
    fireEvent.click(next);
  });
  assert.deepEqual(pages, [2, 3]);
  assert.ok((next as HTMLButtonElement).disabled);
});

test("controlled Ark pagination waits for host and supports page size", async () => {
  const pages: number[] = [];
  const view = render(
    <Pagination
      label="Search pages"
      count={12}
      pageSize={4}
      page={1}
      onPageChange={(page) => pages.push(page)}
    />,
  );
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Next" }));
  });
  assert.deepEqual(pages, [2]);
  assert.ok((view.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled);
  await act(async () => {
    view.rerender(
      <Pagination
        label="Search pages"
        count={12}
        pageSize={4}
        page={2}
        onPageChange={(page) => pages.push(page)}
      />,
    );
  });
  assert.equal(
    (view.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled,
    false,
  );
});

test("fields and icon-only controls require usable accessible labels", async () => {
  let name = "";
  let checked = false;
  const view = render(
    <>
      <Field label="Title" hint="Use a short title" onChange={(value) => (name = value)} />
      <IconButton label="Close">×</IconButton>
      <Checkbox label="Enabled" onChange={(value) => (checked = value)} />
    </>,
  );
  const input = view.getByRole("textbox", { name: "Title" });
  await act(async () => {
    fireEvent.change(input, { target: { value: "New title" } });
  });
  assert.equal(name, "New title");
  assert.ok(input.getAttribute("aria-describedby"));
  assert.ok(view.getByRole("button", { name: "Close" }));
  await act(async () => {
    fireEvent.click(view.getByRole("checkbox", { name: "Enabled" }));
  });
  assert.equal(checked, true);
});

test("shared controls keep keyboard activation and disabled semantics", async () => {
  let presses = 0;
  const view = render(<Button onPress={() => presses++}>Run</Button>);
  const button = view.getByRole("button", { name: "Run" });
  await act(async () => button.focus());
  await act(async () => {
    fireEvent.keyDown(button, { key: "Enter", code: "Enter", charCode: 13 });
    fireEvent.keyUp(button, { key: "Enter", code: "Enter", charCode: 13 });
  });
  assert.equal(presses, 1);
  assert.equal(document.activeElement, button);
  await act(async () => {
    view.rerender(
      <Button isDisabled onPress={() => presses++}>
        Run
      </Button>,
    );
  });
  fireEvent.click(button);
  assert.equal(presses, 1);
});

test("pagination rejects malformed count and pageSize", () => {
  assert.throws(() => renderToString(<Pagination label="Pages" count={-1} />), /non-negative/);
  assert.throws(
    () => renderToString(<Pagination label="Pages" count={5} pageSize={0} />),
    /positive/,
  );
});

test("refs, layout variants and true links retain native semantics", () => {
  let target: HTMLButtonElement | null = null;
  const view = render(
    <Panel padding="lg">
      <Stack gap="sm">
        <Row justify="between" wrap>
          <Button
            ref={(node) => {
              target = node;
            }}
            fullWidth
          >
            Save all
          </Button>
          <Link href="#details" variant="block">
            Details
          </Link>
        </Row>
      </Stack>
    </Panel>,
  );
  assert.equal(target, view.getByRole("button", { name: "Save all" }));
  assert.equal(view.getByRole("button", { name: "Save all" }).getAttribute("data-full"), "true");
  assert.equal(view.getByRole("link", { name: "Details" }).getAttribute("href"), "#details");
  assert.ok(view.container.querySelector('.fux-row[data-justify="between"][data-wrap="true"]'));
});

test("explicit errors cannot be hidden by an isInvalid false prop", () => {
  const view = render(<Field label="Name" error="Name is required" isInvalid={false} />);
  assert.equal(view.getByRole("textbox", { name: "Name" }).getAttribute("aria-invalid"), "true");
  assert.ok(view.getByText("Name is required"));
});

test("modal uses accessible title and explicit close ownership", async () => {
  const changes: boolean[] = [];
  const view = render(
    <ModalDialog title="Review" isOpen onOpenChange={(value) => changes.push(value)}>
      Review content
    </ModalDialog>,
  );
  assert.ok(view.getByRole("dialog", { name: "Review" }));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Close" }));
  });
  assert.deepEqual(changes, [false]);
});
