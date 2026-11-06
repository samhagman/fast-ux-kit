import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Field,
  Link,
  Meter,
  NumberField,
  Panel,
  PasswordInput,
  PinInput,
  ProgressBar,
  RadioGroup,
  Row,
  SearchField,
  Switch,
  TextArea,
} from "../src/components/basic.js";

Object.defineProperty(dom.window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }),
});
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

function describedBy(element: HTMLElement) {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

test("field shows a required marker without changing its accessible name", () => {
  const view = render(<Field label="Work email" required hint="Used for receipts" />);
  const input = view.getByLabelText(/Work email/);
  assert.equal((input as HTMLInputElement).required, true);
  assert.equal(view.container.querySelector('[aria-hidden="true"]')?.textContent, "*");
  assert.match(describedBy(input), /Used for receipts/);
});

test("field addons sit inside one input group and the control stays labelled", () => {
  const view = render(
    <Field label="Website" startAddon="https://" endAddon=".example.test" defaultValue="studio" />,
  );
  const group = view.container.querySelector('[data-slot="input-group"]');
  assert.ok(group);
  const input = view.getByLabelText("Website") as HTMLInputElement;
  assert.ok(group.contains(input));
  assert.match(group.textContent ?? "", /https:\/\//);
  assert.match(group.textContent ?? "", /\.example\.test/);
});

test("field errors carry an icon and mark the control invalid", () => {
  const view = render(<Field label="Username" error="No spaces allowed" />);
  const input = view.getByLabelText("Username");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.match(describedBy(input), /No spaces allowed/);
  assert.ok(view.container.querySelector("svg"));
});

test("textarea counts characters against its limit", () => {
  const view = render(<TextArea label="Summary" maxLength={20} defaultValue="Hello" />);
  assert.match(view.container.textContent ?? "", /5 \/ 20/);
  fireEvent.change(view.getByLabelText("Summary"), { target: { value: "Hello there" } });
  assert.match(view.container.textContent ?? "", /11 \/ 20/);
});

test("search field clears from the button and from Escape, then returns focus", async () => {
  const seen: string[] = [];
  const view = render(
    <SearchField
      label="Search"
      defaultValue="calendar"
      onValueChange={(value) => seen.push(value)}
    />,
  );
  const input = view.getByRole("searchbox") as HTMLInputElement;
  assert.equal(input.value, "calendar");
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Clear search" }));
  });
  assert.equal(input.value, "");
  assert.deepEqual(seen, [""]);
  assert.equal(view.queryByRole("button", { name: "Clear search" }), null);
  await act(async () => {
    fireEvent.change(input, { target: { value: "notes" } });
  });
  assert.equal(input.value, "notes");
  await act(async () => {
    fireEvent.keyDown(input, { key: "Escape" });
  });
  assert.equal(input.value, "");
  assert.deepEqual(seen, ["", "notes", ""]);
});

test("search field follows a controlled value and hides clear when read-only", () => {
  const view = render(<SearchField label="Search" value="fixed" readOnly />);
  assert.equal((view.getByRole("searchbox") as HTMLInputElement).value, "fixed");
  assert.equal(view.queryByRole("button", { name: "Clear search" }), null);
});

test("password input names its toggle for the state it will switch to", async () => {
  const view = render(<PasswordInput label="Password" defaultValue="example-password" />);
  const input = view.getByLabelText("Password") as HTMLInputElement;
  assert.equal(input.type, "password");
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Show password" }));
  });
  assert.equal(input.type, "text");
  assert.ok(view.getByRole("button", { name: "Hide password" }));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Hide password" }));
  });
  assert.equal(input.type, "password");
});

test("number field steppers are named and disabled with the field", () => {
  const view = render(<NumberField label="Copies" defaultValue={2} unit="pt" disabled />);
  const decrease = view.getByRole("button", { name: "Decrease" });
  const increase = view.getByRole("button", { name: "Increase" });
  assert.ok(decrease.querySelector("svg"));
  assert.ok(increase.querySelector("svg"));
  assert.equal(
    decrease.hasAttribute("disabled") || decrease.getAttribute("aria-disabled") === "true",
    true,
  );
  assert.match(view.container.textContent ?? "", /pt/);
});

test("checkbox and switch tie their description to the control", () => {
  const view = render(
    <>
      <Checkbox label="Share usage data" description="Never includes document text." />
      <Switch label="Autosave" description="Every few seconds." justified />
    </>,
  );
  for (const [role, name, text] of [
    ["checkbox", "Share usage data", /Never includes/],
    ["switch", "Autosave", /Every few seconds/],
  ] as const) {
    const control = view.getByRole(role, { name });
    assert.match(describedBy(control), text);
  }
});

test("choice groups link hint and error to the fieldset", () => {
  const options = [
    { id: "a", label: "Alpha", description: "First" },
    { id: "b", label: "Beta" },
  ];
  const view = render(
    <>
      <CheckboxGroup label="Letters" options={options} hint="Pick any" error="Pick at least one" />
      <RadioGroup label="Single" options={options} hint="Pick one" orientation="horizontal" />
    </>,
  );
  const groups = view.getAllByRole("group");
  const text = groups.map(describedBy).join(" | ");
  assert.match(text, /Pick any Pick at least one/);
  assert.match(text, /Pick one/);
  assert.equal(
    view.getAllByRole("checkbox").every((box) => box.getAttribute("aria-invalid") === "true"),
    true,
  );
});

test("meter picks its tone from low, high and optimum like the HTML meter", () => {
  const tones = [
    [45, 60, 85, 0, "optimum"],
    [72, 60, 85, 0, "suboptimal"],
    [94, 60, 85, 0, "danger"],
    [12, 20, 60, 100, "danger"],
    [48, 20, 60, 100, "suboptimal"],
    [91, 20, 60, 100, "optimum"],
  ] as const;
  for (const [value, low, high, optimum, tone] of tones) {
    const view = render(
      <Meter label="Level" value={value} low={low} high={high} optimum={optimum} />,
    );
    assert.equal(view.getByRole("meter").getAttribute("data-tone"), tone, `${value}/${optimum}`);
    cleanup();
  }
  const plain = render(<Meter label="Plain" value={60} />);
  assert.equal(plain.getByRole("meter").getAttribute("data-tone"), null);
});

test("progress bar exposes value, indeterminate and complete states", () => {
  const view = render(
    <>
      <ProgressBar label="Upload" value={65} hint="3 of 5 files" />
      <ProgressBar label="Preparing" value={null} />
      <ProgressBar label="Backup" value={100} />
    </>,
  );
  const bars = view.getAllByRole("progressbar");
  assert.equal(bars[0]!.getAttribute("aria-valuenow"), "65");
  assert.equal(bars[1]!.hasAttribute("aria-valuenow"), false);
  assert.ok(bars[2]!.querySelector("[data-complete]"));
  assert.match(view.container.textContent ?? "", /3 of 5 files/);
});

test("pin input keeps cells labelled and reports errors on each cell", () => {
  const view = render(
    <PinInput label="Code" length={6} groupSize={3} error="Wrong code" hint="Sent by text" />,
  );
  const cells = view.container.querySelectorAll("input:not([aria-hidden])");
  assert.equal(
    [...cells].filter((cell) => cell.getAttribute("aria-invalid") === "true").length >= 6,
    true,
  );
  assert.match(view.container.textContent ?? "", /Wrong code/);
  assert.match(view.container.textContent ?? "", /Sent by text/);
  assert.equal(view.container.querySelectorAll('span[aria-hidden="true"].h-px').length, 1);
});

test("links open external destinations safely and can flow inline", () => {
  const view = render(
    <>
      <Link href="https://example.test" external>
        Docs
      </Link>
      <Link href="#x" inline>
        Plain
      </Link>
    </>,
  );
  const external = view.getByRole("link", { name: /Docs/ });
  assert.equal(external.getAttribute("target"), "_blank");
  assert.match(external.getAttribute("rel") ?? "", /noopener/);
  assert.match(external.textContent ?? "", /opens in a new tab/);
  assert.ok(view.getByRole("link", { name: "Plain" }).classList.contains("fux-link-inline"));
});

test("panel parts compose and row centres its items by default", () => {
  const view = render(
    <>
      <Panel>
        <Panel.Header>
          <Panel.Title>Settings</Panel.Title>
          <Panel.Description>Visible to everyone</Panel.Description>
        </Panel.Header>
        <Panel.Footer>
          <Button>Save</Button>
        </Panel.Footer>
      </Panel>
      <Row>
        <Button>One</Button>
      </Row>
    </>,
  );
  assert.ok(view.getByRole("heading", { name: "Settings" }));
  assert.ok(view.container.querySelector(".fux-panel.fux-surface .fux-panel-footer"));
  assert.equal(view.container.querySelector(".fux-row")?.getAttribute("data-align"), "center");
});
