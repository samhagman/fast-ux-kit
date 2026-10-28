import { useMemo, useRef, useState } from "react";
import {
  EnvironmentProvider,
  LocaleProvider,
  Frame,
  createListCollection,
  createTreeCollection,
  ClientOnly,
  Portal,
  Presence,
  FocusTrap,
  Swap,
  FormatByte,
  FormatNumber,
  FormatTime,
  FormatRelativeTime,
  Highlight,
  useHotkey,
} from "../../../src/ark/index.js";
import type { ComponentDemo } from "./aria-demos.js";

function EnvironmentDemo() {
  const [locale, setLocale] = useState("en-US");
  const [frameOpen, setFrameOpen] = useState(false);
  return (
    <EnvironmentProvider>
      <div className="fux-stack" data-gap="md">
        <label className="fux-field">
          Formatting locale
          <select
            className="fux-input"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
          >
            <option value="en-US">English (US)</option>
            <option value="fr-FR">French</option>
            <option value="de-DE">German</option>
          </select>
        </label>
        <LocaleProvider locale={locale}>
          <output aria-live="polite">
            <FormatNumber value={1234.56} style="currency" currency="EUR" />
          </output>
        </LocaleProvider>
        <button className="fux-control" onClick={() => setFrameOpen((value) => !value)}>
          {frameOpen ? "Close isolated preview" : "Open isolated preview"}
        </button>
        {frameOpen && (
          <Frame
            title="Isolated document preview"
            className="fux-panel"
            style={{ inlineSize: "100%", blockSize: "7rem" }}
            head={
              <style>
                {"body{font:16px/1.5 system-ui;margin:16px;color:#202124;background:#fff}"}
              </style>
            }
          >
            <p>This content renders into an isolated document.</p>
          </Frame>
        )}
      </div>
    </EnvironmentProvider>
  );
}
function CollectionsDemo() {
  const [query, setQuery] = useState("");
  const items = useMemo(
    () => [
      { id: "draft", label: "Draft" },
      { id: "review", label: "Review" },
      { id: "done", label: "Done" },
    ],
    [],
  );
  const collection = useMemo(
    () =>
      createListCollection({
        items: items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
        itemToValue: (item) => item.id,
        itemToString: (item) => item.label,
      }),
    [items, query],
  );
  const tree = useMemo(
    () =>
      createTreeCollection({
        rootNode: {
          id: "root",
          label: "Workspace",
          children: [
            { id: "notes", label: "Notes" },
            { id: "files", label: "Files" },
          ],
        },
        nodeToValue: (node) => node.id,
        nodeToString: (node) => node.label,
      }),
    [],
  );
  return (
    <div className="fux-stack" data-gap="md">
      <label className="fux-field">
        Filter collection
        <input
          className="fux-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <output aria-live="polite">
        {collection.size} items:{" "}
        {collection.items.map((item) => item.label).join(", ") || "No matches"}
      </output>
      <div className="fux-panel" data-padding="md">
        Tree values: {tree.getValues().join(", ")}
      </div>
      <p className="fux-hint">
        Collections are data helpers. They do not render or manage a second selectable control.
      </p>
    </div>
  );
}
function MountingDemo() {
  const [shown, setShown] = useState(false);
  const [trapped, setTrapped] = useState(false);
  const portal = useRef<HTMLDivElement>(null);
  const trap = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const [action, setAction] = useState("No exercise action yet");
  return (
    <div className="fux-stack" data-gap="md">
      <ClientOnly fallback={<span>Server-rendered fallback</span>}>
        <span>Client-only content is mounted.</span>
      </ClientOnly>
      <button
        className="fux-control"
        onClick={() => setShown((value) => !value)}
        aria-expanded={shown}
        aria-label={shown ? "Hide mounted content" : "Show mounted content"}
      >
        <Swap.Root swap={shown} unmountOnExit>
          <Swap.Indicator type="on">Hide mounted content</Swap.Indicator>
          <Swap.Indicator type="off">Show mounted content</Swap.Indicator>
        </Swap.Root>
      </button>
      <Presence present={shown} unmountOnExit>
        <div className="fux-panel" data-padding="md">
          Presence-controlled content
        </div>
      </Presence>
      <div
        ref={portal}
        hidden={!shown}
        className="fux-panel"
        data-padding="md"
        aria-label="Local portal destination"
      />
      {shown && (
        <Portal container={portal}>
          <span>Content rendered into the local portal destination.</span>
        </Portal>
      )}
      <button className="fux-control" onClick={() => setTrapped(true)} disabled={trapped}>
        Start focus exercise
      </button>
      <FocusTrap
        disabled={!trapped}
        initialFocus={() => first.current}
        fallbackFocus={() => trap.current!}
        returnFocusOnDeactivate
      >
        <div
          ref={trap}
          tabIndex={-1}
          role="group"
          aria-label="Focus exercise"
          className="fux-panel"
          data-padding="md"
        >
          <p>
            {trapped
              ? "Tab stays within these controls. Finish the exercise to leave."
              : "The focus exercise is inactive."}
          </p>
          <div className="fux-row" data-gap="sm" data-wrap="true">
            <button
              ref={first}
              className="fux-control"
              onClick={() => setAction("First control activated")}
            >
              First control
            </button>
            <button className="fux-control" onClick={() => setAction("Second control activated")}>
              Second control
            </button>
            <button className="fux-control" onClick={() => setTrapped(false)}>
              Finish focus exercise
            </button>
          </div>
          <output aria-live="polite">{action}</output>
        </div>
      </FocusTrap>
    </div>
  );
}
function FormattingDemo() {
  const [query, setQuery] = useState("clear");
  return (
    <LocaleProvider locale="en-US">
      <div className="fux-stack" data-gap="md">
        <dl>
          <dt>Number</dt>
          <dd>
            <FormatNumber value={12345.67} maximumFractionDigits={1} />
          </dd>
          <dt>File size</dt>
          <dd>
            <FormatByte value={2_500_000} unitDisplay="long" />
          </dd>
          <dt>Time</dt>
          <dd>
            <FormatTime value="14:30" />
          </dd>
          <dt>Relative time</dt>
          <dd>
            <FormatRelativeTime value={new Date("2026-10-25T12:00:00Z")} />
          </dd>
        </dl>
        <label className="fux-field">
          Highlight query
          <input
            className="fux-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p>
          <Highlight
            text="Clear labels and a clear structure make everyday work easier."
            query={query}
            ignoreCase
            matchAll
          />
        </p>
      </div>
    </LocaleProvider>
  );
}
function HotkeysDemo() {
  const area = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [count, setCount] = useState(0);
  useHotkey({
    id: "utility-demo-scoped-action",
    hotkey: "shift+k",
    enabled,
    action: () => setCount((value) => value + 1),
    options: {
      target: () => area.current,
      preventDefault: true,
      enableOnFormTags: false,
      enableOnContentEditable: false,
      requireReset: true,
    },
  });
  return (
    <div className="fux-stack" data-gap="md">
      <button
        className="fux-control"
        aria-pressed={enabled}
        onClick={() => setEnabled((value) => !value)}
      >
        {enabled ? "Disable local shortcut" : "Enable local shortcut"}
      </button>
      <div
        ref={area}
        tabIndex={0}
        className="fux-panel"
        data-padding="lg"
        role="group"
        aria-label="Shortcut practice area"
      >
        <p>
          Focus this area and press Shift+K. The shortcut is local and never captures text input.
        </p>
        <label className="fux-field">
          Typing stays ordinary
          <input className="fux-input" />
        </label>
      </div>
      <output aria-live="polite">Shortcut activated {count} times</output>
    </div>
  );
}

export const arkUtilityDemos: Record<string, ComponentDemo> = {
  "Optional owner environment": {
    render: () => <EnvironmentDemo />,
    code: `import { EnvironmentProvider, LocaleProvider, FormatNumber, Frame } from "@samhagman/fast-ux-kit/ark";

<EnvironmentProvider>
  <LocaleProvider locale="fr-FR"><FormatNumber value={1234.56} style="currency" currency="EUR" /></LocaleProvider>
  <Frame title="Isolated preview"><p>Content in another document.</p></Frame>
</EnvironmentProvider>`,
    notes: [
      "Environment and locale providers scope the optional owner only. Keep locale/direction consistent with the default owner.",
      "Frames need their own style and theme setup; this demo has no external source or scripts.",
    ],
  },
  "Optional collections": {
    render: () => <CollectionsDemo />,
    code: `import { createListCollection, createTreeCollection } from "@samhagman/fast-ux-kit/ark";

const collection = createListCollection({
  items: [{ id: "draft", label: "Draft" }],
  itemToValue: item => item.id,
  itemToString: item => item.label
});
const tree = createTreeCollection({
  rootNode: { id: "root", label: "Workspace", children: [{ id: "notes", label: "Notes" }] },
  nodeToValue: node => node.id,
  nodeToString: node => node.label
});`,
    notes: ["Keep collection IDs stable. Data helpers are not extra visual family counts."],
  },
  "Mounting and presence": {
    render: () => <MountingDemo />,
    code: `import { ClientOnly, Portal, Presence, FocusTrap, Swap } from "@samhagman/fast-ux-kit/ark";

<ClientOnly fallback={<span>Loading client content</span>}><span>Client content</span></ClientOnly>
<Presence present={shown} unmountOnExit><section>Conditional content</section></Presence>
<Portal container={destinationRef}><p>Local portal content</p></Portal>
<Swap.Root swap={shown}><Swap.Indicator type="on">Hide</Swap.Indicator><Swap.Indicator type="off">Show</Swap.Indicator></Swap.Root>
<FocusTrap disabled={!active} returnFocusOnDeactivate><div tabIndex={-1}>
  <button onClick={() => setActive(false)}>Finish</button>
</div></FocusTrap>`,
    notes: [
      "Never add FocusTrap inside a dialog, drawer or popover that already manages focus.",
      "Presence is lifecycle coordination, not an animation mandate. Reduced-motion preferences still apply.",
    ],
  },
  "Formatting and text": {
    render: () => <FormattingDemo />,
    code: `import { LocaleProvider, FormatNumber, FormatByte, FormatTime, FormatRelativeTime, Highlight } from "@samhagman/fast-ux-kit/ark";

<LocaleProvider locale="en-US">
  <FormatNumber value={12345.67} maximumFractionDigits={1} />
  <FormatByte value={2500000} unitDisplay="long" />
  <FormatTime value="14:30" />
  <FormatRelativeTime value={new Date("2026-10-25T12:00:00Z")} />
  <Highlight text="A clear structure" query="clear" ignoreCase matchAll />
</LocaleProvider>`,
    notes: [
      "Relative time depends on the current clock. This time formatter uses wall-clock time strings, not time-zone conversion.",
      "Highlight renders text, not user-provided HTML.",
    ],
  },
  "Optional hotkeys": {
    render: () => <HotkeysDemo />,
    code: `import { useHotkey } from "@samhagman/fast-ux-kit/ark";

const region = useRef<HTMLDivElement>(null);
useHotkey({
  hotkey: "shift+k", enabled,
  action: () => setCount(value => value + 1),
  options: { target: () => region.current, preventDefault: true, enableOnFormTags: false, requireReset: true }
});
<div ref={region} tabIndex={0}>Focus here to use the shortcut.</div>`,
    notes: [
      "Register shortcuts at a deliberate scope. Never override text editing or an interactive control's own arrow-key navigation.",
      "The demo is opt-in and unregisters when unmounted.",
    ],
  },
};
