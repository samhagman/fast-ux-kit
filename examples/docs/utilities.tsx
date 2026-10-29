import { useState } from "react";
import * as A from "../../src/aria/index.js";
import { Button, Field, Primitives as P, Row } from "../../src/components/aria.js";
import { Code, DemoFrame, Notice, PageHeading, type ComponentDemo } from "./ui.js";
import { arkUtilityDemos } from "./demos/ark-utility-demos.js";

import { utilityPages } from "./catalog.js";
const sampleItems = [
  { id: "design", name: "Design principles" },
  { id: "research", name: "Research notes" },
  { id: "delivery", name: "Delivery checklist" },
  { id: "review", name: "Review questions" },
];
function AutocompleteDemo() {
  const { contains } = A.useFilter({ sensitivity: "base" });
  const [selected, setSelected] = useState("None yet");
  return (
    <div className="utility-demo">
      <P.Autocomplete filter={contains}>
        <P.SearchField>
          <P.Label>Find a note</P.Label>
          <P.Input placeholder="Try research" />
        </P.SearchField>
        <P.ListBox
          aria-label="Matching notes"
          items={sampleItems}
          selectionMode="single"
          onSelectionChange={(keys) =>
            setSelected(
              keys === "all"
                ? "All"
                : (sampleItems.find((item) => keys.has(item.id))?.name ?? "None yet"),
            )
          }
          renderEmptyState={() => "No matching notes"}
        >
          {(item) => <P.ListBoxItem id={item.id}>{item.name}</P.ListBoxItem>}
        </P.ListBox>
      </P.Autocomplete>
      <p className="demo-status" role="status">
        Selected: {selected}
      </p>
    </div>
  );
}
const manyItems = Array.from({ length: 500 }, (_, index) => ({
  id: String(index + 1),
  name: `Note ${String(index + 1).padStart(3, "0")}`,
}));
function VirtualizerDemo() {
  const [selected, setSelected] = useState("None yet");
  return (
    <div className="utility-demo">
      <P.Virtualizer layout={A.ListLayout} layoutOptions={{ rowHeight: 48 }}>
        <P.ListBox
          aria-label="Five hundred notes"
          items={manyItems}
          selectionMode="single"
          style={{ height: 260, overflow: "auto", padding: 0 }}
          onSelectionChange={(keys) =>
            setSelected(keys === "all" ? "All" : [...keys].join(", ") || "None yet")
          }
        >
          {(item) => <P.ListBoxItem id={item.id}>{item.name}</P.ListBoxItem>}
        </P.ListBox>
      </P.Virtualizer>
      <p className="demo-status" role="status">
        500 data items · selected: {selected}
      </p>
    </div>
  );
}
function CollectionsDemo() {
  const list = A.useListData({
    initialItems: sampleItems,
    filter: (item, filterText) => item.name.toLowerCase().includes(filterText.toLowerCase()),
  });
  const [next, setNext] = useState(1);
  return (
    <div className="utility-demo">
      <Field label="Filter this collection" value={list.filterText} onChange={list.setFilterText} />
      <P.ListBox
        aria-label="Editable notes"
        items={list.items}
        selectionMode="multiple"
        selectedKeys={list.selectedKeys}
        onSelectionChange={list.setSelectedKeys}
        renderEmptyState={() => "No notes match"}
      >
        {(item) => <P.ListBoxItem id={item.id}>{item.name}</P.ListBoxItem>}
      </P.ListBox>
      <Row wrap>
        <Button
          onPress={() => {
            list.append({ id: `new-${next}`, name: `New note ${next}` });
            setNext(next + 1);
          }}
        >
          Add a note
        </Button>
        <Button
          isDisabled={list.selectedKeys !== "all" && list.selectedKeys.size === 0}
          onPress={() => list.removeSelectedItems()}
        >
          Remove selected
        </Button>
      </Row>
      <p className="demo-status" role="status">
        {list.items.length} visible notes · changes stay in this demo
      </p>
    </div>
  );
}
function DragDemo() {
  const list = A.useListData({ initialItems: sampleItems });
  const { dragAndDropHooks } = A.useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": list.getItem(key)?.name ?? "" })),
    onReorder(event) {
      if (event.target.dropPosition === "before") list.moveBefore(event.target.key, event.keys);
      else if (event.target.dropPosition === "after") list.moveAfter(event.target.key, event.keys);
    },
    renderDropIndicator: (target) => <P.DropIndicator target={target} />,
  });
  return (
    <div className="utility-demo">
      <P.GridList
        aria-label="Reorder notes"
        items={list.items}
        selectionMode="multiple"
        dragAndDropHooks={dragAndDropHooks}
      >
        {(item) => (
          <P.GridListItem id={item.id} textValue={item.name}>
            <P.Button slot="drag" aria-label={`Move ${item.name}`}>
              ↕
            </P.Button>
            <P.Text>{item.name}</P.Text>
          </P.GridListItem>
        )}
      </P.GridList>
      <p className="fux-hint">
        Focus a Move button and press Enter to begin keyboard drag. Use arrows to choose a target;
        Enter drops and Escape cancels.
      </p>
      <p className="demo-status" role="status">
        Order: {list.items.map((item) => item.name).join(" → ")}
      </p>
    </div>
  );
}
function PreviewDemo() {
  return (
    <div className="utility-demo">
      <P.PreviewTrigger delay={250}>
        <P.Link href="#outline">Preview the reader</P.Link>
        <P.Popover>
          <h3>A quiet reading surface</h3>
          <p>Fold the detail without changing the document.</p>
          <P.Link href="#outline">Open the reader example</P.Link>
        </P.Popover>
      </P.PreviewTrigger>
      <p className="fux-hint">
        Hover, focus, or long-press for supplementary context. The link works without the preview.
      </p>
    </div>
  );
}
function SharedDemo() {
  const [side, setSide] = useState(0);
  return (
    <div className="utility-demo">
      <P.SharedElementTransition>
        <div className="shared-demo-lanes">
          {[0, 1].map((index) => (
            <div key={index} className="shared-demo-lane">
              <span>{index ? "Ready" : "In progress"}</span>
              <P.SharedElement
                name="work-item"
                isVisible={side === index}
                className="shared-demo-item"
              >
                A useful idea
              </P.SharedElement>
            </div>
          ))}
        </div>
      </P.SharedElementTransition>
      <Button onPress={() => setSide(side ? 0 : 1)}>
        Move idea to {side ? "In progress" : "Ready"}
      </Button>
      <p className="demo-status" role="status">
        Current stage: {side ? "Ready" : "In progress"}
      </p>
    </div>
  );
}
function LocaleContent() {
  const { locale, direction } = A.useLocale();
  return (
    <div dir={direction} className="locale-example">
      <P.DateField defaultValue={undefined} aria-label={direction === "rtl" ? "التاريخ" : "Date"}>
        <P.Label>{direction === "rtl" ? "التاريخ" : "Date"}</P.Label>
        <P.DateInput>{(segment) => <P.DateSegment segment={segment} />}</P.DateInput>
      </P.DateField>
      <p className="demo-status" role="status">
        {locale} · {direction}
      </p>
    </div>
  );
}
function LocaleDemo() {
  const [locale, setLocale] = useState("en-US");
  return (
    <div className="utility-demo">
      <div className="fux-row" data-gap="sm">
        <Button aria-pressed={locale === "en-US"} onPress={() => setLocale("en-US")}>
          English
        </Button>
        <Button aria-pressed={locale === "ar-AE"} onPress={() => setLocale("ar-AE")}>
          العربية
        </Button>
      </div>
      <A.I18nProvider locale={locale}>
        <LocaleContent />
      </A.I18nProvider>
    </div>
  );
}
function HelpersDemo() {
  const [disabled, setDisabled] = useState(false),
    [presses, setPresses] = useState(0);
  return (
    <div className="utility-demo">
      <P.Checkbox isSelected={disabled} onChange={setDisabled}>
        <span className="fux-checkbox__mark" aria-hidden="true" />
        Disable the composed actions
      </P.Checkbox>
      <A.Provider values={[[A.ButtonContext, { isDisabled: disabled }]]}>
        <div className="fux-row" data-gap="sm">
          <P.Button onPress={() => setPresses(presses + 1)}>First action</P.Button>
          <P.Button onPress={() => setPresses(presses + 1)}>Second action</P.Button>
        </div>
      </A.Provider>
      <p className="demo-status" role="status">
        {presses} local actions
      </p>
    </div>
  );
}
function ColorValuesDemo() {
  const [value, setValue] = useState("#2f6b4f");
  let color: ReturnType<typeof A.parseColor> | undefined;
  try {
    color = A.parseColor(value);
  } catch {
    /* Validation is displayed below. */
  }
  return (
    <div className="utility-demo">
      <Field
        label="Color string"
        value={value}
        onChange={setValue}
        isInvalid={!color}
        error={color ? undefined : "Enter a valid CSS hex, RGB or HSL color."}
      />
      {color ? (
        <>
          <P.ColorSwatch color={color} />
          <dl className="color-value-list">
            <div>
              <dt>Hex</dt>
              <dd>
                <code>{color.toString("hexa")}</code>
              </dd>
            </div>
            <div>
              <dt>RGB</dt>
              <dd>
                <code>{color.toString("rgba")}</code>
              </dd>
            </div>
            <div>
              <dt>Channels</dt>
              <dd>{color.getColorChannels().join(", ")}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p role="status">No color is rendered until the value is valid.</p>
      )}
    </div>
  );
}
const utilityDemos: Record<string, ComponentDemo> = {
  Autocomplete: {
    render: () => <AutocompleteDemo />,
    code: `<P.Autocomplete filter={contains}>\n  <P.SearchField><P.Label>Find a note</P.Label><P.Input /></P.SearchField>\n  <P.ListBox aria-label="Matching notes" items={items} selectionMode="single">\n    {item => <P.ListBoxItem id={item.id}>{item.name}</P.ListBoxItem>}\n  </P.ListBox>\n</P.Autocomplete>`,
    notes: [
      "Autocomplete coordinates existing input and collection owners; it is not another visible input.",
    ],
  },
  Virtualizer: {
    render: () => <VirtualizerDemo />,
    code: `<P.Virtualizer layout={ListLayout} layoutOptions={{ rowHeight: 48 }}>\n  <P.ListBox aria-label="Notes" items={items} selectionMode="single" style={{ height: 260, overflow: "auto", padding: 0 }}>\n    {item => <P.ListBoxItem id={item.id}>{item.name}</P.ListBoxItem>}\n  </P.ListBox>\n</P.Virtualizer>`,
    notes: [
      "A bounded viewport is required. Item heights and virtualizer layout must agree.",
      "This collection utility does not mean the outliner itself is virtualized; large-document editor performance is a separate gate.",
    ],
  },
  "Collections and data": {
    render: () => <CollectionsDemo />,
    code: `const list = useListData({ initialItems, filter: (item, query) => item.name.includes(query) });\nlist.append({ id: "new", name: "New note" });\nlist.removeSelectedItems();\n<P.ListBox items={list.items} selectedKeys={list.selectedKeys} onSelectionChange={list.setSelectedKeys}>\n  {item => <P.ListBoxItem id={item.id}>{item.name}</P.ListBoxItem>}\n</P.ListBox>`,
  },
  "Drag and drop": {
    render: () => <DragDemo />,
    code: `const { dragAndDropHooks } = useDragAndDrop({\n  getItems: keys => [...keys].map(key => ({ "text/plain": list.getItem(key).name })),\n  onReorder(event) {\n    if (event.target.dropPosition === "before") list.moveBefore(event.target.key, event.keys);\n    else if (event.target.dropPosition === "after") list.moveAfter(event.target.key, event.keys);\n  }\n});\n<P.GridList items={list.items} dragAndDropHooks={dragAndDropHooks}>…</P.GridList>`,
    notes: [
      "The application owns authorization and persistence. Validate external payloads and commit the final permitted operation, never intermediate hover state.",
    ],
  },
  PreviewTrigger: {
    render: () => <PreviewDemo />,
    code: `<P.PreviewTrigger>\n  <P.Link href="/reader">Reader</P.Link>\n  <P.Popover>Supplementary context and links.</P.Popover>\n</P.PreviewTrigger>`,
  },
  "Shared elements": {
    render: () => <SharedDemo />,
    code: `<P.SharedElementTransition>\n  <div><P.SharedElement name="item" isVisible={stage === 0}>An idea</P.SharedElement></div>\n  <div><P.SharedElement name="item" isVisible={stage === 1}>An idea</P.SharedElement></div>\n</P.SharedElementTransition>`,
    notes: [
      "The example moves only after an explicit action. Shared styles suppress motion when reduced motion is requested.",
    ],
  },
  "Locale and routing": {
    render: () => <LocaleDemo />,
    code: `<I18nProvider locale="ar-AE">\n  <div dir="rtl">{children}</div>\n</I18nProvider>\n\n<RouterProvider navigate={router.navigate}>\n  {children}\n</RouterProvider>`,
    notes: [
      "Locale context supplies labels and number/date conventions. Set the corresponding DOM direction for layout.",
      "RouterProvider is optional; ordinary links retain their native navigation behavior.",
    ],
  },
  "Composition helpers": {
    render: () => <HelpersDemo />,
    code: `<Provider values={[[ButtonContext, { isDisabled }]]}>\n  <P.Button onPress={handleFirst}>First action</P.Button>\n  <P.Button onPress={handleSecond}>Second action</P.Button>\n</Provider>`,
    notes: [
      "Context shares props, not authorization. Actions still need application-level policy checks.",
    ],
  },
  "Color values": {
    render: () => <ColorValuesDemo />,
    code: `const color = parseColor("#2f6b4f");\ncolor.toString("hexa");\ncolor.toString("rgba");\ncolor.getColorChannels();`,
    notes: ["Parsing invalid input throws; validate or catch errors before deriving presentation."],
  },
};
export function UtilityPage({ id }: { id: string }) {
  const entry = utilityPages.find((item) => item.id === id)!;
  const demo = utilityDemos[entry.name] ?? arkUtilityDemos[entry.name];
  return (
    <>
      <PageHeading category="Utilities" title={entry.name} description={entry.description} />
      {demo && <DemoFrame demo={demo} title={`${entry.name} example`} />}
      <section className="reference-section">
        <h2>Usage</h2>
        {demo && <Code>{demo.code}</Code>}
        {entry.exportName === "/ark" ? (
          <p>
            These optional infrastructure exports come from <code>/ark</code> and require the Ark UI
            peer. They preserve the owner API; they are not additional styled component families.
          </p>
        ) : (
          <p>
            Styled composition uses <code>Primitives</code> from <code>/components/aria</code>.
            Non-visual hooks, contexts, layouts and value helpers come from <code>/aria</code>.
          </p>
        )}
      </section>
      <section className="reference-section">
        <h2>Related exports</h2>
        <div className="parts-list">
          {entry.exports.map((name) => (
            <code key={name}>{name}</code>
          ))}
        </div>
      </section>
      {demo?.notes?.length ? (
        <section className="reference-section">
          <h2>Composition notes</h2>
          <ul className="contract-list">
            {demo.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <Notice title="Infrastructure, not an extra visual family">
        Utilities connect controls, data and application behavior. They are documented individually
        and are not added to the styled component-family total.
      </Notice>
    </>
  );
}
