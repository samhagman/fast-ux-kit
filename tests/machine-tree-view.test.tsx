import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import "./components-dom.js";
import type { MachineDocument } from "../src/core/machine/types.js";
import { machineTreeRowId } from "../src/core/machine/tree.js";
const { act, cleanup, fireEvent, render, within } = await import("@testing-library/react");
const { renderToString } = await import("react-dom/server");
const { MachineTreeView } = await import("../src/react/machine-tree-view.js");
afterEach(() => cleanup());

const doc: MachineDocument = {
  version: 1,
  rootId: "main",
  machines: [
    {
      id: "main",
      label: "Review flow",
      initialId: "work",
      nodes: [
        {
          id: "work",
          label: "Working",
          kind: "compound",
          initialId: "draft",
          description: "Prepare a review.",
          entry: ["prepare"],
          tags: ["editorial"],
        },
        { id: "draft", label: "Draft", kind: "atomic", parentId: "work" },
        { id: "review", label: "Review", kind: "atomic", parentId: "work" },
        { id: "done", label: "Done", kind: "final" },
        { id: "helper", label: "Helper", kind: "submachine", machineId: "child" },
        { id: "note", label: "Keep a record", kind: "note" },
      ],
      transitions: [
        {
          id: "send",
          sourceId: "draft",
          targetId: "review",
          event: "SUBMIT",
          guard: "complete",
          actions: ["record"],
        },
        { id: "finish", sourceId: "review", targetId: "done", event: "APPROVE" },
      ],
    },
    {
      id: "child",
      label: "Child review",
      nodes: [{ id: "waiting", label: "Waiting", kind: "atomic" }],
      transitions: [],
    },
  ],
};
const id = (kind: "machine" | "node" | "transition", element: string, graph = "main") =>
  machineTreeRowId(kind, graph, element);
function key(element: HTMLElement, value: string, extras: Record<string, unknown> = {}) {
  return fireEvent.keyDown(element, { key: value, cancelable: true, ...extras });
}
function focus(element: HTMLElement) {
  act(() => element.focus());
}

test("tree exposes nested state and transition structure without mutating input", () => {
  const before = JSON.stringify(doc);
  const view = render(<MachineTreeView value={doc} />);
  assert.equal(
    view.getByRole("treeitem", { name: "State: Draft" }).getAttribute("aria-level"),
    "3",
  );
  assert.equal(
    view.getByRole("treeitem", { name: "Transition: SUBMIT" }).getAttribute("aria-level"),
    "4",
  );
  fireEvent.click(view.getByRole("treeitem", { name: "Compound: Working" }));
  assert.ok(
    within(view.getByRole("complementary", { name: "Selection details" })).getByText("prepare"),
  );
  assert.equal(JSON.stringify(doc), before);
});

test("exact active state and derived ancestor are distinct and reveal active is navigation", () => {
  const selections: string[] = [];
  const view = render(
    <MachineTreeView
      value={doc}
      defaultExpandedIds={[]}
      activeStates={[{ machineId: "main", activeIds: ["review"] }]}
      onSelectionChange={(value) => selections.push(value!)}
    />,
  );
  assert.equal(view.queryByRole("treeitem", { name: "State: Review" }), null);
  fireEvent.click(view.getByRole("button", { name: "Reveal active" }));
  const row = view.getByRole("treeitem", { name: "State: Review" });
  assert.equal(row.getAttribute("data-active"), "true");
  assert.equal(
    view
      .getByRole("treeitem", { name: "Compound: Working" })
      .getAttribute("data-active-descendant"),
    "true",
  );
  assert.equal(document.activeElement, row);
  assert.equal(selections[0], id("node", "review"));
});

test("controlled selection and expansion are proposals until host accepts", () => {
  let proposal: readonly string[] = [];
  let selection: string | null = null;
  const view = render(
    <MachineTreeView
      value={doc}
      expandedIds={[]}
      selectedId={null}
      onExpandedChange={(ids) => {
        proposal = ids;
      }}
      onSelectionChange={(next) => {
        selection = next;
      }}
    />,
  );
  fireEvent.click(view.getByRole("treeitem", { name: "Machine: Review flow" }));
  assert.equal(selection, id("machine", "main"));
  assert.equal(
    view.getByRole("treeitem", { name: "Machine: Review flow" }).getAttribute("aria-selected"),
    "false",
  );
  fireEvent.click(view.getByRole("button", { name: "Expand Review flow" }));
  assert.ok(proposal.includes(id("machine", "main")));
  assert.equal(view.queryByRole("treeitem", { name: "Compound: Working" }), null);
  view.rerender(<MachineTreeView value={doc} expandedIds={proposal} selectedId={selection} />);
  assert.ok(view.getByRole("treeitem", { name: "Compound: Working" }));
});

test("tree navigation prevents page scrolling at both boundaries and moves roving focus", () => {
  const view = render(<MachineTreeView value={doc} />);
  const rows = view.getAllByRole("treeitem");
  focus(rows[0]!);
  assert.equal(key(rows[0]!, "ArrowUp"), false);
  assert.equal(document.activeElement, rows[0]);
  assert.equal(key(rows[0]!, "ArrowDown"), false);
  assert.equal(document.activeElement, rows[1]);
  key(rows[1]!, "End");
  assert.equal(document.activeElement, rows.at(-1));
  assert.equal(key(rows.at(-1)!, "ArrowDown"), false);
  key(rows.at(-1)!, "Home");
  assert.equal(document.activeElement, rows[0]);
  assert.equal(view.container.querySelectorAll('[role="treeitem"][tabindex="0"]').length, 1);
  for (const disclosure of view.getAllByRole("button", { name: /^(Expand|Collapse) / })) {
    if (disclosure.classList.contains("fux-machine-tree__disclosure"))
      assert.equal(disclosure.tabIndex, -1);
  }
});

test("Left folds and moves to parent; Right expands then moves into branch", () => {
  const view = render(<MachineTreeView value={doc} />);
  const work = view.getByRole("treeitem", { name: "Compound: Working" });
  focus(work);
  key(work, "ArrowLeft");
  assert.equal(work.getAttribute("aria-expanded"), "false");
  key(work, "ArrowRight");
  assert.equal(work.getAttribute("aria-expanded"), "true");
  key(work, "ArrowRight");
  assert.equal(document.activeElement, view.getByRole("treeitem", { name: "State: Draft" }));
  key(document.activeElement as HTMLElement, "ArrowLeft"); // Draft contains its transition, so fold first.
  key(document.activeElement as HTMLElement, "ArrowLeft");
  assert.equal(document.activeElement, work);
});

test("RTL reverses logical expand and collapse keys", () => {
  const view = render(<MachineTreeView value={doc} dir="rtl" defaultExpandedIds={[]} />);
  const root = view.getByRole("treeitem", { name: "Machine: Review flow" });
  focus(root);
  key(root, "ArrowLeft");
  assert.equal(root.getAttribute("aria-expanded"), "true");
  key(root, "ArrowRight");
  assert.equal(root.getAttribute("aria-expanded"), "false");
});

test("IME, modifiers and interactive renderer descendants retain their keyboard events", () => {
  const view = render(
    <MachineTreeView
      value={doc}
      renderLabel={(row) => (
        <span>
          {row.label}
          <input aria-label={`Note for ${row.label}`} />
        </span>
      )}
    />,
  );
  const root = view.getByRole("treeitem", { name: "Machine: Review flow" });
  focus(root);
  assert.equal(key(root, "ArrowDown", { isComposing: true }), true);
  assert.equal(key(root, "ArrowDown", { ctrlKey: true }), true);
  assert.equal(key(root, "ArrowDown", { shiftKey: true }), true);
  const input = view.getByRole("textbox", { name: "Note for Review flow" });
  focus(input);
  assert.equal(key(input, "ArrowDown"), true);
  assert.equal(document.activeElement, input);
});

test("search reveals ancestor context without changing saved expansion, Escape restores folding", () => {
  const view = render(<MachineTreeView value={doc} defaultExpandedIds={[]} />);
  const input = view.getByRole("searchbox");
  fireEvent.change(input, { target: { value: "complete" } });
  assert.ok(view.getByRole("treeitem", { name: "Transition: SUBMIT" }));
  assert.equal(
    view.getByRole("treeitem", { name: "Compound: Working" }).getAttribute("data-context"),
    "true",
  );
  key(input, "Enter");
  assert.equal(document.activeElement, view.getByRole("treeitem", { name: "Transition: SUBMIT" }));
  focus(input);
  key(input, "Escape");
  assert.equal(view.queryByRole("treeitem", { name: "Transition: SUBMIT" }), null);
  assert.equal(
    view.getByRole("treeitem", { name: "Machine: Review flow" }).getAttribute("aria-expanded"),
    "false",
  );
});

test("target reveal clears filter and focuses the real destination without executing events", () => {
  const before = JSON.stringify(doc);
  const view = render(<MachineTreeView value={doc} defaultExpandedIds={[]} />);
  fireEvent.change(view.getByRole("searchbox"), { target: { value: "SUBMIT" } });
  fireEvent.click(view.getByRole("treeitem", { name: "Transition: SUBMIT" }));
  fireEvent.click(view.getByRole("button", { name: "Reveal target: Review" }));
  assert.equal((view.getByRole("searchbox") as HTMLInputElement).value, "");
  assert.equal(document.activeElement, view.getByRole("treeitem", { name: "State: Review" }));
  assert.equal(JSON.stringify(doc), before);
});

test("reference navigation selects the graph rather than recursively embedding it", () => {
  const view = render(<MachineTreeView value={doc} />);
  fireEvent.click(view.getByRole("treeitem", { name: "Reference: Helper" }));
  fireEvent.click(view.getByRole("button", { name: "Open referenced machine: Child review" }));
  assert.equal(
    document.activeElement,
    view.getByRole("treeitem", { name: "Machine: Child review" }),
  );
  assert.equal(view.getAllByRole("treeitem", { name: "State: Waiting" }).length, 1);
});

test("filtering a focused row recovers roving focus without stealing search focus", () => {
  const view = render(<MachineTreeView value={doc} />);
  const draft = view.getByRole("treeitem", { name: "State: Draft" });
  focus(draft);
  const input = view.getByRole("searchbox");
  focus(input);
  fireEvent.change(input, { target: { value: "Waiting" } });
  assert.equal(document.activeElement, input);
  assert.equal(view.container.querySelectorAll('[role="treeitem"][tabindex="0"]').length, 1);
});

test("hidden and removed selections remain explicit rather than silently substituting", () => {
  const view = render(<MachineTreeView value={doc} defaultSelectedId={id("node", "draft")} />);
  fireEvent.click(view.getByRole("button", { name: "Collapse all" }));
  assert.ok(view.getByText(/This selection is outside/));
  fireEvent.click(view.getByRole("button", { name: "Reveal selection" }));
  assert.ok(view.getByRole("treeitem", { name: "State: Draft" }));
  view.rerender(
    <MachineTreeView
      value={{ version: 1, rootId: "empty", machines: [] }}
      selectedId={id("node", "draft")}
    />,
  );
  assert.ok(view.getByRole("heading", { name: "Selection unavailable" }));
});

test("limits, no matches and invalid topology report honest states", () => {
  const view = render(<MachineTreeView value={doc} maxVisibleRows={2} />);
  assert.ok(view.getByText(/View is limited/));
  assert.equal(view.getAllByRole("treeitem").length, 2);
  fireEvent.change(view.getByRole("searchbox"), { target: { value: "unfindable-value" } });
  assert.ok(view.getByText("No matching states or transitions."));
  view.rerender(
    <MachineTreeView
      value={{
        version: 1,
        rootId: "bad",
        machines: [
          {
            id: "bad",
            label: "Bad",
            nodes: [{ id: "orphan", label: "Orphan", kind: "atomic", parentId: "missing" }],
            transitions: [],
          },
        ],
      }}
    />,
  );
  assert.ok(view.getByText(/structure notices/));
});

test("multiple instances and invalid duplicate identities do not duplicate DOM IDs", () => {
  const duplicate: MachineDocument = { ...doc, machines: [doc.machines[0]!, doc.machines[0]!] };
  const view = render(
    <>
      <MachineTreeView value={duplicate} />
      <MachineTreeView value={duplicate} />
    </>,
  );
  const ids = [...view.container.querySelectorAll("[id]")].map((element) => element.id);
  assert.equal(new Set(ids).size, ids.length);
  const html = renderToString(
    <MachineTreeView value={doc} showToolbar={false} showInspector={false} />,
  );
  assert.match(html, /role="tree"/);
  assert.doesNotMatch(html, /Selection details/);
});

test("typeahead changes focus, selection requires explicit Enter or Space", () => {
  const view = render(<MachineTreeView value={doc} />);
  const root = view.getByRole("treeitem", { name: "Machine: Review flow" });
  focus(root);
  key(root, "d");
  const draft = view.getByRole("treeitem", { name: "State: Draft" });
  assert.equal(document.activeElement, draft);
  assert.equal(draft.getAttribute("aria-selected"), "false");
  key(draft, " ");
  assert.equal(draft.getAttribute("aria-selected"), "true");
});

test("rejected controlled reveal cannot steal focus after an unrelated later host update", () => {
  const selected = id("transition", "send");
  const props = {
    value: doc,
    selectedId: selected,
    expandedIds: [] as readonly string[],
    query: "SUBMIT",
  };
  const view = render(<MachineTreeView {...props} />);
  fireEvent.click(view.getByRole("button", { name: "Reveal target: Review" }));
  const search = view.getByRole("searchbox");
  focus(search);
  view.rerender(
    <MachineTreeView
      {...props}
      query=""
      expandedIds={[id("machine", "main"), id("node", "work")]}
    />,
  );
  assert.equal(document.activeElement, search);
  assert.equal(
    view.getByRole("treeitem", { name: "State: Review" }).getAttribute("aria-selected"),
    "false",
  );
});

test("active, initial and context metadata is exposed through accessible descriptions", () => {
  const view = render(
    <MachineTreeView
      value={doc}
      activeStates={[{ machineId: "main", activeIds: ["draft"] }]}
      defaultQuery="Draft"
    />,
  );
  for (const name of ["State: Draft", "Compound: Working"]) {
    const row = view.getByRole("treeitem", { name });
    const descriptions = row
      .getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    assert.match(descriptions, /Initial/);
    assert.match(descriptions, name === "State: Draft" ? /Active/ : /Active within/);
  }
});

test("external folding returns focus to the visible ancestor and requests minimal scrolling", () => {
  const view = render(<MachineTreeView value={doc} />);
  const draft = view.getByRole("treeitem", { name: "State: Draft" });
  focus(draft);
  const root = view.getByRole("treeitem", { name: "Machine: Review flow" });
  let options: ScrollIntoViewOptions | undefined;
  const header = root.querySelector(
    ":scope > .fux-machine-tree__state-box > .fux-machine-tree__row-face",
  )!;
  Object.defineProperty(header, "scrollIntoView", {
    configurable: true,
    value: (next: ScrollIntoViewOptions) => {
      options = next;
    },
  });
  view.rerender(<MachineTreeView value={doc} expandedIds={[]} />);
  assert.equal(document.activeElement, root);
  assert.deepEqual(options, { block: "nearest", inline: "nearest", behavior: "auto" });
});

test("transition reveal stays in its graph occurrence even when the same graph object is repeated", () => {
  const graph = doc.machines[0]!;
  const repeated: MachineDocument = { ...doc, machines: [graph, graph] };
  const view = render(<MachineTreeView value={repeated} />);
  const routes = view.getAllByRole("treeitem", { name: "Transition: SUBMIT" });
  const targets = view.getAllByRole("treeitem", { name: "State: Review" });
  const sources = view.getAllByRole("treeitem", { name: "State: Draft" });
  fireEvent.click(routes[1]!);
  fireEvent.click(view.getByRole("button", { name: "Reveal target: Review" }));
  assert.equal(document.activeElement, targets[1]);
  fireEvent.click(routes[1]!);
  fireEvent.click(view.getByRole("button", { name: "Reveal source: Draft" }));
  assert.equal(document.activeElement, sources[1]);
});

test("trusted interactive label slots do not turn their own pointer action into row selection", () => {
  let selections = 0;
  const view = render(
    <MachineTreeView
      value={doc}
      onSelectionChange={() => selections++}
      renderLabel={(row) => (
        <span>
          {row.label}
          <span contentEditable suppressContentEditableWarning aria-label={`Editable ${row.label}`}>
            Local label tool
          </span>
        </span>
      )}
    />,
  );
  view.getByLabelText("Editable Draft").setAttribute("contenteditable", "");
  fireEvent.click(view.getByLabelText("Editable Draft"));
  assert.equal(selections, 0);
});

test("selection details show an ID-disambiguated tree path and declared initial child", () => {
  const view = render(<MachineTreeView value={doc} />);
  fireEvent.click(view.getByRole("treeitem", { name: "State: Draft" }));
  const path = view.getByRole("list", { name: "Selected item tree path" });
  assert.deepEqual(
    within(path)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
    ["Review flow main", "Working work", "Draft draft"],
  );
  fireEvent.click(view.getByRole("treeitem", { name: "Compound: Working" }));
  assert.equal(view.getByText("Declared initial child").nextElementSibling?.textContent, "draft");
  fireEvent.click(view.getByRole("treeitem", { name: "Machine: Review flow" }));
  assert.equal(view.getByText("Declared initial child").nextElementSibling?.textContent, "work");
  fireEvent.click(view.getByRole("treeitem", { name: "State: Review" }));
  assert.equal(view.queryByText("Declared initial child"), null);
});

test("state containment is nested DOM while outgoing routes remain outside their state border", () => {
  const view = render(<MachineTreeView value={doc} showToolbar={false} showInspector={false} />);
  const working = view.getByRole("treeitem", { name: "Compound: Working" });
  const draft = view.getByRole("treeitem", { name: "State: Draft" });
  const route = view.getByRole("treeitem", { name: "Transition: SUBMIT" });
  assert.ok(working.contains(draft));
  assert.ok(draft.contains(route));
  const box = draft.querySelector(":scope > .fux-machine-tree__state-box")!;
  assert.equal(box.contains(route), false);
  assert.ok(route.parentElement?.matches('[role="group"].fux-machine-tree__routes'));
  assert.equal(view.queryByRole("complementary"), null);
});

test("inline target control reveals only its destination without selecting containing rows", () => {
  const before = JSON.stringify(doc);
  const selections: (string | null)[] = [];
  const view = render(
    <MachineTreeView value={doc} onSelectionChange={(value) => selections.push(value)} />,
  );
  fireEvent.click(view.getByRole("button", { name: "Reveal target Review" }));
  assert.deepEqual(selections, [id("node", "review")]);
  assert.equal(document.activeElement, view.getByRole("treeitem", { name: "State: Review" }));
  assert.equal(JSON.stringify(doc), before);
});

test("nested state pointer and keyboard actions do not bubble into ancestor selection", () => {
  const selections: (string | null)[] = [];
  const view = render(
    <MachineTreeView value={doc} onSelectionChange={(value) => selections.push(value)} />,
  );
  const draft = view.getByRole("treeitem", { name: "State: Draft" });
  fireEvent.click(draft.querySelector(".fux-machine-tree__row-title")!);
  assert.deepEqual(selections, [id("node", "draft")]);
  key(draft, "Enter");
  assert.deepEqual(selections, [id("node", "draft"), id("node", "draft")]);
});

test("inline routes retain missing targets inertly and self targets navigate safely", () => {
  const document: MachineDocument = {
    version: 1,
    rootId: "single",
    machines: [
      {
        id: "single",
        label: "Single",
        nodes: [{ id: "idle", label: "Idle", kind: "atomic" }],
        transitions: [
          { id: "again", sourceId: "idle", targetId: "idle", event: "AGAIN" },
          { id: "gone", sourceId: "idle", targetId: "absent", event: "MISSING" },
        ],
      },
    ],
  };
  const view = render(<MachineTreeView value={document} />);
  const missing = view.getByRole("treeitem", { name: "Transition: MISSING" });
  assert.equal(within(missing).queryByRole("button"), null);
  assert.ok(within(missing).getByText("absent (unavailable)"));
  fireEvent.click(view.getByRole("button", { name: "Reveal target Idle" }));
  assert.equal(
    view.getByRole("treeitem", { name: "State: Idle" }).getAttribute("aria-selected"),
    "true",
  );
});

test("trusted transition event controls and inline navigation have separate ownership", () => {
  let events = 0;
  const selections: (string | null)[] = [];
  const view = render(
    <MachineTreeView
      value={doc}
      onSelectionChange={(value) => selections.push(value)}
      renderLabel={(row) =>
        row.transition ? <button onClick={() => events++}>Send {row.label}</button> : row.label
      }
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Send SUBMIT" }));
  assert.equal(events, 1);
  assert.equal(selections.length, 0);
  fireEvent.click(view.getByRole("button", { name: "Reveal target Review" }));
  assert.equal(events, 1);
  assert.deepEqual(selections, [id("node", "review")]);
});

test("Home scrolls the machine header while focus remains on its nested treeitem", () => {
  const view = render(<MachineTreeView value={doc} />);
  const root = view.getByRole("treeitem", { name: "Machine: Review flow" });
  const draft = view.getByRole("treeitem", { name: "State: Draft" });
  const header = root.querySelector(
    ":scope > .fux-machine-tree__state-box > .fux-machine-tree__row-face",
  )!;
  let headerScrolls = 0;
  let subtreeScrolls = 0;
  Object.defineProperty(header, "scrollIntoView", {
    configurable: true,
    value: () => headerScrolls++,
  });
  Object.defineProperty(root, "scrollIntoView", {
    configurable: true,
    value: () => subtreeScrolls++,
  });
  focus(draft);
  key(draft, "Home");
  assert.equal(document.activeElement, root);
  assert.equal(headerScrolls, 1);
  assert.equal(subtreeScrolls, 0);
});

test("controlled kind filters stay proposals and cannot bypass a refused reveal", () => {
  const transitions: boolean[] = [];
  const notes: boolean[] = [];
  const props = {
    value: doc,
    showTransitions: false,
    showNotes: false,
    selectedId: id("transition", "send"),
    onShowTransitionsChange: (show: boolean) => transitions.push(show),
    onShowNotesChange: (show: boolean) => notes.push(show),
  };
  const view = render(<MachineTreeView {...props} />);
  fireEvent.click(view.getByRole("checkbox", { name: "Transitions" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Notes" }));
  assert.deepEqual(transitions, [true]);
  assert.deepEqual(notes, [true]);
  assert.equal(view.queryByRole("treeitem", { name: "Transition: SUBMIT" }), null);
  assert.equal(view.queryByRole("treeitem", { name: "Note: Keep a record" }), null);
  fireEvent.click(view.getByRole("button", { name: "Reveal selection" }));
  assert.deepEqual(transitions, [true, true]);
  assert.equal(view.queryByRole("treeitem", { name: "Transition: SUBMIT" }), null);
  view.rerender(<MachineTreeView {...props} showTransitions showNotes />);
  assert.ok(view.getByRole("treeitem", { name: "Transition: SUBMIT" }));
  assert.ok(view.getByRole("treeitem", { name: "Note: Keep a record" }));
});
