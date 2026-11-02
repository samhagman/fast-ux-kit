// The live field's bridge between stored source and the editor document, without a view:
// lossless round trips over the whole corpus, typing as source insertions at the caret, format
// commands that are written exactly or reported, paste inside styles, and row split / merge
// through the real core.
//
//   cd studio && node --test tests/live-field-bridge.test.mjs
//   LIVE_FIELD_FULL=1 node --test tests/live-field-bridge.test.mjs   (every caret of every string)
//
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { load, stopVite } from "./harness/outliner-dom.mjs";
import { corpus } from "./harness/inline-corpus.mjs";
import { bridge, caretPositions, fieldState, inline, live, picture, select, source, toggleMark, type } from "./harness/live-field.mjs";

after(() => stopVite());
const core = await load("@fux/core");
const FULL = !!process.env.LIVE_FIELD_FULL;
const strings = corpus();
const fields = (s) => (s.includes("\n") ? ["note"] : ["title", "note"]);

test("every corpus string round-trips byte for byte, as title and as note, and its document is valid", () => {
  let count = 0;
  for (const s of strings.all)
    for (const field of ["title", "note"]) {
      const doc = bridge.sourceToDoc(field, s);
      assert.doesNotThrow(() => doc.check(), `${field}: ${JSON.stringify(s)}`);
      assert.equal(bridge.docToSource(doc), s, `${field}: ${JSON.stringify(s)}`);
      assert.ok(bridge.isStable(field, doc), `${field}: ${JSON.stringify(s)}`);
      count++;
    }
  console.log(`round trip: ${count}/${count} byte-identical and valid`);
});

test("styles that cover the same text are written back in the order they were nested", () => {
  for (const s of ["**~~x~~**", "~~**x**~~", "==*~~x~~*==", "~~**==a==**~~ b", "*__a__*"]) assert.equal(bridge.docToSource(bridge.sourceToDoc("title", s)), s);
  assert.equal(source(type(fieldState("title", "~~**==\\)sb**~~", 10), "==")), "~~**==\\)sb==**~~");
});

test("a character typed at any caret lands at that caret's source offset, and the document is the parse", () => {
  const INSERTS = ["x", "*", "_", "~", "=", "`", "$", "#", "[", "]", "(", ")", "!", "\\", " ", "@"];
  const sample = FULL ? strings.all : [...strings.edges, ...strings.fixtures.filter((_, i) => i % 7 === 0), ...strings.random.filter((_, i) => i % 15 === 0)];
  const failures = [];
  let checks = 0;
  for (const s of sample)
    for (const field of fields(s)) {
      const base = fieldState(field, s, 0);
      for (const p of caretPositions(base.doc)) {
        const at = select(base, p);
        if (!at) continue;
        const offset = live.caretSource(at);
        const char = INSERTS[(p + s.length) % INSERTS.length];
        const next = at.applyTransaction(at.tr.insertText(char)).state;
        const got = source(next);
        checks++;
        if (got !== s.slice(0, offset) + char + s.slice(offset)) failures.push({ field, s, p, char, got });
        const caret = live.caretSource(next);
        if (!bridge.sourceToDoc(field, got, { caret, whitespaceCaret: caret }).eq(next.doc)) failures.push({ field, s, p, char, got, normalized: false });
        assert.doesNotThrow(() => next.doc.check());
      }
    }
  console.log(`typing locality: ${checks - failures.length}/${checks} (${sample.length} strings)`);
  assert.deepEqual(failures.slice(0, 5), []);
});

test("live input rules come from the grammar: stars show until a style closes, then the caret is outside it", () => {
  let s = type(fieldState("title", ""), "Ship **be");
  assert.equal(picture(s.doc), "Ship **be");
  s = type(s, "ta**");
  assert.equal(picture(s.doc), "Ship [bold:beta]");
  s = type(s, " now");
  assert.equal(source(s), "Ship **beta** now", "typing after a just-closed style is plain");
  s = type(fieldState("title", ""), "**bold *both***");
  assert.equal(picture(s.doc), "[bold:bold ][bold+italic:both]");
  s = type(fieldState("title", ""), "Use *x* here");
  assert.equal(picture(s.doc), "Use [italic:x] here");
  assert.equal(source(type(fieldState("title", "**bold** tail", 6), "er")), "**bolder** tail", "the caret inside the closer continues the style");
  s = type(fieldState("title", ""), "Plan #la");
  assert.equal(picture(s.doc), "Plan #la", "no chip mid-word");
  assert.equal(picture(type(s, "unch ").doc), "Plan {tag:#launch} ");
  assert.equal(picture(type(fieldState("title", ""), "cost $x$1").doc), "cost $x$1", "math before a digit is currency");
  assert.equal(picture(type(fieldState("title", ""), "\\*lit\\*").doc), "[esc:*]lit[esc:*]");
  assert.equal(picture(type(fieldState("title", ""), "see [docs](https://a.b/c)").doc), "see {link:[docs](https://a.b/c)}");
  assert.equal(type(fieldState("note", ""), "## Results").doc.firstChild.type.name, "heading");
});

test("⌫ right after a conversion restores the literal characters typed, kept literal", () => {
  const s = type(fieldState("title", ""), "a **b**");
  assert.equal(picture(s.doc), "a [bold:b]");
  const tr = live.revertConversionTr(s, { field: "title" });
  assert.ok(tr);
  const back = s.apply(tr);
  assert.equal(bridge.reading(back.doc), bridge.reading(bridge.sourceToDoc("title", "a \\*\\*b\\*\\*")), "the typed stars, as literal text");
  assert.equal(source(back), "a \\**b**", "one escape is enough to keep it literal");
  assert.equal(live.revertConversionTr(type(s, "x"), { field: "title" }), null, "any edit since voids it");
});

/** A format command over [from, to), as the field applies it. */
function format(base, field, kind, from, to) {
  const state = select(fieldState(field, base, 0), from, to);
  if (!state) return null;
  let tr = null;
  if (!toggleMark(state.schema.marks[kind], null, { removeWhenPresent: false })(state, (t) => (tr = t))) return null;
  return { intended: bridge.reading(tr.doc), ...live.applyCommand(state, { field }, tr) };
}
const BASES = [
  "a b c",
  "**a b** c",
  "a *b c*",
  "**a *b* c**",
  "*a **b** c*",
  "x **y** z",
  "**a****b**",
  "see [l](https://x.y) now",
  "tag #t here",
  "ping @t here",
  "`code` x",
  "a ~~b~~ ==c==",
  "word**s** and more",
  "__legacy__ and *new*",
  "***both*** end",
  "lit \\*star\\* x",
  "on !(2026-11-03) go",
  "see [[T|i]] ok",
  "cost $x$ ok",
  "ta #t__x",
  "a #snake_case b",
  "a!b (a)b",
];
const KINDS = ["bold", "italic", "strike", "highlight", "code"];

test("every format command reads back exactly or is reported inexact; the field always shows what is stored", () => {
  const stats = { cases: 0, exact: 0, inexact: 0, locality: 0 };
  const refusedBy = {};
  for (const field of ["title", "note"])
    for (const base of BASES) {
      const doc = bridge.sourceToDoc(field, base);
      const map = bridge.serialize(doc);
      const spans = inline.parseInline(base).flatMap((segment) => [...(segment.marks ?? []), segment]);
      for (const kind of KINDS)
        for (let from = 1; from < doc.content.size - 1; from++)
          for (let to = from + 1; to <= doc.content.size - 1; to++) {
            const result = format(base, field, kind, from, to);
            if (!result) continue;
            stats.cases++;
            const stored = source(result.state);
            const reread = bridge.sourceToDoc(field, stored);
            assert.doesNotThrow(() => result.state.doc.check());
            assert.equal(bridge.reading(result.state.doc), bridge.reading(reread), `${base} ${kind} ${from}-${to}: the field shows ${stored}`);
            // bytes outside the containers and tokens the range touches are unchanged
            let a = bridge.posToSource(map, from, "lo");
            let b = bridge.posToSource(map, to, "hi");
            for (const span of spans)
              if (span.start < b && span.end > a) {
                a = Math.min(a, span.start);
                b = Math.max(b, span.end);
              }
            assert.ok(stored.startsWith(base.slice(0, a)) && stored.endsWith(base.slice(b)), `${base} ${kind} ${from}-${to}: ${stored}`);
            stats.locality++;
            if (result.exact) {
              assert.equal(bridge.reading(reread), result.intended, `${base} ${kind} ${from}-${to}`);
              stats.exact++;
            } else {
              stats.inexact++;
              refusedBy[`${base} / ${kind}`] = (refusedBy[`${base} / ${kind}`] ?? 0) + 1;
            }
          }
    }
  console.log(`format matrix: ${JSON.stringify(stats)}; refused: ${JSON.stringify(refusedBy)}`);
  assert.ok(stats.cases > 3000);
  // what cannot be written exactly is a literal star inside the range, or a token the style would split
  assert.ok(stats.inexact < stats.cases * 0.05, `${stats.inexact} refused`);
});

test("format commands merge into one container and move a leftover's edge space outside", () => {
  let state = select(fieldState("title", "ab", 0), 1, 2);
  let tr = null;
  toggleMark(state.schema.marks.bold, null, { removeWhenPresent: false })(state, (t) => (tr = t));
  state = select(live.applyCommand(state, { field: "title" }, tr).state, 2, 3);
  toggleMark(state.schema.marks.bold, null, { removeWhenPresent: false })(state, (t) => (tr = t));
  assert.equal(source(live.applyCommand(state, { field: "title" }, tr).state), "**ab**", "⌘B a, then ⌘B b: one container");
  state = select(fieldState("title", "**a b** c", 0), 1, 2);
  assert.equal(source(live.applyCommand(state, { field: "title" }, state.tr.removeMark(1, 2, state.schema.marks.bold)).state), "a **b** c");
  state = select(fieldState("title", "a b c", 0), 1, 4);
  state = live.applyCommand(state, { field: "title" }, state.tr.addMark(1, 4, state.schema.marks.bold.create())).state;
  state = live.applyCommand(state, { field: "title" }, state.tr.addMark(3, 6, state.schema.marks.italic.create())).state;
  assert.equal(source(state), "**a *b*** *c*", "an overlap is written properly nested");
  assert.equal(picture(bridge.sourceToDoc("title", source(state))), "[bold:a ][bold+italic:b] [italic:c]");
  state = fieldState("title", "foobarbaz", 0);
  assert.equal(source(live.applyCommand(state, { field: "title" }, state.tr.addMark(4, 7, state.schema.marks.italic.create())).state), "foo__bar__baz", "intraword italic is spelled __");
  state = select(fieldState("title", "lit \\*star\\* x", 0), 1, 12);
  toggleMark(state.schema.marks.bold, null, { removeWhenPresent: false })(state, (t) => (tr = t));
  assert.equal(live.applyCommand(state, { field: "title" }, tr).exact, false, "bold around a literal star cannot be written");
});

test("touching runs of one kind never put two marks of a kind on a character", () => {
  for (const s of ["****x****", "____x____", "~~~~x~~~~", "====x====", "******x******", "**a ****b** c**"]) {
    const doc = bridge.sourceToDoc("title", s);
    assert.doesNotThrow(() => doc.check(), s);
    doc.descendants((node) => {
      const names = node.marks.map((mark) => mark.type.name);
      assert.equal(new Set(names).size, names.length, s);
    });
  }
});

test("paste reads markdown, carries the styles around the caret, and falls back to literal text", () => {
  // `from` / `to` are source offsets
  const paste = (base, from, to, text, field = "title") => {
    const start = fieldState(field, base, 0);
    const map = bridge.serialize(start.doc);
    const state = select(start, bridge.sourceToPos(map, from), bridge.sourceToPos(map, to));
    const { tr, literal } = live.pasteTr(state, { field }, text);
    const next = live.applyCommand(state, { field }, tr).state;
    assert.doesNotThrow(() => next.doc.check());
    return { source: source(next), literal, picture: picture(next.doc) };
  };
  assert.deepEqual(paste("**ab**", 2, 4, "**x**"), { source: "**x**", literal: false, picture: "[bold:x]" }, "bold over a whole bold stays one bold");
  assert.equal(paste("**ab**", 3, 3, "**x**").source, "**axb**", "inside a bold: one bold");
  assert.equal(paste("**ab**", 3, 3, "*x*").picture, "[bold:a][bold+italic:x][bold:b]");
  assert.equal(paste("a `cd` b", 4, 4, "**x**").source, "a `c**x**d` b", "inside code it is code text");
  const after = paste("#tag", 4, 4, "*i*");
  assert.equal(after.literal, true, "an italic right after a tag would join it: literal text instead");
  assert.equal(bridge.reading(bridge.sourceToDoc("title", after.source)).includes("italic"), false);
});

const OPTS = { readOnly: false };
const node = (id, text, extra = {}) => ({ id, text, ...extra });
const reduce = (state, action) => core.reduceOutlineEditor(state, action, OPTS);

test("Enter splits a title into halves that keep their formatting, as one core step", () => {
  const titles = ["a **bold** b __it__ c ~~s~~ `code` ==hi== end", "#tag @ann !(2026-11-03) [[T|i]] [l](https://x.y) https://u.v $x$ done", "**a *b* c** and *d **e***", "emoji 🎉 **bold 👩🏽‍💻 x** tail"];
  const visible = (s) => bridge.reading(bridge.sourceToDoc("title", s)).replace(/\|?¶line\|?/g, "");
  let positions = 0;
  for (const title of titles) {
    const base = fieldState("title", title, 0);
    for (const p of caretPositions(base.doc)) {
      const state = select(base, p);
      if (!state) continue;
      const split = live.splitSources(state, { field: "title" });
      if (!split.text || split.exact === false) continue;
      positions++;
      const seenLeft = bridge.reading(state.doc.cut(0, p)).replace(/\|?¶line\|?/g, "");
      const seenRight = bridge.reading(state.doc.cut(p)).replace(/\|?¶line\|?/g, "");
      assert.equal(visible(split.text.left), seenLeft, `left of ${p} in ${title}`);
      assert.equal(visible(split.text.right), seenRight, `right of ${p} in ${title}`);
    }
  }
  assert.ok(positions > 50, `${positions} positions`);
  const state = select(fieldState("title", "Ship **beta** now", 0), 8);
  const split = live.splitSources(state, { field: "title" });
  assert.deepEqual(split.text, { left: "Ship **be**", right: "**ta** now" });
  const s0 = core.createOutlineEditorState([node("a", "Ship **beta** now")]);
  const next = reduce(s0, { type: "split", id: "a", start: split.start, end: split.end, newId: "b", text: { ...split.text, base: "Ship **beta** now" } });
  assert.deepEqual(next.nodes.map((n) => n.text), ["Ship **be**", "**ta** now"]);
  assert.equal(next.history.past.length, 1);
  assert.deepEqual(reduce(next, { type: "undo" }).nodes.map((n) => n.text), ["Ship **beta** now"]);
  const stale = reduce(core.createOutlineEditorState([node("a", "NEW Ship **beta** now")]), { type: "split", id: "a", start: split.start, newId: "b", text: { ...split.text, base: "Ship **beta** now" } });
  assert.equal(stale.refusal, "invalid-command", "halves cut from an older text are refused");
  assert.deepEqual(live.splitSources(select(fieldState("title", "**x** y", 0), 1), { field: "title" }), { start: 0, end: 0 }, "the visible start inserts a row above");
});

test("⌫ at a row's start joins both sources so each side keeps its formatting, bound to the two rows", () => {
  const pairs = [
    ["x__a", "b__"],
    ["**a**", "**b**"],
    ["cost $x", "$ y"],
    ["see [docs", "](https://a.b)"],
    ["*a", "b*"],
  ];
  for (const [l, r] of pairs) {
    const { text, exact } = live.joinSources({ field: "title" }, { id: "a", text: l }, { id: "b", text: r });
    assert.equal(exact, true, `${l} + ${r}`);
    const shown = bridge.reading(bridge.sourceToDoc("title", l)).replace(/\|?¶line\|?/g, "") + "|" + bridge.reading(bridge.sourceToDoc("title", r)).replace(/\|?¶line\|?/g, "");
    assert.equal(bridge.reading(bridge.sourceToDoc("title", text.joined)).replace(/\|?¶line\|?/g, ""), shown.replace(/^\||\|$/g, ""), `${l} + ${r} → ${text.joined}`);
    const merged = reduce(core.createOutlineEditorState([node("a", l), node("b", r)]), { type: "merge", id: "b", direction: "backward", text });
    assert.deepEqual(merged.nodes.map((n) => n.text), [text.joined]);
    assert.equal(merged.caret.start, text.caret);
    assert.deepEqual(reduce(merged, { type: "undo" }).nodes.map((n) => n.text), [l, r]);
  }
  assert.equal(live.joinSources({ field: "title" }, { id: "a", text: "$x$" }, { id: "b", text: "1" }).exact, false, "math before a digit cannot stay math");
});

test("a value from outside replaces the field minimally and keeps the caret and a collapsed ⌘B", () => {
  let state = fieldState("title", "abc", 1);
  state = state.apply(state.tr.addStoredMark(state.schema.marks.bold.create()));
  const tr = live.adoptTr(state, { field: "title" }, ">> abc");
  state = state.apply(tr);
  assert.equal(source(state), ">> abc");
  assert.equal(live.caretSource(state), 4, "the caret follows its text");
  assert.equal(source(type(state, "X")), ">> a**X**bc", "the next keystroke is still bold");
});

test("local edits replay onto a newer remote value; overlapping ones are reported", () => {
  assert.equal(live.rebaseLocal("abcdef", "abcXdef", "<<abcdef>>"), "<<abcXdef>>");
  assert.equal(live.rebaseLocal("a", "a漢", ""), "漢");
  assert.equal(live.rebaseLocal("abc", "aXc", "aYc"), null);
  assert.deepEqual(live.diffSplices("abcdef", "<<abcdef>>").length, 2);
  assert.equal(live.mapOffset(live.diffSplices("abc", "Xabc"), 1), 2);
});

test("title line-start rules: headings cap at H3; a line-start #word is not a rule", () => {
  assert.deepEqual(live.titleRuleFor("###"), { kind: "heading", level: 3 });
  assert.deepEqual(live.titleRuleFor("####"), { kind: "heading", level: 3 });
  assert.deepEqual(live.titleRuleFor("#2"), { kind: "heading", level: 2 });
  assert.deepEqual(live.titleRuleFor("[x]"), { kind: "checkbox", checked: true });
  assert.deepEqual(live.titleRuleFor("[]"), { kind: "checkbox", checked: false });
  assert.deepEqual(live.titleRuleFor("1."), { kind: "numbered" });
  assert.equal(live.titleRuleFor("#launch"), null);
  assert.equal(live.titleRuleFor(">"), null);
});
