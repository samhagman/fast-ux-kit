// Dependent edit sequences on titles: per string, seeded steps that build on each other
// (typing delimiter and boundary characters, deleting ranges, format commands, Markdown pastes).
// After every step the document is valid and exactly the parse of its own source, and a typed
// character lands exactly at the caret's source offset.
//
//   cd studio && node --test tests/live-field-walks.test.mjs
//   LIVE_FIELD_FULL=1 node --test tests/live-field-walks.test.mjs   (the whole corpus)
//
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { stopVite } from "./harness/outliner-dom.mjs";
import { corpus } from "./harness/inline-corpus.mjs";
import { bridge, caretPositions, fieldState, live, seeded, select, source, toggleMark } from "./harness/live-field.mjs";

after(() => stopVite());
const FULL = !!process.env.LIVE_FIELD_FULL;
const STEPS = 20;
const CHARS = ["*", "_", "~", "=", "`", "$", "#", "[", "]", "(", ")", "!", "\\", " ", "x", "**", "~~", "=="];
const SNIPPETS = ["**b**", "*i*", "a *b* c", "`c`", "#tag ", "[l](https://x.y)", "~~s~~", "==h==", "***bi***", "x\\*y", "$x$ ", "**a *b***"];
const KINDS = ["bold", "italic", "strike", "highlight", "code"];
const config = { field: "title" };

test("title walks: valid, normalized and local after every step", () => {
  const all = corpus().all.filter((s) => !s.includes("\n"));
  const titles = FULL ? all : all.filter((_, i) => i % 4 === 0);
  const rand = seeded(20261101);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const counts = { strings: 0, steps: 0, typed: 0, refused: 0, literalPastes: 0 };
  const failures = [];
  for (const start of titles) {
    counts.strings++;
    let state = fieldState("title", start, 0);
    for (let k = 0; k < STEPS; k++) {
      const op = pick(["type", "type", "type", "delete", "format", "paste"]);
      const positions = caretPositions(state.doc);
      const before = source(state);
      let next = null;
      if (op === "type") {
        const at = select(state, pick(positions));
        if (!at) continue;
        const offset = live.caretSource(at);
        const text = pick(CHARS);
        next = at;
        for (const char of text) next = next.applyTransaction(next.tr.insertText(char)).state;
        counts.typed++;
        const want = before.slice(0, offset) + text + before.slice(offset);
        if (source(next) !== want) failures.push({ check: "locality", start, k, before, offset, text, got: source(next) });
      } else if (op === "delete") {
        const a = pick(positions);
        const b = pick(positions);
        const at = select(state, Math.min(a, b), Math.max(a, b));
        if (!at || a === b) continue;
        next = at.applyTransaction(at.tr.deleteSelection()).state;
      } else if (op === "format") {
        const a = pick(positions);
        const b = pick(positions);
        const at = select(state, Math.min(a, b), Math.max(a, b));
        let tr = null;
        if (!at || a === b || !toggleMark(at.schema.marks[pick(KINDS)], null, { removeWhenPresent: false })(at, (t) => (tr = t))) continue;
        const result = live.applyCommand(at, config, tr);
        // a format that cannot be written exactly is refused: the field keeps what it had
        if (!result.exact) {
          counts.refused++;
          continue;
        }
        next = result.state;
      } else {
        const at = select(state, pick(positions));
        if (!at) continue;
        const { tr, literal } = live.pasteTr(at, config, pick(SNIPPETS));
        if (literal) counts.literalPastes++;
        next = live.applyCommand(at, config, tr).state;
      }
      counts.steps++;
      state = next;
      try {
        state.doc.check();
      } catch (error) {
        failures.push({ check: "valid", start, k, op, error: String(error) });
      }
      const caret = state.selection.empty ? live.caretSource(state) : null;
      const parsed = bridge.sourceToDoc("title", source(state), { caret: op === "type" ? caret : null, whitespaceCaret: caret });
      if (!parsed.eq(state.doc) && !bridge.sourceToDoc("title", source(state), { whitespaceCaret: caret }).eq(state.doc))
        failures.push({ check: "normalized", start, k, op, before, got: source(state) });
    }
  }
  console.log(`title walks: ${JSON.stringify(counts)}; failures ${failures.length}`);
  assert.deepEqual(failures.slice(0, 5), []);
});
