/**
 * The live-formatting field as editor state logic, with no view, so tests drive the same code a
 * browser runs.
 *
 *   typing       a typed character is a source insertion at the caret's source offset; the
 *                source is parsed again and the document becomes that parse (minimal replace,
 *                caret placed by source offset). `**bol` shows its stars until the closing `**`
 *                makes it bold: every inline rule comes from the one grammar, with no rule table.
 *   composition  nothing is re-parsed while an input method composes; once, when it ends.
 *   commands     format commands, pastes, split halves and merges are normalized and
 *                stabilized (source-doc.ts), so what was shown is what is stored.
 */
import { EditorState, NodeSelection, Plugin, PluginKey, Selection, TextSelection, type Transaction } from "prosemirror-state";
import { Fragment, Slice, type Mark, type Node as PMNode } from "prosemirror-model";
import { AddMarkStep, RemoveMarkStep } from "prosemirror-transform";
import { isStable, normalizeTouched, posToSource, reading, serialize, sourceToDoc, sourceToPos, stabilize, stabilizeChecked, type Serialized } from "./source-doc";
import { STYLE_GROUP, type FieldKind } from "./schema";

export interface FieldConfig {
  readonly field: FieldKind;
  /** Source rewrites right after a typed character (`##tag␣` → `#tag␣`, `_x_` → `*x*`). */
  readonly rewrite?: (before: string) => { from: number; to: number; insert: string } | null;
}

/** The inline conversion the last transaction made, which ⌫ can take back. */
export interface Conversion {
  readonly doc: PMNode;
  readonly from: number;
  readonly to: number;
  /** The converted token's source exactly as typed (`**bold**`, `[l](https://x)`). */
  readonly literal: string;
}

export interface LiveState {
  readonly composing: boolean;
  readonly conversion: Conversion | null;
  /**
   * The caret's exact source offset while typing continues (same document, same collapsed
   * selection). Hidden delimiters give one position several source offsets (`**a *b|** c`);
   * remembering it makes every keystroke land where the previous one ended.
   */
  readonly caret: { readonly doc: PMNode; readonly head: number; readonly src: number } | null;
}

/** A selection in source offsets; a selected chip stays selected through a re-parse. */
export interface SourceSelection {
  readonly anchor: number;
  readonly head: number;
  /** The selected chip's source token, when a chip is selected. */
  readonly chip?: string;
}

export const liveKey = new PluginKey<LiveState>("live-field");
/** The field's own re-parse: never re-parsed again, never a history step of its own. */
export const META_NORMALIZE = "live-field:normalize";
/** A value from outside (another surface, an undo, a veto). */
export const META_REMOTE = "live-field:remote";
/** Input-method composition started (true) or ended (false). */
export const META_COMPOSING = "live-field:composing";
/** A document command (format, paste, popup save, revert): normalized and stabilized, not re-parsed. */
export const META_COMMAND = "live-field:command";
export const META_REVERT = "live-field:revert";
const META_CONVERSION = "live-field:conversion";
const META_CARET = "live-field:caret";

const PROBE = "";
const stylesOf = (marks: readonly Mark[]) => marks.filter((mark) => mark.type.spec.group === STYLE_GROUP);

/**
 * The source offset the next typed character lands at. Beside hidden delimiters (`**a *b*|** c`)
 * that depends on the styles the typed text carries, so it is found by writing the document with
 * a probe character inserted there, carrying exactly those marks.
 */
export function caretSource(state: EditorState, map?: Serialized, pos = state.selection.head): number {
  return typedAt(state, map, pos) ?? posToSource(map ?? serialize(state.doc), pos, "lo");
}

/**
 * Where text typed at `pos` lands in the source, or null when it cannot land there as a plain
 * insertion (its marks would open, close or reopen a style: a collapsed ⌘B).
 */
function typedAt(state: EditorState, map: Serialized = serialize(state.doc), pos = state.selection.head): number | null {
  const memory = liveKey.getState(state)?.caret;
  if (memory && memory.doc === state.doc && state.selection.empty && pos === memory.head && state.selection.head === memory.head) return memory.src;
  const lo = posToSource(map, pos, "lo");
  const hi = posToSource(map, pos, "hi");
  if (lo === hi && state.storedMarks === null) return lo;
  // code text takes no marks: it goes in as it is
  if (state.doc.resolve(pos).parent.type.spec.code) return lo;
  const marks = state.storedMarks ?? state.doc.resolve(pos).marks();
  const probe = serialize(state.doc.replace(pos, pos, new Slice(Fragment.from(state.schema.text(PROBE, marks)), 0, 0))).source;
  const at = probe.indexOf(PROBE);
  if (at >= 0 && probe.slice(0, at) + probe.slice(at + 1) === map.source) return at;
  // Without stored marks the text still goes in plainly, somewhere among the hidden delimiters.
  return state.storedMarks === null ? Math.min(Math.max(at, lo), hi) : null;
}

export function selectionSource(state: EditorState, map: Serialized = serialize(state.doc)): SourceSelection {
  const { anchor, head, empty } = state.selection;
  if (state.selection instanceof NodeSelection && state.selection.node.type.name === "chip")
    return { anchor: posToSource(map, anchor, "hi"), head: posToSource(map, head, "lo"), chip: String(state.selection.node.attrs.src) };
  const caret = caretSource(state, map, head);
  if (empty) return { anchor: caret, head: caret };
  // A range keeps its inner edges: hidden delimiters at its ends stay outside it.
  return { anchor: posToSource(map, anchor, anchor <= head ? "hi" : "lo"), head: posToSource(map, head, head < anchor ? "hi" : "lo") };
}

/** The whole document replaced by `next`, its tail (a note's source after the last block) included. */
export function replaceAll(tr: Transaction, next: PMNode): Transaction {
  tr.replaceWith(0, tr.doc.content.size, next.content);
  if ((tr.doc.attrs.tail ?? "") !== (next.attrs.tail ?? "")) tr.setDocAttribute("tail", next.attrs.tail);
  return tr;
}

/** Replace the document with `next` minimally and put the selection back by source offsets. */
function replaceWith(state: EditorState, next: PMNode, selection: SourceSelection): Transaction | null {
  const tr = state.tr;
  const start = state.doc.content.findDiffStart(next.content);
  const tailChanged = (state.doc.attrs.tail ?? "") !== (next.attrs.tail ?? "");
  if (start === null && !tailChanged) return null;
  if (start !== null) {
    let { a, b } = state.doc.content.findDiffEnd(next.content)!;
    const overlap = start - Math.min(a, b);
    if (overlap > 0) {
      a += overlap;
      b += overlap;
    }
    tr.replace(start, a, next.slice(start, b));
  }
  if (tailChanged) tr.setDocAttribute("tail", next.attrs.tail);
  // The fitted replacement must give exactly the parse; if fitting ever reshapes the slice,
  // the whole content is replaced instead.
  if (!tr.doc.eq(next)) {
    tr.replaceWith(0, tr.doc.content.size, next.content);
    if (tailChanged) tr.setDocAttribute("tail", next.attrs.tail);
    if (!tr.doc.eq(next)) throw new Error("live-field: the re-parse did not reach the parsed document");
  }
  const map = serialize(tr.doc);
  const anchor = sourceToPos(map, selection.anchor);
  const head = sourceToPos(map, selection.head);
  if (selection.chip !== undefined) {
    const node = tr.doc.nodeAt(Math.min(anchor, head));
    if (node?.type.name === "chip" && node.attrs.src === selection.chip) return tr.setSelection(NodeSelection.create(tr.doc, Math.min(anchor, head)));
  }
  return tr.setSelection(TextSelection.between(tr.doc.resolve(anchor), tr.doc.resolve(head)));
}

/**
 * A note is read at its caret (source-doc.ts). When the caret comes to rest on another line than
 * the one it was read at (an offset inside hidden markup snaps to a neighbouring block), it is
 * read again where the caret is.
 */
function readAtCaret(state: EditorState, config: FieldConfig, source: string, tr: Transaction, readAt: number | null): Transaction {
  if (config.field !== "note" || !tr.selection.empty) return tr;
  const landed = posToSource(serialize(tr.doc), tr.selection.head, "lo");
  if (landed === readAt) return tr;
  const again = sourceToDoc(config.field, source, { whitespaceCaret: landed });
  return again.eq(tr.doc) ? tr : (replaceWith(state, again, { anchor: landed, head: landed }) ?? tr);
}

/**
 * A caret after a closing delimiter (`**bold**|`) is outside that style, so typed text is plain;
 * one before it (`**bold|**`) stays inside, so typing continues the style. The source decides:
 * every style around the caret that the source does not put a typed character in is left. This
 * only ever leaves styles; one the source would open here does not exist in the document yet.
 */
function leaveClosedStyles(tr: Transaction, source: string, head: number, config: FieldConfig) {
  if (!tr.selection.empty) return;
  const probe = sourceToDoc(config.field, source.slice(0, head) + PROBE + source.slice(head));
  let wanted: readonly Mark[] | null = null;
  probe.descendants((node) => {
    if (wanted) return false;
    if (node.isText && node.text!.includes(PROBE)) wanted = stylesOf(node.marks);
    return true;
  });
  if (!wanted) return;
  const keep = wanted as readonly Mark[];
  const marks = tr.selection.$head.marks();
  // the same container, not just the same kind: the caret may stand between two (`~~a~~|~~b~~`)
  const leaving = stylesOf(marks).filter((mark) => !keep.some((other) => other.eq(mark)));
  if (leaving.length) tr.setStoredMarks(marks.filter((mark) => !leaving.includes(mark)));
}

/**
 * The document parsed again from its own source; null when it already is the parse. `typed`:
 * text was just inserted, so a word ending at the caret is still being typed. A caret that only
 * arrives beside a chip (a click, an arrow key) never dissolves it.
 */
export function normalizeTr(state: EditorState, config: FieldConfig, typed = true): Transaction | null {
  const map = serialize(state.doc);
  let selection = selectionSource(state, map);
  const empty = state.selection.empty;
  let fresh = sourceToDoc(config.field, map.source, { caret: typed && empty ? selection.head : null, whitespaceCaret: empty ? selection.head : null });
  if (!empty && config.field === "note") {
    // A range whose ends fall onto one caret in the new reading (both inside a fence opener that
    // stops being text) is a caret there, and the note is read at that caret.
    const next = serialize(fresh);
    const range = TextSelection.between(fresh.resolve(sourceToPos(next, selection.anchor)), fresh.resolve(sourceToPos(next, selection.head)));
    if (range.empty) {
      const offset = posToSource(next, range.head, "lo");
      selection = { anchor: offset, head: offset };
      fresh = sourceToDoc(config.field, map.source, { whitespaceCaret: offset });
    }
  }
  if (fresh.eq(state.doc)) return null;
  let tr = replaceWith(state, fresh, selection);
  if (!tr) return null;
  tr = readAtCaret(state, config, map.source, tr, empty ? selection.head : null);
  leaveClosedStyles(tr, map.source, selection.head, config);
  if (typed) {
    const conversion = conversionAt(state, tr);
    if (conversion) tr.setMeta(META_CONVERSION, conversion);
  }
  return tr.setMeta(META_NORMALIZE, true).setMeta("addToHistory", false);
}

/**
 * Did this re-parse just turn text ending at the caret into a style or a chip (`**bold*` + `*`,
 * `[l](https://x` + `)`)? Returns the converted range.
 */
function conversionAt(before: EditorState, tr: Transaction): Conversion | null {
  if (!tr.selection.empty) return null;
  const $head = tr.selection.$head;
  const was = before.selection.$head;
  const nodeBefore = $head.nodeBefore;
  if (!nodeBefore) return null;
  let from: number;
  if (nodeBefore.type.name === "chip") {
    if (was.nodeBefore?.type.name === "chip") return null;
    from = $head.pos - nodeBefore.nodeSize;
  } else {
    // styles the character before the caret has now and did not have before the keystroke
    const had = was.nodeBefore ? stylesOf(was.nodeBefore.marks) : [];
    const gained = nodeBefore.isText ? stylesOf(nodeBefore.marks).filter((mark) => !had.some((old) => old.type === mark.type)) : [];
    if (!gained.length) return null;
    from = $head.pos;
    for (const mark of gained) {
      let start = $head.pos;
      for (let i = $head.index() - 1; i >= 0; i--) {
        const child = $head.parent.child(i);
        if (!mark.isInSet(child.marks)) break;
        start -= child.nodeSize;
      }
      from = Math.min(from, start);
    }
  }
  const map = serialize(tr.doc);
  return { doc: tr.doc, from, to: $head.pos, literal: map.source.slice(posToSource(map, from, "lo"), posToSource(map, $head.pos, "hi")) };
}

/**
 * ⌫ right after a conversion: the converted token becomes the literal characters typed, kept
 * literal (escaped) so it does not convert again. Null when the last transaction was not that
 * conversion (any edit or caret move since voids it).
 */
export function revertConversionTr(state: EditorState, config: FieldConfig): Transaction | null {
  const conversion = liveKey.getState(state)?.conversion;
  if (!conversion || conversion.doc !== state.doc || !state.selection.empty || state.selection.head !== conversion.to) return null;
  const draft = state.tr.replaceWith(conversion.from, conversion.to, state.schema.text(conversion.literal));
  const stable = stabilize(config.field, draft.doc);
  if (!isStable(config.field, stable)) return null;
  const tr = replaceAll(state.tr, stable);
  tr.setSelection(TextSelection.create(tr.doc, conversion.from + conversion.literal.length));
  return tr.setMeta(META_REVERT, true);
}

/** Show a value that came from outside (an echo that differs, a veto, another surface, an undo). */
export function adoptTr(state: EditorState, config: FieldConfig, source: string, caret?: SourceSelection): Transaction | null {
  const map = serialize(state.doc);
  if (map.source === source) return null;
  let next = caret;
  if (!next) {
    // Text inserted exactly at a range's edge stays outside the range; a caret moves after
    // text inserted at its own offset.
    const selection = selectionSource(state, map);
    const splices = diffSplices(map.source, source);
    const collapsed = selection.anchor === selection.head;
    const forward = selection.anchor <= selection.head;
    next = {
      anchor: mapOffset(splices, selection.anchor, collapsed || forward ? 1 : -1),
      head: mapOffset(splices, selection.head, collapsed || !forward ? 1 : -1),
      ...(selection.chip !== undefined ? { chip: selection.chip } : {}),
    };
  }
  const fresh = sourceToDoc(config.field, source, { caret: next.anchor === next.head ? next.head : null });
  let tr = replaceWith(state, fresh, next);
  if (!tr) return null;
  tr = readAtCaret(state, config, source, tr, next.anchor === next.head ? next.head : null);
  leaveClosedStyles(tr, source, next.head, config);
  // what the next keystroke carries (a collapsed ⌘B) survives a value from outside
  if (state.storedMarks !== null && next.anchor === next.head) tr.setStoredMarks(state.storedMarks);
  return tr.setMeta(META_REMOTE, true).setMeta("addToHistory", false);
}

/* ─────────────────────────── source changes ─────────────────────────── */

/** One change between two strings: `a[from, toA)` became `b[fromB, toB)`. */
export interface Splice {
  readonly from: number;
  readonly toA: number;
  readonly fromB: number;
  readonly toB: number;
}

/** The single contiguous change between two strings (common prefix and suffix removed). */
export function spliceOf(a: string, b: string): Splice {
  let from = 0;
  while (from < a.length && from < b.length && a[from] === b[from]) from++;
  let endA = a.length;
  let endB = b.length;
  while (endA > from && endB > from && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return { from, toA: endA, fromB: from, toB: endB };
}

/**
 * Every independent change between two strings (a character LCS over the differing middle, so
 * `abc → <<abc>>` is two insertions, not one replacement). A middle over 2,000 × 2,000 falls back
 * to one splice, which only coarsens caret mapping, never the text.
 */
export function diffSplices(a: string, b: string): Splice[] {
  const outer = spliceOf(a, b);
  const A = a.slice(outer.from, outer.toA);
  const B = b.slice(outer.from, outer.toB);
  if (!A.length || !B.length || A.length * B.length > 4_000_000) return A.length || B.length ? [outer] : [];
  const width = B.length + 1;
  const lcs = new Uint16Array((A.length + 1) * width);
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
      lcs[i * width + j] = A[i] === B[j] ? lcs[(i + 1) * width + j + 1]! + 1 : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
  const out: Splice[] = [];
  let i = 0;
  let j = 0;
  let open: { from: number; fromB: number } | null = null;
  const close = () => {
    if (open) out.push({ from: outer.from + open.from, toA: outer.from + i, fromB: outer.from + open.fromB, toB: outer.from + j });
    open = null;
  };
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) {
      close();
      i++;
      j++;
    } else {
      open ??= { from: i, fromB: j };
      if (j < B.length && (i === A.length || lcs[i * width + j + 1]! >= lcs[(i + 1) * width + j]!)) j++;
      else i++;
    }
  }
  close();
  return out;
}

/**
 * An offset in `a` mapped into `b`. `assoc` decides text inserted exactly at the offset: 1 moves
 * the offset after it, -1 keeps it before. Inside a replaced range: its end (1) or start (-1).
 */
export function mapOffset(splices: readonly Splice[], offset: number, assoc: 1 | -1 = 1): number {
  let delta = 0;
  for (const s of splices) {
    if (s.from > offset || (s.from === offset && s.toA === s.from && assoc < 0)) break;
    if (s.toA <= offset) delta += s.toB - s.fromB - (s.toA - s.from);
    else return assoc > 0 ? s.toB : s.fromB;
  }
  return offset + delta;
}

/** Where an offset in `a` belongs in `b`. */
export const rebaseOffset = (a: string, b: string, offset: number, assoc: 1 | -1 = 1) => mapOffset(diffSplices(a, b), offset, assoc);

/**
 * Local changes made on `base` replayed onto `remote`, a newer value that arrived meanwhile:
 * independent changes all survive (`abcXdef` and `<<abcdef>>` give `<<abcXdef>>`). Null when a
 * local change overlaps a remote one; the caller keeps the remote value and reports the loss.
 */
export function rebaseLocal(base: string, local: string, remote: string): string | null {
  const mine = diffSplices(base, local);
  const theirs = diffSplices(base, remote);
  for (const l of mine)
    for (const r of theirs) {
      const overlap = l.from < r.toA && r.from < l.toA;
      const sameReplacePoint = l.from === r.from && l.toA > l.from && r.toA > r.from;
      const insideTheirs = l.from === l.toA && l.from > r.from && l.from < r.toA;
      const insideMine = r.from === r.toA && r.from > l.from && r.from < l.toA;
      if (overlap || sameReplacePoint || insideTheirs || insideMine) return null;
    }
  let out = remote;
  for (const l of [...mine].reverse()) {
    const from = mapOffset(theirs, l.from, 1);
    const to = l.toA === l.from ? from : mapOffset(theirs, l.toA, -1);
    out = out.slice(0, from) + local.slice(l.fromB, l.toB) + out.slice(to);
  }
  return out;
}

/* ─────────────────────────── the plugin ─────────────────────────── */

/**
 * A user edit that joins textblocks (a range delete or a paste across blocks) keeps the first
 * block's node, and so its suffix (`## H2 ##` joined with `seven` would move the closing hashes
 * after the foreign text). The joined block ends where the last block ended: it takes its suffix.
 */
function rejoinSuffix(transactions: readonly Transaction[], state: EditorState): Transaction | null {
  const fixes: { pos: number; suffix: string }[] = [];
  transactions.forEach((tr, t) => {
    if (tr.getMeta(META_NORMALIZE) || tr.getMeta(META_REMOTE)) return;
    tr.steps.forEach((step, i) => {
      const json = step.toJSON() as { stepType?: string; from?: number; to?: number };
      if (json.stepType !== "replace" || json.from === undefined || json.to === undefined || json.from === json.to) return;
      const before = tr.docs[i]!;
      const $from = before.resolve(json.from);
      const $to = before.resolve(json.to);
      if ($from.parent === $to.parent || !$from.parent.isTextblock || !$to.parent.isTextblock) return;
      let pos = json.from;
      for (let j = i; j < tr.steps.length; j++) pos = tr.steps[j]!.getMap().map(pos, -1);
      for (const later of transactions.slice(t + 1)) pos = later.mapping.map(pos, -1);
      fixes.push({ pos, suffix: String($to.parent.attrs.suffix ?? "") });
    });
  });
  if (!fixes.length) return null;
  const tr = state.tr;
  for (const { pos, suffix } of fixes) {
    const $pos = tr.doc.resolve(pos);
    if (!$pos.parent.isTextblock || $pos.parent.attrs.suffix === suffix) continue;
    tr.setNodeMarkup($pos.before(), null, { ...$pos.parent.attrs, suffix });
  }
  return tr.docChanged ? tr : null;
}

/**
 * Everything was selected (⌘A) and the user deleted or typed over it: the blank lines after the
 * last block went with it. Kept, they would be an invisible note that still counts as one.
 */
function replacedEverything(transactions: readonly Transaction[], old: EditorState): boolean {
  const { from, to, empty } = old.selection;
  if (empty || from > Selection.atStart(old.doc).from || to < Selection.atEnd(old.doc).to) return false;
  return transactions.some((tr) => tr.docChanged && !isFormat(tr) && !tr.getMeta(META_NORMALIZE) && !tr.getMeta(META_REMOTE));
}

/** Did the user insert visible content (text or a chip)? A join's structure alone does not count. */
const insertsText = (tr: Transaction) =>
  tr.steps.some((step) => {
    const slice = (step as unknown as { slice?: Slice }).slice;
    let found = false;
    slice?.content.descendants((node) => {
      if (node.isText || node.type.name === "chip") found = true;
      return !found;
    });
    return found;
  });

/** The text of one plain insertion at the old collapsed caret, or null. */
function plainTyping(transactions: readonly Transaction[], old: EditorState): string | null {
  // Stored marks that cannot be typed as a plain insertion (a collapsed ⌘B) type through the
  // document, where a new container gets its delimiters from the writer.
  if (transactions.length !== 1 || !old.selection.empty || typedAt(old) === null) return null;
  const tr = transactions[0]!;
  if (tr.getMeta(META_COMMAND) || tr.getMeta(META_REMOTE) || tr.getMeta(META_NORMALIZE) || tr.steps.length !== 1) return null;
  const json = tr.steps[0]!.toJSON() as { stepType?: string; from?: number; to?: number };
  if (json.stepType !== "replace" || json.from !== old.selection.head || json.to !== json.from) return null;
  const slice = (tr.steps[0] as unknown as { slice: Slice }).slice;
  if (slice.openStart || slice.openEnd) return null;
  let text = "";
  let plain = true;
  slice.content.forEach((node) => {
    if (node.isText) text += node.text;
    else plain = false;
  });
  return plain && text ? text : null;
}

function typeAt(old: EditorState, state: EditorState, config: FieldConfig, text: string): Transaction {
  const at = typedAt(old)!;
  const source = serialize(old.doc).source;
  const next = source.slice(0, at) + text + source.slice(at);
  const head = at + text.length;
  const fresh = sourceToDoc(config.field, next, { caret: head, whitespaceCaret: head });
  const tr = replaceWith(state, fresh, { anchor: head, head }) ?? state.tr;
  if (!tr.docChanged) tr.setSelection(TextSelection.near(tr.doc.resolve(sourceToPos(serialize(tr.doc), head))));
  const conversion = conversionAt(state, tr);
  if (conversion) tr.setMeta(META_CONVERSION, conversion);
  return tr.setMeta(META_CARET, head).setMeta(META_NORMALIZE, true).setMeta("addToHistory", false);
}

/**
 * Typing after a collapsed ⌘E: code never extends by typing at its end, so the characters typed
 * next would leave it after the first one. While the code style is what this keystroke carried,
 * the next keystroke carries it too, until ⌘E again or the caret moves.
 */
function continueCode(old: EditorState, state: EditorState, tr: Transaction | null): Transaction | null {
  if (!old.storedMarks?.some((mark) => mark.type.name === "code")) return tr;
  const selection = tr ? tr.selection : state.selection;
  const before = selection.empty ? selection.$head.nodeBefore : null;
  if (!before?.isText || !before.marks.some((mark) => mark.type.name === "code")) return tr;
  return (tr ?? state.tr.setMeta(META_NORMALIZE, true)).setStoredMarks(before.marks);
}

/** The document after a command, normalized and stabilized, with the selection kept by source offset. */
function settleCommand(old: EditorState, state: EditorState, config: FieldConfig): Transaction | null {
  // read the way the field shows it: a note's caret line (a block being typed, a blank line) included
  const whitespaceCaret = state.selection.empty ? posToSource(serialize(state.doc), state.selection.head, "lo") : null;
  const { doc: stable } = stabilizeChecked(config.field, normalizeTouched(old.doc, state.doc), { whitespaceCaret });
  if (stable.eq(state.doc)) return null;
  const oldMap = serialize(state.doc);
  const selection = selectionSource(state, oldMap);
  const tr = replaceAll(state.tr, stable);
  const map = serialize(tr.doc);
  const splices = diffSplices(oldMap.source, map.source);
  const anchor = sourceToPos(map, mapOffset(splices, selection.anchor, -1));
  const head = sourceToPos(map, mapOffset(splices, selection.head, 1));
  tr.setSelection(TextSelection.between(tr.doc.resolve(anchor), tr.doc.resolve(head)));
  return readAtCaret(state, config, map.source, tr, whitespaceCaret).setMeta(META_NORMALIZE, true);
}

/** The plugin: keeps the document the parse of its source after every edit, except while composing. */
export function livePlugin(config: FieldConfig): Plugin<LiveState> {
  return new Plugin<LiveState>({
    key: liveKey,
    state: {
      init: () => ({ composing: false, conversion: null, caret: null }),
      apply: (tr, value) => {
        const flag = tr.getMeta(META_COMPOSING) as boolean | undefined;
        const composing = flag ?? value.composing;
        const remembered = tr.getMeta(META_CARET) as number | undefined;
        const caret =
          remembered !== undefined ? { doc: tr.doc, head: tr.selection.head, src: remembered } : tr.docChanged || tr.selectionSet || tr.storedMarksSet ? null : value.caret;
        const conversion = tr.getMeta(META_CONVERSION) as Conversion | undefined;
        // a conversion can be taken back only until the next edit or caret move
        if (conversion) return { composing, conversion, caret };
        if (tr.docChanged || tr.selectionSet) return { composing, conversion: null, caret };
        return composing === value.composing && caret === value.caret ? value : { composing, conversion: value.conversion, caret };
      },
    },
    appendTransaction(transactions, old, state) {
      if (liveKey.getState(state)?.composing) return null;
      const typed = plainTyping(transactions, old);
      if (typed !== null) return continueCode(old, state, typeAt(old, state, config, typed));
      const inserted = transactions.some((tr) => !tr.getMeta(META_REMOTE) && insertsText(tr));
      let glue = rejoinSuffix(transactions, state);
      if (replacedEverything(transactions, old) && state.doc.attrs.tail) glue = (glue ?? state.tr).setDocAttribute("tail", "");
      if (glue) {
        // A plugin never sees its own appended transaction: re-parse on top of the suffix fix
        // here (on a plugin-less state, which cannot re-enter this plugin) and return both as one.
        const fixed = EditorState.create({ doc: glue.doc, selection: glue.selection, storedMarks: glue.storedMarks });
        const norm = normalizeTr(fixed, config, inserted);
        if (!norm) return glue;
        for (const step of norm.steps) glue.step(step);
        glue.setSelection(norm.selection.getBookmark().resolve(glue.doc));
        if (norm.storedMarksSet) glue.setStoredMarks(norm.storedMarks);
        const conversion = norm.getMeta(META_CONVERSION) as Conversion | undefined;
        if (conversion) glue.setMeta(META_CONVERSION, { ...conversion, doc: glue.doc });
        return glue.setMeta(META_NORMALIZE, true);
      }
      if (transactions.every((tr) => tr.getMeta(META_NORMALIZE) || tr.getMeta(META_REMOTE))) return null;
      if (!transactions.some((tr) => tr.docChanged || tr.selectionSet || tr.getMeta(META_COMPOSING) === false)) return null;
      if (transactions.some((tr) => tr.getMeta(META_COMMAND) && tr.docChanged)) {
        const settled = settleCommand(old, state, config);
        if (settled) return settled;
      }
      const norm = normalizeTr(state, config, inserted);
      return inserted ? continueCode(old, state, norm) : norm;
    },
  });
}

/* ─────────────────────────── document commands ─────────────────────────── */

/**
 * Apply a document command (a format, a paste) as the field does: normalized, stabilized and
 * re-parsed by the plugin. `exact` says whether the stored source reads back as the command
 * meant; a caller refuses an inexact format rather than store something else.
 */
export function applyCommand(state: EditorState, config: FieldConfig, tr: Transaction): { state: EditorState; exact: boolean } {
  const intended = reading(tr.doc);
  const next = state.applyTransaction(tr.setMeta(META_COMMAND, true)).state;
  return { state: next, exact: reading(sourceToDoc(config.field, serialize(next.doc).source, { whitespaceCaret: next.selection.empty ? caretSource(next) : null })) === intended };
}

/** Whether a transaction only adds or removes marks (a format command). */
export const isFormat = (tr: Transaction) => tr.docChanged && tr.steps.every((step) => step instanceof AddMarkStep || step instanceof RemoveMarkStep);

/**
 * The paste of plain text at the selection (or at `at`): the text is read as markdown-lite, so
 * its markup renders, and is inserted as document content carrying the styles around the caret
 * (`**x**` pasted inside bold stays one bold). Inside code it is code text. When its formatting
 * cannot be written where it lands (`*i*` right after a #tag would join the tag), `literal` is
 * true and the transaction inserts the text as literal characters instead.
 */
export function pasteTr(state: EditorState, config: FieldConfig, text: string, at?: number): { tr: Transaction; literal: boolean } {
  const from = at ?? state.selection.from;
  const to = at ?? state.selection.to;
  const $from = state.doc.resolve(from);
  const around = (to > from ? $from.marksAcross(state.doc.resolve(to)) : (state.storedMarks ?? $from.marks())) ?? [];
  const styles = stylesOf(around);
  const tr = state.tr;
  if (styles.some((mark) => mark.type.name === "code")) return { tr: tr.insertText(text, from, to), literal: false };
  const parsed = sourceToDoc(config.field, text);
  const inline = config.field === "title" || parsed.childCount === 1;
  let content = inline ? parsed.firstChild!.content : parsed.content;
  if (styles.length) {
    const add = (marks: readonly Mark[]) => styles.reduce((set, mark) => (set.some((other) => other.type === mark.type) ? set : mark.addToSet(set)), marks);
    const nodes: PMNode[] = [];
    content.forEach((node) => nodes.push(node.isText || node.type.name === "chip" ? node.mark(add(node.marks)) : node));
    content = Fragment.fromArray(nodes);
  }
  const slice = new Slice(content, inline ? 0 : 1, inline ? 0 : 1);
  const { exact } = applyCommand(state, config, state.tr.replaceRange(from, to, slice));
  return exact ? { tr: tr.replaceRange(from, to, slice), literal: false } : { tr: tr.insertText(text, from, to), literal: true };
}

/* ─────────────────────────── splitting and joining rows ─────────────────────────── */

/**
 * Enter in a title: both halves as source, each keeping its visible formatting. A collapsed
 * caret sends `end = start`. A caret at the visible start (nothing visible to its left) sends
 * `start = end = 0` and no halves: the core's "insert an empty row above" branch, so the row
 * keeps its id, data, children and focus. `exact` is false when a half cannot keep what it showed.
 */
export function splitSources(state: EditorState, config: FieldConfig): { start: number; end: number; exact?: boolean; text?: { left: string; right: string } } {
  const { from, to, empty } = state.selection;
  const map = serialize(state.doc);
  const leftCut = state.doc.cut(0, from);
  if (empty && leftCut.textContent === "" && !hasChip(leftCut)) return { start: 0, end: 0 };
  const left = stabilizeChecked(config.field, leftCut);
  const right = stabilizeChecked(config.field, state.doc.cut(to));
  const start = empty ? caretSource(state, map) : posToSource(map, from, "hi");
  const end = empty ? start : Math.max(start, posToSource(map, to, "lo"));
  return { start, end, exact: left.exact && right.exact, text: { left: serialize(left.doc).source, right: serialize(right.doc).source } };
}
const hasChip = (doc: PMNode) => {
  let found = false;
  doc.descendants((node) => {
    if (node.type.name === "chip") found = true;
    return !found;
  });
  return found;
};

/**
 * ⌫ at the start of a row, or Delete at its end: the joined source, the caret at the seam, and
 * the two rows and texts it was computed from, which the core checks before merging.
 */
export function joinSources(config: FieldConfig, left: { readonly id: string; readonly text: string }, right: { readonly id: string; readonly text: string }) {
  const a = sourceToDoc(config.field, left.text);
  const b = sourceToDoc(config.field, right.text);
  const seam = a.content.size - 1; // the end of the line's content
  const { doc, exact } = stabilizeChecked(config.field, a.replace(seam, seam, b.slice(1, b.content.size - 1)));
  const map = serialize(doc);
  return { text: { joined: map.source, caret: Math.min(posToSource(map, seam, "lo"), map.source.length), left, right }, exact };
}

/* ─────────────────────────── title line-start rules ─────────────────────────── */

export type TitleRule =
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3 }
  | { readonly kind: "checkbox"; readonly checked: boolean }
  | { readonly kind: "bullet" }
  | { readonly kind: "numbered" };

/**
 * The rule a space completes at the very start of a title, when the marker is all that precedes
 * the caret. `#`, `##`, `###` and `#1` to `#3` are headings (`####` and more cap at H3); a
 * line-start `#word` is a tag and never reaches here.
 */
export function titleRuleFor(textBeforeCaret: string): TitleRule | null {
  const match = /^(?:(#{1,6})|#([1-3])|(\[ ?\])|(\[[xX]\])|([-*+])|(1\.))$/.exec(textBeforeCaret);
  if (!match) return null;
  if (match[1]) return { kind: "heading", level: Math.min(3, match[1].length) as 1 | 2 | 3 };
  if (match[2]) return { kind: "heading", level: Number(match[2]) as 1 | 2 | 3 };
  if (match[3]) return { kind: "checkbox", checked: false };
  if (match[4]) return { kind: "checkbox", checked: true };
  if (match[5]) return { kind: "bullet" };
  return { kind: "numbered" };
}
