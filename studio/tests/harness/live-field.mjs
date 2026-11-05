// Shared helpers for the live-field suites: the field modules loaded through Vite, and an editor
// state driven the way a keyboard drives it (one transaction per key). Not a test file itself.
import { load } from "./outliner-dom.mjs";

export const inline = await load("/src/registry/outliner/inline.tsx");
export const bridge = await load("/src/registry/outliner/live-field/source-doc.ts");
export const live = await load("/src/registry/outliner/live-field/live-field.ts");
export const schema = await load("/src/registry/outliner/live-field/schema.ts");
export const { EditorState, TextSelection, NodeSelection } = await import("prosemirror-state");
export const { toggleMark } = await import("prosemirror-commands");

/** An editor state for `source` with the caret at source offset `caret`. */
export function fieldState(field, source, caret = source.length) {
  const config = { field };
  const doc = bridge.sourceToDoc(field, source, { caret });
  let state = EditorState.create({ doc, plugins: [live.livePlugin(config)] });
  const pos = bridge.sourceToPos(bridge.serialize(state.doc), caret);
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
  return state;
}

/** Type characters one by one, each its own transaction. */
export function type(state, text) {
  for (const char of text) {
    const { from, to } = state.selection;
    state = state.applyTransaction(state.tr.insertText(char, from, to)).state;
  }
  return state;
}

export const source = (state) => bridge.serialize(state.doc).source;

/** Select document positions `from`..`to`; null when one is not a text position. */
export function select(state, from, to = from) {
  try {
    return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
  } catch {
    return null;
  }
}

/** Every caret position inside a textblock. */
export function caretPositions(doc) {
  const out = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    for (let p = pos + 1; p <= pos + 1 + node.content.size; p++) out.push(p);
    return false;
  });
  return out;
}

/** A readable picture of a document: `[bold+italic:text]`, `{tag:#t}` chips, ⏎ for line breaks. */
export function picture(doc) {
  let out = "";
  doc.descendants((node) => {
    const names = node.marks
      .filter((mark) => mark.type.spec.group === schema.STYLE_GROUP || mark.type.name === "esc")
      .map((mark) => mark.type.name);
    const body = node.isText
      ? node.text
      : node.type.name === "chip"
        ? `{${node.attrs.kind}:${node.attrs.src}}`
        : node.type.name === "br"
          ? "⏎"
          : null;
    if (body !== null) out += names.length ? `[${names.join("+")}:${body}]` : body;
    return true;
  });
  return out;
}

/** A seeded random number generator (the same sequence on every run). */
export function seeded(seed) {
  let x = seed;
  return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}
