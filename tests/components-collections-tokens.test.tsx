import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { dom } from "./components-dom.js";

const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { TokenField } = await import("../src/components/collections.js");

class PointerEventStub extends dom.window.MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
Object.defineProperty(dom.window, "PointerEvent", { configurable: true, value: PointerEventStub });
Object.defineProperty(globalThis, "PointerEvent", { configurable: true, value: PointerEventStub });
Object.defineProperty(dom.window.Element.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
});
afterEach(async () => {
  await act(async () => {
    cleanup();
  });
});

const labels = [
  { id: "design", label: "design" },
  { id: "research", label: "research" },
  { id: "engineering", label: "engineering" },
  { id: "legal", label: "legal", disabled: true },
];

test("tokens autocomplete: typing filters a list of suggestions, and picking one adds its chip", async () => {
  const picked: string[][] = [];
  const view = render(
    <TokenField
      label="Labels"
      suggestions={labels}
      onValueChange={(tokens) => picked.push(tokens.map((token) => token.label))}
    />,
  );
  const input = view.getByRole("combobox", { name: "Labels" });
  assert.equal(input.getAttribute("aria-autocomplete"), "list");
  input.focus();
  fireEvent.keyDown(input, { key: "ArrowDown" }); // ↓ opens the list
  await waitFor(() => assert.equal(input.getAttribute("aria-expanded"), "true"));
  fireEvent.input(input, { target: { value: "res" } });
  await waitFor(() =>
    assert.deepEqual(
      view.getAllByRole("option").map((o) => o.textContent),
      ["research"],
    ),
  );
  fireEvent.click(view.getByRole("option", { name: "research" }));
  await waitFor(() => assert.deepEqual(picked.at(-1), ["research"]));
  assert.ok(view.getByRole("button", { name: "Remove research" }), "the pick became a chip");
  assert.equal((input as HTMLInputElement).value, "", "the typed text clears");
});

test("tokens autocomplete: Enter with nothing highlighted adds what was typed (free typing)", async () => {
  const picked: string[][] = [];
  const view = render(
    <TokenField
      label="People"
      suggestions={labels}
      createToken={(text) => ({ id: text, label: text })}
      onValueChange={(tokens) => picked.push(tokens.map((token) => token.label))}
    />,
  );
  const input = view.getByRole("combobox", { name: "People" });
  input.focus();
  fireEvent.keyDown(input, { key: "ArrowDown" }); // ↓ opens the list
  await waitFor(() => assert.equal(input.getAttribute("aria-expanded"), "true"));
  fireEvent.input(input, { target: { value: "Quinn" } });
  await waitFor(() => assert.ok(view.getByText("Press Enter to add “Quinn”")));
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => assert.deepEqual(picked.at(-1), ["Quinn"]));
});

test("autocomplete={false}: no list, and Enter adds an exact suggestion", () => {
  const picked: string[][] = [];
  const view = render(
    <TokenField
      label="Labels"
      autocomplete={false}
      suggestions={labels}
      onValueChange={(tokens) => picked.push(tokens.map((token) => token.label))}
    />,
  );
  assert.equal(view.queryByRole("combobox"), null, "a plain text field, no suggestion list");
  const input = view.getByRole("textbox", { name: "Labels" });
  fireEvent.change(input, { target: { value: "design" } });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.deepEqual(picked.at(-1), ["design"]);
});
