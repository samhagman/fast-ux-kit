import { dom } from "./components-dom.js";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Command, CommandInput, CommandItem, CommandList } from "../src/components/ui/command.js";

Object.defineProperty(globalThis, "AbortController", {
  configurable: true,
  value: dom.window.AbortController,
});
afterEach(() => cleanup());

test("typing in an inline command keeps the page scrolled where it was", async () => {
  const view = render(
    <div data-testid="page" style={{ overflowY: "auto" }}>
      <Command label="Commands">
        <CommandInput aria-label="Search commands" />
        <CommandList>
          <CommandItem value="light">Switch to light theme</CommandItem>
          <CommandItem value="dark">Switch to dark theme</CommandItem>
        </CommandList>
      </Command>
    </div>,
  );
  // jsdom has no layout: give the page a scrolled, overflowing box.
  const page = view.getByTestId("page");
  Object.defineProperty(page, "scrollHeight", { configurable: true, value: 4000 });
  Object.defineProperty(page, "clientHeight", { configurable: true, value: 600 });
  page.scrollTop = 1800;
  const input = view.getByRole("combobox", { name: "Search commands" });
  await act(async () => {
    input.focus();
    fireEvent.input(input, { target: { value: "dark" }, inputType: "insertText" });
    await Promise.resolve();
  });
  assert.equal(
    view.container.querySelector('[data-slot="command-item"]')?.textContent,
    "Switch to dark theme",
    "the query filters the list",
  );
  assert.equal(page.scrollTop, 1800, "the page did not jump to the top");
});
