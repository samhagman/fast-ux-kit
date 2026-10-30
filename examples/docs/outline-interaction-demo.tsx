import { useState } from "react";
import { Button, Checkbox } from "../../src/components/aria.js";
import { OutlineEditor } from "../../src/react/OutlineEditor.js";
import type { OutlineNode, OutlineNoteAdapter } from "../../src/core/index.js";

interface EntryData {
  readonly note: string;
  readonly protected?: boolean;
}
const initial: readonly OutlineNode<EntryData>[] = [
  {
    id: "weekend",
    text: "A weekend without a rush",
    data: { note: "Leave room for an unplanned turn." },
    children: [
      {
        id: "walk",
        text: "Walk along the water",
        data: { note: "A quiet route\nThen a warm drink." },
        children: [
          { id: "route", text: "Choose the shaded path", data: { note: "" } },
          { id: "bottle", text: "Bring a water bottle", checked: false, data: { note: "" } },
        ],
      },
      { id: "cook", text: "Make something for friends", data: { note: "Keep the menu simple." } },
      {
        id: "ideas",
        text: "Ideas for another day",
        data: { note: "" },
        children: [
          { id: "repair", text: "Repair the little shelf", data: { note: "Measure twice." } },
        ],
      },
    ],
  },
  {
    id: "reference",
    text: "A protected reminder",
    data: { note: "Navigation is still available; this entry cannot be changed.", protected: true },
  },
];
const adapter: OutlineNoteAdapter<EntryData> = {
  read: (node) => node.data?.note,
  prepareData: (node, note) =>
    node.data ? { ok: true, data: { ...node.data, note } } : { ok: false },
};

/** Original local fixture, deliberately separated from the advanced capability trials. */
export function OutlineInteractionDemo() {
  const [generation, setGeneration] = useState(0);
  const [readOnly, setReadOnly] = useState(false);
  const [rtl, setRtl] = useState(false);
  return (
    <section
      className="outline-playground"
      aria-labelledby="outline-interaction-title"
      dir={rtl ? "rtl" : "ltr"}
    >
      <h2 id="outline-interaction-title">Read, focus, then write</h2>
      <p>
        Rows fold the details. Bullets open a focused document. Hold and release a row to edit, or
        focus it and press F2. Done or Escape returns to reading without discarding accepted
        changes.
      </p>
      <div className="lab-controls" role="group" aria-label="Interaction trial controls">
        <Checkbox label="Make this trial read only" isSelected={readOnly} onChange={setReadOnly} />
        <Checkbox label="Right-to-left interaction trial" isSelected={rtl} onChange={setRtl} />
        <Button
          onPress={() => {
            setGeneration((value) => value + 1);
            setReadOnly(false);
          }}
        >
          Reset interaction trial
        </Button>
      </div>
      <OutlineEditor
        key={generation}
        defaultNodes={initial}
        readOnly={readOnly}
        interactionMode="browse"
        noteAdapter={adapter}
        noteKeyboardProfile="toggle"
        defaultExpandedIds={new Set(["weekend", "walk"])}
        isLocked={(node) => node.data?.protected === true}
        aria-label="Browse-first weekend outline"
      />
      <p className="demo-status">
        This trial keeps changes only while this page is open. Done ends editing; it does not claim
        a server save. Native text selection, scrolling and context menus take priority over a held
        press.
      </p>
    </section>
  );
}
