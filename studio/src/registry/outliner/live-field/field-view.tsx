/**
 * The live field in the browser: one EditorView per editing session, driving a FieldSession.
 * Loaded on demand (load.ts), so the editor's code is fetched only once a field is edited.
 *
 *   keydown ─▶ the field's popups (item menu, suggestions)   hooks.menuKey
 *           ─▶ ⌫ after a rule or conversion; Enter on a chip  the field itself
 *           ─▶ split, merge, indent, undo, shortcuts …         hooks.key (the outliner's row keys)
 *           ─▶ → out of a style, Home, End                    the field's keymap
 *           ─▶ the editor's base keys
 *
 * Chips render through the static renderer (InlineText to static markup: React escapes the
 * document text, nothing is parsed as HTML), so the editing DOM is the static DOM.
 *
 * The editable element also answers the textarea's selection members (`value`,
 * `selectionStart`, `setSelectionRange` …) in source offsets, and carries `liveField` for
 * structural edits, so everything that worked on a row's textarea works on it unchanged.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Decoration, DecorationSet, EditorView, type NodeView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { NodeSelection, Plugin, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { Check } from "lucide-react";
import type { DOMSerializer, Fragment, Node as PMNode, Slice } from "prosemirror-model";
import { cn } from "@/lib/utils";
import { InlineText, isShortCode, parseInline, type InlineRange, type InlineSegment } from "../inline";
import { MathTex } from "../math";
import { NOTE_CLASS, lineStartAt, parseNoteBlocks, type NoteBlock } from "../rich-note";
import { CodeOrEmbed, ImageBlock, TableView, useRichContent, type OutlineRenderers } from "../rich-note-view";
import { inlineHtml } from "../interchange";
import { isComposingKey } from "../keymap";
import type { CaretField, LiveFieldApi, LiveFieldElement } from "../focus";
import { FieldSession, noteTypingRewrite, typingRewrite, type FieldHost, type FieldName, type FieldNotice, type TokenBookmark } from "./field-session";
import { STYLE_GROUP } from "./schema";
import { posToSource, serialize, sourceToPos, stabilizeChecked } from "./source-doc";
import "./live-field.css";

/** A key event as the outliner's field handlers read it (the same shape React gives a textarea). */
export interface FieldKeyEvent {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly isComposing: boolean;
  readonly keyCode: number;
  readonly repeat: boolean;
  readonly currentTarget: LiveFieldElement;
  readonly target: EventTarget | null;
  readonly nativeEvent: KeyboardEvent;
  readonly defaultPrevented: boolean;
  getModifierState(key: string): boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

/** A chip the reader asked to change (Enter or a click on it). */
export interface ChipRequest {
  readonly kind: string;
  readonly src: string;
  /** Source offsets of the token. */
  readonly from: number;
  readonly to: number;
  readonly segment: InlineSegment | undefined;
  readonly rect: DOMRect;
}

/** What the outliner does for the field. Read through a ref: always the newest. */
export interface LiveFieldHooks {
  /** Keys a popup of this field owns (the item menu, suggestions). First. */
  menuKey?(event: FieldKeyEvent): boolean;
  /** The row's keys (split, merge, indent, undo, shortcuts, arrows at the edges). */
  key(event: FieldKeyEvent): boolean;
  /** The text changed by typing (suggestions follow it). */
  typed?(el: LiveFieldElement): void;
  /** A change shown but not stored yet (the item menu's query). True: held. */
  hold?(el: LiveFieldElement, text: string, caret: number): boolean;
  /** A selection-only move. True: a popup owns it and the core is not told. */
  caretMoved?(el: LiveFieldElement): boolean;
  notice?(notice: FieldNotice): void;
  /** Files, item links, outlines and multi-line text: true when the outliner took the paste. */
  paste?(data: DataTransfer, el: LiveFieldElement): boolean;
  /** Files dropped on the field: true when the outliner took them. */
  drop?(data: DataTransfer, el: LiveFieldElement): boolean;
  /** A date chip opens the date picker. */
  openDate?(chip: ChipRequest): void;
  undo?(redo: boolean): void;
  focus?(): void;
  /** Focus left the field (not for one of its own popups). */
  blur?(): void;
}

export interface LiveFieldProps {
  readonly rowId: string;
  readonly field: FieldName;
  readonly host: FieldHost;
  /** The text this render shows for the field (the field adopts it by the session's rule). */
  readonly committed: string;
  readonly renderedSeq: number;
  /** The core caret and its focus revision: a new revision on this row puts the caret there. */
  readonly caret?: { readonly id: string; readonly start: number; readonly end: number; readonly field?: string } | null;
  readonly focusVersion?: number;
  /** A popup holds a change (the item menu is open); false again: show the stored text. */
  readonly holding?: boolean;
  /** Attributes of the editable element: role, aria-*, data-field … */
  readonly attributes?: Readonly<Record<string, string | undefined>>;
  readonly className?: string;
  /** Source ranges to highlight (search matches). */
  readonly marks?: readonly InlineRange[];
  readonly resolveRef?: (id: string) => string | null;
  readonly hooks: LiveFieldHooks;
  readonly elementRef?: React.MutableRefObject<CaretField | null>;
  /** Focus at once, caret at this source offset (no core caret involved: the zoomed title). */
  readonly autoFocus?: { readonly caret: number };
}

/** Counters for tests and the browser runner. */
export const fieldStats = { created: 0, destroyed: 0 };

/** A transaction the session takes as its own history step (a paste, a drop, a cut, a format). */
const BOUNDARY = "live-field:boundary";

interface Mounted {
  readonly view: EditorView;
  readonly session: FieldSession;
  readonly el: LiveFieldElement;
  /** Open a chip's editor (date picker, token editor). */
  openChip(pos: number): boolean;
}

/* ─────────────────────────── chips ─────────────────────────── */

/** What a node view's React content may read (the newest props, through the LiveField). */
export interface PortalContext {
  readonly resolveRef?: (id: string) => string | null;
}

/**
 * A node view whose content is React: the LiveField renders `content()` into `portal` (one
 * portal per view, created lazily as the view appears). Static renderers are reused as they
 * are, so the editing DOM is the static DOM, and context (trusted renderers, print) flows in.
 */
export interface PortalView {
  readonly id: number;
  readonly portal: HTMLElement;
  content(context: PortalContext): React.ReactNode;
}

/** The portal views a field shows: their DOM homes in the editor and what they show. */
export interface ChipHosts {
  add(view: PortalView): void;
  remove(view: PortalView): void;
  changed(view: PortalView): void;
}

let viewIds = 0;

/**
 * A chip is an atom in the editor whose content is the static renderer's own React (InlineText
 * for its token), rendered into it through a portal by the LiveField component. Clicks belong to
 * the editor (it selects the chip), never to the chip's buttons and links.
 */
export class ChipView implements NodeView, PortalView {
  readonly dom: HTMLElement;
  readonly id = ++viewIds;
  constructor(
    public node: PMNode,
    private readonly hosts: ChipHosts,
  ) {
    this.dom = document.createElement("span");
    this.dom.contentEditable = "false";
    this.dom.dataset.chip = String(node.attrs.kind);
    hosts.add(this);
  }
  get portal() {
    return this.dom;
  }
  get src() {
    return String(this.node.attrs.src);
  }
  content(context: PortalContext) {
    return <InlineText source={this.src} resolveRef={context.resolveRef} />;
  }
  update(node: PMNode) {
    if (node.type !== this.node.type || node.attrs.kind !== this.node.attrs.kind) return false;
    const changed = node.attrs.src !== this.node.attrs.src;
    this.node = node;
    if (changed) this.hosts.changed(this);
    return true;
  }
  destroy() {
    this.hosts.remove(this);
  }
  stopEvent() {
    return false;
  }
  ignoreMutation() {
    return true;
  }
}

/* ─────────────────────────── note blocks ─────────────────────────── */

const make = (tag: string, className = "", attrs: Record<string, string> = {}) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
};
/** The block the selection is in carries this decoration: code, math and tables show their source. */
const isActive = (decorations: readonly Decoration[]) => decorations.some((deco) => (deco.spec as { active?: boolean }).active);
const MATH_LANGS = new Set(["math", "latex", "tex"]);

/** What a block view needs from its field. */
interface BlockContext {
  readonly hosts: ChipHosts;
  readonly renderers: () => OutlineRenderers;
  readonly view: () => EditorView;
  /** Toggle the task whose content starts at document position `pos`. */
  readonly toggleTask: (pos: number) => void;
}

/**
 * A block that is rendered while the caret is elsewhere and shows its source while the caret is
 * in it: display math, a table (the labelled source box), a code fence a trusted renderer draws.
 * A plain code block always shows its source, with its label above it.
 */
class SourceBlockView implements NodeView, PortalView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  readonly portal: HTMLElement;
  readonly id = ++viewIds;
  private readonly header: HTMLElement;
  private readonly label: HTMLElement;
  private readonly box: HTMLElement;
  private active: boolean;
  private registered = false;
  constructor(
    public node: PMNode,
    private readonly getPos: () => number | undefined,
    decorations: readonly Decoration[],
    private readonly context: BlockContext,
  ) {
    const kind = node.type.name;
    this.dom = make("div", kind === "codeblock" ? "relative block max-w-full" : "relative block max-w-full", { "data-block": kind });
    this.box = make("div", "group/code relative block max-w-full overflow-hidden rounded-md border border-hairline bg-muted/45 text-foreground/90");
    this.header = make("div", "flex h-6 items-center gap-1.5 border-b border-hairline ps-2.5 pe-1 font-mono text-[10.5px] tracking-wide text-muted-foreground select-none coarse:h-9", { contenteditable: "false", dir: "ltr" });
    this.label = make("span", "min-w-0 flex-1 truncate");
    this.header.appendChild(this.label);
    const pre = make("pre", "overflow-x-auto overscroll-x-contain px-2.5 py-1.5 font-mono text-[11.5px] leading-[18px] whitespace-pre", { dir: "ltr" });
    this.contentDOM = make("code", "block min-h-[18px]");
    pre.appendChild(this.contentDOM);
    this.box.append(this.header, pre);
    this.portal = make("div", "block max-w-full cursor-text", { contenteditable: "false" });
    // A click on the rendered block puts the caret in its source.
    this.portal.addEventListener("mousedown", (event) => {
      if ((event.target as Element | null)?.closest?.("button, a, input, [data-embed]")) return;
      event.preventDefault();
      const pos = this.getPos();
      if (pos === undefined) return;
      const v = this.context.view();
      v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos + 1)));
      v.focus();
    });
    this.dom.append(this.box, this.portal);
    this.active = isActive(decorations);
    this.paint();
  }
  /** Rendered while the caret is elsewhere (math, a table, a trusted embed); plain code never is. */
  private get rendered() {
    const kind = this.node.type.name;
    if (kind === "mathblock" || kind === "rawblock") return true;
    const lang = String(this.node.attrs.lang ?? "");
    return MATH_LANGS.has(lang) || Object.prototype.hasOwnProperty.call(this.context.renderers(), lang);
  }
  private paint() {
    const kind = this.node.type.name;
    const lang = String(this.node.attrs.lang ?? "");
    const showRendered = this.rendered && !this.active;
    this.label.textContent =
      kind === "rawblock" ? "Table source" : kind === "mathblock" ? "Math source" : lang ? (lang.startsWith("embed:") && !this.rendered ? `${lang} · no renderer` : lang) : "code";
    if (kind === "codeblock") this.dom.dataset.codeBlock = lang;
    // the source box is a 44px target at least, and its keyboard exit is Esc or ↓ past its end
    this.box.classList.toggle("min-h-11", kind === "rawblock");
    this.box.hidden = showRendered;
    this.portal.hidden = !showRendered;
    if (showRendered && !this.registered) {
      this.context.hosts.add(this);
      this.registered = true;
    } else if (!showRendered && this.registered) {
      this.context.hosts.remove(this);
      this.registered = false;
    } else if (showRendered) this.context.hosts.changed(this);
  }
  content() {
    const body = this.node.textContent;
    switch (this.node.type.name) {
      case "mathblock":
        return <MathTex tex={body} display className="text-foreground" />;
      case "rawblock": {
        const table = parseNoteBlocks(body).find((block): block is Extract<NoteBlock, { kind: "table" }> => block.kind === "table");
        return table ? <TableView block={table} source={body} handlers={{}} /> : <pre className="font-mono text-[11.5px] whitespace-pre-wrap">{body}</pre>;
      }
      default:
        return <CodeOrEmbed lang={String(this.node.attrs.lang ?? "")} code={{ start: 0, end: body.length }} source={body} start={0} />;
    }
  }
  update(node: PMNode, decorations: readonly Decoration[]) {
    if (node.type !== this.node.type) return false;
    const changed = node !== this.node;
    this.node = node;
    const active = isActive(decorations);
    if (changed || active !== this.active) {
      this.active = active;
      this.paint();
    }
    return true;
  }
  stopEvent(event: Event) {
    return !!(event.target instanceof Node && this.portal.contains(event.target) && event.type !== "mousedown");
  }
  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }) {
    if (mutation.type === "selection") return !this.contentDOM.contains(mutation.target);
    return !this.contentDOM.contains(mutation.target);
  }
  destroy() {
    if (this.registered) this.context.hosts.remove(this);
  }
}

/** An image on its own line, rendered as the static note renders it; its own controls work. */
class ImageView implements NodeView, PortalView {
  readonly dom: HTMLElement;
  readonly id = ++viewIds;
  constructor(
    public node: PMNode,
    private readonly context: BlockContext,
  ) {
    this.dom = make("div", "block max-w-full", { contenteditable: "false", "data-block": "image" });
    context.hosts.add(this);
  }
  get portal() {
    return this.dom;
  }
  content() {
    const image = parseNoteBlocks(String(this.node.attrs.src)).find((block): block is Extract<NoteBlock, { kind: "image" }> => block.kind === "image");
    return image ? <ImageBlock block={image} /> : null;
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.src !== this.node.attrs.src;
    this.node = node;
    if (changed) this.context.hosts.changed(this);
    return true;
  }
  stopEvent(event: Event) {
    // the enlarge button and its dialog are the image's own; the frame around it selects the block
    return !!(event.target as Element | null)?.closest?.("button");
  }
  ignoreMutation() {
    return true;
  }
  destroy() {
    this.context.hosts.remove(this);
  }
}

/** A list item; a task's box is a real control (a click toggles the task, as ⌘↵ does). */
class ItemView implements NodeView, PortalView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  readonly id = ++viewIds;
  readonly portal: HTMLElement;
  constructor(
    public node: PMNode,
    private readonly getPos: () => number | undefined,
    private readonly context: BlockContext,
  ) {
    this.dom = make("li");
    this.portal = make("span", "", { contenteditable: "false", role: "checkbox", "data-task-box": "" });
    this.portal.addEventListener("mousedown", (event) => event.preventDefault());
    this.portal.addEventListener("click", (event) => {
      event.preventDefault();
      const pos = this.getPos();
      if (pos !== undefined) this.context.toggleTask(pos + 2);
    });
    this.contentDOM = make("div");
    this.dom.append(this.portal, this.contentDOM);
    this.paint();
    context.hosts.add(this);
  }
  private paint() {
    const checked = this.node.attrs.checked as boolean | null;
    const task = checked !== null;
    this.dom.className = NOTE_CLASS.item(task);
    this.portal.hidden = !task;
    // a 44px target on touch, without moving the box
    this.portal.className = `${NOTE_CLASS.box(!!checked)} relative cursor-default after:absolute after:-inset-1.5 coarse:after:-inset-3.5`;
    this.portal.setAttribute("aria-checked", checked ? "true" : "false");
    this.portal.setAttribute("aria-label", checked ? "Done: mark not done" : "To do: mark done");
    this.contentDOM.className = NOTE_CLASS.itemBody(checked ?? undefined);
  }
  content() {
    return this.node.attrs.checked ? <Check className="size-[0.7em]" strokeWidth={3} /> : null;
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.checked !== this.node.attrs.checked;
    this.node = node;
    if (changed) {
      this.paint();
      this.context.hosts.changed(this);
    }
    return true;
  }
  stopEvent(event: Event) {
    return !!(event.target instanceof Node && this.portal.contains(event.target));
  }
  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }) {
    return !this.contentDOM.contains(mutation.target);
  }
  destroy() {
    this.context.hosts.remove(this);
  }
}

/* ─────────────────────────── the view ─────────────────────────── */

const styleMarksAt = (state: EditorState) => (state.storedMarks ?? state.selection.$head.marks()).filter((mark) => mark.type.spec.group === STYLE_GROUP);

/** → at the very end of a style: leave the style (the next character is plain), one press. */
function leaveStyleRight(state: EditorState, dispatch?: (tr: Transaction) => void) {
  const { $head, empty } = state.selection;
  if (!empty) return false;
  const styles = styleMarksAt(state);
  const after = $head.nodeAfter;
  const leaving = styles.filter((mark) => !(after && mark.isInSet(after.marks)));
  if (!leaving.length || after) return false;
  const marks = state.storedMarks ?? $head.marks();
  dispatch?.(state.tr.setStoredMarks(marks.filter((mark) => !leaving.includes(mark))));
  return true;
}

function keyEvent(event: KeyboardEvent, el: LiveFieldElement): FieldKeyEvent {
  return {
    key: event.key,
    code: event.code,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    isComposing: event.isComposing,
    keyCode: event.keyCode,
    repeat: event.repeat,
    currentTarget: el,
    target: event.target,
    nativeEvent: event,
    get defaultPrevented() {
      return event.defaultPrevented;
    },
    getModifierState: (key) => event.getModifierState(key),
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation(),
  };
}

/** The first or last textblock of a document (its position), -1 when there is none. */
function edgeTextblock(doc: PMNode, last: boolean): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0 && !last) return false;
    if (node.isTextblock) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

function mountField(
  place: HTMLElement,
  session: FieldSession,
  props: () => LiveFieldProps,
  openEditor: (bm: TokenBookmark, rect: DOMRect) => void,
  chips: ChipHosts,
  renderers: () => OutlineRenderers,
): Mounted {
  const field = session.config.field;
  const schema = session.state.schema;
  let el: LiveFieldElement;
  let destroyed = false;
  let compositionTimer: ReturnType<typeof setTimeout> | null = null;
  const sync = () => {
    if (!destroyed && view.state !== session.state) view.updateState(session.state);
  };
  const run = (change: () => void) => {
    const before = session.source;
    change();
    sync();
    if (session.source !== before) props().hooks.typed?.(el);
  };

  /** The source of a copied slice, written so it reads back as it showed (`**bo**` of `**bold**`). */
  const sliceSource = (content: Fragment) => {
    const first = content.firstChild;
    // Across a note's blocks: the source the selection covers, exactly as stored.
    if (field === "note" && first && !first.isInline) {
      const { from, to } = session.selectionRange();
      return session.source.slice(from, to);
    }
    const doc = first && !first.isInline ? schema.topNodeType.createAndFill(null, content) : schema.topNodeType.createAndFill(null, schema.nodes.line!.create(null, content));
    return doc ? serialize(stabilizeChecked(field, doc).doc).source : "";
  };

  const finishComposition = () => {
    compositionTimer = null;
    if (!session.composing) return;
    session.compositionEnd();
    sync();
    if (!destroyed) props().hooks.typed?.(el);
  };

  const openChip = (pos: number) => {
    const node = view.state.doc.nodeAt(pos);
    if (node?.type.name !== "chip") return false;
    const bm = session.tokenAt(pos);
    if (!bm) return false;
    const dom = view.nodeDOM(pos) as HTMLElement | null;
    const rect = dom?.getBoundingClientRect() ?? el.getBoundingClientRect();
    if (bm.kind === "date" && props().hooks.openDate) {
      session.release(bm);
      props().hooks.openDate!({ kind: bm.kind, src: bm.src, from: bm.from, to: bm.to, segment: parseInline(bm.src).find((seg) => seg.kind === "date"), rect });
      return true;
    }
    openEditor(bm, rect);
    return true;
  };

  /** At the top (bottom) line of a textblock: ↑ (↓) would leave it. */
  const atLineEdge = (direction: "up" | "down") => {
    const { $head } = view.state.selection;
    if (!el.getBoundingClientRect().width) {
      let br = false;
      $head.parent.forEach((child, offset) => {
        if (child.type.name === "br" && (direction === "up" ? offset < $head.parentOffset : offset >= $head.parentOffset)) br = true;
      });
      return !br;
    }
    try {
      return view.endOfTextblock(direction);
    } catch {
      return true;
    }
  };
  /** ↑/↓ from the line next to a code, math or table block: into its source (its last or first line). */
  const stepIntoSource = (direction: "up" | "down") => {
    const { selection, doc } = view.state;
    if (!selection.empty || selection.$head.depth < 1) return false;
    const index = selection.$head.index(0) + (direction === "up" ? -1 : 1);
    const target = doc.maybeChild(index);
    if (!target || !["codeblock", "mathblock", "rawblock"].includes(target.type.name) || !atLineEdge(direction)) return false;
    let start = 0;
    for (let i = 0; i < index; i++) start += doc.child(i).nodeSize;
    const pos = direction === "up" ? start + 1 + target.content.size : start + 1;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)).scrollIntoView());
    return true;
  };
  /** A note block key through the session (note-blocks.ts); false: the editor's own. */
  const blockKey = (change: () => boolean) => {
    let done = false;
    run(() => (done = change()));
    return done;
  };
  const fieldKeys = keymap({
    ArrowRight: leaveStyleRight,
    // A chip at either end of a title must never trap the caret before it. (A note's lines keep their own.)
    Home: (state, dispatch) => field === "title" && (dispatch?.(state.tr.setSelection(TextSelection.atStart(state.doc))), true),
    End: (state, dispatch) => field === "title" && (dispatch?.(state.tr.setSelection(TextSelection.atEnd(state.doc))), true),
    // A note's blocks: the next item or line, a block opened or left (note-blocks.ts).
    Enter: () => field === "note" && blockKey(() => session.enter(Date.now())),
    // A rendered block (math, a table, an embed) hides its source: ↑/↓ step into it explicitly.
    ArrowUp: () => field === "note" && stepIntoSource("up"),
    ArrowDown: () => field === "note" && stepIntoSource("down"),
    Backspace: () => field === "note" && blockKey(() => session.blockBackspace(Date.now())),
  });

  const glue = new Plugin({
    props: {
      handleTextInput(v, _from, _to, text) {
        if (text !== " " || v.composing || session.composing) return false;
        run(() => session.space(Date.now()));
        return true;
      },
      handleDOMEvents: {
        keydown(v, event) {
          // An input method owns Enter, Tab and Escape while it composes: a Tab it passed on is swallowed.
          if ((v.composing || isComposingKey(event)) && event.key === "Tab" && event.keyCode !== 229) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        compositionstart() {
          if (compositionTimer) finishComposition();
          session.compositionStart();
          return false;
        },
        compositionend() {
          // The editor reads the composed text after this event; finish once it has.
          compositionTimer = setTimeout(finishComposition, 0);
          return false;
        },
        beforeinput(v, event) {
          const type = (event as InputEvent).inputType;
          // Native undo belongs to the input method while it composes; otherwise to the outline.
          if ((type === "historyUndo" || type === "historyRedo") && !v.composing) {
            event.preventDefault();
            props().hooks.undo?.(type === "historyRedo");
            return true;
          }
          return false;
        },
        click(_v, event) {
          // Links inside chips never navigate while editing.
          if ((event.target as HTMLElement | null)?.closest?.("a")) event.preventDefault();
          return false;
        },
        focus() {
          props().hooks.focus?.();
          return false;
        },
        blur(_v, event) {
          const next = (event as FocusEvent).relatedTarget as Element | null;
          if (!next?.closest?.("[data-field-overlay]")) props().hooks.blur?.();
          return false;
        },
      },
      handleClickOn(_v, _pos, node, nodePos, _event, direct) {
        // A date chip opens its picker on a click, as it does when not editing.
        if (!direct || node.type.name !== "chip" || node.attrs.kind !== "date") return false;
        return openChip(nodePos);
      },
      handlePaste(_v, event) {
        const data = event.clipboardData;
        if (!data) return false;
        event.preventDefault();
        if (props().hooks.paste?.(data, el)) return true;
        let text = data.getData("text/plain");
        if (field === "title") text = text.replace(/\r\n?|\n/g, " ");
        if (text) run(() => session.paste(text));
        return true;
      },
      handleDrop(v, event, _slice, moved) {
        if (moved) return false; // a move inside the field: the editor's own, one step (BOUNDARY below)
        const data = event.dataTransfer;
        if (!data) return false;
        event.preventDefault();
        if (props().hooks.drop?.(data, el)) return true;
        let text = data.getData("text/plain");
        if (field === "title") text = text.replace(/\r\n?|\n/g, " ");
        const at = v.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        if (text) run(() => session.paste(text, at));
        return true;
      },
      clipboardTextSerializer: (slice: Slice) => sliceSource(slice.content),
      clipboardSerializer: {
        serializeFragment(content: Fragment, options: { document?: Document }) {
          const doc = options.document ?? document;
          const holder = doc.createElement("template");
          holder.innerHTML = inlineHtml(sliceSource(content), props().resolveRef);
          return holder.content;
        },
      } as unknown as DOMSerializer,
    },
  });

  /** Search matches and short code, drawn the way the static row draws them; never document changes. */
  const decorate = new Plugin({
    props: {
      decorations(state) {
        const decos: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (node.isText && node.marks.some((mark) => mark.type.name === "code") && isShortCode(node.text!)) decos.push(Decoration.inline(pos, pos + node.nodeSize, { class: "whitespace-nowrap" }));
          return true;
        });
        const marks = props().marks;
        if (marks?.length) {
          const map = serialize(state.doc);
          for (const mark of marks) {
            const from = sourceToPos(map, mark.start);
            const to = sourceToPos(map, mark.end);
            if (to > from) decos.push(Decoration.inline(from, to, { class: "rounded-[3px] bg-warning/30 ring-1 ring-warning/40 dark:bg-warning/25", "data-match": "" }));
          }
        }
        return DecorationSet.create(state.doc, decos);
      },
    },
  });

  /** The code, math or table block the selection is in: it shows its source (its view reads this). */
  const activeBlock = new Plugin({
    props: {
      decorations(state) {
        const { $from } = state.selection;
        const index = $from.index(0);
        const node = state.doc.maybeChild(index);
        if (!node || !["codeblock", "mathblock", "rawblock"].includes(node.type.name) || !(state.selection.empty || state.selection instanceof TextSelection)) return null;
        let start = 0;
        for (let i = 0; i < index; i++) start += state.doc.child(i).nodeSize;
        return DecorationSet.create(state.doc, [Decoration.node(start, start + node.nodeSize, {}, { active: true })]);
      },
    },
  });
  const blocks: BlockContext = {
    hosts: chips,
    renderers,
    view: () => view,
    toggleTask: (pos) => {
      const map = serialize(view.state.doc);
      const line = lineStartAt(session.source, posToSource(map, pos, "lo"));
      run(() => session.toggleTaskAt(line));
    },
  };

  const view: EditorView = new EditorView(
    { mount: place },
    {
      state: session.state.reconfigure({ plugins: [...session.state.plugins, glue, fieldKeys, decorate, ...(field === "note" ? [activeBlock] : []), keymap(baseKeymap)] }),
      nodeViews: {
        chip: (node) => new ChipView(node, chips),
        ...(field === "note"
          ? {
              codeblock: (node, _v, getPos, decorations) => new SourceBlockView(node, getPos, decorations, blocks),
              mathblock: (node, _v, getPos, decorations) => new SourceBlockView(node, getPos, decorations, blocks),
              rawblock: (node, _v, getPos, decorations) => new SourceBlockView(node, getPos, decorations, blocks),
              image: (node) => new ImageView(node, blocks),
              item: (node, _v, getPos) => new ItemView(node, getPos, blocks),
            }
          : {}),
      },
      attributes: (state) => {
        const { attributes = {}, className } = props();
        const out: Record<string, string> = { "data-ol-editor": field, class: cn("min-w-0", className) };
        const only = state.doc.childCount === 1 ? state.doc.firstChild! : null;
        if (field === "note" && only?.isTextblock && !only.content.size && !state.doc.attrs.tail && !only.attrs.lead) out["data-empty"] = "";
        for (const [name, value] of Object.entries(attributes)) if (value !== undefined) out[name] = value;
        return out;
      },
      handleKeyDown(v, event) {
        if (v.composing || session.composing || isComposingKey(event)) return false;
        const hooks = props().hooks;
        const key = keyEvent(event, el);
        if (hooks.menuKey?.(key)) return true;
        const bare = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
        if (event.key === "Backspace" && bare) {
          let reverted = false;
          run(() => (reverted = session.backspace()));
          if (reverted) return true;
        }
        if (event.key === "Enter" && bare && v.state.selection instanceof NodeSelection && openChip(v.state.selection.from)) return true;
        if (field === "note") {
          const selected = v.state.selection instanceof NodeSelection ? v.state.selection : null;
          // Enter on a selected image: its line as text (alt, size, title), the caret at its end.
          if (event.key === "Enter" && bare && selected?.node.type.name === "image") {
            run(() => session.showLineAt(posToSource(serialize(v.state.doc), selected.to, "lo")));
            return true;
          }
          // ⌘↵ toggles the task the caret is in, or leaves code, math or a table (before the item's own ⌘↵).
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && blockKey(() => session.modEnter())) {
            event.preventDefault();
            return true;
          }
          if (event.key === "ArrowDown" && bare && blockKey(() => session.downOut())) return true;
        }
        return hooks.key(key);
      },
      dispatchTransaction(tr) {
        const ui = tr.getMeta("uiEvent");
        const boundary = !!tr.getMeta(BOUNDARY) || ui === "paste" || ui === "drop" || ui === "cut";
        run(() => session.apply(tr, { time: Date.now(), boundary }));
      },
    },
  );
  session.state = view.state; // the session owns the reconfigured state from here on
  session.hooks = {
    hold: (text, caret) => props().hooks.hold?.(el, text, caret) ?? false,
    caretMoved: () => props().hooks.caretMoved?.(el) ?? false,
    notice: (notice) => props().hooks.notice?.(notice),
  };
  el = view.dom as LiveFieldElement;

  const startPos = () => edgeTextblock(view.state.doc, false) + 1;
  const endPos = () => {
    const last = edgeTextblock(view.state.doc, true);
    return last < 0 ? view.state.doc.content.size : last + 1 + view.state.doc.nodeAt(last)!.content.size;
  };
  const api: LiveFieldApi = {
    split: (newId) => {
      const result = session.split(newId);
      sync();
      return result as ReturnType<LiveFieldApi["split"]>;
    },
    merge: (direction) => {
      const result = direction === "backward" ? session.mergeBackward() : session.mergeForward();
      sync();
      return result;
    },
    format: (style) => {
      const type = schema.marks[style];
      if (!type) return false;
      const before = session.source;
      const notices = session.notices.length;
      toggleMark(type, null, { removeWhenPresent: false })(view.state, (tr) => view.dispatch(tr.setMeta(BOUNDARY, true)));
      return session.source !== before || (session.notices.length === notices && view.state.storedMarks !== null);
    },
    replaceSource: (from, to, insert, expect) => {
      let ok = false;
      run(() => (ok = session.replaceSource(from, to, insert, expect)));
      return ok;
    },
    paste: (text) => run(() => session.paste(text)),
    at: (edge, collapsed = true) => {
      const { selection } = view.state;
      if (collapsed && !selection.empty) return false;
      return edge === "start" ? selection.head <= startPos() : selection.head >= endPos();
    },
    get allSelected() {
      const { from, to } = view.state.selection;
      return from <= startPos() && to >= endPos();
    },
    atVisualBoundary: (direction) => {
      if (!view.state.selection.empty) return false;
      // A note's other lines are above or below: only its first and last textblocks have an edge.
      const here = view.state.selection.$head.before();
      if (here !== edgeTextblock(view.state.doc, direction === "down")) return false;
      // No layout (a test DOM): line breaks are the only lines.
      if (!el.getBoundingClientRect().width) {
        const { $head } = view.state.selection;
        let br = false;
        $head.parent.forEach((child, offset) => {
          if (child.type.name === "br" && (direction === "up" ? offset < $head.parentOffset : offset >= $head.parentOffset)) br = true;
        });
        return !br;
      }
      try {
        return view.endOfTextblock(direction);
      } catch {
        return true;
      }
    },
    caretRect: (offset) => {
      const pos = offset === undefined ? view.state.selection.head : sourceToPos(serialize(view.state.doc), offset);
      try {
        const box = view.coordsAtPos(pos);
        return new DOMRect(box.left, box.top, Math.max(0, box.right - box.left), box.bottom - box.top);
      } catch {
        const box = el.getBoundingClientRect();
        return new DOMRect(box.left, box.top, 0, box.height);
      }
    },
  };
  let focusing = false;
  Object.defineProperties(el, {
    liveField: { value: api, configurable: true },
    value: { get: () => session.source, configurable: true },
    selectionStart: { get: () => session.selectionRange().from, configurable: true },
    selectionEnd: { get: () => session.selectionRange().to, configurable: true },
    selectionDirection: {
      get: () => {
        const { anchor, head } = session.caret;
        return head < anchor ? "backward" : "forward";
      },
      configurable: true,
    },
    setSelectionRange: {
      value: (start: number, end: number, direction?: string) => {
        const map = serialize(view.state.doc);
        const [anchor, head] = direction === "backward" ? [end, start] : [start, end];
        const sel = TextSelection.between(view.state.doc.resolve(sourceToPos(map, anchor)), view.state.doc.resolve(sourceToPos(map, head)));
        view.dispatch(view.state.tr.setSelection(sel));
      },
      configurable: true,
    },
    // The editor's own focus also puts its selection into the page.
    focus: {
      value: (options?: FocusOptions) => {
        if (focusing || destroyed) return HTMLElement.prototype.focus.call(el, options);
        focusing = true;
        try {
          view.focus();
        } finally {
          focusing = false;
        }
      },
      configurable: true,
    },
    editor: { value: { view, session }, configurable: true },
  });

  const destroy = view.destroy.bind(view);
  view.destroy = () => {
    // Torn down while composing (the row went away): flush first, never leave a timer behind.
    if (compositionTimer) clearTimeout(compositionTimer);
    if (session.composing) finishComposition();
    destroyed = true;
    fieldStats.destroyed++;
    for (const name of ["liveField", "value", "selectionStart", "selectionEnd", "selectionDirection", "setSelectionRange", "focus", "editor"]) delete (el as unknown as Record<string, unknown>)[name];
    destroy();
  };
  fieldStats.created++;
  return { view, session, el, openChip };
}

/* ─────────────────────────── the component ─────────────────────────── */

const TOKEN_NAMES: Record<string, string> = { tag: "tag", mention: "mention", link: "link", url: "link", ref: "item link", math: "formula" };

/**
 * The live field. Mounted only while its row is being edited; the editor is created in a layout
 * effect (one per mount, so a StrictMode double mount leaves exactly one) and destroyed with it.
 */
export function LiveField(props: LiveFieldProps) {
  const { rowId, field } = props;
  const place = React.useRef<HTMLDivElement>(null);
  const latest = React.useRef(props);
  latest.current = props;
  const mounted = React.useRef<Mounted | null>(null);
  const [editor, setEditor] = React.useState<{ readonly bm: TokenBookmark; readonly rect: DOMRect; readonly value: string } | null>(null);
  // The node views on show whose content is React (chips, a note's rendered blocks), and a
  // revision that re-renders their portals when one comes, goes or changes.
  const viewSet = React.useRef(new Set<PortalView>());
  const [, setViewRevision] = React.useState(0);
  const chips = React.useMemo<ChipHosts>(() => {
    const bump = () => setViewRevision((n) => n + 1);
    return {
      add: (view) => (viewSet.current.add(view), bump()),
      remove: (view) => (viewSet.current.delete(view), bump()),
      changed: bump,
    };
  }, []);
  // One stable resolver for every chip: the memoized static renderer then skips chips that did
  // not change when the outliner renders (a long note has hundreds).
  const resolveRef = React.useCallback((id: string) => latest.current.resolveRef?.(id) ?? null, []);
  // Trusted renderers come from the outliner's context; the views read the newest.
  const rich = useRichContent();
  const renderers = React.useRef(rich.renderers);
  renderers.current = rich.renderers;

  React.useLayoutEffect(() => {
    const host: FieldHost = {
      dispatch: (action) => latest.current.host.dispatch(action),
      currentSeq: () => latest.current.host.currentSeq(),
      text: (id, which) => latest.current.host.text(id, which),
      row: (id) => latest.current.host.row(id),
      neighbour: (id, direction) => latest.current.host.neighbour(id, direction),
    };
    const source = host.text(rowId, field) ?? latest.current.committed;
    const session = new FieldSession({ field, rewrite: field === "title" ? typingRewrite : noteTypingRewrite }, rowId, source, host);
    const m = mountField(place.current!, session, () => latest.current, (bm, rect) => setEditor({ bm, rect, value: bm.src }), chips, () => renderers.current);
    mounted.current = m;
    const ref = latest.current.elementRef;
    if (ref) ref.current = m.el;
    const auto = latest.current.autoFocus;
    if (auto) {
      session.place(auto.caret);
      m.view.updateState(session.state);
      m.el.focus();
    }
    return () => {
      if (ref?.current === m.el) ref.current = null;
      mounted.current = null;
      m.view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId, field]);

  // Every render: adopt what the outliner committed (by the session's rule), let go of a held
  // change once its popup closed, and redraw attributes and decorations that come from props.
  const paint = React.useRef("");
  React.useLayoutEffect(() => {
    const m = mounted.current;
    if (!m) return;
    const { session, view } = m;
    if (session.holding && !props.holding) session.releaseHeld(props.caret?.id === rowId ? props.caret.start : undefined);
    if (!session.holding) session.onRender(props.committed, props.renderedSeq, props.caret);
    const look = JSON.stringify([props.attributes, props.className, props.marks]);
    if (view.state !== session.state) view.updateState(session.state);
    else if (look !== paint.current) view.updateState(view.state);
    paint.current = look;
  });

  // The core moved the caret here on purpose (a split, a merge, an undo, navigation): show it.
  const { caret, focusVersion } = props;
  React.useLayoutEffect(() => {
    const m = mounted.current;
    if (!m || !caret || caret.id !== rowId || (caret.field ?? "title") !== field) return;
    const { view, session, el } = m;
    const focused = view.hasFocus();
    const { from, to } = session.selectionRange();
    // Typing here: the editor already shows the caret, and keys ahead of this render win. An
    // edit reports only the selection's moving end, so a range whose head is there stays.
    const head = caret.start === caret.end && caret.start === session.caret.head;
    if (focused && ((from === caret.start && to === caret.end) || head || session.ahead || session.toldCore(caret))) return;
    session.place(caret.start, caret.end);
    view.updateState(session.state);
    if (!focused) el.focus();
    el.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusVersion, rowId, field]);

  const closeEditor = (save: boolean) => {
    const m = mounted.current;
    const open = editor;
    setEditor(null);
    if (!m || !open) return;
    if (save && open.value !== open.bm.src) {
      m.session.editToken(open.bm, open.value);
      m.view.updateState(m.session.state);
    } else m.session.release(open.bm);
    m.el.focus();
  };

  return (
    <>
      <div ref={place} />
      {[...viewSet.current].map((view) => createPortal(view.content({ resolveRef }), view.portal, `view${view.id}`))}
      {editor &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-field-overlay=""
            role="dialog"
            aria-label={`Edit ${TOKEN_NAMES[editor.bm.kind] ?? "token"}`}
            onMouseDown={(event) => event.stopPropagation()}
            style={{ position: "fixed", left: Math.max(8, Math.min(editor.rect.left, window.innerWidth - 296)), top: editor.rect.bottom + 6 }}
            className="z-[60] w-72 max-w-[calc(100vw-1rem)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-[0_10px_38px_-10px_rgb(0_0_0/0.22),0_1px_3px_rgb(0_0_0/0.06)]"
          >
            <input
              autoFocus
              aria-label={`Edit ${TOKEN_NAMES[editor.bm.kind] ?? "token"}`}
              spellCheck={false}
              value={editor.value}
              onChange={(event) => setEditor({ ...editor, value: event.target.value })}
              onKeyDown={(event) => {
                if (isComposingKey(event)) return;
                if (event.key === "Enter" || event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeEditor(event.key === "Enter");
                }
              }}
              onBlur={() => {
                if (!editor) return;
                mounted.current?.session.release(editor.bm);
                setEditor(null);
              }}
              className="h-8 w-full rounded-md bg-transparent px-2 font-mono text-[12.5px] outline-none coarse:h-11 coarse:text-[15px]"
            />
          </div>,
          document.body,
        )}
    </>
  );
}

