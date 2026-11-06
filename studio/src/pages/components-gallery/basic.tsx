// Gallery demos: Actions, inputs, selection controls, feedback and layout (basic.tsx).
import * as C from "@samhagman/fast-ux-kit/components";
import { example, click, input, key, options, type ComponentFixture } from "./fixture-kit";

export const basicFixtures: Readonly<Record<string, ComponentFixture>> = {
  Button: example(
    "Save records an action below.",
    (s) => <C.Button onClick={() => s.report("Saved")}>Save</C.Button>,
    "button",
    [click("button", ".fixture-status", "Saved")],
  ),
  IconButton: example(
    "The icon has a named, full-size action target.",
    (s) => (
      <C.IconButton label="Add item" onClick={() => s.report("Added")}>
        +
      </C.IconButton>
    ),
    'button[aria-label="Add item"]',
    [click("button", ".fixture-status", "Added")],
  ),
  Link: example(
    "Open the linked section with a native link.",
    () => <C.Link href="#component-details">Component details</C.Link>,
    'a[href="#component-details"]',
  ),
  Toolbar: example(
    "Tab enters the toolbar; arrow keys move between actions.",
    (s) => (
      <C.Toolbar.Root aria-label="Formatting" className="fux-row">
        <C.Toolbar.Button className="fux-control" onClick={() => s.report("Bold")}>
          Bold
        </C.Toolbar.Button>
        <C.Toolbar.Button className="fux-control" onClick={() => s.report("Italic")}>
          Italic
        </C.Toolbar.Button>
      </C.Toolbar.Root>
    ),
    '[role="toolbar"]',
    [click("button", ".fixture-status", "Bold")],
  ),
  Field: example(
    "Edit a labeled text field.",
    (s) => <C.Field label="Project name" hint="A short working title." onValueChange={s.report} />,
    "input",
    [input("input", "Notebook")],
  ),
  TextArea: example(
    "Enter a multi-line note.",
    (s) => <C.TextArea label="Notes" rows={4} onValueChange={s.report} />,
    "textarea",
    [input("textarea", "A useful note")],
  ),
  SearchField: example(
    "Search text is reported as it changes.",
    (s) => <C.SearchField label="Search documents" onValueChange={s.report} />,
    'input[type="search"]',
    [input("input", "calendar")],
  ),
  NumberField: example(
    "Adjust a bounded quantity.",
    (s) => (
      <C.NumberField label="Copies" defaultValue={2} min={1} max={10} onValueChange={s.report} />
    ),
    "input",
    [click('button[aria-label="Increase"]', ".fixture-status", "3")],
  ),
  Checkbox: example(
    "Toggle a single preference.",
    (s) => <C.Checkbox label="Send updates" onCheckedChange={s.report} />,
    '[role="checkbox"]',
    [click('[role="checkbox"]', '[role="checkbox"][aria-checked="true"]')],
  ),
  CheckboxGroup: example(
    "Select several channels independently.",
    (s) => <C.CheckboxGroup label="Channels" options={options} onValueChange={s.report} />,
    '[role="checkbox"]',
    [click('[role="checkbox"]', ".fixture-status", "draft")],
  ),
  RadioGroup: example(
    "Select one stage.",
    (s) => <C.RadioGroup label="Stage" options={options} onValueChange={s.report} />,
    '[role="radiogroup"]',
    [click('[role="radio"]', ".fixture-status", "draft")],
  ),
  Switch: example(
    "Toggle automatic saving.",
    (s) => <C.Switch label="Autosave" onCheckedChange={s.report} />,
    '[role="switch"]',
    [click('[role="switch"]', '[role="switch"][aria-checked="true"]')],
  ),
  Slider: example(
    "Arrow keys adjust a numeric value.",
    (s) => <C.Slider label="Volume" defaultValue={30} onValueChange={s.report} />,
    'input[type="range"]',
    [key('input[type="range"]', "ArrowRight", ".fixture-status", "31")],
  ),
  ProgressBar: example(
    "A labeled progress indicator exposes its current value.",
    () => <C.ProgressBar label="Upload" value={65} />,
    '[role="progressbar"][aria-valuenow="65"]',
  ),
  Meter: example(
    "A meter describes a bounded measurement.",
    () => <C.Meter label="Storage" value={45} />,
    '[role="meter"][aria-valuenow="45"]',
  ),
  Form: example(
    "Submit a form without leaving this page.",
    (s) => (
      <C.Form
        onSubmit={(event) => {
          event.preventDefault();
          s.report("Submitted");
        }}
      >
        <C.Field label="Name" name="name" defaultValue="Example" />
        <C.Button type="submit">Submit</C.Button>
      </C.Form>
    ),
    "form",
    [click('button[type="submit"]', ".fixture-status", "Submitted")],
  ),
  Stack: example(
    "A vertical stack uses shared spacing tokens.",
    () => (
      <C.Stack>
        <C.Panel>First item</C.Panel>
        <C.Panel>Second item</C.Panel>
      </C.Stack>
    ),
    ".fux-stack > .fux-panel",
  ),
  Row: example(
    "A row aligns actions horizontally.",
    () => (
      <C.Row>
        <C.Button variant="outline">Cancel</C.Button>
        <C.Button>Save</C.Button>
      </C.Row>
    ),
    ".fux-row > button",
  ),
  Panel: example(
    "A neutral surface groups related information.",
    () => (
      <C.Panel>
        <h3>Document information</h3>
        <p>Updated just now.</p>
      </C.Panel>
    ),
    ".fux-panel h3",
  ),
  Editable: example(
    "Activate the title, edit it and press Enter.",
    (s) => <C.Editable label="Title" defaultValue="Untitled" onValueChange={s.report} />,
    'button[aria-label="Edit Title"]',
    [
      click("button", "input"),
      input("input", "New title", ""),
      key("input", "Enter", ".fixture-status", "New title"),
    ],
  ),
  Fieldset: example(
    "Related controls share a legend.",
    () => (
      <C.Fieldset legend="Preferences">
        <C.Checkbox label="Weekly summary" />
      </C.Fieldset>
    ),
    "fieldset[aria-labelledby]",
  ),
  PasswordInput: example(
    "Reveal or hide the password.",
    () => <C.PasswordInput label="Password" defaultValue="example-password" />,
    'input[type="password"]',
    [click('button[aria-label="Show password"]', 'input[type="text"]')],
  ),
  PinInput: example(
    "Enter a verification code one digit at a time.",
    (s) => <C.PinInput label="Verification code" length={4} onValueChange={s.report} />,
    "input",
    [input("input", "1", "1")],
  ),
};
