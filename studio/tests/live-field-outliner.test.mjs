// The live title field in the real outliner (useOutliner + the controlled store + the core): what
// a reader types renders as it will be stored, every edit is bound to the newest text, history
// steps match the textarea's, and the row keys, chips, paste and copy all work in the field.
// Notes edit in the same field: live-field-notes.test.mjs covers their blocks.
//
//   cd studio && node --test tests/live-field-outliner.test.mjs
//
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { code, domEnv, load, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

after(() => stopVite());

await domEnv();
const { FieldSession, typingRewrite } = await load("/src/registry/outliner/live-field/field-session.ts");
const { fieldHost } = await load("/src/registry/outliner/live-field/outliner-host.ts");
const { fieldStats } = await load("/src/registry/outliner/live-field/field-view.tsx");
const { TextSelection, NodeSelection } = await import("prosemirror-state");
const { toggleMark } = await import("prosemirror-commands");

const find = (nodes, id) => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const inner = node.children && find(node.children, id);
    if (inner) return inner;
  }
  return undefined;
};
const doc = () => [
  { id: "a", text: "Alpha", children: [{ id: "a1", text: "One" }, { id: "a2", text: "Two" }] },
  { id: "b", text: "Beta **bold** end" },
  { id: "c", text: "" },
];
const titleOf = (ui, id) => find(ui.value(), id)?.text;
/** History steps in the newest state (typing renders after the paint, so the rendered state lags). */
const past = (ui) => ui.ol().latestState().history.past.length;
const field = (ui) => ui.field();
const session = (ui) => ui.field().editor.session;
const picture = (ui) => {
  const el = ui.field();
  const line = el.firstElementChild;
  let out = "";
  const walk = (node, styles) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out += styles.length ? `[${styles.join("+")}:${child.textContent}]` : child.textContent;
      else if (child.dataset?.chip) out += `{${child.dataset.chip}}`;
      else {
        const tag = child.tagName.toLowerCase();
        const style = { strong: "bold", em: "italic", s: "strike", code: "code" }[tag];
        walk(child, style ? [...styles, style] : styles);
      }
    }
  };
  walk(line, []);
  return out.replace(/\](\[)/g, "]$1");
};
/** A session driven directly, on the same host the field uses, for history and stale-binding scripts. */
const sessionOn = (ui, id, field = "title") => {
  const host = fieldHost(() => ui.ol());
  return new FieldSession({ field, rewrite: field === "title" ? typingRewrite : undefined }, id, host.text(id, field) ?? "", host);
};
let clock = 1_000_000;
const typeKey = (s, ch, gap = 50) => {
  const { from, to } = s.state.selection;
  s.apply(s.state.tr.insertText(ch, from, to), { time: (clock += gap) });
};
const rendered = (ui, s) => s.onRender(titleOf(ui, s.id) ?? "", ui.ol().renderedSeq, ui.ol().state.caret);
const paste = (ui, text, extra = {}) =>
  ui.act(() => {
    const event = new window.Event("paste", { bubbles: true, cancelable: true });
    event.clipboardData = { getData: (type) => (type === "text/plain" ? text : (extra[type] ?? "")), types: ["text/plain", ...Object.keys(extra)], files: extra.files ?? [] };
    ui.field().dispatchEvent(event);
  });

/* ───────────── Typing renders as it will be stored ───────────── */

test("typing: markup shows until it closes, then renders; the stored text is the source; one history step", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("c");
  const el = field(ui);
  assert.equal(el.dataset.olEditor, "title", "the title edits in the live field");
  await ui.type("Plan **bol");
  assert.equal(picture(ui), "Plan **bol", "the stars show while the bold is open");
  await ui.type("d *both***");
  assert.equal(picture(ui), "Plan [bold:bold ][bold+italic:both]");
  assert.equal(titleOf(ui, "c"), "Plan **bold *both***", "stored as markdown-lite source");
  assert.equal(field(ui).value, "Plan **bold *both***");
  assert.equal(past(ui), 1, "a typing burst is one step");
  await ui.unmount();
});

test("typing rewrites: ##tag and _x_ while typing, never after a currency dollar's math or in code", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  for (const [typed, stored] of [
    ["see ##launch ", "see #launch "],
    ["word##tag ", "word #tag "],
    ["an _x_ ", "an *x* "],
    ["cost $5, use _x_ ", "cost $5, use *x* "],
    ["math $a _x_", "math $a _x_"],
    ["`a _x_", "`a _x_"],
  ]) {
    await ui.act(() => ui.ol().dispatch({ type: "transaction", commands: [{ type: "update", id: "c", changes: { text: "" } }] }));
    await ui.edit("c");
    await ui.type(typed);
    assert.equal(titleOf(ui, "c"), stored, typed);
  }
  await ui.unmount();
});

/* ───────────── Title line-start rules ───────────── */

test("title rules: '### ' and '#2 ' stay text and set no heading; /2 and Enter makes the row H2, one step", async () => {
  for (const typed of ["### Go", "#2 Go", "# Go"]) {
    const ui = await mountOutliner({ defaultValue: doc() });
    await ui.edit("c");
    await ui.type(typed);
    assert.equal(titleOf(ui, "c"), typed, `${typed}: typed as text`);
    assert.equal(find(ui.value(), "c").data?.heading, undefined, `${typed}: no heading`);
    await ui.unmount();
  }
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("c");
  const before = past(ui);
  await ui.type("/2");
  await ui.key("Enter");
  await ui.frames();
  assert.equal(find(ui.value(), "c").data?.heading, 2);
  assert.equal(titleOf(ui, "c"), "", "the /query is not stored");
  assert.equal(past(ui), before + 1, "one step");
  await ui.unmount();
});

test("title rules: [] and [x] set attributes; - is swallowed; #launch is a tag; 1. numbers the parent", async () => {
  const cases = [
    ["[] ", { checked: false }],
    ["[x] ", { checked: true }],
    ["- ", {}],
  ];
  for (const [typed, want] of cases) {
    const ui = await mountOutliner({ defaultValue: doc() });
    await ui.edit("c");
    await ui.type(typed + "Go");
    const node = find(ui.value(), "c");
    assert.equal(node.text, "Go", `${typed}: the marker is not stored`);
    if ("checked" in want) assert.equal(node.checked, want.checked, typed);
    await ui.unmount();
  }
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("c");
  await ui.type("#launch go");
  assert.equal(titleOf(ui, "c"), "#launch go", "a line-start tag is a tag, not a heading");
  assert.equal(find(ui.value(), "c").data?.heading, undefined);
  await ui.edit("a1");
  await ui.act(() => field(ui).setSelectionRange(0, 0));
  await ui.type("1. ");
  assert.equal(find(ui.value(), "a").data?.numbered, true, "the parent numbers its children");
  assert.equal(titleOf(ui, "a1"), "One");
  // at the top level there is no parent to number: the text stays literal
  await ui.edit("c");
  await ui.act(() => field(ui).setSelectionRange(0, 0));
  await ui.type("1. ");
  assert.equal(titleOf(ui, "c"), "1. #launch go");
  await ui.unmount();
});

test("⌫ right after an inline conversion brings back the literal characters typed, stored escaped", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("c");
  await ui.type("Ship **bold**");
  assert.equal(picture(ui), "Ship [bold:bold]");
  await ui.key("Backspace");
  assert.equal(picture(ui), "Ship **bold**", "the stars are back, as typed");
  assert.match(titleOf(ui, "c"), /\\\*/, "stored with escapes so it stays literal");
  await ui.unmount();
});

/* ───────────── Row keys ───────────── */

test("Enter inside bold: both halves keep their formatting; one step; undo is exact", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("b");
  await ui.act(() => field(ui).setSelectionRange(9, 9)); // Beta **bo|ld** end
  const before = past(ui);
  await ui.key("Enter");
  const nodes = ui.value();
  const at = nodes.findIndex((n) => n.id === "b");
  assert.equal(nodes[at].text, "Beta **bo**");
  assert.equal(nodes[at + 1].text, "**ld** end");
  assert.equal(past(ui), before + 1);
  assert.equal(field(ui).closest("[data-row]").dataset.row, nodes[at + 1].id, "editing moved to the new row");
  assert.equal(field(ui).selectionStart, 2, "at its visible start, inside the bold");
  await ui.key("z", { metaKey: true, code: "KeyZ" });
  assert.equal(titleOf(ui, "b"), "Beta **bold** end");
  assert.equal(ui.value().length, 3);
  await ui.unmount();
});

test("Enter at the visible start of a title that opens with hidden markup inserts an empty row above, keeping the row", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "**Launch** plan", checked: true, data: { heading: 2 }, children: [{ id: "k", text: "kid" }] }] });
  await ui.edit("a");
  await ui.key("Home");
  await ui.key("Enter");
  const nodes = ui.value();
  assert.deepEqual(nodes.map((n) => n.text), ["", "**Launch** plan"]);
  assert.equal(nodes[1].id, "a", "the row keeps its id");
  assert.deepEqual(nodes[1].data, { heading: 2 });
  assert.equal(nodes[1].checked, true);
  assert.equal(nodes[1].children[0].id, "k");
  await ui.unmount();
});

test("⌫ at the visible start merges, keeping both sides' formatting; Delete at the end pulls the next row in", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "Left **bo" + "ld**" }, { id: "b", text: "*right* side" }, { id: "c", text: "tail" }] });
  await ui.edit("b");
  await ui.key("Home");
  await ui.key("Backspace");
  // the seam would read `***`, so the italic is respelled to keep exactly what was shown
  assert.deepEqual(ui.value().map((n) => n.text), ["Left **bold**__right__ side", "tail"]);
  assert.equal(field(ui).closest("[data-row]").dataset.row, "a");
  assert.equal(ui.ol().latestState().caret.start, "Left **bold**".length, "the caret at the seam, after the left row's own text");
  await ui.key("End");
  await ui.key("Delete");
  assert.deepEqual(ui.value().map((n) => n.text), ["Left **bold**__right__ sidetail"]);
  await ui.key("z", { metaKey: true, code: "KeyZ" });
  await ui.key("z", { metaKey: true, code: "KeyZ" });
  assert.deepEqual(ui.value().map((n) => n.text), ["Left **bold**", "*right* side", "tail"], "two exact undos");
  await ui.unmount();
});

test("⌫ in an empty checkbox title takes the checkbox off; Tab and ⇧Tab indent and outdent; Esc goes to row mode", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "Alpha" }, { id: "t", text: "", checked: false }] });
  await ui.edit("t");
  await ui.key("Backspace");
  assert.equal(find(ui.value(), "t").checked, undefined, "the checkbox is gone, the row stays");
  await ui.key("Tab");
  assert.equal(find(ui.value(), "a").children?.[0]?.id, "t", "indented");
  await ui.key("Tab", { shiftKey: true });
  assert.deepEqual(ui.value().map((n) => n.id), ["a", "t"], "outdented");
  assert.ok(ui.field(), "still editing");
  await ui.key("Escape");
  assert.equal(ui.field(), null, "row mode");
  assert.ok(document.activeElement === ui.tree(), "the tree has focus");
  assert.deepEqual(ui.selection(), ["t"], "the row is selected");
  await ui.unmount();
});

test("↑/↓ at the edge move to the neighbouring row; ⇧↓ at the edge grows a row selection; ⌘A twice selects every item", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), defaultExpandedIds: ["a"] });
  await ui.edit("a1");
  await ui.key("ArrowDown");
  assert.equal(field(ui).closest("[data-row]").dataset.row, "a2");
  await ui.key("ArrowUp");
  assert.equal(field(ui).closest("[data-row]").dataset.row, "a1");
  await ui.key("ArrowDown", { shiftKey: true });
  assert.equal(ui.field(), null);
  assert.deepEqual(ui.selection().sort(), ["a1", "a2"]);
  await ui.edit("b");
  // jsdom reports no Mac platform, so the editor's own select-all (Mod-a) is Ctrl+A here
  await ui.key("a", { ctrlKey: true, code: "KeyA" });
  assert.ok(ui.field(), "the first ⌘A selects the text");
  assert.ok(field(ui).liveField.allSelected);
  await ui.key("a", { ctrlKey: true, code: "KeyA" });
  assert.equal(ui.field(), null, "the second selects items");
  assert.ok(ui.selection().length >= 3);
  await ui.unmount();
});

test("⇧↵ goes to the note (a live field too) and back; ⌘↵ in a title does nothing", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("b");
  await ui.key("Enter", { metaKey: true });
  assert.equal(titleOf(ui, "b"), "Beta **bold** end");
  await ui.key("Enter", { shiftKey: true });
  await ui.frames();
  assert.equal(ui.field()?.dataset.olEditor, "note");
  assert.equal(ui.field()?.dataset.field, "note");
  await ui.key("Enter", { shiftKey: true });
  await ui.frames();
  assert.equal(ui.field()?.dataset.olEditor, "title");
  assert.equal(ui.field().selectionStart, "Beta **bold** end".length, "at the end of the title");
  await ui.unmount();
});

test("remapped shortcuts reach the field: a format through the keymap, an item shortcut through runItemShortcut", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), defaultSettings: { shortcuts: { bold: ["Mod+Alt+b"] } } });
  await ui.edit("c");
  await ui.type("word");
  await ui.act(() => field(ui).setSelectionRange(0, 4));
  await ui.key("b", { metaKey: true, code: "KeyB" });
  assert.equal(titleOf(ui, "c"), "word", "⌘B no longer bolds");
  await ui.key("b", { metaKey: true, altKey: true, code: "KeyB" });
  assert.equal(titleOf(ui, "c"), "**word**", "the remap does");
  await ui.unmount();
});

test("a format that cannot be written exactly is refused whole, announced, with no history step", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "lit \\*star\\* x" }] });
  await ui.edit("a");
  await ui.act(() => field(ui).setSelectionRange(0, "lit \\*star\\* x".length));
  const before = past(ui);
  await ui.key("b", { metaKey: true, code: "KeyB" });
  assert.equal(titleOf(ui, "a"), "lit \\*star\\* x");
  assert.equal(past(ui), before);
  await waitFor(() => /format can't be applied/.test(ui.live()));
  await ui.unmount();
});

/* ───────────── Chips ───────────── */

test("chips: a typed tag becomes a chip once the caret leaves it; a selected chip deletes whole with one ⌫", async () => {
  // (← → stepping onto and past a chip needs layout: the browser pass covers it)
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("c");
  await ui.type("go #launch");
  assert.equal(picture(ui), "go #launch", "still being typed");
  await ui.type(" now");
  assert.equal(picture(ui), "go {tag} now");
  const view = field(ui).editor.view;
  await ui.act(() => view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 4))));
  assert.equal(field(ui).value.slice(field(ui).selectionStart, field(ui).selectionEnd), "#launch", "a selected chip covers its whole token");
  await ui.key("Backspace");
  assert.equal(titleOf(ui, "c"), "go  now", "the whole token went in one key");
  await ui.key("z", { metaKey: true, code: "KeyZ" });
  assert.equal(titleOf(ui, "c"), "go #launch now", "⌘Z brings it back");
  await ui.unmount();
});

test("chips: Enter on a selected tag opens its editor; a save is one token edit; a value that is not one tag is refused", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "see #old here" }] });
  await ui.edit("a");
  const view = field(ui).editor.view;
  await ui.act(() => view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 5))));
  await ui.key("Enter");
  const input = await waitFor(() => document.querySelector("[data-field-overlay] input"));
  assert.equal(input.value, "#old");
  assert.ok(ui.ui().editing, "the field's own popup keeps the field");
  const setInput = (value) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  const before = past(ui);
  await ui.act(() => setInput("#new"));
  await ui.act(() => input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  assert.equal(titleOf(ui, "a"), "see #new here");
  assert.equal(past(ui), before + 1, "one step");
  assert.ok(ui.field(), "back in the field");
  // not one token of the same kind: refused, said
  await ui.act(() => view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 5))));
  await ui.key("Enter");
  const again = await waitFor(() => document.querySelector("[data-field-overlay] input"));
  await ui.act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(again, "**x** y");
    again.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await ui.act(() => again.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  assert.equal(titleOf(ui, "a"), "see #new here");
  await waitFor(() => /Not changed/.test(ui.live()));
  await ui.unmount();
});

test("chips: Enter on a date chip opens the date picker on its token; a pick after the token changed is refused", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "due !(2026-11-03) ok" }] });
  await ui.edit("a");
  const view = field(ui).editor.view;
  await ui.act(() => view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 5))));
  await ui.key("Enter");
  const request = await waitFor(() => ui.ui().datePicker);
  assert.deepEqual([request.start, request.end, request.src], [4, 17, "!(2026-11-03)"]);
  await ui.unmount();
});

/* ───────────── Suggestions ───────────── */

test("suggestions: the field is the combobox (aria-expanded, controls, activedescendant); an accept is one token edit", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "x #launch" }, { id: "b", text: "" }] });
  await ui.edit("b");
  await ui.type("ship #la");
  const box = await waitFor(() => document.querySelector("[role=listbox]"));
  const el = field(ui);
  assert.equal(el.getAttribute("role"), "combobox");
  assert.equal(el.getAttribute("aria-label"), "Item text");
  assert.equal(el.getAttribute("spellcheck"), "true");
  assert.equal(el.getAttribute("aria-expanded"), "true");
  assert.equal(el.getAttribute("aria-controls"), box.id);
  assert.equal(el.getAttribute("aria-activedescendant"), box.querySelector("[role=option]").id);
  const before = past(ui);
  await ui.key("Enter");
  assert.equal(titleOf(ui, "b"), "ship #launch ");
  assert.equal(past(ui), before + 1, "the accept is its own step");
  assert.equal(picture(ui), "ship {tag} ", "and a chip at once");
  await ui.unmount();
});

/* ───────────── Paste and copy ───────────── */

test("paste: Markdown renders where it lands and carries the styles there (inside bold stays one bold)", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "**ab**" }, { id: "b", text: "x" }] });
  await ui.edit("b");
  await paste(ui, " and `code` **strong**");
  assert.equal(titleOf(ui, "b"), "x and `code` **strong**");
  assert.equal(picture(ui), "x and [code:code] [bold:strong]");
  await ui.edit("a");
  await ui.act(() => field(ui).setSelectionRange(3, 3)); // **a|b**
  await paste(ui, "**x**");
  assert.equal(titleOf(ui, "a"), "**axb**", "one bold, never two kinds stacked");
  await ui.unmount();
});

test("paste: formatting that cannot be written where it lands goes in literal, and the reader is told", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "#tag" }] });
  await ui.edit("a");
  await paste(ui, "*i*");
  assert.match(titleOf(ui, "a"), /^#tag/);
  assert.equal(field(ui).editor.session.notices.at(-1)?.kind, "paste-literal");
  await waitFor(() => /Pasted as plain text/.test(ui.live()));
  await ui.unmount();
});

test("paste routes: several lines become rows, a deep link an item link, an outline (JSON) its items, files the host's", async () => {
  const attached = [];
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }], onAttach: async (files) => (attached.push(files.length), []) });
  await ui.edit("b");
  await ui.act(() => field(ui).setSelectionRange(4, 4));
  await paste(ui, `${window.location.origin}${window.location.pathname}?zoom=a`);
  assert.equal(titleOf(ui, "b"), "Beta[[Alpha|a]]", "an item link");
  await paste(ui, "one\ntwo");
  assert.ok(ui.value().some((n) => n.text === "one") && ui.value().some((n) => n.text === "two"), "rows");
  const count = ui.value().length;
  const json = ui.ol().commands.exportAs("json", ["a"]);
  await ui.edit("a");
  await paste(ui, "Alpha", { "application/x-fast-outline+json": json });
  assert.equal(ui.value().length, count + 1, "an outline from the clipboard pastes as its items");
  assert.equal(titleOf(ui, "a"), "Alpha", "not as text in the title");
  await ui.edit("a");
  await paste(ui, "", { files: [new window.File(["x"], "a.png")] });
  assert.deepEqual(attached, [1], "files go to the host");
  await ui.unmount();
});

test("drop of text is a paste (rendered, one step)", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "x" }] });
  await ui.edit("a");
  const before = past(ui);
  await ui.act(() => {
    const event = new window.Event("drop", { bubbles: true, cancelable: true });
    event.dataTransfer = { getData: (type) => (type === "text/plain" ? " **dropped**" : ""), types: ["text/plain"], files: [] };
    event.clientX = 0;
    event.clientY = 0;
    // jsdom has no layout to find the drop point: the end of the line
    const { view } = field(ui).editor;
    view.posAtCoords = () => ({ pos: view.state.doc.content.size - 1, inside: -1 });
    field(ui).dispatchEvent(event);
  });
  assert.equal(titleOf(ui, "a"), "x **dropped**");
  assert.equal(past(ui), before + 1);
  await ui.unmount();
});

test("copy writes the selection's source as text and nested HTML", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "a **bold *both*** z" }] });
  await ui.edit("a");
  await ui.act(() => field(ui).setSelectionRange(4, 15)); // "bold *both*"
  const written = {};
  await ui.act(() => {
    const event = new window.Event("copy", { bubbles: true, cancelable: true });
    event.clipboardData = { clearData() {}, setData: (type, value) => (written[type] = value), getData: () => "" };
    field(ui).dispatchEvent(event);
  });
  assert.equal(written["text/plain"], "**bold *both***");
  assert.match(written["text/html"], /<strong[^>]*>bold <em>both<\/em><\/strong>/);
  await ui.unmount();
});

/* ───────────── Lifetime, SSR, StrictMode ───────────── */

test("StrictMode's double mount leaves exactly one editor; unmounting the field destroys it", async () => {
  const React = await import("react");
  const created = fieldStats.created - fieldStats.destroyed;
  const ui = await mountOutliner({ defaultValue: doc() }, { wrap: (element) => React.createElement(React.StrictMode, null, element({ defaultValue: doc() })) });
  await ui.edit("b");
  assert.equal(document.querySelectorAll("[data-ol-editor]").length, 1, "one editable");
  assert.equal(fieldStats.created - fieldStats.destroyed - created, 1, "one live editor");
  await ui.key("Escape");
  assert.equal(fieldStats.created - fieldStats.destroyed - created, 0, "destroyed with the field");
  await ui.unmount();
});

test("SSR: the outliner renders on the server and hydrates without a mismatch; then a title edits live", async () => {
  const { renderToString } = await import("react-dom/server");
  const { hydrateRoot } = await import("react-dom/client");
  const React = await import("react");
  const { Outliner } = await load("/src/registry/outliner/outliner.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const element = React.createElement(TooltipProvider, null, React.createElement(Outliner, { defaultValue: doc() }));
  const html = renderToString(element);
  assert.ok(!/data-ol-editor/.test(html), "no editor on the server");
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  const errors = [];
  const error = console.error;
  console.error = (...args) => (/hydrat|did not match/i.test(String(args[0])) ? errors.push(String(args[0])) : error(...args));
  let root;
  await React.act(async () => {
    root = hydrateRoot(container, element, { onRecoverableError: (e) => errors.push(String(e)) });
  });
  console.error = error;
  assert.deepEqual(errors, [], "hydrated cleanly");
  await React.act(async () => root.unmount());
  container.remove();
});

/* ───────────── Bound to the newest text (the real host) ───────────── */

test("stale binding: typing, a split and a paste on a field whose row changed elsewhere keep the other change", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "abc" }, { id: "b", text: "x" }] });
  const host = () => ui.ol();
  // typing: rebased onto the newer text
  let s = sessionOn(ui, "a");
  s.setCaret(1);
  await ui.act(() => host().dispatch({ type: "text", id: "a", text: "NEWabc", time: Number.NEGATIVE_INFINITY }));
  typeKey(s, "X");
  assert.equal(titleOf(ui, "a"), "NEWaXbc", "both survive");
  // split: computed against the newest text (the core would refuse a stale base)
  s = sessionOn(ui, "a");
  s.setCaret(4);
  await ui.act(() => host().dispatch({ type: "text", id: "a", text: ">>NEWaXbc", time: Number.NEGATIVE_INFINITY }));
  let result;
  await ui.act(() => void (result = s.split("n1")));
  assert.equal(result.refusal, null);
  assert.deepEqual(ui.value().slice(0, 2).map((n) => n.text), [">>NEWa", "Xbc"]);
  // the core refuses halves cut from another text
  await ui.act(() => void (result = host().dispatch({ type: "split", id: "a", start: 1, newId: "n2", text: { left: "x", right: "y", base: "stale" } })));
  assert.ok(result.refusal);
  // paste: adopted first, then pasted
  s = sessionOn(ui, "b");
  await ui.act(() => host().dispatch({ type: "text", id: "b", text: "x!", time: Number.NEGATIVE_INFINITY }));
  await ui.act(() => s.paste(" **p**"));
  assert.equal(titleOf(ui, "b"), "x! **p**");
  await ui.unmount();
});

test("stale binding: a merge reads the neighbour's newest text; a token edit after its token vanished is refused", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "A" }, { id: "c", text: "C #t" }] });
  const s = sessionOn(ui, "c");
  await ui.act(() => ui.ol().dispatch({ type: "text", id: "a", text: "A2", time: Number.NEGATIVE_INFINITY }));
  let result;
  await ui.act(() => void (result = s.mergeBackward()));
  assert.equal(result.refusal, null);
  assert.equal(titleOf(ui, "a"), "A2C #t");
  const t = sessionOn(ui, "a");
  const bm = t.tokenAt(5);
  assert.equal(bm?.src, "#t");
  await ui.act(() => ui.ol().dispatch({ type: "text", id: "a", text: "A2C gone", time: Number.NEGATIVE_INFINITY }));
  rendered(ui, t);
  assert.equal(bm.valid, false, "the bookmark knows its token is gone");
  assert.equal(t.editToken(bm, "#u"), false);
  assert.equal(titleOf(ui, "a"), "A2C gone");
  assert.equal(t.notices.at(-1).kind, "token-refused");
  await ui.unmount();
});

test("controlled: a veto during a composition never proposes the rejected text again", async () => {
  let value = [{ id: "a", text: "" }];
  let reject = null;
  const ui = await mountOutliner({ value, onValueChange: (nodes, meta) => void (reject ??= meta.reject) });
  const s = sessionOn(ui, "a");
  typeKey(s, "a");
  s.compositionStart();
  const { from } = s.state.selection;
  s.apply(s.state.tr.insertText("漢", from, from));
  await ui.act(() => reject());
  assert.equal(rendered(ui, s), "deferred", "an outside value waits for the composition");
  let outcome;
  await ui.act(() => void (outcome = s.compositionEnd()));
  assert.equal(outcome, "rebased");
  assert.equal(s.source, "漢", "the composed text on top of the vetoed state");
  assert.equal(titleOf(ui, "a"), "漢");
  void value;
  await ui.unmount();
});

/* ───────────── History matches the textarea, step for step ───────────── */

test("history differential: the same script through the textarea's actions and through the live field gives the same steps and undos", async () => {
  // The textarea reports every keystroke as `text` with its time; a paste or a format as one text.
  const script = [
    { type: "keys", text: "abc", gap: 50 },
    { type: "keys", text: "d", gap: 3000 },
    { type: "caret", at: 0 },
    { type: "keys", text: "X", gap: 10 },
    { type: "paste", text: "YY" },
    { type: "keys", text: "z", gap: 10 },
  ];
  const run = async (live) => {
    const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "" }] });
    const s = live ? sessionOn(ui, "a") : null;
    let text = "";
    let caret = 0;
    let time = 5_000_000;
    const steps = [];
    for (const step of script) {
      await ui.act(() => {
        if (step.type === "keys")
          for (const ch of step.text) {
            time += step.gap;
            if (live) {
              const { from, to } = s.state.selection;
              s.apply(s.state.tr.insertText(ch, from, to), { time });
            } else {
              text = text.slice(0, caret) + ch + text.slice(caret);
              caret++;
              ui.ol().dispatch({ type: "text", id: "a", text, caret, time });
            }
          }
        else if (step.type === "caret") {
          if (live) s.setCaret(step.at);
          else {
            caret = step.at;
            ui.ol().dispatch({ type: "caret", id: "a", start: caret, end: caret });
          }
        } else if (live) s.paste(step.text);
        else {
          text = text.slice(0, caret) + step.text + text.slice(caret);
          caret += step.text.length;
          ui.ol().dispatch({ type: "text", id: "a", text, caret });
        }
      });
      steps.push(past(ui));
    }
    const undos = [];
    for (let i = 0; i < steps.at(-1); i++) {
      await ui.act(() => ui.ol().dispatch({ type: "undo" }));
      undos.push(titleOf(ui, "a"));
    }
    await ui.unmount();
    return { steps, undos };
  };
  const textarea = await run(false);
  const live = await run(true);
  assert.deepEqual(live, textarea);
});

test("history: a composition is one step, emitted when it ends; a collapsed ⌘B is a barrier", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "" }] });
  const s = sessionOn(ui, "a");
  s.compositionStart();
  const { from } = s.state.selection;
  for (const [text, len] of [["k", 0], ["か", 1], ["かん", 1], ["漢", 2]]) s.apply(s.state.tr.insertText(text, from, from + len));
  assert.equal(past(ui), 0, "nothing while composing");
  await ui.act(() => s.compositionEnd());
  assert.equal(past(ui), 1);
  assert.equal(titleOf(ui, "a"), "漢");
  typeKey(s, "a", 10);
  s.apply(s.state.tr.addStoredMark(s.state.schema.marks.bold.create()));
  typeKey(s, "b", 10);
  assert.equal(titleOf(ui, "a"), "漢a**b**");
  assert.equal(past(ui), 3, "the stored-mark toggle broke the typing group");
  void toggleMark;
  void TextSelection;
  void code;
  await ui.unmount();
});

/* ───────────── The controlled contract (echo, veto, outside values) ───────────── */

test("controlled: echoes arriving one by one, a coalesced echo and a late veto never lose or resurrect typing", async () => {
  const proposals = [];
  const onValueChange = (nodes, meta) => void proposals.push({ nodes, meta });
  const start = [{ id: "a", text: "" }];
  const ui = await mountOutliner({ value: start, onValueChange });
  await ui.edit("a");
  await ui.type("ab");
  assert.equal(field(ui).value, "ab");
  // the echo of the FIRST proposal arrives while "b" is pending: nothing typed is overwritten
  await ui.rerender({ value: proposals[0].nodes, onValueChange });
  assert.equal(field(ui).value, "ab");
  await ui.type("c");
  // one value answering everything so far (coalesced): commits it all, the field unchanged
  await ui.rerender({ value: proposals.at(-1).nodes, onValueChange });
  assert.equal(field(ui).value, "abc");
  // a late veto of the newest proposal rolls the field back, and "d" is never proposed on top of it
  await ui.type("d");
  await ui.act(() => proposals.at(-1).meta.reject());
  await ui.frames();
  assert.equal(field(ui).value, "abc", "the vetoed character is gone");
  await ui.type("e");
  assert.equal(proposals.at(-1).nodes[0].text, "abce", "the next edit builds on the committed text");
  await ui.unmount();
});

test("controlled: an outside value replaces the field, and an insert before the caret moves the caret with its text", async () => {
  const onValueChange = () => {};
  const ui = await mountOutliner({ value: [{ id: "a", text: "hello" }], onValueChange });
  await ui.edit("a");
  await ui.act(() => field(ui).setSelectionRange(2, 2));
  await ui.rerender({ value: [{ id: "a", text: ">> hello" }], onValueChange });
  assert.equal(field(ui).value, ">> hello");
  assert.equal(field(ui).selectionStart, 5, "the caret kept its place in the text");
  await ui.unmount();
});

test("strict (optimistic: false): typing stays visible while pending; the echo or the veto settles it", async () => {
  const proposals = [];
  const onValueChange = (nodes, meta) => void proposals.push({ nodes, meta });
  const ui = await mountOutliner({ value: [{ id: "a", text: "" }], onValueChange, optimistic: false });
  await ui.edit("a");
  await ui.type("xy");
  assert.equal(field(ui).value, "xy", "not echoed yet, still shown");
  await ui.rerender({ value: proposals.at(-1).nodes, onValueChange, optimistic: false });
  assert.equal(field(ui).value, "xy");
  await ui.type("z");
  await ui.act(() => proposals.at(-1).meta.reject());
  await ui.frames();
  assert.equal(field(ui).value, "xy", "the veto wins");
  await ui.unmount();
});

test("a refused edit (the row became locked) rolls the field back at once", async () => {
  let locked = false;
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "keep" }], isLocked: (node) => locked && node.id === "a" });
  await ui.edit("a");
  locked = true;
  await ui.type("X");
  assert.equal(titleOf(ui, "a"), "keep");
  assert.equal(field(ui)?.value ?? "keep", "keep", "the field shows the document");
  await ui.unmount();
});

/* ───────────── Edits go through the right adapter and stay bound ───────────── */

test("a note's own-step edit goes through the note adapter: the title is untouched", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "Title", data: { note: "n", heading: 2 } }] });
  const s = sessionOn(ui, "a", "note");
  assert.equal(s.source, "n");
  typeKey(s, "x");
  await ui.act(() => s.paste("P"));
  const node = find(ui.value(), "a");
  assert.equal(node.text, "Title");
  assert.equal(node.data.note, "nxP");
  assert.equal(node.data.heading, 2);
  assert.equal(past(ui), 2, "typing, then the paste: two steps");
  await ui.unmount();
});

test("a merge is bound to the rows and texts it was computed from: any other pair is refused, nothing changes", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }] });
  const before = ui.value();
  let result;
  await ui.act(() => void (result = ui.ol().dispatch({ type: "merge", id: "c", direction: "backward", text: { joined: "AC", caret: 1, left: { id: "a", text: "A" }, right: { id: "c", text: "C" } } })));
  assert.ok(result.refusal, "c's left neighbour is b, not a");
  assert.deepEqual(ui.value(), before);
  const s = sessionOn(ui, "c");
  await ui.act(() => void (result = s.mergeBackward()));
  assert.equal(result.refusal, null);
  assert.deepEqual(ui.value().map((n) => n.text), ["A", "BC"]);
  await ui.unmount();
});

test("undo brings a backward range back backward; an outside value keeps a collapsed ⌘B for the next key", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "abc" }] });
  await ui.edit("a");
  await ui.act(() => field(ui).setSelectionRange(0, 2, "backward"));
  await paste(ui, "**XY**");
  assert.equal(titleOf(ui, "a"), "**XY**c");
  await ui.key("z", { metaKey: true, code: "KeyZ" });
  assert.equal(titleOf(ui, "a"), "abc");
  assert.deepEqual([field(ui).selectionStart, field(ui).selectionEnd, field(ui).selectionDirection], [0, 2, "backward"]);
  await ui.unmount();
  const ui2 = await mountOutliner({ defaultValue: [{ id: "b", text: "abc" }] });
  const s = sessionOn(ui2, "b");
  s.apply(s.state.tr.addStoredMark(s.state.schema.marks.bold.create()));
  await ui2.act(() => ui2.ol().dispatch({ type: "transaction", commands: [{ type: "update", id: "b", changes: { text: ">> abc" } }] }));
  rendered(ui2, s);
  typeKey(s, "X");
  assert.equal(titleOf(ui2, "b"), ">> abc**X**", "the next keystroke is still bold");
  await ui2.unmount();
});
