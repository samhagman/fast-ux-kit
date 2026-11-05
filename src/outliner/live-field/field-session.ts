/**
 * One live field's conversation with the outliner. The outliner (core reducer + controlled
 * store) owns the text; the field shows it, edits it, and keeps the two honest.
 *
 *   field → outliner   typing        { type: "text", id, text, caret, time }      coalesces
 *                      own step      the same, time −∞ (paste, format, token edit, composition)
 *                      split, merge  { type: "split" | "merge", …, text }         bound to the text
 *                      caret         { type: "caret", … } on a selection-only move
 *                      title rule    { type: "transaction", commands, caret }     one step
 *   outliner → field   onRender(committed, renderedSeq, coreCaret) after every commit
 *
 * Adoption (onRender). The field is the author of its row's newest text:
 *   in sync                          nothing to do
 *   composing                        defer to compositionend
 *   renderedSeq > the field's seq    adopt: a veto, an undo or another surface came after
 *   committed is not one we showed   adopt: an outside value
 *   otherwise                        keep: an older echo (strict mode lag)
 *
 * Every outgoing action is bound to the outliner's newest text. `known` is the text the field
 * last adopted, emitted or saw in sync; when the host holds something else that has not been
 * rendered here yet, typing is rebased onto it (or adopted with a conflict notice), and paste,
 * split, merge and token edits adopt it first. The core refuses a stale split or merge whole.
 */
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import type { OutlineAction } from "../../core/index.js";
import { parseInline } from "../inline.js";
import { lineStartAt } from "../rich-note.js";
import {
  META_COMMAND,
  META_NORMALIZE,
  META_REMOTE,
  adoptTr,
  caretSource,
  diffSplices,
  isFormat,
  joinSources,
  livePlugin,
  mapOffset,
  pasteTr,
  rebaseLocal,
  rebaseOffset,
  replaceAll,
  revertConversionTr,
  selectionSource,
  spliceOf,
  splitSources,
  titleRuleFor,
  type FieldConfig,
  type SourceSelection,
  type TitleRule,
} from "./live-field.js";
import {
  inProse,
  noteBackspace,
  noteDownOut,
  noteEnter,
  noteModEnter,
  noteRewrite,
  noteTab,
  taskAt,
  toggleTask,
  type SourceEdit,
} from "./note-blocks.js";
import { posToSource, reading, serialize, sourceToDoc, sourceToPos } from "./source-doc.js";

/** The core's own-step time: an edit with it never coalesces with typing. */
const OWN_STEP = Number.NEGATIVE_INFINITY;
/** How far a barrier moves the session clock: beyond any typing group window. */
const BARRIER = 1e9;

export type FieldName = "title" | "note";
/** What the field dispatches (the outliner's action type, kept open for its data). */
export type FieldAction = OutlineAction<never> | OutlineAction<Record<string, unknown>>;

/** What a title rule needs to know about its row. */
export interface RowFacts {
  readonly parentId: string | null;
  readonly checked?: boolean | null;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly parentData?: Readonly<Record<string, unknown>>;
}

/** The outliner, as one field sees it. */
export interface FieldHost {
  dispatch(action: FieldAction): { readonly refusal: unknown };
  /** The newest content revision, including edits not rendered yet. */
  currentSeq(): number;
  /** The row's newest value of one field, as the outliner holds it now. */
  text(id: string, field: FieldName): string | undefined;
  row(id: string): RowFacts | null;
  /** The row a merge joins with, exactly as the core will pick it (null: none). */
  neighbour(
    id: string,
    direction: "backward" | "forward",
  ): { readonly id: string; readonly text: string } | null;
}

export type NoticeKind =
  | "format-refused"
  | "paste-literal"
  | "token-refused"
  | "merge-refused"
  | "split-refused"
  | "edit-conflict";
export interface FieldNotice {
  readonly kind: NoticeKind;
  /** The text that did not go in where it was meant to (a conflicting edit, a refused value). */
  readonly detail?: string;
}

/** A popup's handle on one token: where it is in the source, what it was, and whether it still is. */
export interface TokenBookmark {
  from: number;
  to: number;
  readonly src: string;
  readonly kind: string;
  valid: boolean;
}

/** Callbacks the view (and through it the outliner) gives the session. */
export interface SessionHooks {
  /** A change the field shows but must not store yet (the `/query` of the item menu). True: held. */
  hold?(text: string, caret: number): boolean;
  /** A selection-only move. True: someone else owns it, so it is not reported to the core. */
  caretMoved?(): boolean;
  notice?(notice: FieldNotice): void;
}

/**
 * Typing-time source rewrites, right after a typed character:
 *   `##tag` + a boundary → `#tag` (after a word character, `word #tag`)
 *   `_x_` (flanking)    → `*x*`
 * The session applies them only in plain prose (see `plainContext`).
 */
export function typingRewrite(before: string): { from: number; to: number; insert: string } | null {
  const tag = /(^|.)##([\p{L}\p{N}_-]+)[\s.,;:!?)]$/u.exec(before);
  if (tag) {
    const hashes = tag.index + tag[1]!.length;
    const word = !!tag[1] && /[\p{L}\p{N}]/u.test(tag[1]);
    return { from: hashes, to: hashes + 2, insert: word ? " #" : "#" };
  }
  const italic = /(^|[^\p{L}\p{N}_\\])_([^_\s](?:[^_\n]*[^_\s\\])?)_$/u.exec(before);
  if (italic) {
    const at = italic.index + italic[1]!.length;
    return { from: at, to: before.length, insert: `*${italic[2]}*` };
  }
  return null;
}

/** A note's typing rewrites: its line-start task rule, then everything a title has. */
export const noteTypingRewrite = (before: string) => noteRewrite(before) ?? typingRewrite(before);

const clean = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));

export class FieldSession {
  state: EditorState;
  hooks: SessionHooks = {};
  /** Everything the user must be told, in order (the view announces each as it arrives). */
  readonly notices: FieldNotice[] = [];
  /** A composition dropped because a remote change overlapped it, kept for recovery. */
  droppedComposition: string | null = null;
  /** The content revision of this field's last edit. */
  private localSeq = -1;
  /** Every text this field showed since its last adoption. */
  private outbox: string[];
  /** The text the session last saw the host hold for this field. */
  private known: string;
  private composingBase: string | null = null;
  private composingSeq = -1;
  private composingAt = 0;
  /** Session clock offset: a barrier moves it forward so the next keystroke starts a new step. */
  private clockOffset = 0;
  /** The last title rule: the text and revision it produced (⌫ undoes only that). */
  private lastRule: { readonly text: string; readonly seq: number } | null = null;
  /** True while the field shows a held change (the item menu's query). */
  private held = false;
  private readonly bookmarks = new Set<TokenBookmark>();
  /** Selections this field last reported as backward, so an undo brings them back backward. */
  private readonly backward = new Set<string>();
  /** The caret this field last told the core (an edit's caret, a selection move). */
  private told: { start: number; end: number } | null = null;

  constructor(
    readonly config: FieldConfig,
    readonly id: string,
    source: string,
    private readonly host: FieldHost,
  ) {
    const doc = sourceToDoc(config.field, source);
    this.state = EditorState.create({
      doc,
      plugins: [livePlugin(config)],
      selection: TextSelection.atEnd(doc),
    });
    this.outbox = [source];
    this.known = source;
  }

  get composing() {
    return this.composingBase !== null;
  }
  get source() {
    return serialize(this.state.doc).source;
  }
  /** The selection in source offsets (a backward selection has head < anchor). */
  get caret(): SourceSelection {
    return selectionSource(this.state);
  }
  /** Whether this field has edits the outliner has not rendered yet. */
  get ahead() {
    return this.outbox.length > 1;
  }
  get holding() {
    return this.held;
  }

  private notify(notice: FieldNotice) {
    this.notices.push(notice);
    this.hooks.notice?.(notice);
  }

  /** Every user transaction (keyboard, format command, drop, cut) comes through here. */
  apply(tr: Transaction, how: { readonly time?: number; readonly boundary?: boolean } = {}) {
    const before = this.source;
    const previous = this.state;
    if (how.boundary) tr.setMeta(META_COMMAND, true);
    const format = how.boundary && isFormat(tr);
    const intended = format ? reading(tr.doc) : "";
    this.state = this.state.applyTransaction(tr).state;
    if (this.composingBase !== null) return; // the input method owns the field until it ends
    // A format whose result would read back differently is refused whole: no change, no step.
    if (format && reading(sourceToDoc(this.config.field, this.source)) !== intended) {
      this.state = previous;
      this.notify({ kind: "format-refused" });
      return;
    }
    let after = this.source;
    // Another surface, an undo or a veto changed this row and it has not rendered here yet: the
    // edit is replayed onto that text, or the text wins and the user is told what did not go in.
    const latest = this.host.text(this.id, this.config.field);
    if (latest !== undefined && latest !== this.known && !this.outbox.includes(latest)) {
      if (after === before) return void this.adopt(latest);
      const merged = rebaseLocal(before, after, latest);
      if (merged === null) {
        this.adopt(latest);
        this.notify({ kind: "edit-conflict", detail: after });
        return;
      }
      const caret = rebaseOffset(after, merged, caretSource(this.state));
      this.adopt(latest);
      const onto = adoptTr(this.state, this.config, merged, { anchor: caret, head: caret });
      if (onto) this.state = this.state.apply(onto);
      this.moved(latest, merged);
      this.emit(merged, how);
      return;
    }
    // Only the marks for the next keystroke changed (a collapsed ⌘B, → out of a style): a barrier.
    if (after === before && tr.storedMarksSet && !tr.docChanged) this.barrier();
    if (after !== before && !how.boundary && this.config.rewrite && this.state.selection.empty) {
      const caret = caretSource(this.state);
      const candidate = this.config.rewrite(after.slice(0, caret));
      if (candidate && this.plainContext(after, candidate.from, candidate.to)) {
        const next = after.slice(0, candidate.from) + candidate.insert + after.slice(candidate.to);
        const shift = candidate.insert.length - (candidate.to - candidate.from);
        const rewritten = adoptTr(this.state, this.config, next, {
          anchor: caret + shift,
          head: caret + shift,
        });
        if (rewritten) this.state = this.state.apply(rewritten.setMeta(META_REMOTE, false));
        after = this.source;
      }
    }
    if (after !== before) {
      this.moved(before, after);
      if (this.hooks.hold?.(after, caretSource(this.state))) {
        this.held = true;
        return;
      }
      this.held = false;
      this.emit(after, how);
    } else if (tr.selectionSet && !tr.docChanged) {
      if (this.hooks.caretMoved?.()) return;
      this.reportCaret();
    }
  }

  /** Tell the core where the caret is (a user selection move; it ends a typing group). */
  private reportCaret() {
    const { anchor, head } = this.caret;
    const start = Math.min(anchor, head);
    const end = Math.max(anchor, head);
    if (head < anchor) this.backward.add(`${start}:${end}`);
    else this.backward.delete(`${start}:${end}`);
    this.told = { start, end };
    this.host.dispatch({
      type: "caret",
      id: this.id,
      start,
      end,
      ...(this.config.field === "note" ? { field: "note" as const } : {}),
    });
  }

  /** Bring the field up to the host's newest text before an action computed against it. */
  private sync() {
    const latest = this.host.text(this.id, this.config.field);
    if (latest !== undefined && latest !== this.known && !this.outbox.includes(latest))
      this.adopt(latest);
  }

  /** Keep open bookmarks on their token through a source change; a token that is gone invalidates its bookmark. */
  private moved(from: string, to: string) {
    if (!this.bookmarks.size || from === to) return;
    const splices = diffSplices(from, to);
    for (const bm of this.bookmarks) {
      const a = mapOffset(splices, bm.from, 1);
      const b = mapOffset(splices, bm.to, -1);
      // A diff can align repeated characters either way: the nearest copy of the same token is it.
      let at = to.slice(a, b) === bm.src ? a : -1;
      if (at < 0)
        for (let i = to.indexOf(bm.src); i >= 0; i = to.indexOf(bm.src, i + 1))
          if (at < 0 || Math.abs(i - a) < Math.abs(at - a)) at = i;
      if (at >= 0) {
        bm.from = at;
        bm.to = at + bm.src.length;
      } else {
        bm.valid = false;
        this.bookmarks.delete(bm);
      }
    }
  }

  /**
   * Paste or drop of plain text at the selection (or at document position `at`). Its markup
   * renders at once and carries the styles around the caret; where that formatting cannot be
   * written it goes in as literal text and the user is told. One history step.
   */
  paste(text: string, at?: number) {
    this.sync();
    if (this.config.field === "note" && /[\r\n]/.test(text)) {
      // Several lines into a note: they go in as the source they are, and read as blocks.
      const value = text.replace(/\r\n?/g, "\n");
      const range =
        at === undefined
          ? this.selectionRange()
          : {
              from: posToSource(serialize(this.state.doc), at),
              to: posToSource(serialize(this.state.doc), at),
            };
      const source = this.source;
      this.replaceTo(
        source.slice(0, range.from) + value + source.slice(range.to),
        range.from + value.length,
      );
      return;
    }
    // A word still pending at the caret (`#tag|`) is settled into its chip before anything lands.
    if (this.settle() && at !== undefined) at = Math.min(at, this.state.doc.content.size);
    const { tr, literal } = pasteTr(this.state, this.config, text, at);
    if (literal) this.notify({ kind: "paste-literal", detail: text });
    this.apply(tr.scrollIntoView(), { boundary: true });
  }

  /** Show a word still pending at the caret (`#tag|`) as what it is, a chip. True when it changed. */
  private settle(): boolean {
    const empty = this.state.selection.empty;
    const settled = sourceToDoc(this.config.field, this.source, {
      whitespaceCaret: empty ? this.caret.head : null,
    });
    if (settled.eq(this.state.doc)) return false;
    const { anchor, head } = selectionSource(this.state);
    const tr = replaceAll(this.state.tr, settled);
    const map = serialize(tr.doc);
    tr.setSelection(
      TextSelection.between(
        tr.doc.resolve(sourceToPos(map, anchor)),
        tr.doc.resolve(sourceToPos(map, head)),
      ),
    );
    this.state = this.state.apply(tr.setMeta(META_NORMALIZE, true).setMeta("addToHistory", false));
    return true;
  }

  /** A bookmark on the chip at (or just after) document position `pos`, for a popup to edit later. */
  tokenAt(pos: number): TokenBookmark | null {
    for (const p of [pos, pos + 1]) {
      const node = p >= 0 && p < this.state.doc.content.size ? this.state.doc.nodeAt(p) : null;
      if (node?.type.name !== "chip") continue;
      const to = posToSource(serialize(this.state.doc), p + 1, "lo");
      const src = String(node.attrs.src);
      const bm: TokenBookmark = {
        from: to - src.length,
        to,
        src,
        kind: String(node.attrs.kind),
        valid: true,
      };
      this.bookmarks.add(bm);
      return bm;
    }
    return null;
  }

  /** Forget a bookmark whose popup closed without saving. */
  release(bm: TokenBookmark) {
    this.bookmarks.delete(bm);
  }

  /**
   * A popup's save: exactly one token of the same kind replaces exactly the token it was opened
   * on. A token that changed or vanished meanwhile, or a value that is not one token, is refused
   * with a notice. One history step.
   */
  editToken(bm: TokenBookmark, value: string): boolean {
    this.sync();
    const refuse = () => {
      this.bookmarks.delete(bm);
      this.notify({ kind: "token-refused", detail: value });
      return false;
    };
    const parts = parseInline(value).filter((seg) => seg.kind !== "delimiter");
    const one =
      parts.length === 1 &&
      parts[0]!.start === 0 &&
      parts[0]!.end === value.length &&
      parts[0]!.kind === bm.kind &&
      !parts[0]!.marks?.length;
    if (!bm.valid || !one) return refuse();
    const source = this.source;
    if (source.slice(bm.from, bm.to) !== bm.src) return refuse();
    const next = source.slice(0, bm.from) + value + source.slice(bm.to);
    // still exactly one token of its kind where it lands (no markup around it joins it)
    const landed = parseInline(next).find(
      (seg) => seg.start === bm.from && seg.kind !== "delimiter",
    );
    if (!landed || landed.kind !== bm.kind || landed.end !== bm.from + value.length)
      return refuse();
    this.bookmarks.delete(bm);
    return this.replaceTo(next, bm.from + value.length);
  }

  /**
   * Replace source `[from, to)` with `insert` as one step (an accepted suggestion, an item link):
   * refused when `expect` no longer stands there. The caret lands after the insertion.
   */
  replaceSource(from: number, to: number, insert: string, expect?: string): boolean {
    this.sync();
    const source = this.source;
    if (
      from < 0 ||
      to > source.length ||
      from > to ||
      (expect !== undefined && source.slice(from, to) !== expect)
    ) {
      this.notify({ kind: "token-refused", detail: insert });
      return false;
    }
    return this.replaceTo(source.slice(0, from) + insert + source.slice(to), from + insert.length);
  }

  private replaceTo(next: string, caret: number): boolean {
    const tr = adoptTr(this.state, this.config, next, { anchor: caret, head: caret });
    if (!tr) return true;
    this.apply(tr.setMeta(META_REMOTE, false).setMeta(META_NORMALIZE, true).scrollIntoView(), {
      boundary: true,
    });
    // a token put in whole is finished, not being typed: a chip at once, even with the caret at its end
    this.settle();
    return true;
  }

  /** The source range the selection covers (a selected chip: its whole token). */
  selectionRange(): { readonly from: number; readonly to: number } {
    const { anchor, head } = this.caret;
    return { from: Math.min(anchor, head), to: Math.max(anchor, head) };
  }

  /** The next keystroke cannot join the current typing group. */
  barrier() {
    this.clockOffset += BARRIER;
  }

  /**
   * Typing rewrites fire only in plain prose: never inside code, math, a link or any other token,
   * and never after a still-open backtick or math dollar on the same line (a currency `$5` is
   * not math).
   */
  private plainContext(source: string, from: number, to: number) {
    if (this.config.field === "note" && !inProse(source, from)) return false;
    const lineStart = lineStartAt(source, from);
    const line = source.slice(lineStart, from).replace(/\\./g, "");
    if ((line.split("`").length - 1) % 2 === 1) return false;
    const openers = line.match(/(?<![\p{L}\p{N}$\\])\$(?![\s$\p{N}])/gu)?.length ?? 0;
    const dollars = line.split("$").length - 1;
    if (openers > 0 && dollars % 2 === 1) return false;
    return parseInline(source).every(
      (seg) =>
        seg.end <= from || seg.start >= to || seg.kind === "text" || seg.kind === "delimiter",
    );
  }

  private emit(text: string, how: { readonly time?: number; readonly boundary?: boolean }) {
    // The core keeps one caret per edit: the selection's moving end.
    const caret = this.caret.head;
    // A proposal moves the revision by one; a synchronous veto moves it again. Recording our own
    // revision makes that veto read as something that came after this edit.
    const seqBefore = this.host.currentSeq();
    const time = how.boundary ? OWN_STEP : (how.time ?? Date.now()) + this.clockOffset;
    const result = this.host.dispatch(
      this.config.field === "note"
        ? { type: "note", id: this.id, text, caret, time }
        : { type: "text", id: this.id, text, caret, time },
    );
    if (result.refusal) {
      // Refused (locked, read-only): the field shows the document again at once.
      this.adopt(this.host.text(this.id, this.config.field) ?? "");
      return;
    }
    this.localSeq = seqBefore + 1;
    this.told = { start: caret, end: caret };
    this.outbox.push(text);
    this.known = text;
    this.lastRule = null;
  }

  /** The outliner rendered: decide whether the committed text replaces what is shown. */
  onRender(
    committed: string,
    renderedSeq: number,
    caret?: {
      readonly id: string;
      readonly start: number;
      readonly end: number;
      readonly field?: string;
    } | null,
  ): "deferred" | "in-sync" | "kept" | "adopted" {
    if (this.composingBase !== null) return "deferred";
    const shown = this.source;
    if (committed === shown) {
      this.outbox = [committed];
      this.known = committed;
      return "in-sync";
    }
    const foreign = renderedSeq > this.localSeq || !this.outbox.includes(committed);
    if (!foreign) return "kept";
    // The core's caret for this row wins over mapping when the core moved it (an undo restores
    // what it recorded); one it only kept from this field's last report is mapped with the text.
    // A range this field reported as backward comes back backward.
    const mine =
      caret &&
      caret.id === this.id &&
      (caret.field ?? "title") === this.config.field &&
      !this.toldCore(caret);
    const at = mine
      ? this.backward.has(`${caret.start}:${caret.end}`)
        ? { anchor: caret.end, head: caret.start }
        : { anchor: caret.start, head: caret.end }
      : undefined;
    this.adopt(committed, at);
    return "adopted";
  }

  /** Whether `caret` is only what this field last told the core (the core has not moved it since). */
  toldCore(caret: { readonly start: number; readonly end: number }): boolean {
    return !!this.told && this.told.start === caret.start && this.told.end === caret.end;
  }

  /** Let go of a held change (the item menu closed): show the stored text again, caret at `at`. */
  releaseHeld(at?: number) {
    if (!this.held) return;
    this.held = false;
    const text = this.host.text(this.id, this.config.field) ?? this.known;
    this.adopt(text, at === undefined ? undefined : { anchor: at, head: at });
  }

  private adopt(source: string, caret?: SourceSelection) {
    const before = this.source;
    const tr = adoptTr(this.state, this.config, source, caret);
    if (tr) this.state = this.state.apply(tr);
    else if (caret) this.place(caret.anchor, caret.head);
    this.outbox = [source];
    this.known = source;
    this.held = false;
    this.moved(before, source);
  }

  /** Put the selection at source offsets without reporting it (the core already knows it). */
  place(anchor: number, head = anchor) {
    const map = serialize(this.state.doc);
    const a = sourceToPos(map, anchor);
    const h = sourceToPos(map, head);
    this.state = this.state.apply(
      this.state.tr
        .setSelection(TextSelection.between(this.state.doc.resolve(a), this.state.doc.resolve(h)))
        .setMeta(META_REMOTE, true),
    );
  }

  /* ── composition: the view calls these from its DOM events ── */

  compositionStart() {
    this.composingBase = this.source;
    this.composingSeq = this.localSeq;
    this.composingAt = caretSource(this.state);
  }

  /**
   * The composed text is in the document. Reconcile with what the outliner holds now: a veto,
   * undo or outside value during the composition is foreign by the onRender rule, and the
   * composed text is replayed onto it, so rejected text is never proposed again. One step.
   */
  compositionEnd(): "rebased" | "remote-wins" | "committed" {
    const base = this.composingBase ?? this.source;
    this.composingBase = null;
    const local = this.source;
    const committed = this.host.text(this.id, this.config.field) ?? "";
    const foreign =
      committed !== base &&
      (this.host.currentSeq() > this.composingSeq || !this.outbox.includes(committed));
    if (foreign) {
      const merged = rebaseLocal(base, local, committed);
      this.adopt(committed);
      if (merged === null) {
        const grown = local.length - base.length;
        const at = this.composingAt;
        if (
          grown > 0 &&
          local.slice(0, at) === base.slice(0, at) &&
          local.slice(at + grown) === base.slice(at)
        )
          this.droppedComposition = local.slice(at, at + grown);
        else {
          const lost = spliceOf(base, local);
          this.droppedComposition = local.slice(lost.fromB, lost.toB);
        }
        this.notify({ kind: "edit-conflict", detail: this.droppedComposition });
        return "remote-wins";
      }
      if (merged !== committed) {
        const tr = adoptTr(this.state, this.config, merged);
        if (tr) this.state = this.state.apply(tr);
        this.emit(merged, { boundary: true });
      }
      return "rebased";
    }
    if (local !== base) {
      if (this.hooks.hold?.(local, caretSource(this.state))) this.held = true;
      else this.emit(local, { boundary: true });
    }
    return "committed";
  }

  /* ── splitting and joining rows ── */

  /** Enter: both halves, bound to the text they were cut from (the core refuses a stale base). */
  split(newId: string) {
    this.sync();
    const { start, end, text } = splitSources(this.state, this.config);
    const result = this.host.dispatch({
      type: "split",
      id: this.id,
      start,
      end,
      newId,
      ...(text ? { text: { left: text.left, right: text.right, base: this.source } } : {}),
    });
    if (result.refusal) this.notify({ kind: "split-refused" });
    return result;
  }

  /** ⌫ at the start: join into the row before. Both texts are the host's newest. */
  mergeBackward() {
    this.sync();
    const left = this.host.neighbour(this.id, "backward");
    if (!left) return null;
    return this.merge(
      "backward",
      { id: left.id, text: left.text },
      { id: this.id, text: this.source },
    );
  }

  /** Delete at the end: pull the next row in. */
  mergeForward() {
    this.sync();
    const right = this.host.neighbour(this.id, "forward");
    if (!right) return null;
    return this.merge(
      "forward",
      { id: this.id, text: this.source },
      { id: right.id, text: right.text },
    );
  }

  private merge(
    direction: "backward" | "forward",
    left: { id: string; text: string },
    right: { id: string; text: string },
  ) {
    const joined = joinSources(this.config, left, right).text;
    // The caret at the end of the left row's own text when the join keeps it whole, as before.
    const text = joined.joined.startsWith(left.text)
      ? { ...joined, caret: left.text.length }
      : joined;
    const result = this.host.dispatch({ type: "merge", id: this.id, direction, text });
    if (result.refusal) this.notify({ kind: "merge-refused" });
    return result;
  }

  /* ── note blocks (note-blocks.ts): each key is a source edit ── */

  /** Apply a note block edit computed on the newest source and selection. False: not this key's. */
  private blockEdit(
    compute: (source: string, from: number, to: number) => SourceEdit | null,
    how: { readonly time?: number; readonly boundary?: boolean },
  ): boolean {
    if (this.config.field !== "note" || this.composing) return false;
    this.sync();
    const { from, to } = this.selectionRange();
    const edit = compute(this.source, from, to);
    if (!edit) return false;
    if (edit.text === this.source) {
      if (edit.anchor === undefined && (edit.caret !== from || to !== from))
        this.setCaret(edit.caret);
      return true;
    }
    const tr = adoptTr(this.state, this.config, edit.text, {
      anchor: edit.anchor ?? edit.caret,
      head: edit.caret,
    });
    if (tr)
      this.apply(
        tr.setMeta(META_REMOTE, false).setMeta(META_NORMALIZE, true).scrollIntoView(),
        how,
      );
    return true;
  }

  /** Enter in a note: a line, the next list item or quoted line, a block opened or left. */
  enter(time?: number): boolean {
    return this.blockEdit((source, from, to) => noteEnter(source, from, to), { time });
  }

  /** ⌫ at a block's start in a note (its marker goes, or it joins the block above). False: an ordinary ⌫. */
  blockBackspace(time?: number): boolean {
    if (!this.state.selection.empty) return false;
    return this.blockEdit((source, from) => noteBackspace(source, from), { time });
  }

  /** ⌘↵ in a note: a task toggles (its own step); code, math or a table is left. False: neither. */
  modEnter(): boolean {
    const task = this.config.field === "note" ? taskAt(this.source, this.caret.head) : null;
    return this.blockEdit(
      (source, from) => noteModEnter(source, from),
      task !== null ? { boundary: true } : { time: Date.now() },
    );
  }

  /** ↓ on the last line of a code, math or table block that ends the note: a line below it. */
  downOut(): boolean {
    if (!this.state.selection.empty) return false;
    return this.blockEdit((source, from) => noteDownOut(source, from), { time: Date.now() });
  }

  /** Tab in a note's list: the items nest under the one above (`out`: a level out). False: not in a list. */
  tab(out: boolean): boolean {
    return this.blockEdit((source, from, to) => noteTab(source, from, to, out), { boundary: true });
  }

  /** The task whose line starts at source offset `itemStart` checked or unchecked: one step. */
  toggleTaskAt(itemStart: number): boolean {
    return this.blockEdit(
      (source, from, to) => {
        const next = toggleTask(source, itemStart);
        return next === null ? null : { text: next, caret: to > from ? from : from };
      },
      { boundary: true },
    );
  }

  /** Show the line at source offset `offset` as the text it is (an image's source), the caret at its end. */
  showLineAt(offset: number) {
    if (this.config.field !== "note") return;
    const fresh = sourceToDoc("note", this.source, { whitespaceCaret: offset });
    const tr = replaceAll(this.state.tr, fresh);
    tr.setSelection(TextSelection.near(tr.doc.resolve(sourceToPos(serialize(tr.doc), offset))));
    this.state = this.state.apply(tr.setMeta(META_NORMALIZE, true).setMeta("addToHistory", false));
    this.reportCaret();
  }

  /* ── title line-start rules ── */

  /** Space typed in a title. True when a rule consumed it (no space is inserted). */
  space(time?: number): boolean {
    if (this.config.field !== "title" || !this.state.selection.empty || this.composing)
      return this.typeSpace(time);
    const caret = caretSource(this.state);
    const text = this.source;
    const rule = titleRuleFor(text.slice(0, caret));
    const row = this.host.row(this.id);
    const latest = this.host.text(this.id, this.config.field);
    if (
      !rule ||
      !row ||
      (latest !== undefined &&
        latest !== text &&
        latest !== this.known &&
        !this.outbox.includes(latest))
    )
      return this.typeSpace(time);
    const rest = text.slice(caret);
    const commands = this.ruleCommands(rule, rest, row);
    if (!commands) return this.typeSpace(time);
    const seqBefore = this.host.currentSeq();
    const result = this.host.dispatch({
      type: "transaction",
      commands,
      caret: { id: this.id, start: 0, end: 0 },
    } as FieldAction);
    if (result.refusal) return this.typeSpace(time); // locked: the keystroke is not lost
    const tr = adoptTr(this.state, this.config, rest, { anchor: 0, head: 0 });
    if (tr) this.state = this.state.apply(tr);
    this.localSeq = seqBefore + 1;
    this.outbox = [text, rest];
    this.known = rest;
    this.lastRule = { text: rest, seq: this.host.currentSeq() };
    return true;
  }

  /**
   * ⌫ right after a title rule undoes it (marker and attribute together, one core undo), only
   * while nothing else happened since; right after an inline conversion it brings back the
   * literal characters typed. False when it is an ordinary ⌫.
   */
  backspace(): boolean {
    if (
      this.lastRule &&
      this.source === this.lastRule.text &&
      this.host.currentSeq() === this.lastRule.seq &&
      this.state.selection.empty &&
      caretSource(this.state) === 0
    ) {
      this.lastRule = null;
      this.host.dispatch({ type: "undo" });
      return true;
    }
    const revert = revertConversionTr(this.state, this.config);
    if (!revert) return false;
    this.apply(revert, { boundary: true });
    return true;
  }

  private typeSpace(time?: number) {
    const { from, to } = this.state.selection;
    this.apply(this.state.tr.insertText(" ", from, to), { time });
    return false;
  }

  private ruleCommands(rule: TitleRule, rest: string, row: RowFacts) {
    const data = { ...(row.data ?? {}) };
    switch (rule.kind) {
      case "bullet":
        return [{ type: "update", id: this.id, changes: { text: rest } }];
      case "checkbox":
        return [
          {
            type: "update",
            id: this.id,
            changes: {
              text: rest,
              checked: rule.checked,
              data: clean({ ...data, completed: undefined }),
            },
          },
        ];
      case "numbered":
        if (!row.parentId) return null; // root level: stays literal
        return [
          {
            type: "update",
            id: row.parentId,
            changes: { data: clean({ ...(row.parentData ?? {}), numbered: true }) },
          },
          { type: "update", id: this.id, changes: { text: rest } },
        ];
    }
  }

  /** Put the caret at a source offset and report it, as a click would. */
  setCaret(anchor: number, head = anchor) {
    const map = serialize(this.state.doc);
    const tr = this.state.tr.setSelection(
      TextSelection.between(
        this.state.doc.resolve(sourceToPos(map, anchor)),
        this.state.doc.resolve(sourceToPos(map, head)),
      ),
    );
    this.apply(tr);
  }
}
