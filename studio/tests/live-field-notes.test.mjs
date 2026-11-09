// Notes in the live field: the blocks of rich-note.ts edit in place. A note stays source text;
// block keys (Enter, ⌫ at a block's start, ⌘↵, ↓ out of a block) are source edits, block rules
// come from the grammar, and the field shows the same blocks the static note shows.
//
//   cd studio && node --test tests/live-field-notes.test.mjs
//   LIVE_FIELD_FULL=1 node --test tests/live-field-notes.test.mjs   (the whole corpus)
//   LIVE_FIELD_SEED=7 …                                              (another walk)
//
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { domEnv, load, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";
import { corpus } from "./harness/inline-corpus.mjs";
import {
  bridge,
  caretPositions,
  fieldState,
  live,
  seeded,
  select,
  source,
  toggleMark,
  type,
} from "./harness/live-field.mjs";

after(() => stopVite());
await domEnv();
const FULL = !!process.env.LIVE_FIELD_FULL;
const blocks = await load("/src/registry/outliner/live-field/note-blocks.ts");
const rich = await load("/src/registry/outliner/rich-note.ts");
const { NodeSelection, TextSelection } = await import("prosemirror-state");

const kinds = (doc) => doc.content.content.map((node) => node.type.name);
/** A note state after typing `text` from empty, character by character. */
const typed = (text) => type(fieldState("note", ""), text);
/** Apply a source edit the way the session does (the document is the parse at the new caret). */
const applyEdit = (state, edit) => {
  const tr = live.adoptTr(state, { field: "note" }, edit.text, {
    anchor: edit.caret,
    head: edit.caret,
  });
  return tr ? state.apply(tr) : state;
};
const caretOf = (state) => live.caretSource(state);

/* ───────────── The document: lossless at every caret ───────────── */

test("a note's document writes back byte for byte at every caret, blank and trailing lines included", () => {
  const notes = [
    ...corpus().all.filter((s) => s.includes("\n")),
    "a\n\n\nb\n\n",
    "\n\n- a\n\n\n",
    "---",
    "```js",
    "$$",
    "![a](https://x.y/i.png)",
    "- a\n\n- b\n\n",
  ];
  const sample = FULL ? notes : notes.filter((_, i) => i % 3 === 0 || i >= notes.length - 8);
  let checks = 0;
  const failures = [];
  for (const s of sample)
    for (
      let caret = 0;
      caret <= s.length;
      caret += FULL ? 1 : Math.max(1, Math.floor(s.length / 24))
    ) {
      const doc = bridge.noteToDoc(s, { whitespaceCaret: caret });
      checks++;
      try {
        doc.check();
      } catch (error) {
        failures.push({ s, caret, error: String(error) });
      }
      const back = bridge.serialize(doc).source;
      if (back !== s) failures.push({ s, caret, back });
    }
  console.log(
    `note round trip at carets: ${checks - failures.length}/${checks} (${sample.length} notes)`,
  );
  assert.deepEqual(failures.slice(0, 5), []);
});

test("blank lines: the caret on one has a line to stand on; right under a paragraph it is that paragraph's next line", () => {
  const at = (s, caret) => {
    const state = fieldState("note", s, caret);
    return {
      kinds: kinds(state.doc),
      caret: caretOf(state),
      parent: state.selection.$head.parent.type.name,
    };
  };
  assert.deepEqual(
    at("a\n\n", 3),
    { kinds: ["para", "para"], caret: 3, parent: "para" },
    "two newlines down: an empty paragraph",
  );
  assert.deepEqual(
    at("a\n", 2).kinds,
    ["para"],
    "one newline down: still the paragraph (its line break)",
  );
  assert.equal(at("a\n", 2).caret, 2);
  assert.deepEqual(at("## H\nabc\n", 9), { kinds: ["heading", "para"], caret: 9, parent: "para" });
  assert.deepEqual(
    at("- a\n", 4),
    { kinds: ["list"], caret: 4, parent: "itemtext" },
    "a list item continues on the next line",
  );
  assert.deepEqual(
    at("## H\n", 5).kinds,
    ["heading", "para"],
    "under a heading: a paragraph of its own",
  );
  assert.deepEqual(at("\n\n- b", 0).kinds, ["para", "list"], "above the first block");
  // without a caret the static reading: no empty paragraphs
  assert.deepEqual(kinds(bridge.noteToDoc("a\n\n")), ["para"]);
});

test("moving off a blank line into styled math-like text does not invent a format toggle", () => {
  for (const prefix of ["a", "#tag", ""]) {
    for (const style of ["**", "*", "~~", "=="]) {
      const text = `${prefix}\n\n\n$${style}b$$${style}`;
      const initial = fieldState("note", text, prefix.length + 1);
      const offset = text.indexOf("$$") + 1;
      const pos = bridge.sourceToPos(bridge.serialize(initial.doc), offset);
      const moved = select(initial, pos);
      assert.ok(moved);
      assert.equal(source(moved), text, "moving the caret preserves the exact source");
      assert.equal(caretOf(moved), offset);
      assert.equal(moved.storedMarks, null, "no explicit formatting command occurred");
      const next = type(moved, "#");
      const expected = text.slice(0, offset) + "#" + text.slice(offset);
      assert.equal(source(next), expected, "typing must not split/reopen a style container");
      assert.doesNotThrow(() => next.doc.check());
    }
  }
});

test("source adoption still distinguishes inside/outside closing styles and keeps explicit format intent", () => {
  for (const [caret, expected] of [
    [3, "**bx**"],
    [5, "**b**x"],
  ]) {
    const initial = fieldState("note", "");
    const tr = live.adoptTr(initial, { field: "note" }, "**b**", { anchor: caret, head: caret });
    assert.ok(tr);
    assert.equal(source(type(initial.apply(tr), "x")), expected);
  }
  let explicit = fieldState("note", "**abc**", 3);
  explicit = explicit.apply(explicit.tr.setStoredMarks([]));
  const tr = live.adoptTr(explicit, { field: "note" }, "**abcd**", { anchor: 3, head: 3 });
  assert.ok(tr);
  const adopted = explicit.apply(tr);
  assert.deepEqual(adopted.storedMarks, [], "a deliberate collapsed format command survives");
  assert.equal(source(type(adopted, "x")), "**a**x**bcd**");
});

/* ───────────── Block rules come from the grammar ───────────── */

test("block rules: headings 1–6, bullets, ordered lists keep their start, tasks, quotes, as typed", () => {
  for (let level = 1; level <= 6; level++) {
    const state = typed(`${"#".repeat(level)} Title`);
    assert.equal(state.doc.firstChild.type.name, "heading");
    assert.equal(state.doc.firstChild.attrs.level, level);
    assert.equal(state.doc.firstChild.textContent, "Title");
  }
  assert.equal(
    typed("#tag").doc.firstChild.type.name,
    "para",
    "a line-start #word is a tag, not a heading",
  );
  for (const marker of ["- ", "* ", "+ "])
    assert.equal(typed(`${marker}item`).doc.firstChild.type.name, "list");
  const ordered = typed("3. third").doc.firstChild;
  assert.deepEqual(
    [ordered.type.name, ordered.attrs.ordered, ordered.attrs.first],
    ["list", true, 3],
  );
  const task = typed("- [ ] todo").doc.firstChild;
  assert.equal(task.firstChild.attrs.checked, false);
  assert.equal(task.attrs.tasks, true);
  assert.equal(typed("> said").doc.firstChild.type.name, "quote");
  assert.equal(source(typed("> said")), "> said", "the stored text is the source");
});

test("block rules: `[]␣`, `[ ]␣`, `[x]␣` and `-␣[]␣` at a line start become task items (a rewrite)", () => {
  assert.equal(blocks.noteRewrite("[] ").insert, "- [ ] ");
  assert.equal(blocks.noteRewrite("[ ] ").insert, "- [ ] ");
  assert.equal(blocks.noteRewrite("a\n[x] ").insert, "- [x] ");
  assert.deepEqual(blocks.noteRewrite("- [] "), { from: 0, to: 5, insert: "- [ ] " });
  assert.equal(blocks.noteRewrite("- [ ] "), null, "already a task");
  assert.equal(blocks.noteRewrite("see [] "), null, "only at a line start");
});

test("block rules: ---, an image, a lone fence or $$ stay text while the caret is on their line", () => {
  const rule = typed("---");
  assert.deepEqual(kinds(rule.doc), ["para"], "--- is text until ⏎");
  assert.equal(rule.doc.textContent, "---");
  assert.deepEqual(
    kinds(applyEdit(rule, blocks.noteEnter("---", 3)).doc),
    ["rule", "para"],
    "⏎: a rule, and the caret below it",
  );
  assert.deepEqual(
    kinds(typed("```js").doc),
    ["para"],
    "a fence opener is text while typed: the rest of the note stays prose",
  );
  assert.deepEqual(kinds(typed("$$").doc), ["para"]);
  const image = typed("![Loss](https://x.y/l.png =640x360)");
  assert.deepEqual(kinds(image.doc), ["para"]);
  assert.deepEqual(kinds(applyEdit(image, blocks.noteEnter(source(image), caretOf(image))).doc), [
    "image",
    "para",
  ]);
});

/* ───────────── Enter ───────────── */

test("Enter: list items continue (next number, an open box); an empty item steps out, then leaves the list", () => {
  const cases = [
    ["- a", 3, "- a\n- ", 6],
    ["* a", 3, "* a\n* ", 6],
    ["1. a", 4, "1. a\n2. ", 8],
    ["9) a", 4, "9) a\n10) ", 9],
    ["- [x] a", 7, "- [x] a\n- [ ] ", 14],
    ["  - b", 5, "  - b\n  - ", 10],
    ["- ab", 3, "- a\n- b", 6],
    ["- abc", 2, "- \n- abc", 5],
    ["- a\n- ", 6, "- a\n\n\n", 6],
    ["- a\n  - ", 8, "- a\n- ", 6],
    ["- a\n- \n- c", 6, "- a\n\n\n\n- c", 6],
    ["- ", 2, "", 0],
  ];
  for (const [s, caret, text, at] of cases)
    assert.deepEqual(
      blocks.noteEnter(s, caret),
      { text, caret: at },
      `${JSON.stringify(s)} @${caret}`,
    );
});

test("Enter: quotes continue and an empty quoted line leaves; headings, paragraphs, fences, math and tables", () => {
  const cases = [
    ["> a", 3, "> a\n> ", 6],
    ["> a\n> ", 6, "> a\n", 4],
    ["## H", 4, "## H\n", 5],
    ["## Head", 5, "## He\nad", 6],
    ["## H", 3, "\n## H", 0],
    ["abc", 3, "abc\n", 4],
    ["abc", 0, "\nabc", 0],
    ["## H\n\nabc", 6, "## H\n\n\n\nabc", 6],
    ["a\n\n", 3, "a\n\n", 3],
    ["```py", 5, "```py\n\n```", 6],
    ["```\nabc", 3, "```\n\n```\nabc", 4],
    ["```\nx\n```", 5, "```\nx\n\n```", 6],
    ["$$", 2, "$$\n\n$$", 3],
    ["|a|b|", 5, "|a|b|\n| --- | --- |\n|   |   |", 22],
    ["![a](https://x.y/i.png)", 4, "![a](https://x.y/i.png)\n", 24],
  ];
  for (const [s, caret, text, at] of cases)
    assert.deepEqual(
      blocks.noteEnter(s, caret),
      { text, caret: at },
      `${JSON.stringify(s)} @${caret}`,
    );
  // a selection is replaced first
  assert.deepEqual(blocks.noteEnter("- abcd", 3, 5), { text: "- a\n- d", caret: 6 });
  // the table rule makes a table (shown as its source while the caret is in it)
  const table = applyEdit(fieldState("note", "|a|b|", 5), blocks.noteEnter("|a|b|", 5));
  assert.deepEqual(kinds(table.doc), ["rawblock"]);
  assert.equal(table.selection.$head.parent.type.name, "rawblock");
});

/* ───────────── ⌫ at a block's start, ⌘↵, ↓ ───────────── */

test("⌫ at a block's start takes its marker back; an empty one gives back what was typed", () => {
  const cases = [
    ["## ", 3, "##", 2],
    ["## H", 3, "H", 0],
    ["- [ ] a", 6, "- a", 2],
    ["- [ ] ", 6, "- [ ]", 5],
    ["- a", 2, "a", 0],
    ["- a\n  - b", 8, "- a\n- b", 6],
    ["> q", 2, "q", 0],
    ["abc\n\nxyz", 5, "abcxyz", 3],
    ["a\n\n", 3, "a", 1],
    ["---\nabc", 4, "abc", 0],
    ["```py\n\n```", 6, "```py", 5],
  ];
  for (const [s, caret, text, at] of cases)
    assert.deepEqual(
      blocks.noteBackspace(s, caret),
      { text, caret: at },
      `${JSON.stringify(s)} @${caret}`,
    );
  assert.equal(blocks.noteBackspace("## Head", 5), null, "inside the text: an ordinary ⌫");
  assert.equal(blocks.noteBackspace("```py", 5), null, "on a fence being typed: an ordinary ⌫");
  assert.deepEqual(
    blocks.noteBackspace("```\nx\n```", 4),
    { text: "```\nx\n```", caret: 4 },
    "code with something in it stays",
  );
});

test("⌘↵ toggles a task and leaves code, math or a table; ↓ on the last line leaves a block that ends the note", () => {
  assert.deepEqual(blocks.noteModEnter("- [ ] a", 7), { text: "- [x] a", caret: 7 });
  assert.deepEqual(blocks.noteModEnter("- [x] a", 3), { text: "- [ ] a", caret: 3 });
  assert.equal(blocks.noteModEnter("- a", 3), null, "not a task: the item's own ⌘↵");
  assert.equal(blocks.noteModEnter("plain", 3), null);
  assert.deepEqual(
    blocks.noteModEnter("```\nx", 5),
    { text: "```\nx\n```\n", caret: 10 },
    "an open fence is closed, the caret below it",
  );
  assert.deepEqual(
    blocks.noteModEnter("```\nx\n```\nabc", 5),
    { text: "```\nx\n```\n\n\nabc", caret: 10 },
    "a blank line keeps what follows apart",
  );
  assert.deepEqual(blocks.noteDownOut("$$\nx\n$$", 4), { text: "$$\nx\n$$\n", caret: 8 });
  assert.equal(blocks.noteDownOut("```\na\nb\n```", 4), null, "not on the last line");
  assert.equal(
    blocks.noteDownOut("```\nx\n```\n\nmore", 4),
    null,
    "not the last block: ↓ just moves",
  );
  assert.equal(blocks.toggleTask("  - [ ] x", 0), "  - [x] x");
  assert.equal(blocks.toggleTask("- x", 0), null);
});

/* ───────────── Dependent walks over notes ───────────── */

test("note walks: valid, lossless and the parse at its caret after every step (typing, Enter, ⌫, formats, pastes, moves)", () => {
  const all = corpus().all.filter((s) => s.includes("\n") || /^(#|- |> |```|\$\$|\||!\[)/.test(s));
  const notes = FULL ? all : all.filter((_, i) => i % 6 === 0);
  const rand = seeded(Number(process.env.LIVE_FIELD_SEED ?? 20261102));
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const CHARS = [
    "x",
    "*",
    "_",
    "`",
    "$",
    "#",
    "-",
    "[",
    "]",
    "|",
    ">",
    " ",
    "\n",
    "**",
    "```",
    "$$",
    "1.",
  ];
  const SNIPPETS = [
    "**b**",
    "*i*",
    "`c`",
    "#tag ",
    "[l](https://x.y)",
    "a\n- b\n- c",
    "## H\n\npara",
    "```\ncode\n```",
    "| a | b |\n|---|---|\n| 1 | 2 |",
  ];
  const config = { field: "note" };
  const counts = { notes: 0, steps: 0, refused: 0 };
  const failures = [];
  for (const start of notes) {
    counts.notes++;
    let state = fieldState("note", start, 0);
    for (let k = 0; k < 20; k++) {
      const op = pick([
        "type",
        "type",
        "enter",
        "backspace",
        "modenter",
        "delete",
        "format",
        "paste",
        "move",
      ]);
      const positions = caretPositions(state.doc);
      const at = select(state, pick(positions));
      if (!at) continue;
      const before = source(at);
      let next = at;
      let want = null;
      if (op === "type") {
        const offset = caretOf(at);
        const text = pick(CHARS);
        for (const char of text) next = next.applyTransaction(next.tr.insertText(char)).state;
        want = before.slice(0, offset) + text + before.slice(offset);
      } else if (op === "enter" || op === "backspace" || op === "modenter") {
        const offset = caretOf(at);
        const edit =
          op === "enter"
            ? blocks.noteEnter(before, offset)
            : op === "backspace"
              ? blocks.noteBackspace(before, offset)
              : blocks.noteModEnter(before, offset);
        if (!edit) continue;
        next = applyEdit(at, edit);
        want = edit.text;
      } else if (op === "delete" || op === "format") {
        const b = select(state, pick(positions));
        if (!b) continue;
        const from = Math.min(at.selection.head, b.selection.head);
        const to = Math.max(at.selection.head, b.selection.head);
        const range = select(state, from, to);
        if (!range || from === to) continue;
        if (op === "delete") next = range.applyTransaction(range.tr.deleteSelection()).state;
        else {
          let tr = null;
          if (
            !toggleMark(
              range.schema.marks[pick(["bold", "italic", "strike", "highlight", "code"])],
              null,
              { removeWhenPresent: false },
            )(range, (t) => (tr = t))
          )
            continue;
          const result = live.applyCommand(range, config, tr);
          if (!result.exact) {
            counts.refused++;
            continue;
          }
          next = result.state;
        }
      } else if (op === "paste") {
        const snippet = pick(SNIPPETS);
        if (snippet.includes("\n")) {
          const offset = caretOf(at);
          want = before.slice(0, offset) + snippet + before.slice(offset);
          next = applyEdit(at, { text: want, caret: offset + snippet.length });
        } else next = live.applyCommand(at, config, live.pasteTr(at, config, snippet).tr).state;
      }
      counts.steps++;
      state = next;
      try {
        state.doc.check();
      } catch (error) {
        failures.push({ check: "valid", start, k, op, error: String(error) });
        break;
      }
      const got = source(state);
      if (want !== null && got !== want)
        failures.push({ check: "lossless", start, k, op, before, want, got });
      const caret = state.selection.empty ? caretOf(state) : null;
      const parsed = bridge.sourceToDoc("note", got, {
        caret: op === "type" || want !== null ? caret : null,
        whitespaceCaret: caret,
      });
      if (
        !parsed.eq(state.doc) &&
        !bridge.sourceToDoc("note", got, { whitespaceCaret: caret }).eq(state.doc)
      )
        failures.push({ check: "normalized", start, k, op, before, got });
    }
  }
  console.log(`note walks: ${JSON.stringify(counts)}; failures ${failures.length}`);
  assert.deepEqual(failures.slice(0, 5), []);
});

/* ───────────── In the outliner ───────────── */

const find = (nodes, id) => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const inner = node.children && find(node.children, id);
    if (inner) return inner;
  }
  return undefined;
};
const noteOf = (ui, id) => find(ui.value(), id)?.data?.note ?? "";
const past = (ui) => ui.ol().latestState().history.past.length;
const openNote = async (ui, id) => {
  await ui.edit(id);
  await ui.key("Enter", { shiftKey: true });
  await ui.frames();
  assert.equal(ui.field()?.dataset.olEditor, "note", "⇧↵ opens the note in the live field");
};

test("typing a note: heading by /2, a list with continuation and exit, a task toggled by ⌘↵ and by a click, then Esc", async () => {
  const ui = await mountOutliner({
    defaultValue: [
      { id: "a", text: "Plan" },
      { id: "b", text: "Next" },
    ],
  });
  await openNote(ui, "a");
  await ui.type("/2");
  await ui.key("Enter");
  await ui.frames();
  await ui.type("Results");
  assert.equal(noteOf(ui, "a"), "## Results", "/2 makes the line a heading");
  await ui.key("Enter");
  await ui.type("- alpha");
  await ui.key("Enter");
  await ui.type("beta");
  await ui.key("Enter");
  await ui.key("Enter");
  assert.equal(noteOf(ui, "a"), "## Results\n- alpha\n- beta\n\n\n");
  await ui.type("[] ship");
  assert.equal(noteOf(ui, "a"), "## Results\n- alpha\n- beta\n\n\n- [ ] ship");
  const steps = past(ui);
  await ui.key("Enter", { metaKey: true });
  assert.equal(
    noteOf(ui, "a"),
    "## Results\n- alpha\n- beta\n\n\n- [x] ship",
    "⌘↵ on a task toggles it",
  );
  assert.equal(past(ui), steps + 1, "its own step");
  assert.equal(find(ui.value(), "a").checked, undefined, "the item itself is not completed");
  await ui.frames();
  const box = ui.field().querySelector("[data-task-box]:not([hidden])");
  assert.equal(box.getAttribute("aria-checked"), "true");
  await ui.click(box);
  assert.equal(
    noteOf(ui, "a"),
    "## Results\n- alpha\n- beta\n\n\n- [ ] ship",
    "a click on the box toggles it back",
  );
  assert.equal(ui.field()?.dataset.olEditor, "note", "and editing goes on");
  await ui.key("Escape");
  await ui.frames();
  assert.equal(ui.field(), null, "Esc: back to rows");
  const note = ui.row("a").querySelector("[data-ol-note]");
  assert.equal(
    note.querySelectorAll("ul").length,
    2,
    "the static note shows the blocks: the list, then the task list after it",
  );
  assert.ok(note.textContent.includes("Results"));
  await ui.unmount();
});

test("⌘↵ outside a task completes the item, as before; Tab on a list's first item leaves both the note and the row", async () => {
  const ui = await mountOutliner({
    defaultValue: [
      { id: "a", text: "First" },
      { id: "b", text: "Second", data: { note: "- item" } },
    ],
  });
  await openNote(ui, "b");
  await ui.key("Enter", { metaKey: true });
  assert.equal(
    find(ui.value(), "b").checked ?? find(ui.value(), "b").data?.completed,
    true,
    "the item's own ⌘↵",
  );
  await ui.key("Tab");
  assert.equal(
    find(ui.value(), "a").children,
    undefined,
    "a list item's Tab is the list's: the row stays",
  );
  assert.equal(noteOf(ui, "b"), "- item");
  await ui.unmount();
});

test("code, math and rules: fences open and close below the caret, ⌘↵ leaves, ⌫ on an empty one gives the opener back", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "Code" }] });
  await openNote(ui, "a");
  await ui.type("```js");
  assert.equal(ui.field().querySelector("[data-block]"), null, "the opener is text while typed");
  await ui.key("Enter");
  assert.equal(noteOf(ui, "a"), "```js\n\n```");
  await ui.type("let a");
  await ui.key("Enter");
  await ui.type("a++");
  assert.equal(noteOf(ui, "a"), "```js\nlet a\na++\n```", "Enter adds a line inside");
  assert.equal(
    ui.field().querySelector("[data-block=codeblock] [contenteditable=false]").textContent,
    "js",
    "the info string is its label",
  );
  await ui.key("Enter", { metaKey: true });
  await ui.type("$$");
  await ui.key("Enter");
  await ui.type("x^2");
  await ui.key("ArrowDown");
  await ui.type("---");
  await ui.key("Enter");
  await ui.type("end");
  assert.equal(noteOf(ui, "a"), "```js\nlet a\na++\n```\n$$\nx^2\n$$\n---\nend");
  await ui.frames();
  const math = ui.field().querySelector("[data-block=mathblock]");
  assert.equal(math.children[0].hidden, true, "math renders once the caret has left it");
  assert.ok(ui.field().querySelector("[role=separator]"), "the rule");
  await ui.unmount();
  const empty = await mountOutliner({
    defaultValue: [{ id: "a", text: "x", data: { note: "```py\n\n```" } }],
  });
  await empty.edit("a");
  await empty.act(() => empty.ol().dispatch({ type: "focus", id: "a", field: "note", start: 6 }));
  await empty.frames();
  await empty.key("Backspace");
  assert.equal(noteOf(empty, "a"), "```py", "⌫ in an empty code block: back to the opener line");
  await empty.unmount();
});

test("tables render and show a labelled source box while the caret is in them; images render like the static note", async () => {
  const table = "| A | B |\n|---|---|\n| 1 | 2 |";
  const ui = await mountOutliner({
    defaultValue: [
      {
        id: "a",
        text: "T",
        data: { note: `intro\n\n${table}\n\n![Curve](https://x.y/c.png =64x32 "Loss")` },
      },
    ],
  });
  await ui.act(() => ui.ol().dispatch({ type: "focus", id: "a", field: "note", start: 2 }));
  await ui.act(() => ui.ui().setEditing(true));
  await ui.frames();
  const el = ui.field();
  const box = el.querySelector("[data-block=rawblock]");
  assert.equal(box.children[0].hidden, true, "the caret is elsewhere: the table is rendered");
  assert.ok(box.querySelector("table th"), "as the static note renders it");
  const img = el.querySelector("[data-block=image] img");
  assert.deepEqual(
    [img.getAttribute("alt"), img.getAttribute("width"), img.getAttribute("height")],
    ["Curve", "64", "32"],
  );
  await ui.act(() => el.setSelectionRange(12, 12));
  await ui.frames();
  assert.equal(box.children[0].hidden, false, "the caret is in it: its source");
  assert.equal(
    box.querySelector("[contenteditable=false]").textContent,
    "Table source",
    "labelled",
  );
  assert.ok(box.children[0].className.includes("min-h-11"), "a 44px target");
  // Enter on a selected image shows its source line, for its alt, size and title
  const view = el.editor.view;
  let imagePos = -1;
  view.state.doc.forEach((node, offset) => node.type.name === "image" && (imagePos = offset));
  await ui.act(() =>
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, imagePos))),
  );
  await ui.key("Enter");
  assert.equal(
    el.editor.view.state.selection.$head.parent.textContent,
    '![Curve](https://x.y/c.png =64x32 "Loss")',
  );
  await ui.unmount();
});

test("trusted embeds render through the host's renderer (one portal each) once the caret leaves; a throwing one shows code", async () => {
  const React = await import("react");
  const fence = "```";
  const renderers = {
    "embed:chart": ({ source: body }) =>
      React.createElement("figure", { "data-chart": body.trim() }),
    "embed:broken": () => {
      throw new Error("host bug");
    },
  };
  const errors = console.error;
  console.error = () => {};
  try {
    const ui = await mountOutliner({
      renderers,
      defaultValue: [
        {
          id: "a",
          text: "E",
          data: {
            note: `top\n\n${fence}embed:chart\nus 1\n${fence}\n\n${fence}embed:broken\nraw\n${fence}`,
          },
        },
      ],
    });
    await ui.act(() => ui.ol().dispatch({ type: "focus", id: "a", field: "note", start: 1 }));
    await ui.act(() => ui.ui().setEditing(true));
    await ui.frames();
    const el = ui.field();
    assert.equal(
      el.querySelector("figure[data-chart]")?.dataset.chart,
      "us 1",
      "rendered by the host",
    );
    const broken = el.querySelectorAll("[data-block=codeblock]")[1];
    assert.equal(
      broken.querySelector("[data-embed] pre")?.textContent,
      "raw",
      "the boundary falls back to code",
    );
    await ui.act(() => el.setSelectionRange(22, 22));
    await ui.frames();
    assert.equal(el.querySelector("figure[data-chart]"), null, "the caret in it: its source");
    assert.equal(el.querySelector("[data-block=codeblock] code").textContent, "us 1");
    await ui.unmount();
  } finally {
    console.error = errors;
  }
});

test("inline behaviour in notes: italic is *, chips, # suggestions, a date chip opens the picker with its token, ⇧F10 the item menu", async () => {
  const ui = await mountOutliner({
    defaultValue: [
      { id: "t", text: "x #launch" },
      { id: "a", text: "N", data: { note: "make this one\ndue !(2026-11-03) ok" } },
    ],
  });
  await openNote(ui, "a");
  await ui.act(() => ui.field().setSelectionRange(5, 9));
  await ui.key("i", { metaKey: true, code: "KeyI" });
  assert.equal(
    noteOf(ui, "a"),
    "make *this* one\ndue !(2026-11-03) ok",
    "⌘I writes *, like titles",
  );
  await ui.act(() => ui.field().setSelectionRange(noteOf(ui, "a").length, noteOf(ui, "a").length));
  await ui.type(" #la");
  const box = await waitFor(() => document.querySelector("[role=listbox]"));
  assert.ok(box);
  await ui.key("Enter");
  assert.equal(
    noteOf(ui, "a"),
    "make *this* one\ndue !(2026-11-03) ok #launch ",
    "an accepted suggestion is one token edit",
  );
  const view = ui.field().editor.view;
  let datePos = -1;
  view.state.doc.descendants(
    (node, pos) => (
      node.type.name === "chip" && node.attrs.kind === "date" && (datePos = pos),
      true
    ),
  );
  await ui.act(() =>
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, datePos))),
  );
  await ui.key("Enter");
  const request = await waitFor(() => ui.ui().datePicker);
  assert.deepEqual([request.field, request.src, request.start], ["note", "!(2026-11-03)", 20]);
  await ui.act(() => ui.ui().setDatePicker(null));
  await ui.frames();
  ui.field()?.focus();
  await ui.act(() => ui.field().setSelectionRange(2, 2));
  await ui.key("F10", { shiftKey: true });
  await waitFor(() => document.querySelector("[data-item-menu]"));
  await ui.unmount();
});

test("paste into a note: several lines go in as their source and read as blocks; one line renders inline", async () => {
  const ui = await mountOutliner({
    defaultValue: [{ id: "a", text: "P", data: { note: "start" } }],
  });
  await openNote(ui, "a");
  const paste = (text) =>
    ui.act(() => {
      const event = new window.Event("paste", { bubbles: true, cancelable: true });
      event.clipboardData = {
        getData: (kind) => (kind === "text/plain" ? text : ""),
        types: ["text/plain"],
        files: [],
      };
      ui.field().dispatchEvent(event);
    });
  await paste("\n\n## Pasted\n- one\n- two");
  assert.equal(noteOf(ui, "a"), "start\n\n## Pasted\n- one\n- two");
  assert.deepEqual(kinds(ui.field().editor.view.state.doc), ["para", "heading", "list"]);
  await paste(" **b**");
  assert.equal(noteOf(ui, "a"), "start\n\n## Pasted\n- one\n- two **b**");
  await ui.key("z", { metaKey: true, code: "KeyZ" });
  assert.equal(noteOf(ui, "a"), "start\n\n## Pasted\n- one\n- two", "⌘Z: one step each");
  await ui.key("z", { metaKey: true, shiftKey: true, code: "KeyZ" });
  assert.equal(noteOf(ui, "a"), "start\n\n## Pasted\n- one\n- two **b**", "⇧⌘Z");
  await ui.unmount();
});

test("note edges: ↑ on the first line goes to the title, ⌫ in an empty note too; ↓ inside a note moves between its blocks", async () => {
  const ui = await mountOutliner({
    defaultValue: [
      { id: "a", text: "Title", data: { note: "one\n\ntwo" } },
      { id: "b", text: "Next" },
    ],
  });
  await ui.act(() => ui.ol().dispatch({ type: "focus", id: "a", field: "note", start: 7 }));
  await ui.act(() => ui.ui().setEditing(true));
  await ui.frames();
  const el = ui.field();
  assert.equal(
    el.liveField.atVisualBoundary("up"),
    false,
    "the second paragraph has a block above it",
  );
  assert.equal(el.liveField.atVisualBoundary("down"), true);
  await ui.act(() => el.setSelectionRange(0, 0));
  assert.equal(el.liveField.at("start"), true);
  await ui.key("ArrowUp");
  await ui.frames();
  assert.equal(ui.field()?.dataset.field, "title", "↑ from the note's first line: the title");
  await ui.unmount();
  const empty = await mountOutliner({ defaultValue: [{ id: "a", text: "Title" }] });
  await openNote(empty, "a");
  assert.ok(empty.field().hasAttribute("data-empty"), "an empty note shows its placeholder");
  await empty.key("Backspace");
  await empty.frames();
  assert.equal(empty.field()?.dataset.field, "title");
  await empty.unmount();
});

test("power profile: Enter in a note still finishes it and starts the next item (before any block rule)", async () => {
  const ui = await mountOutliner({
    defaultValue: [{ id: "a", text: "A", data: { note: "- list" } }],
    defaultSettings: { keyboard: "power" },
  });
  await openNote(ui, "a");
  await ui.key("Enter");
  assert.equal(noteOf(ui, "a"), "- list", "no list continuation");
  assert.equal(ui.value().length, 2, "a new item");
  await ui.unmount();
});

/* ───────────── Static and editing parity ───────────── */

test("parity: a note's text blocks carry the static render's elements and classes, block for block", async () => {
  const note =
    "Para line\nsecond\n\n## Heading two\n\n> quoted\n> more\n\n- a\n- b\n\n1. one\n2. two\n\n- [x] done\n- [ ] open\n\n---";
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "P", data: { note } }] });
  const shape = (el) =>
    [...el.children].map(
      (child) =>
        `${child.tagName}|${child.getAttribute("role") ?? ""}|${(child.className || "")
          .split(" ")
          .filter((c) => !/whitespace-pre-wrap|break-words/.test(c))
          .sort()
          .join(" ")}`,
    );
  const stat = shape(ui.row("a").querySelector("[data-rich-note]")).map((s) =>
    s.replace(/^SPAN/, "DIV"),
  );
  await ui.act(() => ui.ol().dispatch({ type: "focus", id: "a", field: "note", start: 0 }));
  await ui.act(() => ui.ui().setEditing(true));
  await ui.frames();
  const edit = shape(ui.field());
  assert.deepEqual(edit, stat);
  // the list items too: a task's row and its box
  const items = (root) =>
    [...root.querySelectorAll("li")].map((li) => li.className.split(" ").sort().join(" "));
  assert.deepEqual(items(ui.field()), [
    "",
    "",
    "",
    "",
    "flex gap-2 items-start",
    "flex gap-2 items-start",
  ]);
  await ui.unmount();
});

/* ───────────── Walks through the session, against the real outliner ───────────── */

test("note session walks: block keys, typing, foreign changes and undo keep the field valid, bound and in sync", async () => {
  const { FieldSession, noteTypingRewrite } = await load(
    "/src/registry/outliner/live-field/field-session.ts",
  );
  const { fieldHost } = await load("/src/registry/outliner/live-field/outliner-host.ts");
  const all = corpus().all.filter((s) => s.includes("\n"));
  const notes = FULL ? all.filter((_, i) => i % 4 === 0) : all.filter((_, i) => i % 40 === 0);
  const rand = seeded(Number(process.env.LIVE_FIELD_SEED ?? 4242));
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const counts = { notes: 0, steps: 0, foreign: 0, conflicts: 0 };
  const failures = [];
  let clock = 5_000_000;
  for (const start of notes) {
    counts.notes++;
    const ui = await mountOutliner({
      defaultValue: [{ id: "a", text: "T", data: { note: start } }],
    });
    const host = fieldHost(() => ui.ol());
    const s = new FieldSession(
      { field: "note", rewrite: noteTypingRewrite },
      "a",
      host.text("a", "note") ?? "",
      host,
    );
    const latest = () => host.text("a", "note") ?? "";
    for (let k = 0; k < 20; k++) {
      const op = pick([
        "type",
        "type",
        "enter",
        "backspace",
        "foreign",
        "undo",
        "redo",
        "move",
        "render",
      ]);
      const positions = caretPositions(s.state.doc);
      try {
        if (op === "type" || op === "enter" || op === "backspace" || op === "move") {
          const pos = pick(positions);
          s.state = s.state.apply(s.state.tr.setSelection(TextSelection.create(s.state.doc, pos)));
        }
        if (op === "type") {
          const { from, to } = s.state.selection;
          s.apply(s.state.tr.insertText(pick(["x", "-", " ", "#", "`", "*"]), from, to), {
            time: (clock += 40),
          });
        } else if (op === "enter") s.enter((clock += 40));
        else if (op === "backspace") s.blockBackspace((clock += 40));
        else if (op === "foreign") {
          // another surface writes the row; the field has not rendered it
          counts.foreign++;
          await ui.act(() =>
            ui.ol().dispatch({
              type: "note",
              id: "a",
              text: `Ⓕ${latest()}`,
              time: Number.NEGATIVE_INFINITY,
            }),
          );
        } else if (op === "undo" || op === "redo")
          await ui.act(() => ui.ol().dispatch({ type: op }));
        else if (op === "render")
          s.onRender(latest(), ui.ol().currentSeq(), ui.ol().latestState().caret);
      } catch (error) {
        failures.push({ check: "threw", start, k, op, error: String(error) });
        break;
      }
      counts.steps++;
      try {
        s.state.doc.check();
      } catch (error) {
        failures.push({ check: "valid", start, k, op, error: String(error) });
      }
    }
    // in the end the field shows exactly what the outliner holds
    s.onRender(latest(), ui.ol().currentSeq() + 1, null);
    if (s.source !== latest())
      failures.push({ check: "in-sync", start, field: s.source, host: latest() });
    counts.conflicts += s.notices.filter((n) => n.kind === "edit-conflict").length;
    await ui.unmount();
  }
  console.log(`note session walks: ${JSON.stringify(counts)}; failures ${failures.length}`);
  assert.deepEqual(failures.slice(0, 5), []);
});

/* ───────────── Tab nests list items; /1–/3 make a line a heading; #␣ stays text ───────────── */

test("Tab nests a list item under the one above, with its own items; ⇧Tab takes it a level out", () => {
  const tab = (s, from, to = from, out = false) => blocks.noteTab(s, from, to, out);
  assert.deepEqual(tab("- a\n- b", 6), { text: "- a\n  - b", caret: 8 }, "under the item above");
  assert.deepEqual(
    tab("- a\n- b", 2),
    { text: "- a\n- b", caret: 2 },
    "the first item has nothing to go under: it stays, Tab is still the list's",
  );
  assert.deepEqual(
    tab("- a\n- b\n  - c", 6).text,
    "- a\n  - b\n    - c",
    "its own items come along",
  );
  assert.deepEqual(tab("1. a\n2. b", 8).text, "1. a\n   2. b", "under an ordered item's text");
  assert.deepEqual(
    tab("- a\n  - b", 9, 9, true),
    { text: "- a\n- b", caret: 7 },
    "⇧Tab: a level out",
  );
  assert.deepEqual(tab("- a\n- b", 6, 6, true).text, "- a\n- b", "⇧Tab at the top level: it stays");
  assert.deepEqual(
    tab("- a\n- b\n- c", 5, 11),
    { text: "- a\n  - b\n  - c", caret: 15, anchor: 7 },
    "a selection: its items move together and stay selected",
  );
  assert.equal(tab("para", 2), null, "not in a list: the row's Tab");
  assert.equal(tab("```\n- a\n```", 6), null, "not in code");
});

test("/1–/3 in a note: the line becomes a heading (its list or quote marker goes); Normal text takes it back", () => {
  assert.deepEqual(blocks.lineHeading("abc", 1, 2), { text: "## abc", caret: 4 });
  assert.deepEqual(blocks.lineHeading("x\n- item\ny", 5, 1), { text: "x\n# item\ny", caret: 5 });
  assert.deepEqual(blocks.lineHeading("## H", 4, 3).text, "### H", "another level");
  assert.deepEqual(blocks.lineHeading("## H", 4, undefined).text, "H", "plain again");
  assert.equal(blocks.lineHeading("> q", 3, 1).text, "# q");
  assert.equal(blocks.lineHeading("```\ncode\n```", 6, 1), null, "not in code");
  assert.equal(blocks.lineHeadingLevel("a\n## H", 4), 2);
  assert.equal(blocks.lineHeadingLevel("a", 0), undefined);
});

test("#␣ at a note line's start stays text (stored \\#); #tag is still a tag", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "Plan" }] });
  await openNote(ui, "a");
  await ui.type("# not a heading");
  assert.equal(noteOf(ui, "a"), "\\# not a heading");
  assert.equal(
    ui.field().querySelector("h1,h2,h3,h4,h5,h6,[data-heading]"),
    null,
    "shown as a paragraph",
  );
  assert.equal(ui.field().textContent, "# not a heading", "the backslash is not shown");
  await ui.unmount();
});

test("Tab in a note's list nests the item in the field (not the row); Tab in a paragraph still indents the row", async () => {
  const ui = await mountOutliner({
    defaultValue: [
      { id: "a", text: "One" },
      { id: "b", text: "Two", data: { note: "- x\n- y" } },
    ],
  });
  await openNote(ui, "b");
  await ui.act(() => ui.field().setSelectionRange(7, 7));
  await ui.key("Tab");
  assert.equal(noteOf(ui, "b"), "- x\n  - y");
  assert.equal(ui.value().length, 2, "the row did not move");
  await ui.key("Tab", { shiftKey: true });
  assert.equal(noteOf(ui, "b"), "- x\n- y");
  await ui.unmount();
});
