"use client";
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { Button } from "react-aria-components";
import {
  createOutlineEditorState,
  createOutlineId,
  currentTextAnalysis,
  editorVisibleRows,
  exportOutlineJSON,
  findOutlineNode,
  getOutlinePath,
  importOutlineJSON,
  outlineIds,
  planOutlineDrop,
  parseOutlineText,
  reconcileOutlineEditorState,
  reduceOutlineEditor,
  resolveOutlineKey,
  segmentText,
  selectionRoots,
  serializeOutlineText,
  type OutlineAction,
  type OutlineKeyEvent,
  type OutlineCodec,
  decodeOutline,
  encodeOutline,
  type OutlineEditorOptions,
  type OutlineEditorState,
  type OutlineNode,
  type TextAnalysis,
  type TextCompletionProvider,
  type TextRequestContext,
  type OutlineDropTarget,
  type TextHoverProvider,
} from "../core/index.js";
import { RichContent } from "./RichContent.js";
import { Outliner, type OutlinerProps, type OutlineRenderContext } from "./Outliner.js";
import { useTextCompletion } from "./useTextCompletion.js";
import { useTextHover } from "./useTextHover.js";
import { TextPopup } from "./TextPopup.js";
import {
  OutlineBullet,
  OutlineCheck,
  OutlineChevron,
  OutlineFocus,
  OutlineGrip,
} from "./OutlineGlyph.js";
import {
  OutlinePlaceholderInput,
  type OutlinePlaceholderDraft,
} from "./OutlinePlaceholderInput.js";
import {
  textareaAtVisualBoundary,
  textareaOffsetAtPoint,
  textareaVerticalTarget,
} from "./text-geometry.js";

export interface OutlineKeyContext<T = unknown> {
  readonly rowId: string;
  readonly mode: "text" | "row";
  readonly state: OutlineEditorState<T>;
}
export interface OutlineNoteKeyContext<T = unknown> {
  readonly rowId: string;
  readonly field: "note";
  readonly state: OutlineEditorState<T>;
}
export interface OutlinePlugin<T = unknown> {
  readonly id: string;
  /** Note-only keys; legacy title/row keymaps never receive note events. */
  readonly noteKeymap?: (
    event: OutlineKeyEvent,
    context: OutlineNoteKeyContext<T>,
  ) => OutlineAction<T> | null | undefined;
  /** First defined result wins: undefined delegates, null consumes, an action uses normal policy/history. */
  readonly keymap?: (
    event: OutlineKeyEvent,
    context: OutlineKeyContext<T>,
  ) => OutlineAction<T> | null | undefined;
  /** Return null to consume an action, or a replacement action; never mutate the state. */
  readonly beforeAction?: (
    action: OutlineAction<T>,
    state: OutlineEditorState<T>,
  ) => OutlineAction<T> | null;
  readonly afterAction?: (
    action: OutlineAction<T>,
    previous: OutlineEditorState<T>,
    next: OutlineEditorState<T>,
  ) => void;
  readonly completions?: readonly TextCompletionProvider[];
}
export interface OutlinePlaceholder {
  readonly id: string;
  readonly label: string;
  readonly text?: string;
  readonly index?: number;
  readonly caret?: number;
}
export interface OutlineEditorHandle<T = unknown> {
  readonly getState: () => OutlineEditorState<T>;
  readonly dispatch: (action: OutlineAction<T>) => void;
  readonly reveal: (id: string, caret?: number) => void;
  readonly exportJSON: () => string;
  readonly exportText: () => string;
  readonly exportWith: (codec: OutlineCodec<T>) => string;
  /** Decoding errors throw; a valid decoded replacement still obeys editor policy. */
  readonly importWith: (codec: OutlineCodec<T>, source: string) => void;
}
export interface OutlineEditorProps<T = unknown> extends OutlineEditorOptions<T> {
  readonly nodes?: readonly OutlineNode<T>[];
  readonly defaultNodes?: readonly OutlineNode<T>[];
  readonly onNodesChange?: (nodes: readonly OutlineNode<T>[], action: OutlineAction<T>) => void;
  readonly onStateChange?: (state: OutlineEditorState<T>, action: OutlineAction<T>) => void;
  readonly ref?: Ref<OutlineEditorHandle<T>>;
  readonly id?: string;
  readonly className?: string;
  readonly "aria-label"?: string;
  readonly createId?: () => string;
  readonly defaultExpandedIds?: ReadonlySet<string>;
  readonly defaultHoistedId?: string | null;
  readonly plugins?: readonly OutlinePlugin<T>[];
  readonly hoverProviders?: readonly TextHoverProvider<ReactNode>[];
  readonly hoverDelay?: number;
  /** Defaults to the nearest dialog scope, otherwise document.body. */
  readonly popupContainer?: Element | null;
  /** Change to reject pending optimistic edits or reset from the same nodes identity. */
  readonly resetKey?: string | number;
  readonly completionProviders?: readonly TextCompletionProvider[];
  readonly getTextAnalysis?: (node: OutlineNode<T>) => TextAnalysis | undefined;
  readonly getRichContent?: OutlinerProps<T>["getRichContent"];
  readonly richRegistry?: OutlinerProps<T>["richRegistry"];
  readonly allowMedia?: OutlinerProps<T>["allowMedia"];
  readonly renderContent?: (node: OutlineNode<T>, context: OutlineRenderContext) => ReactNode;
  readonly renderBody?: (node: OutlineNode<T>) => ReactNode;
  readonly renderAccessory?: (node: OutlineNode<T>) => ReactNode;
  readonly renderSuffix?: (node: OutlineNode<T>) => ReactNode;
  readonly renderStatus?: (node: OutlineNode<T>) => ReactNode;
  readonly renderCollapsed?: (node: OutlineNode<T>) => ReactNode;
  readonly getRowTone?: (node: OutlineNode<T>) => string | undefined;
  readonly getPlaceholders?: (parent: OutlineNode<T> | null) => readonly OutlinePlaceholder[];
  readonly getRefusalMessage?: (reason: string) => string;
  /** Opt in to Shift+Enter title/note switching; omitted preserves title keys. */
  readonly noteKeyboardProfile?: "toggle";
  readonly spellCheck?: boolean;
  readonly showToolbar?: boolean;
  readonly showBreadcrumbs?: boolean;
  readonly showTasks?: boolean;
  readonly enableDrag?: boolean;
}

const EMPTY: readonly never[] = [];
const OUTLINE_CLIPBOARD_MIME = "application/x-fast-ux-outline+json";
interface DragSession {
  readonly pointerId: number;
  readonly ids: readonly string[];
  readonly startX: number;
  readonly startY: number;
  readonly initialDepth: number;
  readonly active: boolean;
  readonly target: OutlineDropTarget | null;
  readonly gapId: string | null;
  readonly allowed: boolean;
}

/** Explicit keyboard entry into host content, not a modal focus trap. */
function informationTabStops(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, summary, audio[controls], video[controls], [tabindex], [contenteditable]:not([contenteditable="false"])',
    ),
  ]
    .filter((element) => {
      if (
        (element.tabIndex < 0 &&
          !(
            element.isContentEditable &&
            !element.parentElement?.isContentEditable &&
            !element.hasAttribute("tabindex")
          )) ||
        element.matches(":disabled") ||
        element.closest('[hidden], [inert], [aria-hidden="true"]')
      )
        return false;
      for (let current: HTMLElement | null = element; current; current = current.parentElement) {
        const style = current.ownerDocument.defaultView?.getComputedStyle(current);
        if (
          style?.display === "none" ||
          style?.visibility === "hidden" ||
          style?.visibility === "collapse"
        )
          return false;
        if (current === container) break;
      }
      return true;
    })
    .sort(
      (a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity),
    );
}

/**
 * Direct React editor; no framework bridge or hidden editor runtime. Editing must be
 * explicitly enabled with readOnly={false}. Rich bodies never become textareas.
 */
export function OutlineEditor<T = unknown>({
  nodes,
  defaultNodes = EMPTY,
  onNodesChange,
  onStateChange,
  ref,
  id,
  className,
  "aria-label": label = "Outline editor",
  createId = createOutlineId,
  defaultExpandedIds,
  defaultHoistedId,
  plugins = EMPTY,
  completionProviders = EMPTY,
  hoverProviders = EMPTY,
  hoverDelay = 350,
  popupContainer,
  resetKey,
  getTextAnalysis,
  getRichContent,
  richRegistry,
  allowMedia,
  renderContent,
  renderBody,
  renderAccessory,
  renderSuffix,
  renderStatus,
  renderCollapsed,
  getRowTone,
  getPlaceholders,
  getRefusalMessage,
  noteKeyboardProfile,
  noteAdapter,
  spellCheck = true,
  showToolbar = true,
  showBreadcrumbs = true,
  showTasks = true,
  enableDrag = true,
  readOnly = true,
  isLocked,
  canChange,
  mergeData,
  historyLimit,
  typingGroupMs,
}: OutlineEditorProps<T>) {
  const instance = useId(),
    rootId = id ?? `outline-editor-${instance}`;
  const [state, setState] = useState(() =>
    createOutlineEditorState(nodes ?? defaultNodes, {
      expandedIds: defaultExpandedIds,
      hoistedId: defaultHoistedId,
    }),
  );
  const model = useRef(state),
    external = useRef(nodes),
    proposed = useRef(new WeakSet<readonly OutlineNode<T>[]>());
  const externalReset = useRef(resetKey);
  const [rowMode, setRowMode] = useState(false),
    rowModeRef = useRef(false);
  const root = useRef<HTMLElement>(null),
    textareas = useRef(new Map<string, HTMLTextAreaElement>()),
    noteTextareas = useRef(new Map<string, HTMLTextAreaElement>()),
    rowElements = useRef(new Map<string, HTMLLIElement>());
  const exitStart = useRef<HTMLSpanElement>(null),
    exitEnd = useRef<HTMLSpanElement>(null);
  const exitTabTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocus = useRef(false);
  const noteComposing = useRef(false);
  const noteCompositionEpoch = useRef(0);
  const previousNoteAdapter = useRef(noteAdapter);
  const noteHadFocus = useRef(false);
  const composing = useRef(false),
    focused = useRef<string | null>(null),
    selectedCaret = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const callbacks = useRef({
    onNodesChange,
    onStateChange,
    plugins,
    readOnly,
    isLocked,
    canChange,
    mergeData,
    historyLimit,
    typingGroupMs,
    noteAdapter,
  });
  callbacks.current = {
    onNodesChange,
    onStateChange,
    plugins,
    readOnly,
    isLocked,
    canChange,
    mergeData,
    historyLimit,
    typingGroupMs,
    noteAdapter,
  };
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragSession | null>(null),
    dragRef = useRef<DragSession | null>(null);
  const updateMode = (value: boolean) => {
    rowModeRef.current = value;
    setRowMode(value);
  };
  const dispatch = useCallback((input: OutlineAction<T>) => {
    const previous = model.current,
      config = callbacks.current;
    let action: OutlineAction<T> | null = input;
    for (const plugin of config.plugins) {
      if (!action) break;
      action = plugin.beforeAction ? plugin.beforeAction(action, previous) : action;
    }
    if (!action) return;
    const next = reduceOutlineEditor(previous, action, config);
    if (
      noteComposing.current &&
      next.nodes !== previous.nodes &&
      (action.type === "replace" || action.type === "undo" || action.type === "redo")
    ) {
      noteCompositionEpoch.current++;
      noteComposing.current = false;
    }
    if (
      next.focusVersion !== previous.focusVersion &&
      !next.refusal &&
      next.caret?.field === "note"
    ) {
      rowModeRef.current = false;
      setRowMode(false);
    }
    // Advance synchronously before React commits: fast keys never use an old row/tree.
    if (next.focusVersion !== previous.focusVersion) pendingFocus.current = true;
    model.current = next;
    setState(next);
    if (next.nodes !== previous.nodes) {
      if (external.current !== undefined) proposed.current.add(next.nodes);
      config.onNodesChange?.(next.nodes, action);
    }
    config.onStateChange?.(next, action);
    for (const plugin of config.plugins) plugin.afterAction?.(action, previous, next);
  }, []);
  const getContext = useCallback((): TextRequestContext | null => {
    const rowId = focused.current,
      node = rowId && findOutlineNode(model.current.nodes, rowId)?.node;
    if (
      !rowId ||
      !node ||
      composing.current ||
      rowModeRef.current ||
      model.current.caret?.field === "note"
    )
      return null;
    return {
      surfaceId: rootId,
      rowId,
      text: node.text,
      revision: model.current.revision,
      selection: selectedCaret.current,
    };
  }, [rootId]);
  const providers = useMemo(
    () => [...completionProviders, ...plugins.flatMap((plugin) => plugin.completions ?? [])],
    [completionProviders, plugins],
  );
  const completion = useTextCompletion({
    providers,
    getContext,
    disabled: readOnly,
    onAccept: (context, result) => {
      dispatch({
        type: "text",
        id: context.rowId,
        text: result.text,
        caret: result.caret,
        time: Number.NEGATIVE_INFINITY,
      });
      selectedCaret.current = { start: result.caret, end: result.caret };
    },
  });
  const completionRef = useRef(completion);
  completionRef.current = completion;

  const hoverContext = useRef<TextRequestContext | null>(null);
  const information = useRef<HTMLElement>(null);
  const informationEntry = useRef<HTMLElement | null>(null);
  const hoverFocus = useRef<{ rowId: string | null; start: number; end: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getHoverContext = useCallback(() => {
    const requested = hoverContext.current;
    if (!requested || composing.current) return null;
    const originFocus = hoverFocus.current;
    if (
      originFocus &&
      (originFocus.rowId !== focused.current ||
        originFocus.start !== selectedCaret.current.start ||
        originFocus.end !== selectedCaret.current.end)
    )
      return null;
    const node = editorVisibleRows(model.current).find((row) => row.id === requested.rowId)?.node;
    return node ? { ...requested, text: node.text, revision: model.current.revision } : null;
  }, []);
  const hover = useTextHover({
    providers: hoverProviders,
    getContext: getHoverContext,
    disabled: false,
  });
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const clearHoverTimer = () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  const dismissHover = () => {
    clearHoverTimer();
    informationEntry.current = null;
    hoverContext.current = null;
    hoverFocus.current = null;
    hover.dismiss();
  };
  const scheduleHoverDismiss = () => {
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => {
      const popup = information.current;
      if (!popup?.contains(popup.ownerDocument.activeElement)) dismissHover();
    }, 180);
  };
  const enterInformation = () => {
    const popup = information.current;
    if (!popup) return;
    clearHoverTimer();
    for (const target of informationTabStops(popup)) {
      target.focus();
      if (popup.ownerDocument.activeElement === target) {
        informationEntry.current = target;
        return;
      }
    }
    informationEntry.current = popup;
    popup.focus();
  };
  const requestHover = (rowId: string, offset: number, origin: "pointer" | "keyboard") => {
    const node = findOutlineNode(model.current.nodes, rowId)?.node;
    if (
      !node ||
      composing.current ||
      (model.current.caret?.field === "note" && !rowModeRef.current)
    )
      return;
    completion.dismiss();
    clearHoverTimer();
    const context: TextRequestContext = {
      surfaceId: rootId,
      rowId,
      text: node.text,
      revision: model.current.revision,
      selection:
        origin === "keyboard" && focused.current === rowId
          ? { ...selectedCaret.current }
          : { start: offset, end: offset },
    };
    hoverContext.current = context;
    hoverFocus.current =
      origin === "keyboard" ? { rowId: focused.current, ...selectedCaret.current } : null;
    hover.request(context, offset, origin);
  };
  useEffect(
    () => () => {
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    },
    [],
  );
  useEffect(() => {
    hoverContext.current = null;
    hoverRef.current.dismiss();
  }, [state.hoistedId, readOnly]);
  useEffect(
    () => () => {
      if (exitTabTimer.current !== null) {
        clearTimeout(exitTabTimer.current);
        exitTabTimer.current = null;
      }
    },
    [readOnly],
  );

  useLayoutEffect(() => {
    const forced = resetKey !== externalReset.current;
    if (nodes === external.current && !forced) return;
    external.current = nodes;
    externalReset.current = resetKey;
    if (nodes === undefined) return;
    if (!forced && proposed.current.has(nodes)) return;
    const interruptedNote = noteComposing.current;
    if (interruptedNote) {
      noteCompositionEpoch.current++;
      noteComposing.current = false;
    }
    // An unrelated host replacement wins and clears stale user history/completion.
    proposed.current = new WeakSet();
    completionRef.current.dismiss();
    const reconciled = reconcileOutlineEditorState(model.current, nodes, callbacks.current);
    const next = {
      ...reconciled,
      ...(forced ? { history: { past: [], future: [], group: null } } : {}),
      ...(interruptedNote ? { focusVersion: reconciled.focusVersion + 1 } : {}),
    };
    model.current = next;
    setState(next);
  }, [nodes, resetKey]);
  useLayoutEffect(() => {
    const adapterChanged = previousNoteAdapter.current !== noteAdapter;
    previousNoteAdapter.current = noteAdapter;
    if (adapterChanged && noteComposing.current) {
      noteComposing.current = false;
      noteCompositionEpoch.current++;
      const next = { ...model.current, focusVersion: model.current.focusVersion + 1 };
      model.current = next;
      pendingFocus.current = true;
      setState(next);
      return;
    }
    const caret = model.current.caret;
    if (caret?.field !== "note") {
      noteComposing.current = false;
      return;
    }
    const reconciled = reconcileOutlineEditorState(
      model.current,
      model.current.nodes,
      callbacks.current,
    );
    if (reconciled !== model.current) {
      model.current = reconciled;
      pendingFocus.current = true;
      setState(reconciled);
      return;
    }
    const node = findOutlineNode(model.current.nodes, caret.id)?.node;
    const locked =
      !!node && getOutlinePath(model.current.nodes, caret.id).some((item) => isLocked?.(item));
    if (readOnly || !node || locked || readNote(node) === undefined) {
      noteComposing.current = false;
      // Host capability changes reconcile interaction, not a user/plugin action.
      const next = reduceOutlineEditor(
        model.current,
        { type: "focus", id: caret.id, start: 0 },
        callbacks.current,
      );
      model.current = next;
      pendingFocus.current = true;
      setState(next);
    }
  });
  useLayoutEffect(() => {
    const caret = state.caret;
    if (
      !caret &&
      noteHadFocus.current &&
      root.current?.ownerDocument.activeElement === root.current?.ownerDocument.body
    ) {
      root.current?.focus({ preventScroll: true });
      noteHadFocus.current = false;
    }
    if (!caret || readOnly || composing.current || noteComposing.current) {
      pendingFocus.current = false;
      return;
    }
    if (rowModeRef.current) {
      const row = rowElements.current.get(caret.id);
      row?.focus({ preventScroll: true });
      row?.querySelector<HTMLElement>(":scope > .fast-ux-outliner__row")?.scrollIntoView?.({
        block: "nearest",
        inline: "nearest",
        behavior: "instant",
      });
      pendingFocus.current = false;
      return;
    }
    const textarea = (caret.field === "note" ? noteTextareas : textareas).current.get(caret.id);
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(caret.start, caret.end);
    focused.current = caret.id;
    selectedCaret.current = { start: caret.start, end: caret.end };
    pendingFocus.current = false;
    textarea.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
  }, [state.focusVersion, readOnly]);
  const resizeTextareas = useCallback((targets?: Iterable<HTMLTextAreaElement>) => {
    // Batch the writes and reads: one width notification must not force a fresh
    // layout for every row. Height-only notifications are filtered below.
    const inputs = [
      ...(targets ?? [...textareas.current.values(), ...noteTextareas.current.values()]),
    ];
    for (const textarea of inputs) textarea.style.height = "0px";
    const heights = inputs.map((textarea) => Math.max(24, textarea.scrollHeight));
    inputs.forEach((textarea, index) => {
      textarea.style.height = `${heights[index]}px`;
    });
  }, []);
  const textareaSizeObserver = useRef<ResizeObserver | null>(null);
  const observedWidths = useRef(new Map<Element, number | undefined>());
  useLayoutEffect(() => {
    resizeTextareas();
  }, [
    state.nodes,
    state.caret?.field,
    state.caret?.id,
    rowMode,
    state.expandedIds,
    state.hoistedId,
    readOnly,
    showTasks,
    enableDrag,
    hoverProviders.length,
    renderAccessory,
    renderSuffix,
    renderStatus,
    className,
    resizeTextareas,
  ]);
  useLayoutEffect(() => {
    if (readOnly || !root.current) return;
    const element = root.current;
    const widths = observedWidths.current;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            // Ignore deliveries queued by an observer from an earlier edit session.
            if (textareaSizeObserver.current !== observer) return;
            const changedInputs: HTMLTextAreaElement[] = [];
            let rootChanged = false;
            for (const entry of entries) {
              if (!widths.has(entry.target)) continue;
              const nextWidth = entry.contentRect.width;
              if (widths.get(entry.target) === nextWidth) continue;
              widths.set(entry.target, nextWidth);
              if (entry.target === element) rootChanged = true;
              else changedInputs.push(entry.target as HTMLTextAreaElement);
            }
            if (rootChanged) resizeTextareas();
            else if (changedInputs.length) resizeTextareas(changedInputs);
          });
    textareaSizeObserver.current = observer;
    if (observer) {
      widths.set(element, undefined);
      observer.observe(element);
    }
    const resizeAll = () => resizeTextareas();
    window.addEventListener("resize", resizeAll);
    return () => {
      observer?.disconnect();
      textareaSizeObserver.current = null;
      widths.clear();
      window.removeEventListener("resize", resizeAll);
    };
  }, [readOnly, resizeTextareas]);
  useLayoutEffect(() => {
    const observer = textareaSizeObserver.current;
    if (!observer) return;
    // DOM nodes survive ordinary text edits. Reconcile after commit rather than
    // observing in inline refs, which React detaches/reattaches on every render.
    const inputs = new Set([...textareas.current.values(), ...noteTextareas.current.values()]);
    const widths = observedWidths.current;
    for (const element of widths.keys()) {
      if (element !== root.current && !inputs.has(element as HTMLTextAreaElement)) {
        observer.unobserve(element);
        widths.delete(element);
      }
    }
    for (const input of inputs) {
      if (!widths.has(input)) {
        widths.set(input, undefined);
        observer.observe(input);
      }
    }
  });
  useEffect(() => {
    completionRef.current.dismiss();
  }, [readOnly, state.hoistedId]);
  useImperativeHandle(
    ref,
    () => ({
      getState: () => model.current,
      dispatch,
      reveal: (target, caret = 0) => {
        const current = model.current;
        if (
          current.hoistedId &&
          !getOutlinePath(current.nodes, target).some((node) => node.id === current.hoistedId)
        )
          dispatch({ type: "hoist", id: null });
        updateMode(false);
        dispatch({ type: "focus", id: target, start: caret });
      },
      exportJSON: () => exportOutlineJSON(model.current.nodes),
      exportText: () => serializeOutlineText(model.current.nodes),
      exportWith: (codec) => encodeOutline(model.current.nodes, codec),
      importWith: (codec, source) =>
        dispatch({ type: "replace", nodes: decodeOutline(source, codec) }),
    }),
    [dispatch],
  );

  const visible = useMemo(
    () => editorVisibleRows(state),
    [state.nodes, state.expandedIds, state.hoistedId],
  );
  function readNote(node: OutlineNode<T>): string | undefined {
    if (!noteAdapter) return undefined;
    try {
      const value = noteAdapter.read(node);
      return typeof value === "string" ? value : undefined;
    } catch {
      return undefined;
    }
  }
  const focusNote = (rowId: string) => {
    const node = findOutlineNode(model.current.nodes, rowId)?.node;
    const text = node && readNote(node);
    if (text === undefined) return;
    completion.dismiss();
    dismissHover();
    dispatch({ type: "focus", id: rowId, field: "note", start: text.length });
  };
  const syncNote = (input: HTMLTextAreaElement, rowId: string) => {
    const node = findOutlineNode(model.current.nodes, rowId)?.node;
    if (!node) return;
    const text = readNote(node);
    if (text === undefined) return;
    if (text !== input.value)
      dispatch({
        type: "note",
        id: rowId,
        text: input.value,
        caret: input.selectionStart,
        time: Date.now(),
      });
    else
      dispatch({
        type: "caret",
        id: rowId,
        field: "note",
        start: input.selectionStart,
        end: input.selectionEnd,
      });
  };
  const noteKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, rowId: string) => {
    if (
      event.defaultPrevented ||
      event.nativeEvent.defaultPrevented ||
      noteComposing.current ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    )
      return;
    for (const plugin of callbacks.current.plugins) {
      const mapped = plugin.noteKeymap?.(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          isComposing: false,
        },
        { rowId, field: "note", state: model.current },
      );
      if (mapped !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        if (mapped) dispatch(mapped);
        return;
      }
    }
    const command = event.ctrlKey || event.metaKey;
    if (
      command &&
      !event.altKey &&
      (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")
    ) {
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: event.key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo" });
    } else if (!command && !event.altKey && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const previous = model.current;
      dispatch({ type: "select", id: rowId });
      if (
        model.current !== previous &&
        !model.current.refusal &&
        model.current.caret?.field !== "note" &&
        model.current.selection.has(rowId)
      ) {
        updateMode(true);
        rowElements.current.get(rowId)?.focus({ preventScroll: true });
      }
    } else if (
      !command &&
      !event.altKey &&
      event.key === "Enter" &&
      event.shiftKey &&
      noteKeyboardProfile === "toggle"
    ) {
      event.preventDefault();
      event.stopPropagation();
      dispatch({
        type: "focus",
        id: rowId,
        start: findOutlineNode(model.current.nodes, rowId)?.node.text.length ?? 0,
      });
    } else if (!command && !event.altKey && event.key === "Tab") {
      if (event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      const input = event.currentTarget;
      dispatch({
        type: "note",
        id: rowId,
        text:
          input.value.slice(0, input.selectionStart) + "\t" + input.value.slice(input.selectionEnd),
        caret: input.selectionStart + 1,
        time: Date.now(),
      });
    }
  };
  const focusedRow = state.caret?.id;
  const dropDepth = drag?.target
    ? Math.max(
        0,
        drag.target.depth -
          (state.hoistedId ? getOutlinePath(state.nodes, state.hoistedId).length - 1 : 0),
      )
    : 0;
  const selectRow = (rowId: string, extend = false, toggle = false) => {
    completion.dismiss();
    updateMode(true);
    focused.current = rowId;
    dispatch({ type: "select", id: rowId, extend, toggle });
    rowElements.current.get(rowId)?.focus({ preventScroll: true });
  };
  const syncInput = (textarea: HTMLTextAreaElement, rowId: string) => {
    focused.current = rowId;
    selectedCaret.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
    const current = findOutlineNode(model.current.nodes, rowId)?.node;
    if (current && current.text !== textarea.value)
      dispatch({
        type: "text",
        id: rowId,
        text: textarea.value,
        caret: textarea.selectionStart,
        time: Date.now(),
      });
    else
      dispatch({
        type: "caret",
        id: rowId,
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      });
  };
  const moveFocus = (
    rowId: string,
    direction: "up" | "down",
    extend: boolean,
    textarea?: HTMLTextAreaElement,
  ) => {
    const rows = editorVisibleRows(model.current),
      index = rows.findIndex((row) => row.id === rowId),
      next = rows[index + (direction === "up" ? -1 : 1)];
    if (!next) return;
    if (rowModeRef.current || extend) {
      updateMode(true);
      dispatch({ type: "select", id: next.id, extend });
      focused.current = next.id;
      rowElements.current.get(next.id)?.focus({ preventScroll: true });
    } else {
      const before = textarea?.value.slice(0, textarea.selectionStart) ?? "";
      const column = before.length - before.lastIndexOf("\n") - 1;
      const lineStart = direction === "up" ? next.node.text.lastIndexOf("\n") + 1 : 0;
      const lineLength =
        direction === "up"
          ? next.node.text.length - lineStart
          : next.node.text.indexOf("\n") < 0
            ? next.node.text.length
            : next.node.text.indexOf("\n");
      const target = textareas.current.get(next.id);
      dispatch({
        type: "focus",
        id: next.id,
        start:
          textarea && target
            ? textareaVerticalTarget(textarea, target, direction)
            : lineStart + Math.min(column, lineLength),
      });
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>, rowId: string, mode: "text" | "row") => {
    if (
      event.defaultPrevented ||
      event.nativeEvent.defaultPrevented ||
      composing.current ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    )
      return;
    const textarea = mode === "text" ? (event.currentTarget as HTMLTextAreaElement) : undefined;
    if (textarea) syncInput(textarea, rowId);
    if (event.key === "Escape" && mode === "text" && completionRef.current.status === "loading") {
      event.preventDefault();
      event.stopPropagation();
      completionRef.current.dismiss();
      return;
    }
    if (completionRef.current.session && mode === "text") {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        completionRef.current.move(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        completionRef.current.choose();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        completionRef.current.dismiss();
        return;
      }
    }
    if (
      event.key === "Escape" &&
      (hoverRef.current.session || hoverRef.current.status === "loading")
    ) {
      event.preventDefault();
      event.stopPropagation();
      dismissHover();
      return;
    }
    if (
      mode === "text" &&
      event.key === "Tab" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      hoverRef.current.session?.origin === "keyboard" &&
      hoverRef.current.session.context.rowId === rowId &&
      information.current
    ) {
      event.preventDefault();
      event.stopPropagation();
      enterInformation();
      return;
    }
    for (const plugin of callbacks.current.plugins) {
      const mapped = plugin.keymap?.(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          isComposing: false,
        },
        { rowId, mode, state: model.current },
      );
      if (mapped !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        completion.dismiss();
        dismissHover();
        if (mapped) dispatch(mapped);
        return;
      }
    }
    if (
      mode === "text" &&
      noteKeyboardProfile === "toggle" &&
      noteAdapter &&
      event.key === "Enter" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const node = findOutlineNode(model.current.nodes, rowId)?.node;
      if (node && readNote(node) !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        focusNote(rowId);
        return;
      }
    }
    const intent = resolveOutlineKey(event, mode);
    if (!intent || intent === "line-break") return;
    if (
      intent === "merge-backward" &&
      (!textarea || textarea.selectionStart !== 0 || textarea.selectionEnd !== 0)
    )
      return;
    if (
      intent === "merge-forward" &&
      (!textarea ||
        textarea.selectionStart !== textarea.value.length ||
        textarea.selectionEnd !== textarea.value.length)
    )
      return;
    if (
      (intent === "up" || intent === "down") &&
      textarea &&
      !textareaAtVisualBoundary(textarea, intent)
    )
      return;
    if (intent === "hover") {
      event.preventDefault();
      requestHover(rowId, textarea?.selectionStart ?? 0, "keyboard");
      return;
    }
    event.preventDefault();
    // These Escape steps belong to the editor. Once focus reaches the container,
    // its next Escape remains available to an enclosing dialog or other owner.
    if (event.key === "Escape" && (intent === "row-mode" || intent === "exit"))
      event.stopPropagation();
    completion.dismiss();
    dismissHover();
    if (intent === "split")
      dispatch({
        type: "split",
        id: rowId,
        start: textarea!.selectionStart,
        end: textarea!.selectionEnd,
        newId: createId(),
      });
    else if (intent === "merge-backward" || intent === "merge-forward")
      dispatch({
        type: "merge",
        id: rowId,
        direction: intent === "merge-backward" ? "backward" : "forward",
      });
    else if (intent === "indent" || intent === "outdent")
      dispatch({ type: intent, ids: model.current.selection.size ? undefined : [rowId] });
    else if (intent === "move-up" || intent === "move-down")
      dispatch({
        type: "move",
        direction: intent === "move-up" ? "up" : "down",
        ids: model.current.selection.size ? undefined : [rowId],
      });
    else if (intent === "undo" || intent === "redo") dispatch({ type: intent });
    else if (intent === "task")
      dispatch({
        type: "tasks",
        ids: model.current.selection.size ? [...model.current.selection] : [rowId],
      });
    else if (intent === "select-all") dispatch({ type: "select-all" });
    else if (intent === "delete-selection") dispatch({ type: "delete" });
    else if (intent === "row-mode") selectRow(rowId);
    else if (intent === "edit-mode") {
      updateMode(false);
      dispatch({
        type: "focus",
        id: rowId,
        start: findOutlineNode(model.current.nodes, rowId)?.node.text.length ?? 0,
      });
    } else if (intent === "exit") {
      dispatch({ type: "clear-selection" });
      root.current?.focus();
    } else if (intent === "completion") {
      const context = getContext();
      if (context) completion.request(context);
    } else if (intent === "up" || intent === "down")
      moveFocus(rowId, intent, event.shiftKey, textarea);
    else if (intent === "left" || intent === "right") {
      const location = findOutlineNode(model.current.nodes, rowId)!;
      if (intent === "left") {
        if (location.node.children?.length && model.current.expandedIds.has(rowId))
          dispatch({ type: "expand", ids: [rowId], expanded: false });
        else if (location.parentId && rowId !== model.current.hoistedId)
          selectRow(location.parentId);
      } else if (location.node.children?.length) {
        if (!model.current.expandedIds.has(rowId)) {
          const summary = rowElements.current
            .get(rowId)
            ?.querySelector<HTMLElement>(".fast-ux-editor__summary");
          if (summary) summary.focus();
          else dispatch({ type: "expand", ids: [rowId], expanded: true });
        } else selectRow(location.node.children[0]!.id);
      }
    }
  };

  const selectedNodes = () =>
    selectionRoots(model.current.nodes, model.current.selection).map(
      (nodeId) => findOutlineNode(model.current.nodes, nodeId)!.node,
    );
  const copySelection = (clipboard: DataTransfer): boolean => {
    try {
      const selected = selectedNodes();
      clipboard.setData("text/plain", serializeOutlineText(selected));
      const canonical = exportOutlineJSON(selected);
      clipboard.setData(OUTLINE_CLIPBOARD_MIME, canonical);
      if (clipboard.getData(OUTLINE_CLIPBOARD_MIME) !== canonical)
        throw new Error("Clipboard did not retain structured content.");
      setClipboardError(null);
      return true;
    } catch {
      setClipboardError(
        "Cannot copy this content without losing data. The outline was not changed.",
      );
      return false;
    }
  };
  const pasteStructured = (clipboard: DataTransfer, rowId?: string): boolean => {
    const json = clipboard.getData(OUTLINE_CLIPBOARD_MIME);
    if (!json) return false;
    try {
      const document = importOutlineJSON<T>(json);
      dispatch({ type: "paste-nodes", afterId: rowId, nodes: document.nodes, createId });
      setClipboardError(null);
    } catch {
      setClipboardError("The copied outline is invalid. Nothing was inserted.");
    }
    return true;
  };
  const cancelDrag = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
  }, []);
  useEffect(() => {
    if (!drag) return;
    const owner = root.current?.ownerDocument;
    if (!owner) return;
    let animationFrame: number | null = null;
    let latestPointer: PointerEvent | null = null;
    const move = (event: PointerEvent) => {
      latestPointer = event;
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (
        !current.active &&
        Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 8
      )
        return;
      event.preventDefault();
      if (current.ids.some((nodeId) => !findOutlineNode(model.current.nodes, nodeId))) {
        cancelDrag();
        return;
      }
      const movingIds = new Set(
        current.ids.flatMap((nodeId) =>
          outlineIds([findOutlineNode(model.current.nodes, nodeId)!.node]),
        ),
      );
      const rows = editorVisibleRows(model.current).filter((row) => !movingIds.has(row.id));
      let gap = rows.length;
      for (let index = 0; index < rows.length; index++) {
        const bounds = rowElements.current.get(rows[index]!.id)?.getBoundingClientRect();
        if (bounds && event.clientY < bounds.top + bounds.height / 2) {
          gap = index;
          break;
        }
      }
      const rtl = root.current && getComputedStyle(root.current).direction === "rtl";
      const scopeDepth = model.current.hoistedId
        ? getOutlinePath(model.current.nodes, model.current.hoistedId).length - 1
        : 0;
      const desired =
        scopeDepth +
        current.initialDepth +
        Math.round(((event.clientX - current.startX) * (rtl ? -1 : 1)) / 24);
      const target = planOutlineDrop(
        model.current.nodes,
        editorVisibleRows(model.current).map((row) => row.id),
        current.ids,
        gap,
        desired,
      );
      const preview = target
        ? reduceOutlineEditor(
            model.current,
            { type: "drop", ids: current.ids, parentId: target.parentId, index: target.index },
            callbacks.current,
          )
        : null;
      const next = {
        ...current,
        active: true,
        target,
        gapId: rows[gap]?.id ?? null,
        allowed: preview?.refusal === null,
      };
      dragRef.current = next;
      setDrag(next);
      let scrollable: HTMLElement | null = root.current;
      while (
        scrollable &&
        !(
          scrollable.scrollHeight > scrollable.clientHeight &&
          /auto|scroll/.test(getComputedStyle(scrollable).overflowY)
        )
      )
        scrollable = scrollable.parentElement;
      const viewport = !scrollable;
      const scroller = scrollable ?? owner.scrollingElement;
      const bounds = scrollable?.getBoundingClientRect();
      const top = viewport ? 0 : bounds!.top,
        bottom = viewport ? (owner.defaultView?.innerHeight ?? 0) : bounds!.bottom;
      const distance = event.clientY < top + 48 ? -12 : event.clientY > bottom - 48 ? 12 : 0;
      if (scroller && distance) scroller.scrollTop += distance;
      if (animationFrame === null && owner.defaultView)
        animationFrame = owner.defaultView.requestAnimationFrame(() => {
          animationFrame = null;
          if (dragRef.current?.active && latestPointer) move(latestPointer);
        });
    };
    const up = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (current.active && current.allowed && current.target)
        dispatch({
          type: "drop",
          ids: current.ids,
          parentId: current.target.parentId,
          index: current.target.index,
        });
      cancelDrag();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelDrag();
      }
    };
    owner.addEventListener("pointermove", move, { passive: false });
    owner.addEventListener("pointerup", up);
    owner.addEventListener("pointercancel", cancelDrag);
    owner.addEventListener("keydown", escape);
    return () => {
      if (animationFrame !== null) owner.defaultView?.cancelAnimationFrame(animationFrame);
      owner.removeEventListener("pointermove", move);
      owner.removeEventListener("pointerup", up);
      owner.removeEventListener("pointercancel", cancelDrag);
      owner.removeEventListener("keydown", escape);
    };
  }, [!!drag, cancelDrag, dispatch]);
  useEffect(() => {
    cancelDrag();
  }, [state.nodes, state.hoistedId, readOnly, cancelDrag]);

  if (readOnly)
    return (
      <Outliner
        nodes={state.nodes}
        className={className}
        aria-label={label}
        expandedIds={state.expandedIds}
        onExpandedChange={(next, change) =>
          dispatch({ type: "expand", ids: change.affectedIds, expanded: change.isExpanded })
        }
        getRichContent={getRichContent}
        richRegistry={richRegistry}
        allowMedia={allowMedia}
        renderContent={renderContent}
        renderBody={renderBody}
        renderAccessory={renderAccessory}
        renderCollapsed={renderCollapsed}
        renderStatus={renderStatus}
        renderSuffix={renderSuffix}
        enableHoist={showBreadcrumbs}
        hoistedId={state.hoistedId}
        onHoistChange={(id) => dispatch({ type: "hoist", id })}
      />
    );

  const breadcrumbs = state.hoistedId ? getOutlinePath(state.nodes, state.hoistedId) : [];
  const renderPlaceholder = (placeholder: OutlinePlaceholder, parentId: string | null) => {
    const insert = (draft?: OutlinePlaceholderDraft) => {
      const id = createId();
      const existed = !!findOutlineNode(model.current.nodes, id);
      const text = draft?.text ?? placeholder.text ?? "";
      updateMode(false);
      dispatch({
        type: "insert",
        id,
        parentId,
        text,
        index: placeholder.index,
        caret: draft?.caret ?? placeholder.caret,
      });
      const inserted = findOutlineNode(model.current.nodes, id);
      // Plugins may consume or replace an action, and policy may refuse it.
      // A retained local draft is safer than acknowledging an unrelated result.
      return !existed && inserted?.node.text === text && inserted.parentId === parentId;
    };
    return (
      <div key={placeholder.id} className="fast-ux-editor__placeholder-row">
        <OutlinePlaceholderInput
          label={`${placeholder.label}: type here`}
          spellCheck={spellCheck}
          onMaterialize={insert}
          onActivate={() => insert()}
        />
        <Button className="fast-ux-editor__placeholder fux-control" onPress={() => insert()}>
          {placeholder.label}
        </Button>
      </div>
    );
  };
  return (
    <section
      ref={root}
      id={rootId}
      className={["fast-ux-outliner", "fast-ux-editor", className].filter(Boolean).join(" ")}
      aria-label={label}
      tabIndex={-1}
      data-read-only="false"
      onKeyDown={(event) => {
        const container = event.currentTarget;
        if (
          event.target !== container ||
          container.ownerDocument.activeElement !== container ||
          event.key !== "Tab" ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.defaultPrevented ||
          event.nativeEvent.defaultPrevented ||
          composing.current ||
          event.nativeEvent.isComposing ||
          event.keyCode === 229
        )
          return;
        const boundary = event.shiftKey ? exitStart.current : exitEnd.current;
        if (!boundary) return;
        if (exitTabTimer.current !== null) clearTimeout(exitTabTimer.current);
        const nativeEvent = event.nativeEvent;
        // An ancestor may cancel after this handler. Do not leave focus on a
        // clipped boundary in that case, or override a focus destination it chose.
        exitTabTimer.current = setTimeout(() => {
          exitTabTimer.current = null;
          if (
            nativeEvent.defaultPrevented &&
            root.current === container &&
            container.isConnected &&
            container.ownerDocument.activeElement === boundary
          )
            container.focus({ preventScroll: true });
        }, 0);
        // Change only the native traversal starting point. The browser and any
        // enclosing focus scope still own Tab's default action and containment.
        boundary.focus({ preventScroll: true });
      }}
      onPaste={(event) => {
        if (event.target !== event.currentTarget && visible.length > 0) return;
        event.preventDefault();
        updateMode(false);
        if (pasteStructured(event.clipboardData)) return;
        try {
          const pasted = parseOutlineText(event.clipboardData.getData("text/plain"));
          dispatch({ type: "paste-nodes", nodes: pasted as readonly OutlineNode<T>[], createId });
        } catch {
          setClipboardError("The copied outline is invalid. Nothing was inserted.");
        }
      }}
      onCopy={(event) => {
        if (
          !model.current.selection.size ||
          !(
            event.target === event.currentTarget ||
            rowElements.current.get(model.current.caret?.id ?? "") === event.target
          )
        )
          return;
        event.preventDefault();
        copySelection(event.clipboardData);
      }}
      onCut={(event) => {
        if (
          !model.current.selection.size ||
          !(
            event.target === event.currentTarget ||
            rowElements.current.get(model.current.caret?.id ?? "") === event.target
          )
        )
          return;
        event.preventDefault();
        if (copySelection(event.clipboardData)) dispatch({ type: "delete" });
      }}
    >
      <span ref={exitStart} className="fast-ux-sr-only" tabIndex={-1}>
        Start of {label}
      </span>
      {showToolbar && (
        <div role="toolbar" aria-label="Outline actions" className="fast-ux-editor__toolbar">
          <Button
            className="fux-control"
            isDisabled={!state.history.past.length}
            onPress={() => {
              completion.dismiss();
              dispatch({ type: "undo" });
            }}
          >
            Undo
          </Button>
          <Button
            className="fux-control"
            isDisabled={!state.history.future.length}
            onPress={() => {
              completion.dismiss();
              dispatch({ type: "redo" });
            }}
          >
            Redo
          </Button>
          <Button
            className="fux-control"
            onPress={() => dispatch({ type: "expand-all", expanded: true })}
          >
            Expand all
          </Button>
          <Button
            className="fux-control"
            onPress={() => dispatch({ type: "expand-all", expanded: false })}
          >
            Collapse all
          </Button>
        </div>
      )}
      {showBreadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Outline path" className="fast-ux-editor__breadcrumbs">
          <Button className="fux-control" onPress={() => dispatch({ type: "hoist", id: null })}>
            All items
          </Button>
          {breadcrumbs.map((node, index) => (
            <Button
              key={node.id}
              className="fux-control"
              aria-current={index === breadcrumbs.length - 1 ? "location" : undefined}
              onPress={() => dispatch({ type: "hoist", id: node.id })}
            >
              {node.text || "Untitled item"}
            </Button>
          ))}
        </nav>
      )}
      <ul
        role="list"
        className="fast-ux-outliner__list fast-ux-editor__rows"
        aria-label="Outline items"
      >
        {visible.map((row, index) => {
          const node = row.node,
            expanded = state.expandedIds.has(node.id),
            selected = state.selection.has(node.id),
            locked =
              isLocked?.(node) ||
              getOutlinePath(state.nodes, node.id)
                .slice(0, -1)
                .some((ancestor) => isLocked?.(ancestor));
          const inputId = `${rootId}-text-${index}`,
            diagnosticsId = `${rootId}-diagnostics-${index}`;
          const analysis = currentTextAnalysis(getTextAnalysis?.(node), node.text);
          const richDocument = getRichContent?.(node);
          const body = renderBody?.(node);
          const note = readNote(node);
          const noteEpoch = noteCompositionEpoch.current;
          const editingNote =
            note !== undefined &&
            !locked &&
            !rowMode &&
            state.caret?.id === node.id &&
            state.caret.field === "note";
          const hasBody = renderBody
            ? body != null && typeof body !== "boolean" && body !== ""
            : !!richDocument;
          const activeCompletion =
            completion.session?.context.rowId === node.id ? completion.session : null;
          const popupId = `${rootId}-completions`,
            activeOption = activeCompletion ? `${popupId}-${activeCompletion.active}` : undefined;
          const hiddenSummary = row.hasChildren && !expanded ? renderCollapsed?.(node) : null;
          const hasTask = showTasks && node.checked !== undefined;
          const focusButton = (
            <Button
              className={`${hasTask ? "fast-ux-editor__focus" : "fast-ux-editor__bullet"} fux-control`}
              aria-label={`Focus on ${node.text || "empty item"}`}
              onPress={() => {
                completion.dismiss();
                dispatch({ type: "hoist", id: node.id });
              }}
            >
              {hasTask ? (
                <OutlineFocus />
              ) : (
                <OutlineBullet collapsed={row.hasChildren && !expanded} />
              )}
            </Button>
          );
          return (
            <li
              key={node.id}
              ref={(element) => {
                if (element) rowElements.current.set(node.id, element);
                else rowElements.current.delete(node.id);
              }}
              className="fast-ux-editor__item"
              data-node-id={node.id}
              data-depth={row.depth}
              data-has-children={row.hasChildren}
              data-expanded={row.hasChildren && expanded}
              data-checked={node.checked}
              data-locked={locked || undefined}
              data-dragging={(drag?.active && drag.ids.includes(node.id)) || undefined}
              data-selected={selected || undefined}
              data-tone={getRowTone?.(node)}
              data-drop-before={
                drag?.active && drag.gapId === node.id
                  ? drag.allowed
                    ? "allowed"
                    : "blocked"
                  : undefined
              }
              data-drop-depth={drag?.active && drag.gapId === node.id ? dropDepth + 1 : undefined}
              tabIndex={rowMode && focusedRow === node.id ? 0 : -1}
              aria-label={`${node.text || "Empty item"}, level ${row.depth + 1}${selected ? ", selected" : ""}`}
              style={
                {
                  "--outline-depth": Math.min(row.depth, 12),
                  "--outline-drop-depth": Math.min(dropDepth, 12),
                } as CSSProperties
              }
              onKeyDown={(event) => {
                if (event.target === event.currentTarget) keyDown(event, node.id, "row");
              }}
              onPaste={(event) => {
                if (event.target !== event.currentTarget) return;
                event.preventDefault();
                updateMode(false);
                if (pasteStructured(event.clipboardData, node.id)) return;
                try {
                  const pasted = parseOutlineText(event.clipboardData.getData("text/plain"));
                  dispatch({
                    type: "paste-nodes",
                    afterId: node.id,
                    nodes: pasted as readonly OutlineNode<T>[],
                    createId,
                  });
                } catch {
                  setClipboardError("The copied outline is invalid. Nothing was inserted.");
                }
              }}
            >
              {row.depth > 0 && (
                <span className="fast-ux-editor__guides" aria-hidden="true">
                  {Array.from({ length: Math.min(row.depth, 12) }, (_, level) => (
                    <span key={level} style={{ "--outline-guide": level } as CSSProperties} />
                  ))}
                </span>
              )}
              <div className="fast-ux-outliner__row fast-ux-editor__row">
                {!hasTask && focusButton}
                {hasTask && (
                  <label className="fast-ux-editor__task">
                    <input
                      type="checkbox"
                      checked={node.checked}
                      disabled={locked}
                      aria-label={`Complete ${node.text || "item"}`}
                      onChange={(event) =>
                        dispatch({
                          type: "task",
                          id: node.id,
                          checked: event.currentTarget.checked,
                        })
                      }
                    />
                  </label>
                )}
                {renderStatus?.(node)}
                <div className="fast-ux-editor__text-container">
                  {analysis?.classifications?.length ? (
                    <div className="fast-ux-editor__decoration" aria-hidden="true">
                      {segmentText(node.text, analysis.classifications).map((segment) => (
                        <span
                          key={segment.start}
                          data-kinds={segment.layers.map((layer) => layer.kind).join(" ")}
                        >
                          {segment.text}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <textarea
                    ref={(element) => {
                      if (element) textareas.current.set(node.id, element);
                      else textareas.current.delete(node.id);
                    }}
                    id={inputId}
                    value={node.text}
                    readOnly={locked}
                    spellCheck={spellCheck}
                    rows={1}
                    aria-label={`Edit ${node.text || "empty item"}`}
                    aria-describedby={
                      [
                        analysis?.diagnostics?.length ? diagnosticsId : "",
                        hover.session?.context.rowId === node.id &&
                        hover.session.origin === "keyboard"
                          ? `${rootId}-information`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    aria-autocomplete={providers.length ? "list" : undefined}
                    aria-controls={activeCompletion ? popupId : undefined}
                    aria-activedescendant={activeOption}
                    className="fast-ux-editor__input"
                    data-decorated={!!analysis?.classifications?.length || undefined}
                    onPointerMove={(event) => {
                      if (
                        !hoverProviders.length ||
                        event.pointerType === "touch" ||
                        model.current.caret?.field === "note"
                      )
                        return;
                      const input = event.currentTarget,
                        x = event.clientX,
                        y = event.clientY;
                      clearHoverTimer();
                      hoverTimer.current = setTimeout(() => {
                        const offset = textareaOffsetAtPoint(input, x, y);
                        const current = hoverRef.current.session;
                        if (
                          current?.context.rowId === node.id &&
                          current.offer.range.start <= offset &&
                          offset <= current.offer.range.end
                        )
                          return;
                        requestHover(node.id, offset, "pointer");
                      }, hoverDelay);
                    }}
                    onPointerLeave={scheduleHoverDismiss}
                    onFocus={(event) => {
                      noteHadFocus.current = false;
                      updateMode(false);
                      focused.current = node.id;
                      selectedCaret.current = {
                        start: event.currentTarget.selectionStart,
                        end: event.currentTarget.selectionEnd,
                      };
                      if (!pendingFocus.current)
                        dispatch({ type: "caret", id: node.id, ...selectedCaret.current });
                    }}
                    onSelect={(event) => {
                      if (
                        hoverFocus.current &&
                        (event.currentTarget.selectionStart !== hoverFocus.current.start ||
                          event.currentTarget.selectionEnd !== hoverFocus.current.end)
                      )
                        dismissHover();
                      if (
                        pendingFocus.current ||
                        event.currentTarget.ownerDocument.activeElement !== event.currentTarget
                      )
                        return;
                      selectedCaret.current = {
                        start: event.currentTarget.selectionStart,
                        end: event.currentTarget.selectionEnd,
                      };
                      dispatch({ type: "caret", id: node.id, ...selectedCaret.current });
                      if (
                        completionRef.current.session &&
                        (selectedCaret.current.start !==
                          completionRef.current.session.context.selection.start ||
                          selectedCaret.current.end !==
                            completionRef.current.session.context.selection.end)
                      )
                        completionRef.current.dismiss();
                    }}
                    onBlur={(event) => {
                      if (!event.relatedTarget || !root.current?.contains(event.relatedTarget))
                        completionRef.current.dismiss();
                      if (hoverFocus.current && !information.current?.contains(event.relatedTarget))
                        dismissHover();
                    }}
                    onChange={(event) => {
                      syncInput(event.currentTarget, node.id);
                      if (!composing.current) {
                        const context = getContext();
                        if (context) completion.request(context, "input");
                      }
                    }}
                    onCompositionStart={() => {
                      composing.current = true;
                      completion.dismiss();
                      dismissHover();
                    }}
                    onCompositionEnd={(event) => {
                      composing.current = false;
                      syncInput(event.currentTarget, node.id);
                      const context = getContext();
                      if (context) completion.request(context, "input");
                    }}
                    onKeyDown={(event) => keyDown(event, node.id, "text")}
                    onPaste={(event) => {
                      if (composing.current) return;
                      event.preventDefault();
                      completion.dismiss();
                      syncInput(event.currentTarget, node.id);
                      if (pasteStructured(event.clipboardData, node.id)) return;
                      dispatch({
                        type: "paste",
                        id: node.id,
                        start: event.currentTarget.selectionStart,
                        end: event.currentTarget.selectionEnd,
                        text: event.clipboardData.getData("text/plain"),
                        createId,
                      });
                    }}
                  />
                  {renderSuffix?.(node)}
                  {analysis?.diagnostics?.length ? (
                    <ul id={diagnosticsId} className="fast-ux-editor__diagnostics">
                      {analysis.diagnostics.map((diagnostic, diagnosticIndex) => (
                        <li key={diagnosticIndex} data-severity={diagnostic.severity}>
                          {diagnostic.severity}: {diagnostic.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {activeCompletion && (
                    <TextPopup
                      container={popupContainer}
                      anchor={textareas.current.get(node.id) ?? null}
                      offset={activeCompletion.context.selection.start}
                    >
                      <ul
                        id={popupId}
                        role="listbox"
                        aria-label="Suggestions"
                        className="fast-ux-editor__completions"
                      >
                        {activeCompletion.items.map((item, optionIndex) => (
                          <li
                            id={`${popupId}-${optionIndex}`}
                            key={item.id}
                            role="option"
                            aria-selected={optionIndex === activeCompletion.active}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => completion.choose(optionIndex)}
                          >
                            {item.label}
                            {item.detail && <small>{item.detail}</small>}
                          </li>
                        ))}
                      </ul>
                    </TextPopup>
                  )}
                </div>
                {hasTask && focusButton}
                <Button
                  className="fast-ux-editor__select fux-control"
                  aria-label={`Select ${node.text || "empty item"}`}
                  aria-pressed={selected}
                  onPress={(event) =>
                    selectRow(node.id, event.shiftKey, event.metaKey || event.ctrlKey)
                  }
                >
                  <OutlineCheck checked={selected} />
                </Button>
                {hoverProviders.length > 0 && (
                  <Button
                    className="fast-ux-editor__info fux-control"
                    aria-label={`Information about ${node.text || "item"}`}
                    aria-haspopup="dialog"
                    aria-expanded={hover.session?.context.rowId === node.id}
                    aria-controls={
                      hover.session?.context.rowId === node.id ? `${rootId}-information` : undefined
                    }
                    onKeyDown={(event) => {
                      if (hoverContext.current?.rowId !== node.id) return;
                      if (
                        event.key === "Escape" &&
                        (hoverRef.current.session || hoverRef.current.status === "loading")
                      ) {
                        event.preventDefault();
                        dismissHover();
                      } else if (
                        event.key === "Tab" &&
                        !event.shiftKey &&
                        !event.altKey &&
                        !event.ctrlKey &&
                        !event.metaKey &&
                        hoverRef.current.session?.origin === "keyboard" &&
                        information.current
                      ) {
                        event.preventDefault();
                        enterInformation();
                      }
                    }}
                    onBlur={(event) => {
                      if (
                        hoverContext.current?.rowId === node.id &&
                        hoverFocus.current &&
                        !information.current?.contains(event.relatedTarget) &&
                        event.relatedTarget !== textareas.current.get(node.id)
                      )
                        dismissHover();
                    }}
                    onPress={() =>
                      requestHover(
                        node.id,
                        focused.current === node.id ? selectedCaret.current.start : 0,
                        "keyboard",
                      )
                    }
                  >
                    Info
                  </Button>
                )}
                {renderAccessory?.(node)}
                {enableDrag && (
                  <Button
                    className="fast-ux-editor__drag fux-control"
                    aria-label={`Reorder ${node.text || "empty item"}`}
                    isDisabled={locked}
                    style={{ touchAction: "none" }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                        event.preventDefault();
                        dispatch({
                          type: "move",
                          direction: event.key === "ArrowUp" ? "up" : "down",
                          ids: model.current.selection.has(node.id)
                            ? [...model.current.selection]
                            : [node.id],
                        });
                      }
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || locked) return;
                      completion.dismiss();
                      const ids = state.selection.has(node.id)
                        ? selectionRoots(state.nodes, state.selection)
                        : [node.id];
                      const next = {
                        pointerId: event.pointerId,
                        ids,
                        startX: event.clientX,
                        startY: event.clientY,
                        initialDepth: row.depth,
                        active: false,
                        target: null,
                        gapId: null,
                        allowed: false,
                      };
                      dragRef.current = next;
                      setDrag(next);
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                    }}
                  >
                    <OutlineGrip />
                  </Button>
                )}
                {row.hasChildren && (
                  <Button
                    className="fast-ux-outliner__toggle fux-control"
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${node.text || "item"}`}
                    aria-expanded={expanded}
                    onPress={(event) =>
                      dispatch(
                        event.altKey
                          ? { type: "expand", ids: outlineIds([node]), expanded: !expanded }
                          : { type: "toggle", id: node.id },
                      )
                    }
                  >
                    <span className="fast-ux-outliner__chevron" aria-hidden="true">
                      <OutlineChevron />
                    </span>
                    {!expanded && (
                      <span className="fast-ux-outliner__count" aria-hidden="true">
                        {node.children!.length}
                      </span>
                    )}
                  </Button>
                )}
              </div>
              {note !== undefined && (
                <div className="fast-ux-editor__note">
                  {editingNote ? (
                    <>
                      <textarea
                        key={noteEpoch}
                        ref={(element) => {
                          if (element) noteTextareas.current.set(node.id, element);
                          else noteTextareas.current.delete(node.id);
                        }}
                        value={note}
                        rows={1}
                        spellCheck={spellCheck}
                        className="fast-ux-editor__input fast-ux-editor__note-input"
                        aria-label={`Edit note for ${node.text || "empty item"}`}
                        aria-describedby={`${rootId}-note-help-${index}`}
                        onFocus={(event) => {
                          noteHadFocus.current = true;
                          completion.dismiss();
                          dismissHover();
                          if (!pendingFocus.current)
                            dispatch({
                              type: "caret",
                              id: node.id,
                              field: "note",
                              start: event.currentTarget.selectionStart,
                              end: event.currentTarget.selectionEnd,
                            });
                        }}
                        onSelect={(event) => {
                          if (
                            pendingFocus.current ||
                            event.currentTarget.ownerDocument.activeElement !== event.currentTarget
                          )
                            return;
                          dispatch({
                            type: "caret",
                            id: node.id,
                            field: "note",
                            start: event.currentTarget.selectionStart,
                            end: event.currentTarget.selectionEnd,
                          });
                        }}
                        onBlur={() => {
                          noteComposing.current = false;
                        }}
                        onChange={(event) => {
                          if (noteEpoch === noteCompositionEpoch.current)
                            syncNote(event.currentTarget, node.id);
                        }}
                        onCompositionStart={() => {
                          if (noteEpoch === noteCompositionEpoch.current)
                            noteComposing.current = true;
                        }}
                        onCompositionEnd={(event) => {
                          if (noteEpoch !== noteCompositionEpoch.current || !noteComposing.current)
                            return;
                          noteComposing.current = false;
                          syncNote(event.currentTarget, node.id);
                        }}
                        onKeyDown={(event) => noteKeyDown(event, node.id)}
                        onPaste={(event) => {
                          if (noteComposing.current) return;
                          event.preventDefault();
                          event.stopPropagation();
                          const input = event.currentTarget;
                          const text = event.clipboardData.getData("text/plain");
                          dispatch({
                            type: "note",
                            id: node.id,
                            text:
                              input.value.slice(0, input.selectionStart) +
                              text +
                              input.value.slice(input.selectionEnd),
                            caret: input.selectionStart + text.length,
                            time: Date.now(),
                          });
                        }}
                      />
                      <span
                        id={`${rootId}-note-help-${index}`}
                        className="fast-ux-editor__note-help"
                      >
                        Tab inserts a tab. Shift+Tab moves focus back. Escape finishes editing
                        without discarding changes.
                      </span>
                      <Button
                        className="fux-control"
                        onPress={() =>
                          dispatch({ type: "focus", id: node.id, start: node.text.length })
                        }
                      >
                        Return to title
                      </Button>
                    </>
                  ) : (
                    <>
                      {!renderBody && note && (
                        <div className="fast-ux-editor__note-preview">{note}</div>
                      )}
                      <Button
                        className="fux-control"
                        isDisabled={locked}
                        aria-label={`Edit note for ${node.text || "empty item"}`}
                        onPress={() => focusNote(node.id)}
                      >
                        Edit note
                      </Button>
                    </>
                  )}
                </div>
              )}
              {hasBody && (
                <div className="fast-ux-editor__body">
                  {renderBody ? (
                    body
                  ) : (
                    <RichContent
                      document={richDocument!}
                      registry={richRegistry}
                      allowMedia={allowMedia}
                    />
                  )}
                </div>
              )}
              {hiddenSummary && (
                <div
                  className="fast-ux-editor__summary"
                  tabIndex={0}
                  aria-label={`Collapsed content for ${node.text || "item"}`}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      selectRow(node.id);
                    }
                  }}
                >
                  {hiddenSummary}
                </div>
              )}
              {expanded &&
                getPlaceholders?.(node).map((placeholder) =>
                  renderPlaceholder(placeholder, node.id),
                )}
            </li>
          );
        })}
        {drag?.active && drag.gapId === null && (
          <li
            aria-hidden="true"
            className="fast-ux-editor__drop-end"
            data-drop-before={drag.allowed ? "allowed" : "blocked"}
            data-drop-depth={dropDepth + 1}
            style={{ "--outline-drop-depth": Math.min(dropDepth, 12) } as CSSProperties}
          />
        )}
      </ul>
      <Button
        className="fast-ux-editor__add fux-control"
        onPress={() => {
          updateMode(false);
          dispatch({ type: "insert", id: createId() });
        }}
      >
        Add item
      </Button>
      {!state.hoistedId &&
        getPlaceholders?.(null).map((placeholder) => renderPlaceholder(placeholder, null))}
      {hover.session && (
        <TextPopup
          container={popupContainer}
          anchor={textareas.current.get(hover.session.context.rowId) ?? null}
          offset={hover.session.offset}
          onPointerEnter={clearHoverTimer}
          onPointerLeave={scheduleHoverDismiss}
        >
          <aside
            ref={information}
            id={`${rootId}-information`}
            role="dialog"
            tabIndex={-1}
            aria-label="Text information"
            className="fast-ux-editor__information"
            onFocus={clearHoverTimer}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget) &&
                event.relatedTarget !== textareas.current.get(hover.session!.context.rowId)
              )
                dismissHover();
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Tab" &&
                event.shiftKey &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                (event.target === event.currentTarget ||
                  event.target === informationEntry.current ||
                  event.target === informationTabStops(event.currentTarget)[0])
              ) {
                event.preventDefault();
                event.stopPropagation();
                textareas.current.get(hover.session!.context.rowId)?.focus();
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                const target = hover.session!.context.rowId;
                dismissHover();
                textareas.current.get(target)?.focus();
              }
            }}
          >
            {hover.session.offer.content}
            <Button
              className="fux-control"
              onPress={() => {
                const target = hover.session!.context.rowId;
                dismissHover();
                textareas.current.get(target)?.focus();
              }}
            >
              Close information
            </Button>
          </aside>
        </TextPopup>
      )}
      <div role="status" className="fast-ux-sr-only" aria-live="polite">
        {clipboardError ??
          (state.refusal
            ? (getRefusalMessage?.(state.refusal) ?? `Cannot change outline: ${state.refusal}.`)
            : drag?.active
              ? drag.allowed
                ? `Move to level ${(drag.target?.depth ?? 0) + 1}`
                : "This move is not allowed"
              : completion.status === "ready"
                ? `${completion.session?.items.length ?? 0} suggestions`
                : completion.status === "loading"
                  ? "Loading suggestions"
                  : completion.status === "error"
                    ? "Suggestions unavailable"
                    : "")}
      </div>
      <span ref={exitEnd} className="fast-ux-sr-only" tabIndex={-1}>
        End of {label}
      </span>
    </section>
  );
}
