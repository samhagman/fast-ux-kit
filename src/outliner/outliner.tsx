import * as React from "react";

import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  useAnimate,
  useIsPresent,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  animate as animateValue,
} from "motion/react";
import {
  CalendarDays,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  EyeOff,
  IndentDecrease,
  IndentIncrease,
  CircleCheck,
  Command,
  CornerDownRight,
  CornerUpLeft,
  FileDown,
  FileUp,
  Home,
  Keyboard,
  ListTree,
  Ban,
  Files,
  Kanban,
  Printer,
  Replace,
  Settings2,
  History,
  Lock,
  MoreHorizontal,
  Plus,
  Redo2,
  Repeat2,
  Star,
  Search,
  StickyNote,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "../components/ui/sonner.js";
import {
  createOutlineId,
  findOutlineNode,
  getOutlinePath,
  planOutlineDrop,
} from "../core/index.js";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../lib/utils.js";
import { DirectionScope, useResolvedDirection, type Dir } from "../lib/direction.js";
import { useMediaQuery } from "../hooks/use-media-query.js";
import { motionTokens } from "../lib/motion.js";
import { Button } from "../components/ui/button.js";
import { Kbd } from "../components/ui/kbd.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.js";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "../components/ui/context-menu.js";
import {
  InlineText,
  inlineToLabel,
  inlineToPlain,
  inlineToSpeech,
  sourceOffsetFromPoint,
} from "./inline.js";
import { AutocompletePopover, useAutocomplete } from "./autocomplete.js";
import {
  OutlinerContext,
  useOutlinerContext,
  usePlatformKeys,
  type ActionSheetRequest,
  type FocusReturn,
  type ItemMenuRequest,
  type OutlinerHostSlots,
  type OutlinerPaletteCommand,
  type OutlinerPaletteGroup,
  type OutlinerStarredDocuments,
  type OutlinerSearchScope,
  type OutlinerUi,
  type PaletteMode,
} from "./context.js";
import type { OutlinerController } from "./use-outliner.js";
import {
  carryIds,
  useOutliner,
  type OutlinerRow,
  type ToggleSummary,
  type UseOutlinerOptions,
} from "./use-outliner.js";
import { COLOR_STYLES, type OutlineExportFormat, type OutlineItem } from "./types.js";
import { resolveLabels, type OutlinerLabels } from "./labels.js";
import { mirrorOf } from "./mirrors.js";
import { exportOutline, htmlHasStructure } from "./interchange.js";
import { isBoard } from "./board.js";
import { OutlinerBoard, type BoardParts } from "./outliner-board.js";
import { RichContentProvider, RichNote, type OutlineRenderers } from "./rich-note-view.js";
import { NOTE_CLASS } from "./rich-note.js";
import { OutlinerArticle, type ArticleParts } from "./outliner-article.js";
import { OutlinerPrintHost, requestPrint } from "./outliner-print.js";
import { MindMapSlot, ViewSwitcher, printCurrent, shownView } from "./outliner-views.js";
import { searchSuggestions } from "./search-filters.js";
import { ResultSortControl } from "./result-sort.js";
import { reportImport } from "./outliner-import-report.js";
import { insideClose, keepClearOfToasts } from "./toasts.js";
import {
  ItemMenuContent,
  OutlinerActionSheet,
  OutlinerBookmarksMenu,
  OutlinerBulkBar,
  OutlinerCommandPalette,
  OutlinerDatePicker,
  OutlinerMobileBar,
  OutlinerShortcuts,
  deleteItems,
} from "./outliner-chrome.js";
import { afterFocusReturn } from "./item-actions.js";
import {
  bookmarkFor,
  cycleRegion,
  fieldAllSelected,
  fieldAt,
  fieldAtVisualBoundary,
  fieldCaretRect,
  isEditingField,
  isLiveField,
  isSoleOutliner,
  neighbourOf,
  registerOutliner,
  setFieldSelection,
  type CaretField,
} from "./focus.js";
import { loadLiveField, useLiveField } from "./live-field/load.js";
import type { FieldHost, FieldNotice } from "./live-field/field-session.js";
import { fieldHost } from "./live-field/outliner-host.js";
import { resolveSettings, settingsStyle, type OutlinerSettings } from "./settings.js";
import {
  buildKeymap,
  isComposingKey,
  isItemMenuKey,
  matchShortcut,
  primaryShortcut,
  type ReservedShortcut,
  type ShortcutId,
} from "./keymap.js";
import { listNav, onRowKey } from "./row-keys.js";
import { resolveTarget, type SelectPolicy } from "./target.js";
import { useApplePlatform } from "../lib/platform.js";
import {
  FORMAT_MARKS,
  runGlobalShortcut,
  runItemShortcut,
  showLevels,
  toggleHideCompleted,
} from "./shortcut-actions.js";
import { deepLinkTarget, itemFromHref, itemHref, writeLinkToClipboard } from "./permalink.js";
import { attachmentMarkup, type OutlineAttachHandler, type OutlinerItemCommands } from "./seams.js";
import { copyDropCommands } from "./copy-drop.js";
import { swipeIntent } from "./gestures.js";
import { FindReplaceBar } from "./outliner-find-replace.js";
import { OutlinerSettingsPanel } from "./outliner-settings.js";
import { FoldTasks } from "./outliner-fold-tasks.js";
import { ResponsiveMenu, type MenuEntry } from "./outliner-menu.js";
import { OutlinerItemMenu, suppressKeyboardContextMenu, useSlashMenu } from "./item-menu.js";

export interface OutlinerProps extends UseOutlinerOptions {
  /** Zoomed item (controlled). Pair with onHoistChange to sync zoom with the URL. */
  readonly hoistedId?: string | null;
  readonly onHoistChange?: (id: string | null) => void;
  /** Document title shown when no item is zoomed. */
  readonly title?: string;
  readonly className?: string;
  /** Show the header toolbar (breadcrumbs, search, view and document menus). */
  readonly toolbar?: boolean;
  readonly placeholder?: string;
  /** Writing direction. Defaults to the direction inherited from the page. */
  readonly dir?: Dir;
  /** User-facing strings (toolbar, menus, toasts, announcements). Pass only what you change. */
  readonly labels?: Partial<OutlinerLabels>;
  /** Imperative handle (React 19 ref-as-prop; same contract forwardRef gave). */
  readonly ref?: React.Ref<OutlinerHandle>;
  /** Rendered first in the toolbar (e.g. a documents switcher button). */
  readonly headerStart?: React.ReactNode;
  /** Makes the document title editable in place; called with the new title. */
  readonly onTitleChange?: (title: string) => void;
  /** Extra ⌘K groups (e.g. "Open document"). */
  readonly paletteGroups?: readonly OutlinerPaletteGroup[];
  /** Offer a wider search scope (all documents); see OutlinerSearchScope. */
  readonly searchScope?: OutlinerSearchScope;
  /** Extra ⋯ view menu entries (see OutlinerHostSlots.menuCommands). */
  readonly menuCommands?: readonly OutlinerPaletteCommand[];
  /** Rows dragged onto a `data-outline-drop` target outside the outline (see OutlinerHostSlots). */
  readonly onExternalDrop?: (ids: readonly string[], target: string) => boolean;
  /** Starred documents for the bookmarks menu (see OutlinerHostSlots.starredDocuments). */
  readonly starredDocuments?: OutlinerStarredDocuments;
  /**
   * Trusted embeds in notes: a fenced block whose info string is a key here (```embed:video)
   * renders through the host's own React component. See rich-note-view.tsx.
   */
  readonly renderers?: OutlineRenderers;
  /**
   * The reader's preferences (density, text size, bullet click, keyboard profile, note display,
   * remapped shortcuts). Controlled with `settings` + `onSettingsChange`, or seeded with
   * `defaultSettings`. The outliner never stores them; the settings panel edits them.
   */
  readonly settings?: Partial<OutlinerSettings>;
  readonly defaultSettings?: Partial<OutlinerSettings>;
  readonly onSettingsChange?: (settings: OutlinerSettings) => void;
  /* Host seams (SEAMS.md). */
  /** A deep or share link for an item; default: this page with `?zoom=<id>` (`?doc=` in a workspace). */
  readonly linkFor?: (id: string) => string;
  /** Store files pasted or dropped into an item; the links you return are added to its note. */
  readonly onAttach?: OutlineAttachHandler;
  /** Adds "Version history…" to ⌘K and the ⋯ menu; restore through `ref.replace(nodes)`. */
  readonly onHistory?: () => void;
  /** Integrations: host actions in every item menu and the phone sheet. */
  readonly itemCommands?: OutlinerItemCommands;
  /** Keys the host uses itself; shortcut remapping refuses them. */
  readonly reservedShortcuts?: readonly ReservedShortcut[];
}

/** What a host can do from outside: `const ref = useRef<OutlinerHandle>(null)`. */
export interface OutlinerHandle {
  /** Focus the tree (keyboard selection mode). */
  focus(): void;
  /**
   * Put the keyboard back where the reader left this outline: the tree on its row, or a field
   * with its selection (a dialog of the host's closing). Never <body>.
   */
  restoreFocus(): void;
  /** Reveal (unfold, zoom out if needed), select and scroll to an item; `edit` puts the caret in it. */
  focusItem(id: string, options?: { readonly edit?: boolean }): boolean;
  /** Zoom into an item (null: the document root). */
  zoomTo(id: string | null): void;
  /**
   * Open a deep link to an item: zoom into it when it has children; a leaf opens its parent's
   * zoom with the leaf selected (never an empty page). False when the item does not exist.
   */
  openLink(id: string): boolean;
  /** The current document, including edits a controlled host has not echoed yet. */
  getValue(): readonly OutlineItem[];
  undo(): void;
  redo(): void;
  /** Set the search query (opens the field); "" clears it. */
  search(query: string): void;
  exportAs(format: OutlineExportFormat): string;
  /** Print / Save as PDF: the article of the current zoom (or the whole document), no chrome. */
  print(): void;
  /**
   * Append whole items (with children) at the top level as one undo step; an id that is free
   * here is kept (a move between documents keeps its links). Returns the ids it inserted.
   */
  insertItems(nodes: readonly OutlineItem[]): readonly string[];
  /** Update existing item fields synchronously as one undo step, preserving the
   * current caret/selection. False when refused, vetoed or unchanged. */
  updateItem(id: string, changes: Partial<Pick<OutlineItem, "text" | "checked" | "data">>): boolean;
  /** Remove items and their subtrees as one undo step. False when refused (locked, read-only). */
  removeItems(ids: readonly string[]): boolean;
  /**
   * Replace the whole document as ONE undo step (a restored version, a remote merge, a move
   * between documents). `carried`: ids that arrive intact from elsewhere, so not stamped as edits.
   */
  replace(
    nodes: readonly OutlineItem[],
    options?: { readonly carried?: ReadonlySet<string> },
  ): boolean;
  /** The entries an undo and a redo would travel now (opaque; compare by identity). */
  history(): { readonly undo: unknown; readonly redo: unknown };
  /** Open find and replace, optionally with a query. */
  find(query?: string): void;
}

/** Item shortcuts that need no row, so they also work with focus outside the tree. */
const ROWLESS_SHORTCUTS: ReadonlySet<ShortcutId> = new Set<ShortcutId>([
  "levels1",
  "levels2",
  "levels3",
  "levelsAll",
  "hideCompleted",
  "zoomOut",
]);

/** Indentation per level comes from --ol-indent (22px, 16px on narrow screens). */
const indentPx = (el?: Element | null) =>
  parseFloat(getComputedStyle(el ?? document.documentElement).getPropertyValue("--ol-indent")) ||
  22;

export function Outliner({
  title = "Untitled",
  className,
  toolbar = true,
  placeholder,
  hoistedId,
  onHoistChange,
  dir,
  labels: labelOverrides,
  ref,
  headerStart,
  onTitleChange,
  paletteGroups,
  searchScope,
  renderers,
  menuCommands,
  onExternalDrop,
  starredDocuments,
  settings: settingsProp,
  defaultSettings,
  onSettingsChange,
  linkFor,
  onAttach,
  onHistory,
  itemCommands,
  reservedShortcuts,
  ...options
}: OutlinerProps) {
  // Undo and redo are said aloud, whichever control did them: keys, the toolbar, a toast.
  const travelled = React.useRef<((direction: "undo" | "redo") => void) | null>(null);
  const hostTravel = options.onHistoryTravel;
  const ol = useOutliner({
    ...options,
    onHistoryTravel: (travel) => {
      travelled.current?.(travel.direction);
      hostTravel?.(travel);
    },
  });
  /* ── Preferences: controlled (`settings`) or owned (`defaultSettings`); never stored here ── */
  const [ownSettings, setOwnSettings] = React.useState(() => resolveSettings(defaultSettings));
  const settings = React.useMemo(
    () => (settingsProp ? resolveSettings(settingsProp) : ownSettings),
    [settingsProp, ownSettings],
  );
  const settingsRef = React.useRef(settings);
  settingsRef.current = settings;
  const onSettingsChangeRef = React.useRef(onSettingsChange);
  onSettingsChangeRef.current = onSettingsChange;
  const controlledSettings = settingsProp !== undefined;
  const updateSettings = React.useCallback(
    (patch: Partial<OutlinerSettings>) => {
      const next = resolveSettings({ ...settingsRef.current, ...patch });
      settingsRef.current = next;
      if (!controlledSettings) setOwnSettings(next);
      onSettingsChangeRef.current?.(next);
    },
    [controlledSettings],
  );
  const keymap = React.useMemo(
    () => buildKeymap(settings.keyboard, settings.shortcuts),
    [settings.keyboard, settings.shortcuts],
  );
  // The note display setting is the session's starting point; the view menu writes it back.
  React.useLayoutEffect(() => {
    ol.setView((view) =>
      view.noteDisplay === settings.noteDisplay
        ? view
        : { ...view, noteDisplay: settings.noteDisplay },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.noteDisplay]);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [findOpen, setFindOpen] = React.useState(false);
  const [findSeed, setFindSeed] = React.useState<{ readonly query: string } | null>(null);
  // Zoom is reader state the host may own (e.g. ?zoom= in the URL for Back/Forward).
  const reported = React.useRef(ol.state.hoistedId);
  React.useEffect(() => {
    if (
      hoistedId !== undefined &&
      hoistedId !== ol.state.hoistedId &&
      hoistedId !== reported.current
    ) {
      reported.current = hoistedId;
      ol.dispatch({ type: "hoist", id: hoistedId });
    }
  }, [hoistedId, ol]);
  React.useEffect(() => {
    if (ol.state.hoistedId !== reported.current) {
      reported.current = ol.state.hoistedId;
      onHoistChange?.(ol.state.hoistedId);
    }
  }, [ol.state.hoistedId, onHoistChange]);
  const [editing, setEditing] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [paletteMode, setPaletteMode] = React.useState<PaletteMode>("all");
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [datePicker, setDatePicker] = React.useState<OutlinerUi["datePicker"]>(null);
  const [sheet, setSheet] = React.useState<ActionSheetRequest | null>(null);
  const [itemMenu, setItemMenu] = React.useState<ItemMenuRequest | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const direction = useResolvedDirection(rootRef, dir);
  const searchHelpId = React.useId();
  const labels = React.useMemo(() => resolveLabels(labelOverrides), [labelOverrides]);
  const host = React.useMemo<OutlinerHostSlots>(
    () => ({
      headerStart,
      onTitleChange,
      paletteGroups,
      searchScope,
      menuCommands,
      onExternalDrop,
      starredDocuments,
      linkFor,
      onAttach,
      onHistory,
      itemCommands,
      reservedShortcuts,
    }),
    [
      headerStart,
      onTitleChange,
      paletteGroups,
      searchScope,
      menuCommands,
      onExternalDrop,
      starredDocuments,
      linkFor,
      onAttach,
      onHistory,
      itemCommands,
      reservedShortcuts,
    ],
  );
  // ⌘K "Outline" group: find and replace, levels, settings (and the host's version history).
  const apple = useApplePlatform();
  const paletteHost = React.useMemo<OutlinerHostSlots>(() => {
    const hint = (id: ShortcutId) => primaryShortcut(keymap, id, apple);
    const levels = ([1, 2, 3, "all"] as const).map((n) => ({
      id: `levels-${n}`,
      label: labels.showLevels(n === "all" ? 0 : n),
      keywords: "fold depth expand collapse levels",
      icon: <ListTree />,
      hint: hint(n === "all" ? "levelsAll" : (`levels${n}` as ShortcutId)),
      run: () => showLevels(live.current.ol, uiRef.current, n),
    }));
    const group: OutlinerPaletteGroup = {
      heading: "Outline",
      commands: [
        {
          id: "find-replace",
          label: labels.findReplace,
          keywords: "find replace substitute rename",
          icon: <Replace />,
          hint: hint("findReplace"),
          run: () => uiRef.current.setFindOpen(true),
        },
        ...levels,
        {
          id: "settings",
          label: labels.settings,
          keywords: "preferences density font size bullet keyboard profile shortcuts remap",
          icon: <Settings2 />,
          hint: hint("settings"),
          run: () => uiRef.current.setSettingsOpen(true),
        },
        ...(onHistory
          ? [
              {
                id: "history",
                label: labels.versionHistory,
                keywords: "versions restore revisions",
                icon: <History />,
                run: onHistory,
              },
            ]
          : []),
      ],
    };
    return { ...host, paletteGroups: [...(host.paletteGroups ?? []), group] };
  }, [host, keymap, apple, labels, onHistory]);
  const live = React.useRef({ ol, labels, keymap, host });
  live.current = { ol, labels, keymap, host };
  /** Deep link to an item, as rich and plain text, with a toast that shows it. */
  const copyLink = React.useCallback((rawId: string) => {
    const { ol, labels, host } = live.current;
    const id = ol.commands.identityOf(rawId);
    const href = host.linkFor
      ? host.linkFor(id)
      : itemHref(id, ol.external?.qualify(id), window.location.href);
    const node = findOutlineNode(ol.latestNodes(), id)?.node;
    const title = inlineToPlain(node?.text ?? "") || labels.untitled;
    void writeLinkToClipboard(href, title).then(
      () =>
        toast.success(labels.copiedLink, {
          description: (
            <span className="block truncate font-mono text-[11px]" dir="ltr">
              {href}
            </span>
          ),
        }),
      () => toast(href),
    );
  }, []);

  /*
   * an Undo offer is bound to the history entry it was made at. Any undo, redo or new edit
   * replaces that entry; the toast is dismissed then, and a stale click does nothing.
   */
  const undoOffer = React.useRef<{ readonly id: string | number; readonly entry: unknown } | null>(
    null,
  );
  const offerUndo = React.useCallback((text: string, opts?: { readonly sticky?: boolean }) => {
    const { ol } = live.current;
    const entry = ol.historyTop();
    if (!entry) return;
    if (undoOffer.current) toast.dismiss(undoOffer.current.id);
    const id = toast(text, {
      duration: opts?.sticky ? Infinity : 5000,
      closeButton: opts?.sticky,
      ...(opts?.sticky ? { classNames: insideClose("center") } : {}),
      action: {
        label: live.current.labels.undoAction,
        onClick: () => {
          if (live.current.ol.historyTop() === entry) live.current.ol.dispatch({ type: "undo" });
        },
      },
      onDismiss: () => {
        if (undoOffer.current?.id === id) undoOffer.current = null;
      },
    });
    undoOffer.current = { id, entry };
    // The rows the toast is about stay visible above it: measured once the toast has laid out
    // and a row that just appeared has grown to its height (the base motion token).
    window.setTimeout(
      () => {
        const { state } = live.current.ol;
        const head = state.selectionAnchor ?? [...state.selection].at(-1) ?? state.caret?.id;
        if (head)
          keepClearOfToasts(
            rootRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(head)}"]`),
          );
      },
      motionTokens.base.duration * 1000 + 60,
    );
  }, []);
  const historyTop = ol.state.history.past.at(-1);
  React.useEffect(() => {
    const offer = undoOffer.current;
    if (offer && offer.entry !== live.current.ol.historyTop()) {
      toast.dismiss(offer.id);
      undoOffer.current = null;
    }
  }, [historyTop, ol.state.history.future]);

  const scroller = React.useRef<((id: string, align: "auto" | "center") => boolean) | null>(null);
  const scrollToRow = React.useCallback((id: string, align: "auto" | "center" = "auto") => {
    if (scroller.current?.(id, align)) return;
    const el = listRef.current?.querySelector(`[data-row="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: align === "center" ? "center" : "nearest" });
  }, []);
  const registerScroller = React.useCallback(
    (scroll: ((id: string, align: "auto" | "center") => boolean) | null) => {
      scroller.current = scroll;
    },
    [],
  );
  /*
   * focus return (focus.ts). Whenever focus leaves the tree or a field, where it was is
   * bookmarked (with the rows shown then, for the neighbour rule). Every overlay closes back to
   * that bookmark, or to a place it names, never to <body>, unless what it ran took focus.
   */
  const bookmark = React.useRef<{
    readonly place: FocusReturn;
    readonly rows: readonly OutlinerRow[];
  } | null>(null);
  /** A field is being given focus back (its row renders a frame or two later): nothing else takes it meanwhile. */
  const restoring = React.useRef(false);
  /** The caret Esc left a field with: Enter on that row resumes there, until the cursor moves on. */
  const leftCaret = React.useRef<Extract<FocusReturn, { kind: "text" }> | null>(null);
  if (leftCaret.current && ol.state.caret?.id !== leftCaret.current.id) leftCaret.current = null;
  const coarsePointer = () => !!window.matchMedia?.("(pointer: coarse)").matches;
  const takeBookmark = (el: Element) => {
    const { ol } = live.current;
    const place = bookmarkFor(el, {
      tree: listRef.current,
      cursor: () =>
        resolveTarget(ol.state, ol.viewRows(), false).cursor ??
        ol.state.selectionAnchor ??
        ol.state.hoistedId,
      coarse: coarsePointer(),
    });
    if (!place) return;
    bookmark.current = { place, rows: ol.rows };
    if (place.kind === "text") leftCaret.current = place;
  };
  /** The keyboard surface of the view shown: the tree, the board, the mind map, else the article's scroller. */
  const focusView = React.useCallback(() => {
    const root = rootRef.current;
    const surface =
      listRef.current ??
      root?.querySelector<HTMLElement>("[data-mindmap]") ??
      root?.querySelector<HTMLElement>("[data-outliner-scroll][tabindex]");
    surface?.focus({ preventScroll: true });
    return !!surface && document.activeElement === surface;
  }, []);
  /** Touch: the control an overlay came from, else the cursor row's ⋯, else the view menu, else the toolbar. */
  const focusTrigger = React.useCallback((element: HTMLElement | null) => {
    const root = rootRef.current;
    const { state } = live.current.ol;
    const actions = (id: string | null | undefined) =>
      id
        ? root?.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"] [data-row-actions]`)
        : null;
    const target =
      (element?.isConnected && !element.closest("[inert]") ? element : null) ||
      actions(state.selectionAnchor) ||
      [...state.selection].map(actions).find(Boolean) ||
      root?.querySelector<HTMLElement>("[data-view-menu-trigger]") ||
      root?.querySelector<HTMLElement>("[data-slot=outliner] > div button:not(:disabled)");
    target?.focus({ preventScroll: true });
  }, []);
  /** Put focus at `place` now. A row that is gone hands over to its neighbour; nothing lands on <body>. */
  const restoreFocus = React.useCallback(
    (place: FocusReturn | null, rows: readonly OutlinerRow[], named = false) => {
      const { ol } = live.current;
      if (place?.kind === "trigger") return focusTrigger(place.element);
      const exists = (id: string) => !!findOutlineNode(ol.latestNodes(), id);
      const shown = (id: string) =>
        ol.rowIndex.has(id) || !!rootRef.current?.querySelector(`[data-row="${CSS.escape(id)}"]`);
      if (place?.kind === "text" && !ol.readOnly && exists(place.id) && shown(place.id)) {
        const start = Math.min(place.anchor, place.head);
        const end = Math.max(place.anchor, place.head);
        ol.dispatch({
          type: "focus",
          id: place.id,
          start,
          end,
          ...(place.field === "note" ? { field: "note" as const } : {}),
        });
        setEditing(true);
        // The core caret has no direction: a backward selection gets it back once the field took
        // focus. A field that never appears (the row could not be edited) leaves focus on the view.
        let frames = 0;
        restoring.current = true;
        const settle = () => {
          const el = document.activeElement;
          if (
            isEditingField(el) &&
            el.dataset.field === place.field &&
            el.closest<HTMLElement>("[data-row]")?.dataset.row === place.id
          ) {
            restoring.current = false;
            if (place.head < place.anchor && el.selectionStart === start && el.selectionEnd === end)
              setFieldSelection(el, place);
          } else if (++frames < 10) requestAnimationFrame(settle);
          else {
            restoring.current = false;
            if (!el || el === document.body) focusView();
          }
        };
        requestAnimationFrame(settle);
        return;
      }
      const id = place ? place.id : null;
      const gone = !!id && !exists(id);
      // The view on screen decides what is shown (a board's cards, a mind map's nodes), else the list.
      const view = ol.viewRows();
      const target = gone ? neighbourOf(id, rows, (candidate) => view.rowIndex.has(candidate)) : id;
      setEditing(false);
      // A bookmark yields to a cursor something else moved meanwhile; a named row, or the neighbour of a gone one, is selected.
      const cursor = resolveTarget(ol.state, view, false).cursor;
      const select = named || gone || !cursor;
      if (select && target && view.rowIndex.has(target) && !ol.state.selection.has(target))
        ol.dispatch({ type: "select", id: target });
      if (!focusView()) {
        // A view still loading (the mind map's engine): try again for a few frames.
        let tries = 0;
        const retry = () => {
          if (
            focusView() ||
            ++tries > 30 ||
            (document.activeElement && document.activeElement !== document.body)
          )
            return;
          requestAnimationFrame(retry);
        };
        requestAnimationFrame(retry);
      }
      if (select && target && view.rowIndex.has(target)) scrollToRow(target);
    },
    [focusView, focusTrigger, scrollToRow],
  );
  const captureFocus = React.useCallback((): FocusReturn | null => {
    const active = document.activeElement;
    if (active && active !== document.body) takeBookmark(active);
    return bookmark.current?.place ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const returnFocus = React.useCallback(
    (event: Event | null, to?: FocusReturn | string | null) => {
      const saved = bookmark.current;
      // A row id: an overlay about that row goes back to where you were on it (a field's caret), else to the row.
      const named: FocusReturn | null =
        typeof to === "string"
          ? saved && saved.place.kind !== "trigger" && saved.place.id === to
            ? saved.place
            : { kind: "row", id: to }
          : (to ?? null);
      const place = named ?? saved?.place ?? null;
      const rows = saved?.rows ?? live.current.ol.rows;
      // Touch has no keyboard cursor: focusing the tree would select a row and drop the phone into
      // selection mode. The overlay hands focus back to its own trigger (never <body>).
      if (coarsePointer() && (place?.kind === "trigger" || (!to && event))) {
        requestAnimationFrame(() => {
          const active = document.activeElement;
          if (
            active &&
            active !== document.body &&
            active.isConnected &&
            !active.closest("[data-slot=drawer-content]")
          )
            return;
          focusTrigger(place?.kind === "trigger" ? place.element : null);
        });
        return;
      }
      event?.preventDefault();
      const before = document.activeElement;
      requestAnimationFrame(() => {
        const active = document.activeElement;
        // A place in the outline (the tree, a field) that the action itself focused stays put.
        const inPlace =
          active === listRef.current ||
          (isEditingField(active) && !!rootRef.current?.contains(active));
        const lost =
          !active ||
          active === document.body ||
          (active === before && !inPlace) ||
          !active.isConnected ||
          !!active.closest(
            "[data-slot$=menu-trigger],[data-slot=drawer-content],[data-slot=popover-content]",
          );
        if (!lost) return;
        restoreFocus(place, rows, !!named);
      });
    },
    [restoreFocus, focusTrigger],
  );
  /** Enter in row mode: back to the caret Esc left, else the end of the title. */
  const resumeEditing = React.useCallback(
    (id: string) => {
      const { ol } = live.current;
      const left = leftCaret.current;
      if (left && left.id === id) return restoreFocus(left, ol.rows);
      ol.dispatch({ type: "focus", id, start: ol.rowOf(id)?.node.text.length ?? 0 });
      setEditing(true);
    },
    [restoreFocus],
  );
  // A repeated sentence ("Indented" twice) must be read again: alternate a no-break space so the
  // live region's text actually changes.
  const announce = React.useCallback(
    (text: string) => setMessage((prev) => (prev === text ? `${text}\u00a0` : text)),
    [],
  );
  travelled.current = (direction) => announce(direction === "undo" ? labels.undone : labels.redone);
  const announceToggle = React.useCallback(
    (summary: ToggleSummary) => {
      const { labels } = live.current;
      if (summary.advanced.length) {
        const next = summary.advanced[0]!.next;
        const text = labels.nextOccurrence(
          next.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        );
        // The Undo toast speaks it (one live channel).
        offerUndo(text);
      } else announce(summary.completed ? labels.markedComplete : labels.markedIncomplete);
    },
    [offerUndo],
  );

  const ui = React.useMemo<OutlinerUi>(
    () => ({
      editing,
      setEditing,
      paletteOpen,
      setPaletteOpen,
      paletteMode,
      setPaletteMode,
      shortcutsOpen,
      setShortcutsOpen,
      searchOpen,
      setSearchOpen,
      listRef,
      rootRef,
      focusList: focusView,
      announce,
      datePicker,
      setDatePicker,
      searchHelpId,
      labels,
      offerUndo,
      scrollToRow,
      registerScroller,
      sheet,
      setSheet,
      returnFocus,
      captureFocus,
      resumeEditing,
      announceToggle,
      host: paletteHost,
      settings,
      updateSettings,
      keymap,
      settingsOpen,
      setSettingsOpen,
      findOpen,
      setFindOpen,
      copyLink,
      itemMenu,
      setItemMenu,
    }),
    [
      editing,
      paletteOpen,
      paletteMode,
      shortcutsOpen,
      searchOpen,
      datePicker,
      searchHelpId,
      labels,
      offerUndo,
      scrollToRow,
      registerScroller,
      sheet,
      returnFocus,
      captureFocus,
      resumeEditing,
      focusView,
      announceToggle,
      paletteHost,
      settings,
      updateSettings,
      keymap,
      settingsOpen,
      findOpen,
      copyLink,
      itemMenu,
    ],
  );

  /** Reveal (unfold, zoom out if needed), select and scroll to an item; `edit` puts the caret in it. */
  const focusItem = (id: string, opts?: { readonly edit?: boolean }) => {
    const { ol } = live.current;
    const path = getOutlinePath(ol.latestNodes(), id);
    if (!path.length) return false;
    if (ol.state.hoistedId && !path.some((node) => node.id === ol.state.hoistedId))
      ol.dispatch({ type: "hoist", id: null });
    ol.dispatch({ type: "reveal", id });
    if (opts?.edit && !ol.readOnly) {
      ol.dispatch({ type: "focus", id, start: path.at(-1)!.text.length });
      setEditing(true);
    } else {
      ol.dispatch({ type: "select", id });
      setEditing(false);
      requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
    }
    requestAnimationFrame(() => scrollToRow(id, "center"));
    return true;
  };
  React.useImperativeHandle(
    ref,
    (): OutlinerHandle => ({
      focus: () => listRef.current?.focus({ preventScroll: true }),
      restoreFocus: () => uiRef.current.returnFocus(null),
      focusItem: (id, opts) => focusItem(id, opts),
      openLink: (id) => {
        const { ol } = live.current;
        const target = deepLinkTarget(ol.latestNodes(), id);
        if (!target) return false;
        if (ol.state.hoistedId !== target.zoom) ol.dispatch({ type: "hoist", id: target.zoom });
        // After the zoom lands (its own effect picks a cursor row): the leaf wins.
        const select = target.select;
        if (select) requestAnimationFrame(() => focusItem(select));
        return true;
      },
      zoomTo: (id) => live.current.ol.dispatch({ type: "hoist", id }),
      getValue: () => live.current.ol.latestNodes(),
      undo: () => live.current.ol.dispatch({ type: "undo" }),
      redo: () => live.current.ol.dispatch({ type: "redo" }),
      search: (query) => {
        live.current.ol.setView((view) => ({ ...view, query }));
        setSearchOpen(!!query);
      },
      exportAs: (format) => live.current.ol.commands.exportAs(format),
      print: () => requestPrint(rootRef, live.current.ol.state.hoistedId),
      insertItems: (nodes) => {
        const { ol } = live.current;
        if (!nodes.length || ol.readOnly) return [];
        const roots = ol.latestNodes();
        const before = new Set(roots.map((node) => node.id));
        // After the last top-level item (never inside a zoomed one): the end of the document.
        const last = roots.at(-1);
        ol.commands.importJSON(
          exportOutline(nodes, "json"),
          last && last.id !== ol.state.hoistedId ? last.id : undefined,
        );
        return ol
          .latestNodes()
          .filter((node) => !before.has(node.id))
          .map((node) => node.id);
      },
      updateItem: (id, changes) => {
        const { ol } = live.current;
        if (
          !changes ||
          Object.keys(changes).some((key) => !["text", "checked", "data"].includes(key))
        )
          return false;
        const before = ol.latestNodes();
        const next = ol.dispatch({
          type: "transaction",
          focus: false,
          commands: [{ type: "update", id, changes }],
        });
        return !next.refusal && ol.latestNodes() !== before;
      },
      removeItems: (ids) => {
        const { ol } = live.current;
        if (!ids.length) return false;
        const before = ol.latestNodes();
        const next = ol.dispatch({ type: "delete", ids });
        return !next.refusal && next.nodes !== before;
      },
      replace: (nodes, opts) => {
        const { ol } = live.current;
        const before = ol.latestNodes();
        if (opts?.carried) carryIds(nodes, opts.carried);
        const next = ol.dispatch({ type: "replace", nodes });
        return !next.refusal && next.nodes !== before;
      },
      history: () => live.current.ol.historyStacks(),
      find: (query) => {
        setFindSeed(query === undefined ? null : { query });
        setFindOpen(true);
      },
    }),
    [scrollToRow],
  );
  const uiRef = React.useRef(ui);
  uiRef.current = ui;

  // Surface refusals (locked, read-only) as a quiet toast rather than a silent no-op.
  const refusal = ol.state.refusal;
  React.useEffect(() => {
    if (!refusal) return;
    const text =
      refusal === "locked"
        ? labels.locked
        : refusal === "read-only"
          ? labels.readOnly
          : refusal === "descendant-move"
            ? labels.cannotMoveInside
            : null;
    if (text) toast(text, { id: "outliner-refusal", icon: <Lock className="size-3.5" /> });
  }, [refusal, ol.state]);

  // a controlled host's veto is never silent: one deduplicated notice, also announced.
  const rejection = ol.rejection;
  React.useEffect(() => {
    if (!rejection) return;
    // One live channel: the toast region speaks it (announcing it here too read it twice).
    toast(labels.changeRejected(rejection.count), {
      id: "outliner-veto",
      icon: <Ban className="size-3.5" />,
    });
  }, [rejection, labels]);

  /*
   * Keys on <body> (after a dialog, Back, a fresh load): ⌘K / ⌘F / ⌘/, undo, ↓ and "/" reach this
   * outliner when it was the last one used, or it is the only one mounted and not inert.
   */
  const lastActive = React.useRef(false);
  React.useEffect(() => (rootRef.current ? registerOutliner(rootRef.current) : undefined), []);
  // The live title field's code arrives while the page is idle, before the first edit asks for it.
  React.useEffect(() => {
    if (ol.readOnly) return;
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => void loadLiveField().catch(() => {}));
    return () => cancel(id);
  }, [ol.readOnly]);
  React.useEffect(() => {
    const onPointer = (event: Event) => {
      // Dialogs portal outside the root; they don't count as leaving the outliner.
      const target = event.target as Element | null;
      if (target?.closest?.("[role=dialog]")) return;
      lastActive.current = !!rootRef.current?.contains(target);
    };
    const onKey = (event: KeyboardEvent) => {
      if (document.activeElement !== document.body || event.defaultPrevented) return;
      // A workspace keeps other documents mounted but inert: they never answer the keyboard.
      if (rootRef.current?.closest("[inert]")) return;
      if (!lastActive.current && !isSoleOutliner(rootRef.current)) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && (key === "z" || (key === "y" && event.ctrlKey && !event.metaKey))) {
        // Focus fell back to <body> after something inside the outliner: undo still works.
        event.preventDefault();
        live.current.ol.dispatch({ type: key === "y" || event.shiftKey ? "redo" : "undo" });
      } else if (matchShortcut(live.current.keymap, event, "global")) {
        event.preventDefault();
        runGlobalShortcut(matchShortcut(live.current.keymap, event, "global")!, {
          ui: uiRef.current,
        });
      } else if (!mod && (key === "arrowdown" || key === "arrowup" || key === "j" || key === "k")) {
        listRef.current?.focus();
      } else if ((key === "/" && !mod && !event.altKey) || isItemMenuKey(event)) {
        // A "/" typed while a closing menu still holds focus on <body> (one frame): once focus is
        // back, it opens the item menu as it would have on the tree.
        event.preventDefault();
        const init = {
          key: event.key,
          code: event.code,
          shiftKey: event.shiftKey,
          bubbles: true,
          cancelable: true,
        };
        afterFocusReturn(() => {
          if (document.activeElement === document.body) focusView();
          if (document.activeElement === listRef.current)
            listRef.current!.dispatchEvent(new KeyboardEvent("keydown", init));
        });
      }
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("focusin", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("focusin", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [focusView]);
  // A remote replacement can remove the last editing target (or a collaboration binding
  // can explicitly clear it). The outgoing row may still own focus while it animates out;
  // end that editing session now, without taking focus from another control or workspace.
  React.useLayoutEffect(() => {
    if (!editing || ol.state.caret) return;
    setEditing(false);
    const root = rootRef.current;
    if (!lastActive.current || restoring.current || root?.closest("[inert]")) return;
    const active = document.activeElement;
    const row = active?.closest<HTMLElement>("[data-row]")?.dataset.row;
    const outgoing =
      !!root?.contains(active) && row !== undefined && !findOutlineNode(ol.state.nodes, row);
    if (active && active !== document.body && active.isConnected && !outgoing) return;
    if (coarsePointer()) focusTrigger(null);
    else focusView();
  }, [editing, ol.state.caret, ol.state.nodes, focusTrigger, focusView]);
  /*
   * Zooming into a board or a mind map (or "View as" switching the view) unmounts the tree that
   * had focus, and the browser drops it on <body>: the new view's surface takes it. A view that
   * loads lazily (the mind map's engine) gets a few frames to appear.
   */
  const viewKey = `${ol.state.hoistedId ?? ""}:${ol.hoisted ? shownView(ol, ol.hoisted) : "list"}:${ol.view.query.trim() ? "search" : ""}`;
  React.useEffect(() => {
    if (coarsePointer()) return;
    let frame = 0;
    let tries = 0;
    const rescue = () => {
      if (document.activeElement !== document.body || !lastActive.current || restoring.current)
        return;
      if (!focusView() && ++tries < 30) frame = requestAnimationFrame(rescue);
    };
    frame = requestAnimationFrame(rescue);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);
  // Closing a dialog returns focus to the document (unless something else took it).
  const overlayOpen = paletteOpen || shortcutsOpen;
  // The selection a dialog was opened over comes back when it closes (if nothing replaced it).
  const savedSelection = React.useRef<readonly string[]>([]);
  React.useEffect(() => {
    if (overlayOpen) {
      captureFocus();
      setEditing(false);
      savedSelection.current = [...ol.state.selection];
      return;
    }
    const saved = savedSelection.current;
    if (
      saved.length &&
      !ol.state.selection.size &&
      !editing &&
      saved.every((id) => ol.rows.some((row) => row.id === id))
    ) {
      ol.dispatch({ type: "select", id: saved[0]! });
      for (const id of saved.slice(1)) ol.dispatch({ type: "select", id, toggle: true });
    }
    savedSelection.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayOpen]);
  React.useEffect(() => {
    if (overlayOpen) return;
    const id = requestAnimationFrame(() => {
      // The same place the dialog's own close returns to (whichever runs first wins; the other sees focus home).
      if (
        document.activeElement === document.body &&
        lastActive.current &&
        !restoring.current &&
        !coarsePointer()
      )
        restoreFocus(
          bookmark.current?.place ?? null,
          bookmark.current?.rows ?? live.current.ol.rows,
        );
    });
    return () => cancelAnimationFrame(id);
  }, [overlayOpen]);

  // Global document shortcuts while focus is anywhere inside the outliner.
  const onRootKeyDown = (event: React.KeyboardEvent) => {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const target = event.target as HTMLElement;
    // Safety valve: "editing" with no editor mounted (it never appeared) must not trap the keyboard.
    if (
      key === "escape" &&
      editing &&
      !isEditingField(target) &&
      target.tagName !== "TEXTAREA" &&
      !target.closest("[role=dialog]")
    ) {
      setEditing(false);
      return;
    }
    // F6 / ⇧F6: the next region (sidebar → toolbar → search → tree). Tab stays indent.
    if (
      event.key === "F6" &&
      !mod &&
      !event.altKey &&
      !event.defaultPrevented &&
      !isComposingKey(event)
    ) {
      if (cycleRegion(target, event.shiftKey)) event.preventDefault();
      return;
    }
    if (
      mod &&
      (key === "z" || (key === "y" && event.ctrlKey && !event.metaKey)) &&
      !event.defaultPrevented
    ) {
      // ⌘Z / ⇧⌘Z from anywhere in the outliner (zoomed-title checkbox, toolbar, crumbs). Row
      // fields and the tree handle their own; native inputs (search, palette) keep native undo.
      if (target.tagName === "INPUT" || (target.isContentEditable ?? false)) return;
      event.preventDefault();
      ol.dispatch({ type: key === "y" || event.shiftKey ? "redo" : "undo" });
    } else if (!event.defaultPrevented) {
      // ⌘K, ⌘F, ⌘/, ⌘⇧M, ⌥⌘F … whatever the keymap says (remaps included).
      const action = matchShortcut(keymap, event, "global");
      if (action && runGlobalShortcut(action, { ui })) event.preventDefault();
      else if (
        !isEditingField(target) &&
        target.tagName !== "TEXTAREA" &&
        target.tagName !== "INPUT" &&
        !target.isContentEditable
      ) {
        // From the toolbar, the zoomed title, a menu button: the actions that need no row.
        const rowless = matchShortcut(keymap, event, "row");
        if (
          rowless &&
          ROWLESS_SHORTCUTS.has(rowless) &&
          runItemShortcut(rowless, { ol, ui, ids: [], rowId: null })
        )
          event.preventDefault();
      }
    }
  };

  return (
    <OutlinerContext.Provider value={{ ol, ui }}>
      <RichContentProvider renderers={renderers}>
        <DirectionScope dir={direction}>
          <MotionConfig reducedMotion="user">
            <div
              ref={rootRef}
              dir={dir}
              onKeyDown={onRootKeyDown}
              // ⇧F10 / the ContextMenu key opened the item menu: no browser menu on top of it.
              onContextMenu={suppressKeyboardContextMenu}
              onBlur={(event) => {
                // Where focus was (the tree, a field and its selection): overlays hand it back.
                takeBookmark(event.target);
                // Field swaps (title ⇄ note, row → row) unmount the focused textarea, which blurs
                // with no relatedTarget. Decide after the swap settles, from the real active element.
                requestAnimationFrame(() => {
                  const active = document.activeElement;
                  // A field's own popup (a chip's editor) keeps the field: it hands focus straight back.
                  if (active?.closest("[data-field-overlay]")) return;
                  if (
                    !rootRef.current?.contains(active) ||
                    (!isEditingField(active) &&
                      active?.tagName !== "TEXTAREA" &&
                      !(active as HTMLElement | null)?.isContentEditable)
                  )
                    setEditing(false);
                });
              }}
              data-slot="outliner"
              data-density={settings.density}
              data-font-size={settings.fontSize}
              data-keyboard={settings.keyboard}
              style={settingsStyle(settings) as React.CSSProperties}
              className={cn(
                "group/outliner relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-surface text-ui text-foreground [--ol-indent:22px] max-sm:[--ol-indent:16px]",
                className,
              )}
            >
              {toolbar && <OutlinerHeader title={title} />}
              <FindReplaceBar seed={findSeed} />
              <OutlinerSettingsPanel />
              <SearchHelp />
              <OutlinerErrorBoundary>
                <OutlinerBody title={title} placeholder={placeholder} />
              </OutlinerErrorBoundary>
              <OutlinerStatusBar />
              <OutlinerBulkBar />
              <OutlinerMobileBar />
              <OutlinerCommandPalette />
              <OutlinerShortcuts />
              <OutlinerDatePicker />
              <OutlinerActionSheet />
              <OutlinerItemMenu />
              <div aria-live="polite" className="sr-only">
                {message}
              </div>
            </div>
          </MotionConfig>
        </DirectionScope>
      </RichContentProvider>
    </OutlinerContext.Provider>
  );
}

/** A render fault in the document shows a calm recovery panel instead of a white screen. */
class OutlinerErrorBoundary extends React.Component<
  { readonly children: React.ReactNode },
  { readonly error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="grid flex-1 place-items-center p-8">
        <div className="max-w-sm text-center">
          <p className="font-medium">This view hit a problem.</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Your document is unchanged. Re-render the view to continue.
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => this.setState({ error: null })}
          >
            Re-render
          </Button>
        </div>
      </div>
    );
  }
}

/* ───────────────────────────── Header ───────────────────────────── */

function OutlinerHeader({ title }: { readonly title: string }) {
  const { isMac, modKey } = usePlatformKeys();
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const crumbs = ol.breadcrumbs;
  // on a phone an open search takes the whole toolbar row (crumbs and menus step aside).
  const narrow = useMediaQuery("(max-width: 639px)");
  const phoneSearch = narrow && (ui.searchOpen || !!ol.view.query);
  return (
    <div
      data-outliner-toolbar=""
      data-focus-region="toolbar"
      className="flex h-11 shrink-0 items-center gap-1 border-b border-hairline px-2 coarse:gap-0 coarse:px-1"
    >
      {ui.host.headerStart && (
        <div className={cn("flex shrink-0 items-center", phoneSearch && "hidden")}>
          {ui.host.headerStart}
        </div>
      )}
      <nav
        aria-label="Breadcrumb"
        className={cn("flex min-w-0 flex-1 items-center", phoneSearch && "hidden")}
      >
        <AnimatePresence initial={false}>
          {crumbs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={motionTokens.quick}
              className="shrink-0 overflow-hidden"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={L.zoomOut}
                    onClick={() => ol.dispatch({ type: "hoist", id: crumbs.at(-2)?.id ?? null })}
                  >
                    <CornerUpLeft />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {L.zoomOut} <Kbd dir="ltr">{modKey}[</Kbd>
                </TooltipContent>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>
        <ol className="flex min-w-0 items-center gap-0.5 text-ui">
          <li className="flex min-w-0 items-center">
            <button
              type="button"
              onClick={() => ol.dispatch({ type: "hoist", id: null })}
              className={cn(
                "flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-muted",
                crumbs.length ? "text-muted-foreground hover:text-foreground" : "font-medium",
              )}
            >
              <Home className="size-3.5 shrink-0 opacity-70" />
              <span className="truncate max-sm:sr-only">{title}</span>
            </button>
          </li>
          <AnimatePresence initial={false}>
            {crumbs.map((node, index) => {
              const last = index === crumbs.length - 1;
              // Collapse the middle of long paths on narrow screens.
              const middle = index > 0 && index < crumbs.length - 1;
              return (
                <motion.li
                  key={node.id}
                  layout="position"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={motionTokens.quick}
                  className={cn("flex min-w-0 items-center", middle && "max-md:hidden")}
                >
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 rtl:rotate-180" />
                  <button
                    type="button"
                    aria-current={last ? "page" : undefined}
                    onClick={() => ol.dispatch({ type: "hoist", id: node.id })}
                    className={cn(
                      "h-7 max-w-48 truncate rounded-md px-1.5 transition-colors hover:bg-muted",
                      last
                        ? "font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {inlineToPlain(node.text) || "Untitled"}
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </nav>
      <OutlinerSearchField wide={phoneSearch} />
      {/* A phone's search takes the toolbar; the bookmarks stay beside it, so the query in the
          field can be saved (and a saved one chosen) without leaving search. */}
      {phoneSearch && <OutlinerBookmarksMenu />}
      <div className={cn("flex items-center gap-0.5", phoneSearch && "hidden")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={L.undo}
              disabled={!ol.canUndo || ol.readOnly}
              onClick={() => ol.dispatch({ type: "undo" })}
              className="max-sm:hidden"
            >
              <Undo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {L.undo} <Kbd dir="ltr">{modKey}Z</Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={L.redo}
              disabled={!ol.canRedo || ol.readOnly}
              onClick={() => ol.dispatch({ type: "redo" })}
              className="max-sm:hidden"
            >
              <Redo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {L.redo} <Kbd dir="ltr">{isMac ? "⇧⌘Z" : "Ctrl Y"}</Kbd>
          </TooltipContent>
        </Tooltip>
        {!phoneSearch && <OutlinerBookmarksMenu />}
        <ViewMenu />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="ms-1 gap-1.5 px-2 text-muted-foreground max-sm:hidden"
              onClick={() => {
                ui.setPaletteMode("all");
                ui.setPaletteOpen(true);
              }}
            >
              <span className="text-ui">{L.commands}</span>
              <Kbd dir="ltr" className="h-4 px-1 font-sans text-[10.5px]">
                {modKey}K
              </Kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Commands &amp; jump to item</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function OutlinerSearchField({ wide = false }: { readonly wide?: boolean }) {
  const { modKey } = usePlatformKeys();
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const input = React.useRef<HTMLInputElement>(null);
  const open = ui.searchOpen || !!ol.view.query;
  React.useEffect(() => {
    if (!ui.searchOpen) return;
    input.current?.focus();
    // Reopened over a query: select it, so typing replaces it (as ⌘F into an open field does).
    input.current?.select();
  }, [ui.searchOpen]);
  /*
   * Enter / ⇧Enter step to the next / previous match and wrap; the field keeps focus so
   * the next Enter steps again, and ↓ takes you into the tree on the match. The first Enter for
   * a query starts at the first (⇧: the last) match.
   */
  const stepped = React.useRef<string | null>(null);
  const stepMatch = (back: boolean) => {
    const matches = ol.rows.filter((row) => !row.context);
    if (!matches.length) return;
    const query = ol.view.query;
    const cursor = resolveTarget(ol.state, ol, false).cursor;
    const at =
      stepped.current === query && cursor ? matches.findIndex((row) => row.id === cursor) : -1;
    const next =
      at < 0
        ? back
          ? matches.length - 1
          : 0
        : (at + (back ? -1 : 1) + matches.length) % matches.length;
    stepped.current = query;
    const id = matches[next]!.id;
    ol.dispatch({ type: "select", id });
    ui.scrollToRow(id);
    ui.announce(
      `${L.matchPosition(next + 1, matches.length)}: ${inlineToSpeech(matches[next]!.node.text) || L.untitled}`,
    );
  };
  const reportQuery = ui.host.searchScope?.onQueryChange;
  React.useEffect(() => reportQuery?.(ol.view.query), [reportQuery, ol.view.query]);
  // A half-typed operator ("due:") is unfinished, not wrong: the help strip offers completions.
  const completing = React.useMemo(
    () => searchSuggestions(ol.view.query).length > 0,
    [ol.view.query],
  );
  const diagnostics = completing ? [] : (ol.search?.diagnostics ?? []);
  const scope = ui.host.searchScope;
  const everywhere = scope?.value === "all";
  const count =
    everywhere && scope.count ? scope.count(ol.view.query) : (ol.search?.matchedIds.length ?? 0);
  const dated = /(?:^|\s)-?(?:due|before|after|during):|has:dates?\b/i.test(ol.view.query);
  const setMode = (mode: "filter" | "flat" | "agenda") =>
    ol.setView((view) => ({ ...view, searchMode: view.searchMode === mode ? "filter" : mode }));
  const iconButton =
    "relative me-0.5 grid size-6 shrink-0 place-items-center rounded-[5px] after:absolute coarse:size-8 coarse:after:-inset-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  return (
    <div className={cn("flex items-center", wide && "min-w-0 flex-1")}>
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.div
            key="field"
            initial={{ opacity: 0, width: 32 }}
            animate={{ opacity: 1, width: wide ? "100%" : "var(--search-w)" }}
            exit={{ opacity: 0, width: 32 }}
            transition={motionTokens.base}
            className="relative flex h-8 items-center overflow-hidden rounded-md border bg-background [--search-w:min(18rem,46vw)] focus-within:border-signal/60 focus-within:ring-3 focus-within:ring-signal/15 coarse:h-10"
          >
            <Search className="ms-2 size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={input}
              value={ol.view.query}
              data-focus-region="search"
              aria-label={L.searchOutline}
              aria-invalid={diagnostics.length > 0}
              aria-describedby={ui.searchHelpId}
              placeholder={L.searchPlaceholder}
              dir="auto"
              onChange={(event) => ol.setView((view) => ({ ...view, query: event.target.value }))}
              onKeyDown={(event) => {
                if (isComposingKey(event)) return;
                const completion =
                  event.key === "Tab" && !event.shiftKey
                    ? searchSuggestions(ol.view.query)[0]
                    : undefined;
                if (completion) {
                  // Tab completes the operator or value being typed (shown in the help strip).
                  event.preventDefault();
                  ol.setView((view) => ({ ...view, query: completion.query }));
                } else if (event.key === "Escape") {
                  event.stopPropagation();
                  ol.setView((view) => ({ ...view, query: "" }));
                  ui.setSearchOpen(false);
                  // Back where search was opened from: the tree row, or the field and its caret.
                  ui.returnFocus(null);
                } else if (event.key === "Enter" && event.altKey) {
                  // Flat results (⌥↵; ⇧↵ steps back through the matches).
                  event.preventDefault();
                  setMode("flat");
                } else if ((event.key === "ArrowDown" || event.key === "Enter") && everywhere) {
                  // All documents: into the results list (the host's), first result.
                  event.preventDefault();
                  ui.rootRef.current
                    ?.querySelector<HTMLElement>("[data-scope-results] [data-scope-result]")
                    ?.focus();
                } else if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
                  event.preventDefault();
                  stepMatch(event.shiftKey);
                } else if (event.key === "ArrowDown") {
                  // Into the tree: on the match Enter stepped to, else the first match.
                  event.preventDefault();
                  const cursor = resolveTarget(ol.state, ol, false).cursor;
                  const onMatch =
                    stepped.current === ol.view.query &&
                    ol.rows.some((row) => row.id === cursor && !row.context);
                  const first = ol.rows.find((row) => !row.context);
                  if (!onMatch && first) ol.dispatch({ type: "select", id: first.id });
                  ui.focusList();
                }
              }}
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-ui outline-none placeholder:text-muted-foreground/70 coarse:text-[16px]"
            />
            {ol.view.query && (
              <span
                aria-live="off"
                className={cn(
                  "me-1 shrink-0 font-mono text-[11px] tabular-nums",
                  diagnostics.length ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {completing ? (
                  <span className="font-sans text-ui text-muted-foreground/80">…</span>
                ) : diagnostics.length ? (
                  "invalid"
                ) : (
                  `${count}${ol.search?.truncated ? "+" : ""}`
                )}
              </span>
            )}
            {scope && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={everywhere}
                    aria-label={`${L.searchScope}: ${everywhere ? L.allDocuments : L.thisDocument}`}
                    onClick={() => scope.onChange(everywhere ? "document" : "all")}
                    className={cn(
                      iconButton,
                      everywhere &&
                        "bg-signal-muted text-signal hover:bg-signal-muted hover:text-signal",
                    )}
                  >
                    <Files className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{everywhere ? L.allDocuments : L.thisDocument}</TooltipContent>
              </Tooltip>
            )}
            {dated && !everywhere && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={ol.view.searchMode === "agenda"}
                    aria-label={L.agenda}
                    onClick={() => setMode("agenda")}
                    className={cn(
                      iconButton,
                      ol.view.searchMode === "agenda" &&
                        "bg-signal-muted text-signal hover:bg-signal-muted hover:text-signal",
                    )}
                  >
                    <CalendarDays className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{L.agenda}</TooltipContent>
              </Tooltip>
            )}
            {!everywhere && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={ol.view.searchMode === "flat"}
                    aria-label={L.flatResults}
                    onClick={() => setMode("flat")}
                    className={cn(
                      iconButton,
                      ol.view.searchMode === "flat" &&
                        "bg-signal-muted text-signal hover:bg-signal-muted hover:text-signal",
                    )}
                  >
                    <ListTree className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {ol.view.searchMode === "flat" ? L.showInOutline : L.flatResults}{" "}
                  <Kbd dir="ltr">⌥↵</Kbd>
                </TooltipContent>
              </Tooltip>
            )}
            <button
              type="button"
              aria-label={L.closeSearch}
              onClick={() => {
                ol.setView((view) => ({ ...view, query: "" }));
                ui.setSearchOpen(false);
                // This button leaves with the field: focus goes back, never to <body>.
                ui.returnFocus(null);
              }}
              className={cn(iconButton, "me-1")}
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={L.search}
                  onClick={() => ui.setSearchOpen(true)}
                >
                  <Search />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {L.search} <Kbd dir="ltr">{modKey}F</Kbd>
              </TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ViewMenu() {
  const { isMac, modKey } = usePlatformKeys();
  const { ol, ui } = useOutlinerContext();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const coarse = useMediaQuery("(pointer: coarse)");
  const narrow = useMediaQuery("(max-width: 639px)");
  const download = (format: "markdown" | "opml" | "json") => {
    const text = ol.commands.exportAs(format);
    const blob = new Blob([text], { type: format === "opml" ? "text/x-opml" : "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `outline.${format === "markdown" ? "md" : format}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const hint = (id: ShortcutId) => primaryShortcut(ui.keymap, id, isMac);
  const entries: MenuEntry[] = [
    // A phone has no ⌘K and no room for the Commands button: the palette (jump to item,
    // move to, every action) opens from here.
    ...(coarse || narrow
      ? [
          {
            kind: "item",
            id: "commands",
            label: ui.labels.commands,
            icon: <Command />,
            surface: true,
            run: () => (ui.setPaletteMode("all"), ui.setPaletteOpen(true)),
          } satisfies MenuEntry,
        ]
      : []),
    ...(ui.host.menuCommands ?? []).map((command): MenuEntry => ({
      kind: "item",
      id: `host-${command.id}`,
      label: command.label,
      icon: command.icon,
      hint: command.hint,
      surface: true,
      run: command.run,
    })),
    ...(coarse || narrow || ui.host.menuCommands?.length
      ? [{ kind: "separator", id: "sep-host" } satisfies MenuEntry]
      : []),
    { kind: "label", id: "label-view", label: "View" },
    {
      kind: "item",
      id: "expand-all",
      label: "Expand all",
      icon: <ChevronsUpDown />,
      run: () => ol.dispatch({ type: "expand-all", expanded: true }),
    },
    {
      kind: "item",
      id: "collapse-all",
      label: "Collapse all",
      icon: <ChevronsDownUp />,
      run: () => ol.dispatch({ type: "expand-all", expanded: false }),
    },
    {
      kind: "page",
      id: "levels",
      label: ui.labels.levelsMenu,
      icon: <ListTree />,
      entries: ([1, 2, 3, "all"] as const).map((levels): MenuEntry => ({
        kind: "item",
        id: `levels-${levels}`,
        label: ui.labels.showLevels(levels === "all" ? 0 : levels),
        hint: hint(levels === "all" ? "levelsAll" : `levels${levels}`),
        run: () => showLevels(ol, ui, levels),
      })),
    },
    {
      kind: "item",
      id: "hide-completed",
      label: "Hide completed",
      icon: <EyeOff />,
      checked: ol.view.hideCompleted,
      hint: hint("hideCompleted"),
      run: () => toggleHideCompleted(ol, ui),
    },
    {
      kind: "page",
      id: "notes",
      label: "Notes",
      icon: <StickyNote />,
      // The settings own the note display: the menu and the panel stay one value.
      radio: {
        value: ol.view.noteDisplay,
        onChange: (value) =>
          ui.updateSettings({ noteDisplay: value as typeof ol.view.noteDisplay }),
      },
      entries: [
        { kind: "item", id: "show", label: "Show full notes", run: () => undefined },
        { kind: "item", id: "first-line", label: "First line only", run: () => undefined },
        { kind: "item", id: "hide", label: "Hide notes", run: () => undefined },
      ],
    },
    { kind: "separator", id: "sep-document" },
    { kind: "label", id: "label-document", label: "Document" },
    {
      kind: "page",
      id: "export",
      label: "Export",
      icon: <FileDown />,
      entries: [
        {
          kind: "item",
          id: "copy-markdown",
          label: "Copy as Markdown",
          run: async () => {
            await navigator.clipboard.writeText(ol.commands.copyMarkdown());
            toast.success("Copied as Markdown");
          },
        },
        { kind: "item", id: "download-md", label: "Download .md", run: () => download("markdown") },
        { kind: "item", id: "download-opml", label: "Download .opml", run: () => download("opml") },
        { kind: "item", id: "download-json", label: "Download .json", run: () => download("json") },
      ],
    },
    {
      kind: "item",
      id: "print",
      label: ui.labels.print,
      icon: <Printer />,
      run: () => window.setTimeout(() => printCurrent(ol, ui), 180),
    },
    {
      kind: "item",
      id: "import",
      label: ui.labels.importFile,
      icon: <FileUp />,
      disabled: ol.readOnly,
      run: () => fileInput.current?.click(),
    },
    {
      kind: "item",
      id: "find-replace",
      label: ui.labels.findReplace,
      icon: <Replace />,
      hint: hint("findReplace"),
      surface: true,
      run: () => ui.setFindOpen(true),
    },
    ...(ui.host.onHistory
      ? [
          {
            kind: "item",
            id: "history",
            label: ui.labels.versionHistory,
            icon: <History />,
            surface: true,
            run: () => ui.host.onHistory?.(),
          } satisfies MenuEntry,
        ]
      : []),
    { kind: "separator", id: "sep-settings" },
    {
      kind: "item",
      id: "settings",
      label: ui.labels.settings,
      icon: <Settings2 />,
      hint: hint("settings"),
      surface: true,
      run: () => ui.setSettingsOpen(true),
    },
    {
      kind: "item",
      id: "shortcuts",
      label: "Keyboard shortcuts",
      icon: <Keyboard />,
      hint: hint("shortcuts") ?? `${modKey}/`,
      surface: true,
      run: () => ui.setShortcutsOpen(true),
    },
  ];
  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".opml,.xml,.md,.txt,.json,.html,.htm"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const text = await file.text();
          // A saved web page or doc export reads through the inert HTML importer.
          const html = /\.html?$/i.test(file.name);
          const count = html
            ? ol.commands.importHtml(text, ol.rows.at(-1)?.id)
            : ol.commands.importText(text, ol.rows.at(-1)?.id);
          // The count, plus what did not survive (unknown OPML attributes, images, embeds …).
          // Items counted with their children (the command reports the top-level ones).
          reportImport(text, html ? { format: "html", items: count } : {});
          event.target.value = "";
        }}
      />
      <ResponsiveMenu
        touch={coarse}
        title={ui.labels.viewOptionsTitle}
        backLabel={ui.labels.back}
        tooltip="View & document"
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={ui.labels.viewOptions}
            data-view-menu-trigger=""
          >
            <MoreHorizontal />
          </Button>
        }
        onCloseAutoFocus={(event) => ui.returnFocus(event)}
        entries={entries}
      />
    </>
  );
}

/* ───────────────────────────── Body / list ───────────────────────────── */

function OutlinerBody({
  title,
  placeholder,
}: {
  readonly title: string;
  readonly placeholder?: string;
}) {
  const { ol, ui } = useOutlinerContext();
  const drag = useRowDrag();
  const hoisted = ol.hoisted;
  const selection = ol.state.selection;
  const caretId = ui.editing ? ol.state.caret?.id : undefined;
  // One cursor (target.ts): the row the next key acts on is the one drawn and announced.
  const target = resolveTarget(ol.state, ol, ui.editing);
  const litCursor = ui.editing ? null : target.cursor;
  // The cursor row's parent guide lights up (the chain of guides the cursor sits on).
  const litParents = React.useMemo(() => {
    const cursor = caretId ?? litCursor;
    const chain = new Set<string>();
    if (!cursor) return chain;
    const byId = (id: string) => ol.rows[ol.rowIndex.get(id) ?? -1];
    for (let row = byId(cursor); row?.parentId; row = byId(row.parentId)) chain.add(row.parentId);
    return chain;
  }, [caretId, litCursor, ol.rows, ol.rowIndex]);
  // A row's guides light from its parent upward while that ancestor is on the cursor's path.
  const rowIndex = ol.rowIndex;
  const rowById = { get: (id: string) => ol.rows[rowIndex.get(id) ?? -1] };
  const litLevelsFor = (row: OutlinerRow) => {
    let lit = 0;
    for (
      let parent = row.parentId;
      parent && litParents.has(parent);
      parent = rowById.get(parent)?.parentId ?? null
    )
      lit++;
    return lit;
  };
  const coarse = useMediaQuery("(pointer: coarse)");
  const selecting = coarse && !ui.editing && selection.size > 0;
  const animateLayout = ol.rows.length <= 160;
  // a veto's rollback paints in ONE step: rows it removes leave at once, not over 200 ms.
  const lastRejection = React.useRef(ol.rejection);
  const rollback = lastRejection.current !== ol.rejection;
  React.useEffect(() => {
    lastRejection.current = ol.rejection;
  });
  // Touch has no keyboard cursor: there it marks only a selected row (selection mode).
  const cursorId =
    !ui.editing && target.cursor && (!coarse || selection.has(target.cursor))
      ? target.cursor
      : null;
  useTouchSelectionClear(ol, ui, coarse);
  // The cursor row is conveyed by aria-activedescendant; range size is not, so say it.
  const selectedCount = selection.size;
  const lastCount = React.useRef(selectedCount);
  // Undo and redo say "Undone" / "Redone" themselves; the range they bring back is not news.
  const futureLength = ol.state.history.future.length;
  const lastFuture = React.useRef(futureLength);
  const travelled = lastFuture.current !== futureLength;
  React.useEffect(() => {
    lastFuture.current = futureLength;
  });
  React.useEffect(() => {
    const previous = lastCount.current;
    lastCount.current = selectedCount;
    // Only growing/shrinking ranges: collapses come from actions (delete, Esc) that announce themselves.
    if (travelled || selectedCount === previous || selectedCount <= 1) return;
    const timer = setTimeout(() => ui.announce(`${selectedCount} items selected`), 150);
    return () => clearTimeout(timer);
  }, [selectedCount, ui]);
  // Callback-ref state: children's layout effects run before a parent's object ref attaches.
  const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null);
  const [zoomScope, animateZoom] = useAnimate<HTMLDivElement>();
  const zoomKey = ol.state.hoistedId ?? "root";
  const previousZoom = React.useRef(zoomKey);
  const zoomScroll = React.useRef(new Map<string, number>());
  // Search keeps your place: start at the top of the results, restore the reading position on clear.
  const queryActive = !!ol.view.query.trim();
  const searchScroll = React.useRef<number | null>(null);
  // Remember each zoom level's scroll as the user scrolls. Reading scrollTop inside the zoom
  // effect is too late: by then the new level has rendered and the browser has clamped it.
  React.useEffect(() => {
    if (!scrollEl) return;
    const record = () => {
      if (searchScroll.current === null)
        zoomScroll.current.set(previousZoom.current, scrollEl.scrollTop);
    };
    scrollEl.addEventListener("scroll", record, { passive: true });
    return () => scrollEl.removeEventListener("scroll", record);
  }, [scrollEl]);
  React.useLayoutEffect(() => {
    if (previousZoom.current === zoomKey || !zoomScope.current) return;
    const from = previousZoom.current;
    previousZoom.current = zoomKey;
    animateZoom(zoomScope.current, { opacity: [0, 1], y: [6, 0] }, motionTokens.base);
    const top = zoomScroll.current.get(zoomKey) ?? 0;
    // Zooming out (one level or several via breadcrumbs): land on the deepest visible item on
    // the path you came from, as outliners conventionally do. Rows outside a virtual window are
    // reached by focusing the list first, so the virtualizer scrolls the new cursor into view.
    const visible = new Set(ol.rows.map((row) => row.id));
    const cameFrom =
      from === "root"
        ? null
        : (getOutlinePath(ol.state.nodes, from)
            .map((node) => node.id)
            .reverse()
            .find((id) => visible.has(id)) ?? null);
    // Rows of the level we land on can still be growing in (or a virtual list sizing up), which
    // would clamp the position: restore until it sticks, then make sure the cursor shows.
    const landed = (done: () => void) => (scrollEl ? restoreScroll(scrollEl, top, done) : done());
    if (cameFrom) {
      ui.focusList();
      ol.dispatch({ type: "select", id: cameFrom });
      landed(() =>
        requestAnimationFrame(() => {
          const el = ui.listRef.current?.querySelector(`[data-row="${CSS.escape(cameFrom)}"]`);
          const box = el?.getBoundingClientRect();
          const view = scrollEl?.getBoundingClientRect();
          if (!el || (box && view && (box.top < view.top || box.bottom > view.bottom)))
            ui.scrollToRow(cameFrom, "center");
        }),
      );
      ui.announce(
        `Zoomed out to ${ol.hoisted ? inlineToSpeech(ol.hoisted.text, live.current.resolveRef) : "the document"}`,
      );
    } else {
      // Zooming into the row being edited: it is now the heading, whose title keeps the caret
      // (ZoomTitle), so no row is being edited. Focus left on its old row (which only animates
      // out, and may have taken the caret back) or on <body> goes to that title, else to the
      // zoomed level in row mode.
      const caretRow = ol.state.caret?.id;
      if (ui.editing && caretRow && !ol.rowIndex.has(caretRow)) ui.setEditing(false);
      const active = document.activeElement;
      const row = active?.closest<HTMLElement>("[data-row]")?.dataset.row;
      if (
        !active ||
        active === document.body ||
        !active.isConnected ||
        (row !== undefined && !ol.rowIndex.has(row))
      ) {
        const title = ui.rootRef.current?.querySelector<HTMLElement>("[data-zoom-title]");
        if (title) title.focus({ preventScroll: true });
        else ui.focusList();
      }
      landed(() => {});
      ui.announce(
        ol.hoisted
          ? `Zoomed into ${inlineToSpeech(ol.hoisted.text, live.current.resolveRef)}`
          : "Document root",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomKey]);
  React.useLayoutEffect(() => {
    if (!scrollEl) return;
    if (queryActive && searchScroll.current === null) {
      // The results have already rendered (and clamped scrollTop): use the recorded position.
      searchScroll.current = zoomScroll.current.get(previousZoom.current) ?? scrollEl.scrollTop;
      scrollEl.scrollTop = 0;
    } else if (!queryActive && searchScroll.current !== null) {
      const top = searchScroll.current;
      searchScroll.current = null;
      // The full list (and a virtual list's total height) arrives after the query clears.
      requestAnimationFrame(() => restoreScroll(scrollEl, top));
    }
  }, [queryActive, scrollEl]);
  // While the phone sheet is open the list has room below its content, so the sheet can lift its
  // target row clear of itself even near the end of the document (OutlinerActionSheet scrolls).
  const sheetRow = ui.sheet?.rowId ?? null;
  React.useLayoutEffect(() => {
    scrollEl?.toggleAttribute("data-sheet-open", !!sheetRow);
  }, [sheetRow, scrollEl]);
  const live = React.useRef<LiveHandle>(null!);
  live.current = {
    ol,
    ui,
    startDrag: drag.start,
    resolveRef: (id) => {
      const node = findOutlineNode(ol.state.nodes, id)?.node;
      if (node) return inlineToPlain(node.text) || "Untitled";
      const external = ol.external?.resolve(id);
      return external === undefined || external === null
        ? null
        : inlineToPlain(external) || "Untitled";
    },
    refSource: (id) => {
      const node = findOutlineNode(ol.state.nodes, id)?.node;
      if (node) return node.text || "Untitled";
      const external = ol.external?.resolve(id);
      return external === undefined || external === null ? null : external || "Untitled";
    },
    revealItem: (id, title) => {
      // `[[label|doc/item]]` in a workspace: the host opens that document at the item.
      if (id && !findOutlineNode(ol.latestNodes(), id) && ol.external?.resolve(id) !== undefined)
        ol.external!.open(id);
      else if (id) revealItem(ol, ui, id);
      else ol.setView((view) => ({ ...view, query: `"${title}"` }));
    },
  };
  // Clipboard while the tree has focus. The browser aims copy/cut/paste at the DOM selection's
  // node (often a stale text node, e.g. the title), not the focused tree, so listen on the
  // document and act whenever the tree is the active element.
  React.useEffect(() => {
    const handle = (event: ClipboardEvent) => {
      const { ol, ui } = live.current;
      if (document.activeElement !== ui.listRef.current || ui.editing || !event.clipboardData)
        return;
      const ids = resolveTarget(ol.state, ol.viewRows(), false).ids;
      if (event.type === "paste") {
        if (ol.readOnly) return;
        // Row mode: what was pasted becomes the target ("result"), so Tab or ⌫ act on it next.
        const count = readClipboard(
          event.clipboardData,
          ol,
          ids.at(-1) ?? ol.rows.at(-1)?.id,
          "result",
        );
        if (count === null) return;
        event.preventDefault();
        ui.announce(ui.labels.pasted(count));
        return;
      }
      if (!ids.length || (event.type === "cut" && ol.readOnly)) return;
      event.preventDefault();
      writeClipboard(event.clipboardData, ol, ids);
      if (event.type === "cut") deleteItems({ ol, ui }, ids, "cut");
      else ui.announce(ui.labels.copied(ids.length));
    };
    for (const type of ["copy", "cut", "paste"] as const) document.addEventListener(type, handle);
    return () => {
      for (const type of ["copy", "cut", "paste"] as const)
        document.removeEventListener(type, handle);
    };
  }, []);
  const isSel = (index: number) =>
    !ui.editing && index >= 0 && index < ol.rows.length && selection.has(ol.rows[index]!.id);
  // children of a selected row move and delete with it, so they sit in a lighter band.
  const insideSelection = (row: OutlinerRow) => {
    if (ui.editing || !selection.size) return false;
    for (let parent = row.parentId; parent; parent = rowById.get(parent)?.parentId ?? null)
      if (selection.has(parent)) return true;
    return false;
  };
  const edgeOf = (row: OutlinerRow): RowViewProps["selectionEdge"] => {
    const index = rowIndex.get(row.id) ?? -1;
    const before = isSel(index - 1),
      after = isSel(index + 1);
    return before && after ? "middle" : before ? "last" : after ? "first" : "single";
  };
  const renderRow = (row: OutlinerRow) => (
    <OutlineRowView
      selectionEdge={!ui.editing && selection.has(row.id) ? edgeOf(row) : undefined}
      key={row.id}
      row={row}
      editingField={caretId === row.id ? (ol.state.caret?.field ?? "title") : undefined}
      selected={!ui.editing && selection.has(row.id)}
      cursor={cursorId === row.id}
      litLevels={litLevelsFor(row)}
      dragging={(!drag.state?.copy && drag.state?.ids.includes(row.id)) ?? false}
      flat={searching && ol.view.searchMode === "flat"}
      readOnly={ol.readOnly}
      noteDisplay={ol.view.noteDisplay}
      selecting={selecting}
      rangeMode={!ui.editing && selection.size > 1}
      animateLayout={animateLayout}
      coarse={coarse}
      carried={!selection.has(row.id) && insideSelection(row)}
      starred={ol.bookmarks.items.includes(identityOfRow(row))}
    />
  );

  const searching = !!ol.view.query.trim();
  const empty = ol.rows.length === 0;
  // All documents (a workspace host): its results replace this document's rows while searching.
  const scoped = searching && ui.host.searchScope?.value === "all";
  // A zoomed item in board view shows its children as columns (search shows the outline).
  // The view shown: the document's, or a read-only reader's own local choice (outliner-views.tsx).
  const shown = hoisted ? shownView(ol, hoisted) : "list";
  const board = !searching && hoisted && shown === "board" ? hoisted : null;
  // Article and mind map views of the zoomed item (outliner-views.tsx); search shows the outline.
  const article = !searching && hoisted && shown === "article" ? hoisted : null;
  const mindmap = !searching && hoisted && shown === "mindmap" ? hoisted : null;
  const articleParts: ArticleParts = {
    TaskCheckbox,
    reveal: (id, title) => live.current.revealItem(id, title),
    refSource: (id) => live.current.refSource(id),
  };

  return (
    <div
      ref={setScrollEl}
      data-outliner-scroll
      data-focus-region="tree"
      // An article has no cursor: its scroller takes focus (arrows and Page keys scroll it), never <body>.
      tabIndex={article ? -1 : undefined}
      className={cn(
        "relative min-h-0 flex-1 scroll-pb-20 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]",
        mindmap && "flex flex-col",
        article &&
          "outline-none focus-visible:ring-2 focus-visible:ring-signal/30 focus-visible:ring-inset",
      )}
    >
      <OutlinerPrintHost owner={ui.rootRef} title={title} parts={articleParts} />
      {!board && !mindmap && !article && !scoped && <AncestorStrip scrollEl={scrollEl} />}
      <div
        data-outliner-content={board ? "board" : mindmap ? "mindmap" : article ? "article" : "list"}
        className={cn(
          "mx-auto w-full px-3 pt-4 sm:px-6 sm:pt-5",
          board ? "max-w-none pb-2" : mindmap ? "max-w-none shrink-0 pb-3" : "max-w-[52rem] pb-24",
        )}
      >
        {/* Zoom crossfade only for animated (small) documents: a virtual list must never be
            mounted twice (both copies would fight over the shared list and scroll refs). */}
        {/* Zoom transition animates this one stable node in place; the list (and any virtual
            window inside it) is never mounted twice. */}
        <div ref={zoomScope}>
          <DocumentTitle title={title} />
          {scoped ? (
            <div data-scope-results="">{ui.host.searchScope!.renderResults(ol.view.query)}</div>
          ) : board || mindmap ? null : article ? (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={motionTokens.base}
              className="mt-5"
            >
              <OutlinerArticle items={article.children ?? []} parts={articleParts} />
            </motion.div>
          ) : (
            <>
              {searching && ol.view.searchMode === "flat" && (
                <div className="mb-1 flex items-center gap-2 ps-[30px] text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                  <span className="me-auto">
                    {ol.rows.length} result{ol.rows.length === 1 ? "" : "s"}
                  </span>
                  {ol.rows.length > 1 && (
                    <ResultSortControl
                      value={ol.view.resultSort ?? "outline"}
                      options={["outline", "date", "title"]}
                      onChange={(resultSort) => ol.setView((view) => ({ ...view, resultSort }))}
                    />
                  )}
                </div>
              )}
              <div
                ref={ui.listRef}
                data-focus-entry=""
                role="tree"
                aria-label={hoisted ? inlineToSpeech(hoisted.text) : title}
                aria-multiselectable
                aria-activedescendant={cursorId ? rowDomId(cursorId) : undefined}
                tabIndex={ui.editing ? -1 : 0}
                onFocus={(event) => {
                  // Keyboard entry: the tree is one tab stop; landing on it selects a row.
                  // (The newest selection: a click that selected and then focused must not be undone.)
                  if (
                    event.target !== event.currentTarget ||
                    ol.latestSelection().size ||
                    !ol.rows.length
                  )
                    return;
                  const first = ol.rows.find((row) => row.id === target.cursor) ?? ol.rows[0]!;
                  ol.dispatch({ type: "select", id: first.id });
                }}
                onKeyDown={(event) => onSelectionKey(event, ol, ui)}
                className="relative outline-none"
              >
                <LiveContext.Provider value={live}>
                  {animateLayout ? (
                    <LayoutGroup>
                      <AnimatePresence initial={false} custom={rollback}>
                        {ol.rows.map(renderRow)}
                      </AnimatePresence>
                    </LayoutGroup>
                  ) : (
                    <VirtualRows
                      rows={ol.rows}
                      renderRow={renderRow}
                      scrollEl={scrollEl}
                      listRef={ui.listRef}
                      focusId={caretId ?? cursorId}
                      editing={ui.editing}
                      register={ui.registerScroller}
                      pinnedIds={[ui.sheet?.rowId, cursorId, caretId]}
                    />
                  )}
                </LiveContext.Provider>
                <DropIndicator drag={drag.state} />
              </div>
              {empty && <EmptyState searching={searching} placeholder={placeholder} />}
              {!empty && !searching && !ol.readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    const id = ol.commands.addChild(ol.state.hoistedId);
                    ol.dispatch({ type: "focus", id });
                    ui.setEditing(true);
                  }}
                  className="group/add mt-1 flex h-7 items-center gap-2 rounded-md ps-[26px] pe-2 text-muted-foreground/70 transition-colors hover:text-foreground coarse:h-11"
                >
                  <Plus className="size-3.5 transition-transform group-hover/add:rotate-90" />
                  <span className="text-ui">{ui.labels.addItem}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {board && (
        <motion.div
          key={board.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionTokens.base}
          className="pb-20"
        >
          <OutlinerBoard
            board={board}
            parts={{ ...BOARD_PARTS, reveal: (id) => revealItem(ol, ui, id) }}
          />
        </motion.div>
      )}
      {mindmap && <MindMapSlot key={mindmap.id} root={mindmap} />}
    </div>
  );
}

/**
 * Put a scroller back at `top`, and keep doing so each frame until it sticks: the content it
 * needs (rows growing in, a virtual list's total height) can arrive frames later. It yields at
 * once when the user scrolls on their own, and gives up after two seconds; `done` runs either way.
 */
function restoreScroll(scrollEl: HTMLElement, top: number, done?: () => void) {
  const deadline = performance.now() + 2000;
  let cancelled = false;
  const cancel = () => (cancelled = true);
  const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
  for (const type of events) scrollEl.addEventListener(type, cancel, { once: true, passive: true });
  const attempt = () => {
    if (!cancelled) scrollEl.scrollTop = top;
    if (!cancelled && Math.abs(scrollEl.scrollTop - top) > 1 && performance.now() < deadline)
      requestAnimationFrame(attempt);
    else {
      for (const type of events) scrollEl.removeEventListener(type, cancel);
      done?.();
    }
  };
  attempt();
}

/**
 * Sticky ancestor strip: scrolled deep into a big branch, the top row's ancestors pin under the
 * toolbar as a compact breadcrumb (click one to zoom into it), so you never lose where you are.
 * It overlays the list (zero-height sticky host: nothing below shifts) and appears only while
 * the top row's parent has scrolled away.
 */
function AncestorStrip({ scrollEl }: { readonly scrollEl: HTMLDivElement | null }) {
  const { ol, ui } = useOutlinerContext();
  const [topId, setTopId] = React.useState<string | null>(null);
  const live = React.useRef(ol);
  live.current = ol;
  React.useEffect(() => {
    if (!scrollEl) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const list = ui.listRef.current;
      if (!list || scrollEl.scrollTop < 24) return setTopId(null);
      const edge = scrollEl.getBoundingClientRect().top + STRIP_HEIGHT;
      // Rows are flat and in visual order: binary-search the first one still showing below the strip.
      const rows = list.querySelectorAll<HTMLElement>(":scope [data-row]");
      let lo = 0,
        hi = rows.length - 1,
        found: HTMLElement | null = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (rows[mid]!.getBoundingClientRect().bottom > edge) {
          found = rows[mid]!;
          hi = mid - 1;
        } else lo = mid + 1;
      }
      const id = found?.dataset.row ?? null;
      const { rows: all, rowIndex } = live.current;
      const row = id ? all[rowIndex.get(id) ?? -1] : undefined;
      const parent = row?.parentId
        ? list.querySelector<HTMLElement>(`[data-row="${CSS.escape(row.parentId)}"]`)
        : null;
      // The parent still in view (its title above the edge is still readable) needs no strip.
      const parentShown =
        !!parent && parent.getBoundingClientRect().top >= scrollEl.getBoundingClientRect().top;
      setTopId(row && row.depth > 0 && !parentShown ? row.id : null);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    scrollEl.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      scrollEl.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, [scrollEl, ui.listRef, ol.rows]);
  const chain = React.useMemo(() => {
    const out: OutlinerRow[] = [];
    for (let row = topId ? ol.rows[ol.rowIndex.get(topId) ?? -1] : undefined; row?.parentId;) {
      row = ol.rows[ol.rowIndex.get(row.parentId) ?? -1];
      if (row) out.unshift(row);
    }
    return out;
  }, [topId, ol.rows, ol.rowIndex]);
  const key = chain.map((row) => row.id).join("/");
  // The phone sheet lifts its target to the top: the strip must not cover it.
  const visible = chain.length > 0 && !ui.sheet;
  // A phone has room for one readable crumb: the nearest parent in full, the rest folded into "…".
  const narrow = useMediaQuery("(max-width: 639px)");
  const shown = chain.length > (narrow ? 1 : 3) ? chain.slice(narrow ? -1 : -3) : chain;
  // The strip overlays the list, so keep the cursor row clear of it (WCAG 2.4.11): every
  // scrollIntoView and the virtualizer honour the container's top scroll padding.
  const navRef = React.useRef<HTMLElement>(null);
  React.useLayoutEffect(() => {
    if (!scrollEl) return;
    const pad = () =>
      (scrollEl.style.scrollPaddingTop = visible
        ? `${(navRef.current?.offsetHeight ?? STRIP_HEIGHT) + 4}px`
        : "");
    pad();
    const frame = requestAnimationFrame(pad);
    return () => {
      cancelAnimationFrame(frame);
      scrollEl.style.scrollPaddingTop = "";
    };
  }, [scrollEl, visible]);
  return (
    <div className="pointer-events-none sticky top-0 z-10 h-0">
      <AnimatePresence initial={false}>
        {visible && (
          <motion.nav
            key="strip"
            ref={navRef}
            aria-label={ui.labels.ancestors}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={motionTokens.quick}
            className="pointer-events-auto absolute inset-x-0 top-0 border-b border-hairline bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] backdrop-blur-sm"
          >
            <motion.ol
              key={key}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={motionTokens.quick}
              className="mx-auto flex h-7 w-full max-w-[52rem] min-w-0 items-center gap-0.5 px-3 font-mono text-[11px] text-muted-foreground sm:px-6 coarse:h-10"
            >
              {chain.length > shown.length && (
                <li aria-hidden className="shrink-0 px-1 text-muted-foreground/60">
                  …
                </li>
              )}
              {shown.map((row, index) => (
                <li key={row.id} className="flex min-w-0 items-center">
                  {(index > 0 || chain.length > shown.length) && (
                    <ChevronRight
                      aria-hidden
                      className="size-3 shrink-0 text-muted-foreground/50 rtl:rotate-180"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => ol.dispatch({ type: "hoist", id: row.id })}
                    title={inlineToPlain(row.node.text) || ui.labels.untitled}
                    className={cn(
                      "h-6 max-w-[16rem] truncate rounded-[5px] px-1.5 transition-colors hover:bg-muted hover:text-foreground coarse:h-9",
                      index === shown.length - 1 && "text-foreground/80 max-sm:max-w-none",
                    )}
                  >
                    <span dir="auto">
                      {inlineToLabel(row.node.text) ||
                        inlineToPlain(row.node.text) ||
                        ui.labels.untitled}
                    </span>
                  </button>
                </li>
              ))}
            </motion.ol>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
const STRIP_HEIGHT = 28;
/** What the board borrows from the outline (passed down, so the modules never import each other). */
const BOARD_PARTS: Omit<BoardParts, "reveal"> = { RowField, TaskCheckbox };

/** Row exit: collapse calmly, or at once when a veto rolls the row back (`custom` = rollback). */
const ROW_PRESENCE = {
  exit: (rollback?: boolean) =>
    rollback ? { opacity: 0, height: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 },
};

const NO_COUNT = { total: 0, done: 0 } as const;
const checkboxCache = new WeakMap<
  OutlinerRow["node"],
  { readonly total: number; readonly done: number }
>();
function checkboxCount(node: OutlinerRow["node"]): {
  readonly total: number;
  readonly done: number;
} {
  const cached = checkboxCache.get(node);
  if (cached) return cached;
  // A mirror is counted where it lives (its source), never twice.
  if (mirrorOf(node)) return NO_COUNT;
  let total = node.checked !== undefined ? 1 : 0,
    done = node.checked ? 1 : 0;
  for (const child of node.children ?? []) {
    const count = checkboxCount(child);
    total += count.total;
    done += count.done;
  }
  const result = { total, done };
  checkboxCache.set(node, result);
  return result;
}

function DocumentTitle({ title }: { readonly title: string }) {
  const { ol } = useOutlinerContext();
  const hoisted = ol.hoisted;
  // Per-subtree counts cached by node identity: a keystroke recounts only the edited path.
  const tasks = React.useMemo(() => {
    let total = 0,
      done = 0;
    for (const node of hoisted ? (hoisted.children ?? []) : ol.state.nodes) {
      const count = checkboxCount(node);
      total += count.total;
      done += count.done;
    }
    return { total, done };
  }, [ol.state.nodes, hoisted]);
  const ratio = tasks.total ? tasks.done / tasks.total : 0;
  return (
    <header className="mb-3 ps-[30px]">
      {hoisted ? <ZoomTitle key={hoisted.id} /> : <RootTitle title={title} />}
      {hoisted?.data?.note && (
        <div dir="auto" className="mt-0.5 text-ui text-muted-foreground">
          <RichNote source={hoisted.data.note} />
        </div>
      )}
      {hoisted && <ZoomConnections item={hoisted} />}
      {tasks.total > 0 && (
        <div className="mt-2 flex items-center gap-2.5">
          <div
            className="h-1 w-28 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={tasks.total}
            aria-valuenow={tasks.done}
            aria-label="Tasks complete"
          >
            <motion.div
              className="h-full rounded-full bg-signal"
              initial={false}
              animate={{
                width: `${ratio * 100}%`,
                backgroundColor: ratio >= 1 ? "var(--success)" : "var(--signal)",
              }}
              transition={motionTokens.slow}
            />
          </div>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            <bdi>
              {tasks.done.toLocaleString()}/{tasks.total.toLocaleString()}
            </bdi>{" "}
            tasks
          </span>
        </div>
      )}
    </header>
  );
}

/** The document's own title; editable in place when the host passes `onTitleChange` (a workspace). */
function RootTitle({ title }: { readonly title: string }) {
  const { ol, ui } = useOutlinerContext();
  const onChange = ui.host.onTitleChange;
  const [draft, setDraft] = React.useState<string | null>(null);
  const className = "block w-full text-[22px] leading-8 font-semibold tracking-[-0.015em]";
  if (!onChange || ol.readOnly) return <h2 className={cn(className, "text-balance")}>{title}</h2>;
  if (draft === null)
    return (
      <h2 className={cn(className, "cursor-text text-balance")} onClick={() => setDraft(title)}>
        {title || <span className="text-muted-foreground/60">{ui.labels.untitledDocument}</span>}
      </h2>
    );
  const commit = () => {
    const next = draft.replace(/\s+/g, " ").trim();
    setDraft(null);
    if (next !== title) onChange(next);
  };
  return (
    <input
      autoFocus
      aria-label={ui.labels.documentTitle}
      value={draft}
      dir="auto"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (isComposingKey(event)) return;
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          ui.focusList();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setDraft(null);
        }
      }}
      className={cn(
        className,
        "border-0 bg-transparent p-0 caret-signal outline-none placeholder:text-muted-foreground/60",
      )}
      placeholder={ui.labels.untitledDocument}
    />
  );
}

/** Syntax chips shown under an empty search field (core grammar + the outliner's task/date filters). */
function searchHints(now = new Date()) {
  const week = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const iso = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, "0")}-${String(week.getDate()).padStart(2, "0")}`;
  return [
    "is:todo",
    "due:today",
    "due:overdue",
    "due:week",
    `before:${iso}`,
    "created:week",
    "#tag",
    "@person",
    '"exact phrase"',
    "-exclude",
    "a OR b",
    "is:done",
    "has:date",
    "has:note",
    "color:red",
    "heading:2",
    "parent:goals",
    "in:title",
  ];
}

/**
 * Inline query help under the search field, one of three states:
 *   typing a token  completions for it (operators, then values: due: → today, overdue, week …); Tab takes the first
 *   invalid query   the parser's reason (e.g. "2026-02-30 is not a calendar date.")
 *   empty query     syntax chips
 */
function SearchHelp() {
  const { ol, ui } = useOutlinerContext();
  const diagnostic = ol.search?.diagnostics[0];
  const suggestions = React.useMemo(() => searchSuggestions(ol.view.query), [ol.view.query]);
  const hints = React.useMemo(() => searchHints(), []);
  const active = ui.searchOpen || !!ol.view.query;
  // Completing a half-typed token beats the parser's complaint about it ("due:" is not wrong, just unfinished).
  const mode = !active
    ? null
    : suggestions.length
      ? "complete"
      : diagnostic
        ? "error"
        : !ol.view.query
          ? "hints"
          : null;
  const setQuery = (query: string) => {
    ol.setView((view) => ({ ...view, query }));
    requestAnimationFrame(() => {
      const input = ui.rootRef.current?.querySelector<HTMLInputElement>(
        "input[aria-label='Search outline']",
      );
      input?.focus();
      input?.setSelectionRange(query.length, query.length);
    });
  };
  const chip =
    "shrink-0 rounded-[5px] border border-hairline bg-background px-1.5 font-mono leading-5 text-muted-foreground transition-colors hover:border-border hover:text-foreground coarse:h-11 coarse:rounded-md coarse:px-2.5 coarse:text-[12px] coarse:leading-[42px]";
  return (
    <AnimatePresence initial={false}>
      {mode && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={motionTokens.quick}
          className="shrink-0 overflow-hidden border-b border-hairline bg-muted/30"
        >
          <div
            id={ui.searchHelpId}
            dir="ltr"
            className="flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 text-[11px] [scrollbar-width:none] coarse:gap-2 coarse:py-2"
          >
            {mode === "error" ? (
              <span role="status" className="flex items-center gap-1.5 text-destructive">
                <span className="size-1.5 rounded-full bg-destructive" />
                {diagnostic!.message}
              </span>
            ) : mode === "complete" ? (
              <>
                <span className="flex shrink-0 items-center gap-1 text-muted-foreground coarse:hidden">
                  <Kbd className="h-4 px-1 font-sans text-[10px]">Tab</Kbd>
                </span>
                {suggestions.map((suggestion, index) => (
                  <motion.button
                    key={suggestion.label}
                    type="button"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...motionTokens.quick, delay: index * 0.015 }}
                    title={suggestion.hint}
                    aria-label={`${suggestion.label}, ${suggestion.hint}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setQuery(suggestion.query)}
                    className={cn(
                      chip,
                      "flex items-center gap-1.5",
                      index === 0 && "border-signal/40 text-foreground",
                    )}
                  >
                    {suggestion.label}
                    <span className="font-sans text-muted-foreground/70">{suggestion.hint}</span>
                  </motion.button>
                ))}
              </>
            ) : (
              <>
                <span className="shrink-0 text-muted-foreground">Try</span>
                {hints.map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setQuery(hint)}
                    className={chip}
                  >
                    {hint}
                  </button>
                ))}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The zoomed item's title, shown the way its row shows it: a task keeps its checkbox (its own tab
 * stop, announced), a colour keeps its start stripe, a heading keeps its level, a completed item
 * reads struck through. The text is editable in place; Enter starts its first child.
 */
function ZoomTitle() {
  const { ol, ui } = useOutlinerContext();
  const hoisted = ol.hoisted!;
  // Zoomed into the title being typed in (⌘] while editing): the caret carries on here.
  const carried = React.useRef(
    ui.editing && ol.state.caret?.id === hoisted.id && ol.state.caret.field !== "note"
      ? ol.state.caret.start
      : null,
  );
  const [editing, setEditingState] = React.useState(carried.current !== null);
  const setEditing = (next: boolean) => {
    if (!next) carried.current = null;
    setEditingState(next);
  };
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const liveModule = useLiveField();
  const host = useFieldHost(ol);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [hoisted.text, editing]);
  const locked = ol.isItemLocked(hoisted.id);
  const editable = !ol.readOnly && !locked;
  const task = hoisted.checked !== undefined;
  const completed = hoisted.checked === true || hoisted.data?.completed === true;
  const color =
    hoisted.data?.color && hoisted.data.color in COLOR_STYLES
      ? COLOR_STYLES[hoisted.data.color]
      : null;
  const heading = hoisted.data?.heading;
  const starred = ol.bookmarks.items.includes(ol.commands.identityOf(hoisted.id));
  const className = "block w-full text-[22px] leading-8 font-semibold tracking-[-0.015em]";
  /** Enter starts the first child; Esc stops editing. */
  const firstChild = () => {
    setEditing(false);
    const id = createOutlineId();
    ol.dispatch({ type: "insert", id, parentId: hoisted.id, index: 0 });
    ui.setEditing(true);
  };
  const LiveField = liveModule?.LiveField;
  const title =
    editing && LiveField ? (
      <LiveField
        rowId={hoisted.id}
        field="title"
        host={host}
        committed={hoisted.text}
        renderedSeq={ol.renderedSeq}
        autoFocus={{ caret: carried.current ?? hoisted.text.length }}
        attributes={{
          "aria-label": "Zoomed item title",
          role: "textbox",
          spellcheck: "true",
          dir: "auto",
          "data-zoom-title": "",
        }}
        className={cn(className, "min-h-8 caret-signal")}
        resolveRef={(id) =>
          findOutlineNode(ol.state.nodes, id)?.node.text ?? ol.external?.resolve(id) ?? null
        }
        hooks={{
          typed: (el) => reportCollaborationField(ol, hoisted.id, "title", "selection", el),
          caretMoved: (el) => {
            reportCollaborationField(ol, hoisted.id, "title", "selection", el);
            return false;
          },
          composition: (active, el) =>
            reportCollaborationField(
              ol,
              hoisted.id,
              "title",
              active ? "composition-start" : "composition-end",
              el,
            ),
          key: (event) => {
            const mod = event.metaKey || event.ctrlKey;
            const lower = event.key.toLowerCase();
            const stop = () => {
              event.preventDefault();
              event.stopPropagation();
              return true;
            };
            if (event.key === "Escape") {
              stop();
              setEditing(false);
              // the keyboard goes on in the zoomed level's rows, never from <body>
              ui.focusList();
              return true;
            }
            if (event.key === "Enter" && !mod && !event.altKey) {
              stop();
              firstChild();
              return true;
            }
            if (mod && (lower === "z" || (lower === "y" && event.ctrlKey && !event.metaKey))) {
              stop();
              ol.dispatch({ type: lower === "y" || event.shiftKey ? "redo" : "undo" });
              return true;
            }
            const action = matchShortcut(ui.keymap, event, "text");
            const style = action ? FORMAT_STYLES[action] : undefined;
            if (style) {
              stop();
              event.currentTarget.liveField.format(style);
              return true;
            }
            if (action === "zoomOut") {
              // ⌘[ undoes ⌘]: out to the level above, on this item's row
              stop();
              setEditing(false);
              ol.dispatch({ type: "hoist", id: ol.breadcrumbs.at(-2)?.id ?? null });
              return true;
            }
            return false;
          },
          notice: (notice) => ui.announce(noticeText(ui, notice)),
          undo: (redo) => ol.dispatch({ type: redo ? "redo" : "undo" }),
          blur: () => setEditing(false),
        }}
      />
    ) : editing ? (
      <textarea
        ref={ref}
        autoFocus
        rows={1}
        aria-label="Zoomed item title"
        onSelect={(event) =>
          reportCollaborationField(ol, hoisted.id, "title", "selection", event.currentTarget)
        }
        onCompositionStart={(event) =>
          reportCollaborationField(
            ol,
            hoisted.id,
            "title",
            "composition-start",
            event.currentTarget,
          )
        }
        onCompositionEnd={(event) => {
          const el = event.currentTarget;
          setTimeout(
            () => reportCollaborationField(ol, hoisted.id, "title", "composition-end", el),
            0,
          );
        }}
        value={hoisted.text}
        onChange={(event) =>
          ol.dispatch({ type: "text", id: hoisted.id, text: event.target.value, time: Date.now() })
        }
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (isComposingKey(event)) return;
          if (event.key === "Escape") setEditing(false);
          if (event.key === "Enter") {
            event.preventDefault();
            firstChild();
          }
        }}
        className={cn(
          className,
          "resize-none overflow-hidden border-0 bg-transparent p-0 caret-signal outline-none",
        )}
      />
    ) : (
      <h2
        className={cn(
          className,
          "text-balance transition-colors duration-200",
          editable && "cursor-text",
          completed &&
            "text-muted-foreground line-through decoration-muted-foreground/50 decoration-2",
        )}
        onClick={() => editable && setEditing(true)}
      >
        <InlineText source={hoisted.text || ui.labels.untitled} />
        {heading && (
          <span
            aria-label={`Heading ${heading}`}
            className="ms-2 inline-block translate-y-[-3px] rounded-[4px] border border-hairline px-1 align-middle font-mono text-[10.5px] leading-4 font-medium tracking-normal text-muted-foreground no-underline"
          >
            H{heading}
          </span>
        )}
      </h2>
    );
  return (
    <div className="relative flex items-start">
      {color && (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1.5 w-[2px] rounded-full opacity-75",
            task ? "-start-[33px]" : "-start-[29px]",
            color.bar,
          )}
        />
      )}
      {task && (
        // Sized to the 22 px title (cap height), sitting in the bullet column, not the stripe gutter.
        <span className="-ms-[25px] me-[5px] flex h-8 shrink-0 items-center">
          <TaskCheckbox
            focusable
            checked={completed}
            disabled={!editable}
            label={`${completed ? ui.labels.markIncomplete : ui.labels.complete}: ${inlineToSpeech(hoisted.text) || ui.labels.untitled}`}
            className="size-5 rounded-[5px] coarse:size-6 [&_svg]:size-3.5"
            onToggle={() => ui.announceToggle(ol.commands.toggleComplete([hoisted.id]))}
          />
        </span>
      )}
      <div className="min-w-0 flex-1">{title}</div>
      <ViewSwitcher item={hoisted} disabled={!editable} />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-pressed={starred}
            aria-label={starred ? ui.labels.removeBookmark : ui.labels.bookmark}
            onClick={() =>
              ui.announce(
                ol.commands.toggleBookmark(hoisted.id)
                  ? ui.labels.bookmarked
                  : ui.labels.bookmarkRemoved,
              )
            }
            className={cn(
              "relative ms-2 mt-1.5 grid size-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground/70 transition-colors after:absolute after:-inset-1 hover:bg-muted hover:text-foreground coarse:ms-0 coarse:mt-0 coarse:size-11",
              starred && "text-warning hover:text-warning",
            )}
          >
            <Star className={cn("size-3.5", starred && "fill-current")} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{starred ? ui.labels.removeBookmark : ui.labels.bookmark}</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Follow a link or a mirror: unzoom if needed, unfold, select, scroll into view, focus the tree. */
function revealItem(ol: OutlinerController, ui: OutlinerUi, id: string) {
  if (!findOutlineNode(ol.latestNodes(), id)) {
    toast(ui.labels.linkedItemDeleted);
    return;
  }
  const go = () => {
    ol.dispatch({ type: "reveal", id });
    ol.dispatch({ type: "select", id });
    ui.setEditing(false);
    requestAnimationFrame(() => {
      ui.focusList();
      ui.scrollToRow(id, "center");
    });
  };
  const outside =
    ol.state.hoistedId &&
    !getOutlinePath(ol.latestNodes(), id).some((node) => node.id === ol.state.hoistedId);
  if (outside || ol.state.hoistedId === id) {
    // Zooming out lands on the item you came from; the link's target wins after that settles.
    ol.dispatch({ type: "hoist", id: null });
    requestAnimationFrame(go);
  } else go();
}

/**
 * Under a zoomed title: what points here. "Linked from N" lists the items that link to it with
 * [[label|id]] (click to reveal; the whole set is also `links:<id>` in search), plus where it is
 * mirrored, or which item it mirrors.
 */
function ZoomConnections({ item }: { readonly item: OutlineItem }) {
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const nodes = ol.state.nodes;
  const sources = React.useMemo(
    () => ol.commands.backlinks(item.id),
    [nodes, item.id, ol.commands],
  );
  const mirrors = React.useMemo(
    () => ol.commands.mirrorsOf(item.id),
    [nodes, item.id, ol.commands],
  );
  const mirrorSource = mirrorOf(item);
  const elsewhere = React.useMemo(
    () => ol.external?.backlinks(ol.commands.identityOf(item.id)) ?? [],
    [ol.external, item.id, ol.commands, nodes],
  );
  if (!sources.length && !mirrors.length && !mirrorSource && !elsewhere.length) return null;
  const titleOf = (id: string) => {
    const node = findOutlineNode(nodes, id)?.node;
    return node ? inlineToPlain(node.text) || L.untitled : L.untitled;
  };
  const pathOf = (id: string) =>
    getOutlinePath(nodes, id)
      .slice(0, -1)
      .map((node) => inlineToPlain(node.text))
      .join(" › ");
  const entry = (id: string, icon: React.ReactNode) => (
    <li key={id}>
      <button
        type="button"
        onClick={() => revealItem(ol, ui, id)}
        className="group/link flex w-full min-w-0 items-baseline gap-2 rounded-md px-1.5 py-1 text-start transition-colors hover:bg-muted coarse:min-h-11 coarse:items-center"
      >
        <span className="translate-y-px text-muted-foreground/70 [&>svg]:size-3">{icon}</span>
        <span dir="auto" className="min-w-0 truncate text-ui text-foreground/90">
          {titleOf(id)}
        </span>
        <span
          dir="auto"
          className="ms-auto max-w-[45%] shrink-0 truncate font-mono text-[10.5px] text-muted-foreground"
        >
          {pathOf(id)}
        </span>
      </button>
    </li>
  );
  return (
    <motion.section
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTokens.base}
      aria-label="Connections"
      className="mt-2.5 -ms-1.5 max-w-xl border-s border-hairline ps-1.5"
    >
      {mirrorSource && (
        <button
          type="button"
          onClick={() => revealItem(ol, ui, mirrorSource)}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase transition-colors hover:bg-muted hover:text-foreground"
        >
          <Repeat2 className="size-3" /> {L.mirrorOf(titleOf(mirrorSource))}
        </button>
      )}
      {sources.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-1.5 pt-0.5">
            <span className="font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase">
              {L.linkedFrom(sources.length)}
            </span>
            {sources.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  ol.setView((view) => ({
                    ...view,
                    query: `links:${ol.commands.identityOf(item.id)}`,
                    searchMode: "flat",
                  }));
                  ui.setSearchOpen(true);
                }}
                className="font-mono text-[10.5px] text-signal hover:underline"
              >
                {L.showLinksInSearch}
              </button>
            )}
          </div>
          <ul>{sources.slice(0, 6).map((id) => entry(id, <CornerDownRight />))}</ul>
        </>
      )}
      {elsewhere.length > 0 && (
        <>
          <div className="px-1.5 pt-1 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase">
            {L.linkedFromElsewhere(elsewhere.length)}
          </div>
          <ul>
            {elsewhere.slice(0, 6).map((ref) => (
              <li key={ref.id}>
                <button
                  type="button"
                  onClick={() => ol.external?.open(ref.id)}
                  className="group/link flex w-full min-w-0 items-baseline gap-2 rounded-md px-1.5 py-1 text-start transition-colors hover:bg-muted coarse:min-h-11 coarse:items-center"
                >
                  <span className="translate-y-px text-muted-foreground/70 [&>svg]:size-3">
                    <Files />
                  </span>
                  <span dir="auto" className="min-w-0 truncate text-ui text-foreground/90">
                    {inlineToPlain(ref.title) || L.untitled}
                  </span>
                  <span
                    dir="auto"
                    className="ms-auto max-w-[45%] shrink-0 truncate font-mono text-[10.5px] text-muted-foreground"
                  >
                    {ref.context}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {mirrors.length > 0 && (
        <>
          <div className="px-1.5 pt-1 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase">
            {L.mirroredIn(mirrors.length)}
          </div>
          <ul>{mirrors.slice(0, 6).map((id) => entry(id, <Repeat2 />))}</ul>
        </>
      )}
    </motion.section>
  );
}

/** IDE-style status strip: interaction mode, document revision, scope and the escape hatches. */
function OutlinerStatusBar() {
  const { modKey } = usePlatformKeys();
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const selected = ol.state.selection.size;
  const searching = !!ol.view.query.trim();
  // Across documents the footer reports what the results show, not this document's matches.
  const across =
    searching && ui.host.searchScope?.value === "all"
      ? (ui.host.searchScope.stats?.(ol.view.query) ?? null)
      : null;
  const matches = across ? across.matches : (ol.search?.matchedIds.length ?? 0);
  // The footer follows the field: a half-typed token is "typing…", never "invalid".
  const typing = searching && (ol.search?.pending || searchSuggestions(ol.view.query).length > 0);
  const mode = ol.readOnly
    ? L.readOnlyMode
    : ui.editing
      ? ol.state.caret?.field === "note"
        ? L.editingNote
        : L.editing
      : selected
        ? L.selected(selected)
        : searching
          ? L.searching(matches)
          : L.browsing;
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-hairline bg-muted/30 px-3 font-mono text-[10.5px] text-muted-foreground tabular-nums max-sm:hidden">
      <span className="flex items-center gap-1.5">
        <motion.span
          key={mode}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={motionTokens.quick}
          className={cn(
            "size-1.5 rounded-full",
            ui.editing
              ? "bg-signal"
              : selected
                ? "bg-warning"
                : ol.readOnly
                  ? "bg-muted-foreground/60"
                  : searching
                    ? "bg-signal/70"
                    : "bg-success",
          )}
        />
        {mode}
      </span>
      {across ? (
        <span>{L.acrossDocuments(across.documents)}</span>
      ) : (
        <span>
          {ol.rows.length.toLocaleString()} {ol.rows.length === 1 ? "row" : "rows"}
        </span>
      )}
      {ol.state.history.past.length > 0 && (
        <span>
          {ol.state.history.past.length} {ol.state.history.past.length === 1 ? "change" : "changes"}
        </span>
      )}
      {searching &&
        (typing ? (
          <span>{L.typingQuery}</span>
        ) : ol.search?.diagnostics.length ? (
          <span className="text-destructive">{L.invalidQuery}</span>
        ) : (
          <span className="text-signal">
            {ui.host.searchScope?.value === "all"
              ? L.allDocuments.toLowerCase()
              : ol.view.searchMode === "agenda"
                ? "agenda view"
                : ol.view.searchMode === "flat"
                  ? "flat results"
                  : "filtered outline"}
          </span>
        ))}
      {ol.view.hideCompleted && (
        <button
          type="button"
          className="text-signal hover:underline"
          onClick={() => ol.setView((view) => ({ ...view, hideCompleted: false }))}
        >
          completed hidden
        </button>
      )}
      <span className="ms-auto flex items-center gap-3">
        <button
          type="button"
          dir="ltr"
          onClick={() => ui.setShortcutsOpen(true)}
          className="transition-colors hover:text-foreground"
        >
          {modKey}/ shortcuts
        </button>
        <span className="flex items-center gap-1" dir="ltr">
          <Lock className={cn("size-3", !ol.readOnly && "hidden")} />
          {ol.canUndo ? `${modKey}Z to undo` : ""}
        </span>
      </span>
    </div>
  );
}

function EmptyState({
  searching,
  placeholder,
}: {
  readonly searching: boolean;
  readonly placeholder?: string;
}) {
  const { ol, ui } = useOutlinerContext();
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTokens.base}
      className="flex flex-col items-start gap-2 ps-[30px] py-6"
    >
      {searching ? (
        <>
          <p className="text-ui text-muted-foreground">
            {ui.labels.noMatches("")}
            <span dir="auto" className="font-mono text-foreground">
              {ol.view.query}
            </span>
          </p>
          {ol.search?.diagnostics[0] && (
            <p className="font-mono text-[11px] text-destructive">
              {ol.search.diagnostics[0].message}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => ol.setView((view) => ({ ...view, query: "" }))}
          >
            {ui.labels.clearSearch}
          </Button>
        </>
      ) : (
        <button
          type="button"
          disabled={ol.readOnly}
          onClick={() => {
            const id = ol.commands.addChild(ol.state.hoistedId);
            ol.dispatch({ type: "focus", id });
            ui.setEditing(true);
          }}
          className="text-ui text-muted-foreground transition-colors hover:text-foreground"
        >
          {placeholder ?? ui.labels.emptyDocument}
        </button>
      )}
    </motion.div>
  );
}

/* ───────────────────────────── Row ───────────────────────────── */

interface RowViewProps {
  readonly row: OutlinerRow;
  readonly editingField?: "title" | "note";
  readonly selected: boolean;
  readonly cursor: boolean;
  /** Guides at levels [0, litLevels) are lit: their ancestors contain the cursor row. */
  readonly litLevels: number;
  readonly dragging: boolean;
  readonly flat: boolean;
  readonly readOnly: boolean;
  readonly noteDisplay: OutlinerController["view"]["noteDisplay"];
  /** Touch selection mode: taps toggle selection instead of editing. */
  readonly selecting: boolean;
  readonly animateLayout: boolean;
  /** Where this row sits in a contiguous selected block (selected rows merge into one band). */
  readonly selectionEdge?: "single" | "first" | "middle" | "last";
  /** Several rows are selected: only the cursor (head) row offers ⋯, for the whole selection. */
  readonly rangeMode?: boolean;
  /** Touch device: long-press and ⋯ open the action sheet instead of menus. */
  readonly coarse?: boolean;
  /** An ancestor is selected: this row moves and deletes with it (lighter band). */
  readonly carried?: boolean;
  readonly starred?: boolean;
}

/**
 * Pure presentational row. It never subscribes to the outliner context: all render inputs
 * are props (so React.memo holds across keystrokes) and handlers read the latest
 * controller from a stable ref at event time.
 */
const OutlineRowView = React.memo(function OutlineRowView({
  row,
  editingField,
  selected,
  cursor: cursorProp,
  litLevels,
  dragging,
  flat,
  readOnly,
  noteDisplay,
  selecting,
  animateLayout,
  selectionEdge,
  rangeMode = false,
  coarse = false,
  carried = false,
  starred = false,
}: RowViewProps) {
  const live = useLive();
  const labels = live.current.ui.labels;
  // A row on its way out (deleted, filtered) keeps its last props while it fades: it is never
  // the cursor, so exactly one row ever carries it (and the active descendant).
  const present = useIsPresent();
  const cursor = cursorProp && present;
  const { node, details } = row;
  const titleRef = React.useRef<HTMLSpanElement>(null);
  const heading = details.heading;
  const color =
    details.color && details.color in COLOR_STYLES
      ? COLOR_STYLES[details.color as keyof typeof COLOR_STYLES]
      : null;
  const noteText = details.note ?? "";
  const showNote = editingField === "note" || (noteText && noteDisplay !== "hide");
  const editable = !readOnly && !row.locked;
  // Screen readers hear dates as words ("due today at 4:00 PM"), not the chip's "Today 4:00 PM".
  const spoken = inlineToSpeech(node.text, live.current.resolveRef) || "Untitled";

  const beginEdit = (
    event: React.MouseEvent,
    field: "title" | "note",
    source: string,
    el: HTMLElement | null,
  ) => {
    const { ol, ui } = live.current;
    if (selecting) {
      ol.dispatch({ type: "select", id: row.id, toggle: true });
      return;
    }
    if (event.defaultPrevented) return;
    if (!editable) {
      // Locked or read-only rows can't be edited, but a click still selects them.
      ol.dispatch({ type: "select", id: row.id });
      ui.focusList();
      return;
    }
    const offset = el
      ? sourceOffsetFromPoint(el, event.clientX, event.clientY, source.length)
      : source.length;
    ol.dispatch({
      type: "focus",
      id: row.id,
      start: offset,
      ...(field === "note" ? { field: "note" } : {}),
    });
    ui.setEditing(true);
  };

  /* touch long-press opens the action sheet (not a desktop dropdown over the row). */
  const press = React.useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  const clearPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };
  const openSheet = () => {
    const { ol, ui } = live.current;
    const many = ol.state.selection.has(row.id) && ol.state.selection.size > 1;
    // The target is marked (selected) and lifted into the space above the sheet, never covered.
    // The modal sheet hides the page from assistive tech: nothing behind it may keep focus.
    (document.activeElement as HTMLElement | null)?.blur?.();
    const marked = !many && !ol.state.selection.has(row.id);
    if (marked) ol.dispatch({ type: "select", id: row.id });
    ui.setSheet({ rowId: row.id, ids: many ? [...ol.state.selection] : [row.id], marked });
    navigator.vibrate?.(8);
  };
  const touch: React.HTMLAttributes<HTMLDivElement> =
    coarse && !editingField
      ? {
          onPointerDown: (event) => {
            if (
              event.pointerType === "mouse" ||
              (event.target as Element).closest("[data-drag-handle],[role=checkbox],a")
            )
              return;
            clearPress();
            const state = { x: event.clientX, y: event.clientY, fired: false, timer: 0 };
            state.timer = window.setTimeout(() => {
              state.fired = true;
              openSheet();
            }, 480);
            press.current = state;
          },
          onPointerMove: (event) => {
            if (
              press.current &&
              !press.current.fired &&
              Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 8
            ) {
              clearPress();
              press.current = null;
            }
          },
          onPointerUp: clearPress,
          onPointerCancel: () => {
            clearPress();
            press.current = null;
          },
          onContextMenu: (event) => {
            // Android fires contextmenu for a long-press: same sheet, once.
            event.preventDefault();
            if (!press.current?.fired) {
              clearPress();
              press.current = { x: 0, y: 0, timer: 0, fired: true };
              openSheet();
            }
          },
          onClickCapture: (event) => {
            if (press.current?.fired) {
              event.preventDefault();
              event.stopPropagation();
            }
            press.current = null;
          },
        }
      : {};
  React.useEffect(() => () => clearPress(), []);

  return (
    <motion.div
      layout={animateLayout ? "position" : false}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: dragging ? 0.35 : 1, height: "auto" }}
      variants={ROW_PRESENCE}
      exit="exit"
      transition={{
        layout: motionTokens.layout,
        height: motionTokens.base,
        opacity: motionTokens.quick,
      }}
      role="treeitem"
      id={rowDomId(row.id)}
      aria-level={row.depth + 1}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      aria-selected={selected}
      aria-label={`${row.agenda ? `${labels.agendaGroups[row.agenda.group]}: ` : ""}${spoken}${row.completed ? ", completed" : ""}${noteText ? ", has note" : ""}${row.locked ? ", locked" : ""}${row.mirror && row.mirror !== "copy" ? ", mirror" : ""}${row.backlinks ? `, ${labels.linkedFrom(row.backlinks).toLowerCase()}` : ""}`}
      data-row={row.id}
      data-cursor={cursor || undefined}
      className="relative"
    >
      {row.agenda && (
        <div
          aria-hidden
          className="flex items-baseline gap-2 ps-[30px] pt-3 pb-1 font-mono text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase first:pt-0"
        >
          <span
            className={cn(
              row.agenda.group === "overdue" && "text-destructive",
              row.agenda.group === "today" && "text-signal",
            )}
          >
            {labels.agendaGroups[row.agenda.group]}
          </span>
          <span className="text-muted-foreground/60 tabular-nums">{row.agenda.count}</span>
          <span className="h-px flex-1 self-center bg-hairline" />
        </div>
      )}
      <SwipeRow row={row} disabled={!!editingField || !editable}>
        <ContextMenu>
          <ContextMenuTrigger asChild disabled={!!editingField || coarse}>
            <div
              {...touch}
              className={cn(
                "group/row relative flex items-start rounded-md transition-colors duration-100 coarse:[-webkit-touch-callout:none]",
                coarse && !editingField && "select-none",
                !selected && !editingField && !cursor && !carried && color?.row,
                carried && "bg-foreground/[0.025] dark:bg-foreground/[0.045]",
                selected && "bg-foreground/[0.06] dark:bg-foreground/[0.09]",
                selected && selectionEdge === "middle" && "rounded-none",
                selected && selectionEdge === "first" && "rounded-b-none",
                selected && selectionEdge === "last" && "rounded-t-none",
                cursor && "bg-foreground/[0.09] dark:bg-foreground/[0.13]",
                row.context && "opacity-55",
              )}
              style={{ paddingInlineStart: `calc(var(--ol-indent) * ${row.depth})` }}
              onClick={(event) => {
                const { ol, ui } = live.current;
                if (readOnly || !(event.shiftKey || event.metaKey || event.ctrlKey)) return;
                event.preventDefault();
                if (ui.editing) {
                  // ⌘/Ctrl- or ⇧-click while editing: the row being edited becomes the selection's first
                  // member, then the clicked row joins it (one click, not two).
                  const editingId = ol.state.caret?.id;
                  if (editingId === row.id) return;
                  ui.setEditing(false);
                  if (editingId) ol.dispatch({ type: "select", id: editingId });
                }
                ol.dispatch({
                  type: "select",
                  id: row.id,
                  extend: event.shiftKey,
                  toggle: event.metaKey || event.ctrlKey,
                });
                ui.focusList();
              }}
            >
              {/* Colour label: a start stripe at the item's own indent (plus the faintest tint), so a
            coloured row never reads as the cursor or the selection band. */}
              {/* hidden on every selected row, so it never stands next to the cursor bar. */}
              {color && !selected && !carried && (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-y-[6px] w-[2px] rounded-full opacity-75 coarse:inset-y-[10px]",
                    color.bar,
                  )}
                  style={{ insetInlineStart: `calc(var(--ol-indent) * ${row.depth} + 1px)` }}
                />
              )}
              {cursor && (
                <motion.span
                  layoutId="outliner-cursor"
                  aria-hidden
                  transition={motionTokens.layout}
                  className="pointer-events-none absolute inset-y-1 start-0.5 w-[3px] rounded-full bg-signal"
                />
              )}
              {/* Indent guides: one hairline per ancestor level, continuous across rows. */}
              {Array.from({ length: row.depth }, (_, level) => (
                <span
                  key={level}
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-y-0 w-px transition-colors duration-150",
                    level >= row.depth - litLevels ? "bg-signal/40" : "bg-border",
                  )}
                  style={{ insetInlineStart: `calc(var(--ol-indent) * ${level} + 17px)` }}
                />
              ))}

              {/* Disclosure */}
              <div className="relative flex h-[var(--ol-line)] w-[22px] shrink-0 items-center justify-center coarse:w-7">
                {row.hasChildren && !flat && (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden
                    onClick={(event) => {
                      event.stopPropagation();
                      const { ol } = live.current;
                      if (event.altKey)
                        ol.dispatch({
                          type: "expand",
                          ids: subtreeIds(row.node),
                          expanded: !row.expanded,
                        });
                      else ol.dispatch({ type: "toggle", id: row.id });
                    }}
                    className={cn(
                      // Touch: the hit area also covers the empty indent to its start (44 × 44 to the finger).
                      "relative grid size-5 place-items-center rounded-[5px] text-muted-foreground/80 transition-[opacity,background-color,color] hover:bg-muted hover:text-foreground coarse:size-8 coarse:after:absolute coarse:after:-start-4 coarse:after:end-0 coarse:after:top-1/2 coarse:after:h-11 coarse:after:-translate-y-1/2",
                      row.expanded
                        ? "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 coarse:opacity-60"
                        : "opacity-60 group-hover/row:opacity-100",
                    )}
                  >
                    <motion.span
                      animate={{ rotate: row.expanded ? 90 : 0 }}
                      transition={motionTokens.quick}
                      className="grid rtl:-scale-x-100"
                    >
                      <ChevronRight className="size-3.5" />
                    </motion.span>
                  </button>
                )}
              </div>

              {/* Bullet (or ordinal): click zooms in, drag moves. */}
              <div
                className={cn(
                  "relative flex h-[var(--ol-line)] min-w-[18px] shrink-0 items-center justify-center coarse:min-w-7",
                  details.checkbox && "coarse:hidden",
                )}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  data-drag-handle
                  onPointerDown={(event) => live.current.startDrag(event, row)}
                  onClick={(event) => {
                    event.stopPropagation();
                    const { ol, ui } = live.current;
                    // ⌘/⇧-click a bullet selects, like anywhere else on the row.
                    if (event.metaKey || event.ctrlKey || event.shiftKey) {
                      if (readOnly) return;
                      ui.setEditing(false);
                      ol.dispatch({
                        type: "select",
                        id: row.id,
                        extend: event.shiftKey,
                        toggle: event.metaKey || event.ctrlKey,
                      });
                      ui.focusList();
                      return;
                    }
                    // The setting picks what a click does; ⌥/Alt-click does the other. A leaf has
                    // nothing to fold, so it always zooms.
                    const fold = (ui.settings.bulletClick === "fold") !== event.altKey;
                    if (fold && row.hasChildren) ol.dispatch({ type: "toggle", id: row.id });
                    else {
                      ol.dispatch({ type: "hoist", id: row.id });
                      ui.setEditing(false);
                    }
                  }}
                  className={cn(
                    "group/bullet grid h-[18px] min-w-[18px] cursor-grab touch-none place-items-center rounded-full active:cursor-grabbing coarse:h-7 coarse:min-w-7",
                    row.ordinal !== undefined && "rounded-[5px] px-0.5 hover:bg-muted",
                  )}
                >
                  {row.ordinal !== undefined ? (
                    <span
                      dir="ltr"
                      className={cn(
                        "font-mono text-[11px] text-muted-foreground tabular-nums",
                        color && "text-foreground/80",
                      )}
                    >
                      {row.ordinal}.
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "block rounded-full transition-[width,height,background-color,box-shadow] duration-150",
                        color ? color.dot : "bg-foreground/55",
                        "size-[5px] group-hover/bullet:size-[7px]",
                        row.hasChildren &&
                          !row.expanded &&
                          "size-[6px] shadow-[0_0_0_4px_color-mix(in_srgb,var(--foreground)_10%,transparent)]",
                        row.completed && !color && "bg-foreground/25",
                        // A mirror's bullet is a ring: the same item, shown here too (the conventional cue).
                        row.mirror &&
                          row.mirror !== "copy" &&
                          "bg-transparent ring-[1.5px] ring-signal/70",
                      )}
                    />
                  )}
                </button>
              </div>

              {details.checkbox && (
                <div className="flex h-[var(--ol-line)] w-6 shrink-0 items-center justify-center coarse:w-11">
                  <TaskCheckbox
                    checked={row.completed}
                    disabled={!editable}
                    onToggle={() => {
                      const { ol, ui } = live.current;
                      ui.announceToggle(ol.commands.toggleComplete([row.id]));
                      // a click in browse mode leaves the keyboard on this row (↑ ↓ Space keep
                      // working). Touch has no keyboard cursor; a field being edited keeps its caret.
                      if (!coarse && !ui.editing) {
                        ol.dispatch({ type: "select", id: row.id });
                        ui.focusList();
                      }
                    }}
                  />
                </div>
              )}

              {/* Content */}
              <div className="min-w-0 flex-1 py-[var(--ol-row-pad)] pe-1">
                {flat && row.path && row.path.length > 0 && (
                  <div className="mb-px truncate text-2xs text-muted-foreground">
                    {row.path.join(" › ")}
                  </div>
                )}
                <div className={cn("relative", headingClass(heading))}>
                  {editingField === "title" ? (
                    <RowField row={row} field="title" />
                  ) : (
                    <span
                      ref={titleRef}
                      onMouseDown={(event) => {
                        if (editable && !event.shiftKey && !event.metaKey && !event.ctrlKey)
                          event.preventDefault();
                      }}
                      onClick={(event) => {
                        if (event.shiftKey || event.metaKey || event.ctrlKey) return;
                        event.stopPropagation();
                        beginEdit(event, "title", node.text, titleRef.current);
                      }}
                      data-ol-title=""
                      className={cn(
                        "block min-h-[var(--ol-leading)] cursor-text transition-colors duration-200",
                        !editable && "cursor-default",
                        row.completed &&
                          "text-muted-foreground line-through decoration-muted-foreground/60",
                      )}
                    >
                      {node.text ? (
                        <InlineText
                          source={node.text}
                          marks={row.match?.titleRanges}
                          onTag={(tag) =>
                            live.current.ol.setView((view) => ({ ...view, query: tag }))
                          }
                          onRef={(title, id) => live.current.revealItem(id, title)}
                          resolveRef={(id) => live.current.refSource(id)}
                          onDate={(segment, el) =>
                            segment.date &&
                            editable &&
                            live.current.ui.setDatePicker({
                              rowId: row.id,
                              field: "title",
                              start: segment.start,
                              end: segment.end,
                              src: node.text.slice(segment.start, segment.end),
                              value: segment.date.value,
                              hasTime: segment.date.hasTime,
                              repeat: segment.date.repeat,
                              rangeEnd: segment.date.end,
                              rangeEndHasTime: segment.date.endHasTime,
                              time: segment.date.time,
                              rect: el.getBoundingClientRect(),
                            })
                          }
                        />
                      ) : (
                        <span className="text-muted-foreground/50">
                          {editable ? "Untitled" : "—"}
                        </span>
                      )}
                      {row.locked && (
                        <Lock
                          aria-hidden
                          className="ms-1.5 inline size-3 -translate-y-px text-muted-foreground"
                        />
                      )}
                      <RowBadges row={row} starred={starred} />
                      {row.summary && row.summary.descendants > 0 && (
                        <FoldTasks
                          node={row.node}
                          summary={row.summary}
                          disabled={!editable}
                          coarse={coarse}
                          labels={labels}
                          onExpand={() => live.current.ol.dispatch({ type: "toggle", id: row.id })}
                          onToggle={(id) => {
                            const { ol, ui } = live.current;
                            ui.announceToggle(ol.commands.toggleComplete([id]));
                          }}
                          isLocked={(id) => live.current.ol.isItemLocked(id)}
                          onClose={(event) =>
                            live.current.ui.returnFocus(event, coarse ? null : row.id)
                          }
                        />
                      )}
                    </span>
                  )}
                </div>
                <AnimatePresence initial={false}>
                  {showNote && (
                    <motion.div
                      key="note"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={motionTokens.quick}
                      className="overflow-hidden"
                    >
                      {editingField === "note" ? (
                        <RowField row={row} field="note" />
                      ) : (
                        <NoteDisplay
                          row={row}
                          firstLine={noteDisplay === "first-line"}
                          readOnly={readOnly}
                          onEdit={(event, el) => beginEdit(event, "note", noteText, el)}
                        />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Trailing meta + actions */}
              <div className="flex h-[var(--ol-line)] shrink-0 items-center gap-1 ps-1">
                {coarse ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    data-row-actions
                    aria-haspopup="menu"
                    aria-label={
                      rangeMode && cursor
                        ? labels.actionsForSelection(live.current.ol.state.selection.size)
                        : labels.actionsFor(spoken)
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      openSheet();
                    }}
                    className={cn(
                      // 44 × 44: on touch the row's first line is 44 px tall (outliner-settings.css).
                      "grid h-[var(--ol-line)] w-11 place-items-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-60 active:bg-muted",
                      selected && "opacity-60",
                      rangeMode && selected && !cursor && "invisible",
                    )}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        tabIndex={-1}
                        data-row-menu=""
                        // The tree is one tab stop (Tab indents), so the keyboard opens these same
                        // entries from the row itself: ⇧F10, the ContextMenu key, or "/".
                        aria-keyshortcuts="Shift+F10 ContextMenu /"
                        aria-label={
                          rangeMode && cursor
                            ? labels.actionsForSelection(live.current.ol.state.selection.size)
                            : labels.actionsFor(spoken)
                        }
                        onClick={(event) => event.stopPropagation()}
                        className={cn(
                          "grid size-6 place-items-center rounded-[5px] text-muted-foreground opacity-0 transition-[opacity,background-color] group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:opacity-100",
                          rangeMode && cursor && "opacity-70",
                          rangeMode && selected && !cursor && "invisible",
                        )}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      collisionPadding={12}
                      className="w-56"
                      onCloseAutoFocus={(event) => live.current.ui.returnFocus(event)}
                    >
                      <ItemMenuContent
                        ids={selected ? [...live.current.ol.state.selection] : [row.id]}
                        row={row}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent
            collisionPadding={12}
            onCloseAutoFocus={(event) => live.current.ui.returnFocus(event)}
            className="max-h-[min(70vh,var(--available-height))] w-56 overflow-y-auto"
          >
            <ItemMenuContent
              variant="context"
              ids={selected ? [...live.current.ol.state.selection] : [row.id]}
              row={row}
            />
          </ContextMenuContent>
        </ContextMenu>
      </SwipeRow>
    </motion.div>
  );
});

const rowDomId = (id: string) => `ol-row-${id}`;
/** The id links and bookmarks name a row by: a mirror names its source, a copy the item it shows. */
const identityOfRow = (row: OutlinerRow) =>
  row.mirror === "copy" ? row.id.slice(row.id.indexOf("~") + 1) : (row.mirror ?? row.id);

/** Clipboard flavors: lossless JSON (colors, numbering, notes) for outliners, Markdown for everyone else. */
const OUTLINE_MIME = "application/x-fast-outline+json";
/** Three flavors: lossless JSON (us), nested-list HTML (doc editors, note apps, mail), Markdown (everyone). */
function writeClipboard(data: DataTransfer, ol: OutlinerController, ids: readonly string[]) {
  data.setData("text/plain", ol.commands.copyMarkdown(ids));
  data.setData("text/html", ol.commands.exportHtml(ids));
  data.setData(OUTLINE_MIME, ol.commands.exportAs("json", ids));
}
/** Paste: our JSON first, then structured HTML from other apps, then Markdown/OPML/indented text. */
function readClipboard(
  data: DataTransfer,
  ol: OutlinerController,
  afterId?: string,
  select: SelectPolicy = "keep",
): number | null {
  const json = data.getData(OUTLINE_MIME);
  if (json) {
    const count = ol.commands.importJSON(json, afterId);
    if (count !== null) return count;
  }
  const html = data.getData("text/html");
  if (html && htmlHasStructure(html)) {
    const count = ol.commands.importHtml(html, afterId, select);
    // A paste stays quiet unless something was lost (images, embeds, tables …).
    if (count) reportImport(html, { format: "html", quiet: true, items: count });
    if (count) return count;
  }
  const text = data.getData("text/plain");
  return text ? ol.commands.importText(text, afterId, select) : null;
}

/**
 * Windowed rendering for large documents: only rows near the viewport mount, measured for
 * their real (wrapping, note-bearing) height. The cursor row is scrolled into the window
 * before it needs focus, so keyboard travel never lands on an unmounted row.
 */
function VirtualRows({
  rows,
  renderRow,
  scrollEl,
  listRef,
  focusId,
  editing = false,
  register,
  pinnedIds = [],
}: {
  readonly rows: readonly OutlinerRow[];
  readonly renderRow: (row: OutlinerRow) => React.ReactNode;
  readonly scrollEl: HTMLDivElement | null;
  readonly listRef: React.RefObject<HTMLDivElement | null>;
  readonly focusId: string | null | undefined;
  /** Entering edit mode on a row scrolled out of the window must bring it back (its editor mounts there). */
  readonly editing?: boolean;
  readonly register: OutlinerUi["registerScroller"];
  /**
   * Rows that stay mounted whatever the window: the phone sheet's target (it is lifted into view
   * and its ⋯ takes focus back) and the cursor row (aria-activedescendant must name a real row).
   */
  readonly pinnedIds?: readonly (string | null | undefined)[];
}) {
  const [margin, setMargin] = React.useState(0);
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (scrollEl && list)
      setMargin(
        list.getBoundingClientRect().top -
          scrollEl.getBoundingClientRect().top +
          scrollEl.scrollTop,
      );
  }, [scrollEl, listRef]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => 28,
    overscan: 14,
    scrollMargin: margin,
    // The sticky ancestor strip pads the top while shown; keyboard scrolling must clear it.
    scrollPaddingStart: Number.parseFloat(scrollEl?.style.scrollPaddingTop || "0") || 0,
    getItemKey: (index) => rows[index]!.id,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      const pinned = pinnedIds
        .flatMap((id) => (id ? [rows.findIndex((row) => row.id === id)] : []))
        .filter((index) => index >= 0 && !indexes.includes(index));
      return pinned.length ? [...new Set([...indexes, ...pinned])].sort((a, b) => a - b) : indexes;
    },
  });
  // ui.scrollToRow reaches rows outside the window (delete's new selection, links, crumbs).
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  React.useEffect(() => {
    register((id, align) => {
      const index = rowsRef.current.findIndex((row) => row.id === id);
      if (index < 0) return false;
      virtualizer.scrollToIndex(index, { align });
      return true;
    });
    return () => register(null);
  }, [register, virtualizer]);
  // Follow the cursor only when the cursor itself moves while the outliner has focus; a
  // re-filter or a background index shift must never yank the viewport.
  // Keyed on edit mode too: Enter turns the cursor into the caret on the SAME id, and a row
  // outside the window would otherwise "edit" with no editor mounted.
  const focusKey = focusId ? `${focusId}${editing ? "|edit" : ""}` : null;
  const lastFocus = React.useRef(focusKey);
  React.useLayoutEffect(() => {
    if (focusKey === lastFocus.current) return;
    lastFocus.current = focusKey;
    if (
      !focusId ||
      (!listRef.current?.contains(document.activeElement) &&
        document.activeElement !== listRef.current)
    )
      return;
    const index = rows.findIndex((row) => row.id === focusId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [focusKey, focusId, rows, virtualizer, listRef]);
  return (
    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((item) => (
        <div
          key={item.key}
          data-index={item.index}
          ref={virtualizer.measureElement}
          className="absolute inset-x-0 top-0"
          style={{ transform: `translateY(${item.start - margin}px)` }}
        >
          {renderRow(rows[item.index]!)}
        </div>
      ))}
    </div>
  );
}

interface LiveHandle {
  readonly ol: OutlinerController;
  readonly ui: OutlinerUi;
  readonly startDrag: (event: React.PointerEvent, row: OutlinerRow) => void;
  /** Follow an internal link: by id when known, else search by title. */
  readonly revealItem: (id: string | undefined, title: string) => void;
  /** Current plain title of a link target, or null when it was deleted. */
  readonly resolveRef: (id: string) => string | null;
  /** A link target's raw title source (the link renders its words without chips). */
  readonly refSource: (id: string) => string | null;
}
/** Stable identity forever; `.current` is refreshed every render of <Outliner>. */
const LiveContext = React.createContext<React.RefObject<LiveHandle> | null>(null);
const useLive = () => React.useContext(LiveContext)!;

/**
 * Touch-only swipe actions, two stages each way (gestures.ts): toward the inline end completes,
 * further indents; toward the start deletes (with undo), further outdents. The action is
 * revealed under the row as it moves; crossing a stage swaps the icon with a haptic tick.
 */
function SwipeRow({
  row,
  disabled,
  children,
}: {
  readonly row: OutlinerRow;
  readonly disabled: boolean;
  readonly children: React.ReactNode;
}) {
  const live = useLive();
  const coarse = useMediaQuery("(pointer: coarse)");
  const x = useMotionValue(0);
  const host = React.useRef<HTMLDivElement>(null);
  const [intent, setIntent] = React.useState<ReturnType<typeof swipeIntent>>(null);
  // Clip only while the row is off its resting place: at rest, hit areas that reach past the
  // row's edge (the fold chevron's 44px target in the gutter) must stay tappable.
  const [moving, setMoving] = React.useState(false);
  useMotionValueEvent(x, "change", (v) => setMoving(v !== 0));
  const forwardOpacity = useTransform(x, (v) =>
    Math.min(1, Math.abs(Math.max(0, rtlSign(host.current) * v)) / 30),
  );
  const backOpacity = useTransform(x, (v) =>
    Math.min(1, Math.abs(Math.min(0, rtlSign(host.current) * v)) / 30),
  );
  const iconScale = useTransform(x, [-120, -36, 0, 36, 120], [1.12, 1, 0.8, 1, 1.12]);
  useMotionValueEvent(x, "change", (v) => {
    const next = swipeIntent(v, rtlSign(host.current) < 0);
    if (next === intent) return;
    if (next) navigator.vibrate?.(next === "indent" || next === "outdent" ? 10 : 5);
    setIntent(next);
  });
  if (!coarse || disabled) return <>{children}</>;
  const onDragEnd = () => {
    const { ol, ui } = live.current;
    const L = ui.labels;
    const what = swipeIntent(x.get(), rtlSign(host.current) < 0);
    if (what === "complete") {
      ui.announceToggle(ol.commands.toggleComplete([row.id]));
      navigator.vibrate?.(6);
    } else if (what === "delete") deleteItems(live.current, [row.id]);
    else if (what === "indent" || what === "outdent") {
      const outcome = ol.commands.shift([row.id], what);
      if (outcome === "moved") ui.announce(what === "indent" ? L.indented : L.outdented);
      else if (outcome === "noop")
        toast(what === "indent" ? L.cannotIndent : L.cannotOutdent, { id: "outliner-swipe" });
    }
    animateValue(x, 0, motionTokens.layout);
  };
  const L = live.current.ui.labels;
  const forward =
    intent === "indent"
      ? { label: L.swipeIndent, Icon: IndentIncrease, tone: "bg-signal/15 text-signal" }
      : { label: L.swipeComplete, Icon: CircleCheck, tone: "bg-success/15 text-success" };
  const back =
    intent === "outdent"
      ? { label: L.swipeOutdent, Icon: IndentDecrease, tone: "bg-muted text-foreground" }
      : { label: L.swipeDelete, Icon: Trash2, tone: "bg-destructive/12 text-destructive" };
  return (
    <div
      ref={host}
      className={cn("relative rounded-md", moving && "overflow-hidden")}
      data-swipe-row={row.id}
      data-swipe-moving={moving || undefined}
      data-swipe-intent={intent ?? undefined}
    >
      <motion.div
        aria-hidden
        style={{ opacity: forwardOpacity }}
        className={cn(
          "absolute inset-0 flex items-center gap-2 ps-4 text-[13px] font-medium transition-colors duration-150",
          forward.tone,
        )}
      >
        <motion.span
          style={{ scale: iconScale }}
          key={forward.label}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={motionTokens.quick}
        >
          <forward.Icon className="size-5 rtl:-scale-x-100" />
        </motion.span>
        {/* Words only at the long stage, where the row has moved far enough to show them. */}
        <span
          className={cn(
            "whitespace-nowrap transition-opacity",
            intent === "indent" ? "opacity-100" : "opacity-0",
          )}
        >
          {forward.label}
        </span>
      </motion.div>
      <motion.div
        aria-hidden
        style={{ opacity: backOpacity }}
        className={cn(
          "absolute inset-0 flex items-center justify-end gap-2 pe-4 text-[13px] font-medium transition-colors duration-150",
          back.tone,
        )}
      >
        <span
          className={cn(
            "whitespace-nowrap transition-opacity",
            intent === "outdent" ? "opacity-100" : "opacity-0",
          )}
        >
          {back.label}
        </span>
        <motion.span
          style={{ scale: iconScale }}
          key={back.label}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={motionTokens.quick}
        >
          <back.Icon className="size-5 rtl:-scale-x-100" />
        </motion.span>
      </motion.div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        dragSnapToOrigin={false}
        style={{ x }}
        onDragEnd={onDragEnd}
        className="relative bg-surface"
      >
        {children}
      </motion.div>
    </div>
  );
}

/** +1 in LTR, −1 in RTL: swipe offsets are read toward the inline end. */
const rtlSign = (el: Element | null) => (el && getComputedStyle(el).direction === "rtl" ? -1 : 1);

function headingClass(heading?: 1 | 2 | 3) {
  // Sized from the settings' type scale (--ol-text / --ol-leading, see settings.ts).
  return heading === 1
    ? "text-[length:calc(var(--ol-text)+3px)] leading-[calc(var(--ol-leading)+4px)] font-semibold tracking-[-0.01em]"
    : heading === 2
      ? "text-[length:calc(var(--ol-text)+1px)] leading-[var(--ol-leading)] font-semibold"
      : heading === 3
        ? "text-[length:var(--ol-text)] leading-[var(--ol-leading)] font-semibold text-foreground/85"
        : "text-[length:var(--ol-text)] leading-[var(--ol-leading)]";
}

function NoteDisplay({
  row,
  firstLine,
  readOnly,
  onEdit,
}: {
  readonly row: OutlinerRow;
  readonly firstLine: boolean;
  readonly readOnly: boolean;
  readonly onEdit: (event: React.MouseEvent, el: HTMLElement | null) => void;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const note = row.details.note ?? "";
  return (
    <span
      ref={ref}
      data-ol-note=""
      onMouseDown={(event) => !readOnly && event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onEdit(event, ref.current);
      }}
      className={cn(
        "block cursor-text pt-px text-[length:var(--ol-note)] leading-[var(--ol-note-leading)] text-muted-foreground",
        firstLine && "truncate",
        row.completed && "opacity-70",
      )}
    >
      {firstLine ? (
        <InlineText source={note.split("\n")[0]!} marks={row.match?.noteRanges} />
      ) : (
        <RichNote source={note} marks={row.match?.noteRanges} />
      )}
    </span>
  );
}

/**
 * Quiet trailing marks after a title: a star (bookmarked), a mirror glyph (click reveals the
 * source) and "linked from N" (click zooms in, where the backlinks panel lists them).
 */
function RowBadges({ row, starred }: { readonly row: OutlinerRow; readonly starred: boolean }) {
  const live = useLive();
  const labels = live.current.ui.labels;
  const source = row.mirror && row.mirror !== "copy" ? row.mirror : null;
  const board = isBoard(row.node);
  if (!starred && !source && !row.backlinks && !board) return null;
  const chip =
    "relative ms-1.5 inline-flex h-[18px] translate-y-[-1px] items-center gap-1 rounded-[5px] px-1 align-middle font-mono text-[10.5px] text-muted-foreground no-underline transition-colors after:absolute after:-inset-1 hover:bg-muted hover:text-foreground coarse:after:-inset-3";
  return (
    <>
      {starred && (
        <Star
          aria-hidden
          className="ms-1.5 inline size-3 -translate-y-px fill-current text-warning/80"
        />
      )}
      {board && (
        <button
          type="button"
          tabIndex={-1}
          title={labels.board}
          aria-label={`${labels.board}: ${labels.zoomIn}`}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            live.current.ol.dispatch({ type: "hoist", id: row.id });
            live.current.ui.setEditing(false);
          }}
          className={cn(chip, "border border-hairline")}
        >
          <Kanban className="size-3" />
          <bdi className="tabular-nums">{row.node.children?.length ?? 0}</bdi>
        </button>
      )}
      {source && (
        <button
          type="button"
          tabIndex={-1}
          title={labels.mirrorOf(live.current.resolveRef(source) ?? labels.untitled)}
          aria-label={labels.mirrorOf(live.current.resolveRef(source) ?? labels.untitled)}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            live.current.revealItem(source, "");
          }}
          className={cn(chip, "text-signal/80")}
        >
          <Repeat2 className="size-3" />
        </button>
      )}
      {!!row.backlinks && (
        <button
          type="button"
          tabIndex={-1}
          title={labels.linkedFrom(row.backlinks)}
          aria-label={labels.linkedFrom(row.backlinks)}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            live.current.ol.dispatch({ type: "hoist", id: row.id });
            live.current.ui.setEditing(false);
          }}
          className={cn(chip, "border border-hairline")}
        >
          <CornerDownRight className="size-3 -scale-x-100 rtl:scale-x-100" />
          <bdi className="tabular-nums">{row.backlinks}</bdi>
        </button>
      )}
    </>
  );
}

function TaskCheckbox({
  checked,
  disabled,
  onToggle,
  focusable = false,
  label,
  className,
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  /** Rows are one tab stop (the tree); the zoomed title's box is its own stop. */
  readonly focusable?: boolean;
  readonly label?: string;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? (checked ? "Mark incomplete" : "Mark complete")}
      disabled={disabled}
      tabIndex={focusable ? 0 : -1}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "relative grid size-[15px] place-items-center rounded-[4px] border transition-[background-color,border-color,transform] duration-150 outline-none after:absolute after:-inset-1.5 focus-visible:ring-3 focus-visible:ring-signal/30 active:scale-90 disabled:opacity-60 coarse:size-5 coarse:after:-inset-[13px]",
        checked
          ? "border-signal bg-signal text-signal-foreground"
          : "border-foreground/30 bg-background hover:border-foreground/55",
        className,
      )}
    >
      <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
        <motion.path
          d="M2.5 6.2 5 8.6 9.6 3.6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={motionTokens.quick}
        />
      </svg>
    </button>
  );
}

/* ───────────────────────────── Editing field ───────────────────────────── */

/** A mouse/trackpad device (read once): see Enter in RowField. */
const FINE_POINTER =
  typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches;
const NATIVE_FIELD_SIZING = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");

/**
 * A board card's field keeps the board's shape: ↑/↓ at an edge go to the neighbouring card in
 * the column, Enter at the end adds the next card, Tab and merges (which would nest or fold cards
 * into each other out of sight) do nothing, and Backspace in an empty card deletes it.
 */
export interface BoardFieldNav {
  /** The card above/below in this column (null at the ends). */
  readonly step: (id: string, direction: "up" | "down") => string | null;
  /** Add the next card after `id` and edit it. */
  readonly addAfter: (id: string) => void;
  /** Delete the empty card `id`, landing on `next`. */
  readonly removeEmpty: (id: string, next: string | null) => void;
}

/** The style each formatting shortcut toggles in the live title field. */
const FORMAT_STYLES: Partial<
  Record<ShortcutId, "bold" | "italic" | "code" | "strike" | "highlight">
> = {
  bold: "bold",
  italic: "italic",
  code: "code",
  strike: "strike",
  highlight: "highlight",
};

/** A key event as a row field reads it: React's for a title's loading textarea, the live field's own otherwise. */
type FieldKey = Pick<
  React.KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "preventDefault" | "stopPropagation"
> & {
  readonly code?: string;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
  readonly nativeEvent?: { readonly isComposing?: boolean; readonly keyCode?: number };
  readonly currentTarget: CaretField;
  getModifierState?(key: string): boolean;
};

/** One live field's host for the life of a component (it reads the newest controller). */
function useFieldHost(ol: OutlinerController): FieldHost {
  const latest = React.useRef(ol);
  latest.current = ol;
  return React.useMemo(() => fieldHost(() => latest.current, React.startTransition), []);
}

/** What a field notice says (the outliner announces it, never silently drops an edit). */
function noticeText(ui: OutlinerUi, notice: FieldNotice): string {
  const L = ui.labels;
  switch (notice.kind) {
    case "format-refused":
      return L.formatRefused;
    case "paste-literal":
      return L.pastedLiteral;
    case "token-refused":
      return L.tokenRefused;
    case "merge-refused":
      return L.mergeRefused;
    case "split-refused":
      return L.splitRefused;
    case "edit-conflict":
      return L.editConflict;
  }
}

function reportCollaborationField(
  ol: OutlinerController,
  itemId: string,
  field: "title" | "note",
  kind: "selection" | "composition-start" | "composition-end",
  el: CaretField,
) {
  const backward = el.selectionDirection === "backward";
  ol.reportField({
    kind,
    itemId,
    field,
    text: el.value,
    anchor: backward ? el.selectionEnd : el.selectionStart,
    head: backward ? el.selectionStart : el.selectionEnd,
  });
}

export function RowField({
  row,
  field,
  board,
}: {
  readonly row: OutlinerRow;
  readonly field: "title" | "note";
  readonly board?: BoardFieldNav;
}) {
  const { ol, ui } = useOutlinerContext();
  // Titles and notes edit in the live field once its code has loaded (asked for while idle at
  // mount). Until then a title edits in a plain textarea and a note shows as it reads.
  const liveModule = useLiveField();
  const LiveField = liveModule?.LiveField;
  const host = useFieldHost(ol);
  const attachmentOwner = React.useRef({ ol, ui, active: true });
  attachmentOwner.current.ol = ol;
  attachmentOwner.current.ui = ui;
  React.useEffect(() => {
    attachmentOwner.current.active = true;
    return () => {
      attachmentOwner.current.active = false;
    };
  }, []);
  const ref = React.useRef<CaretField | null>(null);
  const textareaRef = React.useCallback((el: HTMLTextAreaElement | null) => {
    if (el || ref.current instanceof HTMLTextAreaElement) ref.current = el;
  }, []);
  /** Set when a handled key moves the caret elsewhere; React's synthetic select for the same
   *  keydown would otherwise report this field's stale selection and undo that move. */
  const suppressSelect = React.useRef(false);
  const reportField = (
    kind: "selection" | "composition-start" | "composition-end",
    el: CaretField,
  ) => reportCollaborationField(ol, row.id, field, kind, el);

  const committed = field === "title" ? row.node.text : (row.details.note ?? "");
  /*
   * a keystroke paints from this local draft; the document update (and every part of the
   * outliner that renders from it) follows as a transition. The store itself updates
   * synchronously, so the next key, Enter or ⌘Z always builds on every character typed. The draft
   * is current only while it is ahead of what has rendered (`renderedSeq`): any later render
   * (the transition, an undo, a refusal) shows the document again.
   */
  const [draft, setDraft] = React.useState<{ readonly text: string; readonly seq: number } | null>(
    null,
  );
  const stored = draft && draft.seq > ol.renderedSeq ? draft.text : committed;
  const ac = useAutocomplete(ol, row, field);
  // "/" in a title: the item menu, its query transient (never stored, never in history).
  const slash = useSlashMenu({ ol, ui, row, field, ref });
  const listId = React.useId();
  const value = slash.value ?? stored;

  // Autosize: native field-sizing where supported, otherwise measure on value and width changes.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!(el instanceof HTMLTextAreaElement) || NATIVE_FIELD_SIZING) return;
    const fit = () => {
      el.style.height = "0px";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, [value, LiveField]);

  // Focus + caret placement whenever the core moves the caret to this field (the live field
  // places its own caret from the same core caret).
  const caret = ol.state.caret;
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!(el instanceof HTMLTextAreaElement) || !caret || caret.id !== row.id) return;
    if ((caret.field ?? "title") !== field) return;
    // Typing in this very field: the browser already placed and revealed the caret. Skipping
    // the forced layout of scrollIntoView keeps each keystroke to one layout pass.
    if (
      document.activeElement === el &&
      el.selectionStart === caret.start &&
      el.selectionEnd === caret.end
    )
      return;
    // Keys typed after this render's document (draft ahead): the browser's caret is the truth.
    if (document.activeElement === el && draft && draft.seq > ol.renderedSeq) return;
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    if (el.selectionStart !== caret.start || el.selectionEnd !== caret.end)
      el.setSelectionRange(caret.start, caret.end);
    el.scrollIntoView({ block: "nearest" });
    // focusVersion changes signal deliberate caret moves (split, merge, undo, navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ol.state.focusVersion, row.id, field, LiveField]);

  /** The popups' keys first (the item menu, then suggestions). */
  const onMenuKey = (event: FieldKey): boolean => {
    if (slash.onKeyDown(event) || ac.onKeyDown(event)) {
      suppressSelect.current = true;
      return true;
    }
    return false;
  };

  /** Every other key a row field answers: true when it was handled. */
  const onFieldKey = (event: FieldKey): boolean => {
    const el = event.currentTarget;
    const liveEl = isLiveField(el) ? el : null;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key;
    const lower = key.toLowerCase();
    const value = el.value;
    const start = el.selectionStart,
      end = el.selectionEnd;
    const dispatch = ol.dispatch;
    suppressSelect.current = false;
    const prevent = () => {
      event.preventDefault();
      event.stopPropagation();
      suppressSelect.current = true;
      return true;
    };

    if (mod && lower === "z") {
      prevent();
      dispatch({ type: event.shiftKey ? "redo" : "undo" });
      return true;
    }
    if (event.ctrlKey && !event.metaKey && lower === "y") {
      prevent();
      dispatch({ type: "redo" });
      return true;
    }
    if (key === "Escape") {
      prevent();
      ui.setEditing(false);
      ui.focusList();
      dispatch({ type: "select", id: row.id });
      return true;
    }
    const wrap = (open: string, close = open) => {
      prevent();
      const selected = value.slice(start, end);
      const next = value.slice(0, start) + open + selected + close + value.slice(end);
      dispatch({
        type: field === "note" ? "note" : "text",
        id: row.id,
        text: next,
        caret: end + open.length,
      });
      requestAnimationFrame(() => el.setSelectionRange(start + open.length, end + open.length));
      return true;
    };
    // Remappable shortcuts: the keyboard profile plus the reader's remaps decide what a key means.
    const action = matchShortcut(ui.keymap, event, "text");
    if (action) {
      const style = FORMAT_STYLES[action];
      if (liveEl && style) {
        prevent();
        liveEl.liveField.format(style);
        return true;
      }
      const marks = FORMAT_MARKS[action];
      if (marks) return wrap(marks);
      if (runItemShortcut(action, { ol, ui, ids: [row.id], rowId: row.id })) return prevent();
    }
    if (key === "Enter" && mod) {
      prevent();
      // ⌘⇧↵ is a line break in a note (the power profile's way to write one; standard too).
      if (field === "note" && event.shiftKey) {
        const next = value.slice(0, start) + "\n" + value.slice(end);
        dispatch({ type: "note", id: row.id, text: next, caret: start + 1 });
        requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1));
      }
      return true;
    }
    if (
      field === "note" &&
      key === "Enter" &&
      !event.shiftKey &&
      !event.altKey &&
      ui.settings.keyboard === "power"
    ) {
      // Power profile: Enter in a note finishes it and starts the next item.
      prevent();
      const id = createOutlineId();
      const next = dispatch({ type: "insert", id, afterId: row.id, text: "" });
      if (!next.refusal) dispatch({ type: "focus", id, start: 0 });
      return true;
    }
    if (key === "Enter" && event.shiftKey && !mod) {
      prevent();
      if (field === "title")
        dispatch({
          type: "focus",
          id: row.id,
          field: "note",
          start: (row.details.note ?? "").length,
        });
      else dispatch({ type: "focus", id: row.id, start: row.node.text.length });
      return true;
    }
    const split = () =>
      liveEl
        ? liveEl.liveField.split(createOutlineId())
        : dispatch({ type: "split", id: row.id, start, end, newId: createOutlineId() });
    if (board && field === "title") {
      const bare = !mod && !event.shiftKey && !event.altKey;
      if (key === "Tab") return prevent();
      if (key === "Enter" && bare) {
        prevent();
        if (fieldAt(el, "end")) board.addAfter(row.id);
        else split();
        return true;
      }
      if (
        (key === "ArrowUp" || key === "ArrowDown") &&
        bare &&
        fieldAtVisualBoundary(el, key === "ArrowUp" ? "up" : "down")
      ) {
        const target = board.step(row.id, key === "ArrowUp" ? "up" : "down");
        if (!target) return false;
        prevent();
        const text = ol.rowOf(target)?.node.text ?? "";
        dispatch({ type: "focus", id: target, start: key === "ArrowUp" ? text.length : 0 });
        return true;
      }
      if (key === "Backspace" && bare && fieldAt(el, "start")) {
        prevent();
        if (!value && !row.hasChildren)
          board.removeEmpty(row.id, board.step(row.id, "up") ?? board.step(row.id, "down"));
        return true;
      }
      if (key === "Delete" && bare && fieldAt(el, "end")) return prevent();
    }
    if (field === "note") {
      // Notes are multiline: plain Enter inserts a newline. Arrow keys leave at the edges.
      if (key === "ArrowUp" && fieldAtVisualBoundary(el, "up")) {
        prevent();
        dispatch({ type: "focus", id: row.id, start: row.node.text.length });
      } else if (key === "ArrowDown" && fieldAtVisualBoundary(el, "down")) {
        prevent();
        moveVertical(row.id, "down", el);
      } else if (key === "Backspace" && start === 0 && end === 0 && !value) {
        prevent();
        dispatch({ type: "focus", id: row.id, start: row.node.text.length });
      }
      if (key !== "Tab") return false;
    }
    if (key === "Enter") {
      prevent();
      // Let go of focus while the DOM is still clean: the commit then removes an unfocused field
      // (removing the focused one cost ~20 ms at 4× CPU on 2,740 rows) and the new row's field
      // takes focus once. Touch keeps focus throughout, so the on-screen keyboard never drops.
      if (FINE_POINTER) el.blur();
      const next = split();
      // Refused (a locked source behind a mirror, a stale text): keep typing where you were.
      if (next.refusal || next.caret?.id === row.id) el.focus({ preventScroll: true });
      return true;
    }
    if (key === "Tab") {
      prevent();
      dispatch({ type: event.shiftKey ? "outdent" : "indent", ids: [row.id] });
      return true;
    }
    if (key === "Backspace" && !mod && fieldAt(el, "start")) {
      prevent();
      if (!value && !row.hasChildren && row.details.checkbox) {
        ol.commands.toggleCheckbox([row.id]);
        return true;
      }
      if (liveEl) liveEl.liveField.merge("backward");
      else dispatch({ type: "merge", id: row.id, direction: "backward" });
      return true;
    }
    if (key === "Delete" && !mod && fieldAt(el, "end")) {
      prevent();
      if (liveEl) liveEl.liveField.merge("forward");
      else dispatch({ type: "merge", id: row.id, direction: "forward" });
      return true;
    }
    if (
      (key === "ArrowUp" || key === "ArrowDown") &&
      event.shiftKey &&
      !mod &&
      !event.altKey &&
      field === "title" &&
      !board
    ) {
      // ⇧↑/⇧↓ at a title's visual edge (or once the text selection reaches it) grows a row
      // selection: the edited row and its neighbour, then ⇧↑/⇧↓ keep going in the tree.
      const up = key === "ArrowUp";
      const atEdge =
        (start === end && fieldAtVisualBoundary(el, up ? "up" : "down")) ||
        fieldAt(el, up ? "start" : "end", false);
      if (atEdge) {
        prevent();
        const index = ol.rows.findIndex((candidate) => candidate.id === row.id);
        const target = ol.rows[index + (up ? -1 : 1)];
        ui.setEditing(false);
        dispatch({ type: "select", id: row.id });
        if (target) dispatch({ type: "select", id: target.id, extend: true });
        ui.focusList();
        return true;
      }
    }
    if (
      key === "ArrowUp" &&
      !mod &&
      !event.shiftKey &&
      !event.altKey &&
      fieldAtVisualBoundary(el, "up")
    ) {
      prevent();
      moveVertical(row.id, "up", el);
      return true;
    }
    if (
      key === "ArrowDown" &&
      !mod &&
      !event.shiftKey &&
      !event.altKey &&
      fieldAtVisualBoundary(el, "down")
    ) {
      prevent();
      moveVertical(row.id, "down", el);
      return true;
    }
    if (mod && lower === "a" && fieldAllSelected(el)) {
      prevent();
      ui.setEditing(false);
      dispatch({ type: "select-all" });
      ui.focusList();
      return true;
    }
    return false;
  };

  /** Hand files to the host's `onAttach`; what it stored is appended to the note (one undo step). */
  const attachFiles = (files: readonly File[]) => {
    const handler = ui.host.onAttach;
    if (!handler || ol.readOnly || row.locked) return;
    void Promise.resolve()
      .then(() => handler(files, { itemId: row.id, field }))
      .then((attachments) => {
        const current = attachmentOwner.current;
        if (
          !current.active ||
          current.ol.readOnly ||
          current.ol.isItemLocked(row.id) ||
          current.ui.host.onAttach !== handler
        )
          return;
        const markup = attachmentMarkup(attachments);
        if (!markup) return;
        const node = findOutlineNode(current.ol.latestNodes(), row.id)?.node as
          OutlineItem | undefined;
        if (!node) return;
        const note = node.data?.note ? `${node.data.note}\n${markup}` : markup;
        const before = current.ol.latestNodes();
        const next = current.ol.dispatch({
          type: "transaction",
          focus: false,
          commands: [{ type: "update", id: row.id, changes: { data: { ...node.data, note } } }],
        });
        // A controlled host can veto synchronously: the proposed result alone
        // does not mean the current editor accepted the attachment.
        current.ui.announce(
          next.refusal || current.ol.latestNodes() === before
            ? current.ui.labels.attachFailed
            : current.ui.labels.attached(attachments.length),
        );
      })
      .catch(() => {
        if (attachmentOwner.current.active)
          attachmentOwner.current.ui.announce(attachmentOwner.current.ui.labels.attachFailed);
      });
  };
  /** `https://…?zoom=<id>` of this page (or `?doc=…` of this workspace): insert `[[title|id]]`. */
  const pasteItemLink = (text: string, el: CaretField): boolean => {
    const target = itemFromHref(text, window.location.href);
    if (!target) return false;
    const external = ol.external;
    const here = external ? external.qualify("").slice(0, -1) : null;
    const local = !target.doc || target.doc === here;
    const id = local ? target.id : `${target.doc}/${target.id}`;
    const title = local ? findOutlineNode(ol.latestNodes(), id)?.node.text : external?.resolve(id);
    if (title === undefined || title === null) return false;
    const label =
      inlineToPlain(title)
        .replace(/[[\]|]/g, "")
        .trim() || ui.labels.untitled;
    const link = `[[${label}|${id}]]`;
    const start = el.selectionStart,
      end = el.selectionEnd;
    if (isLiveField(el))
      return el.liveField.replaceSource(start, end, link, el.value.slice(start, end)) || true;
    const value = el.value;
    const next = value.slice(0, start) + link + value.slice(end);
    ol.dispatch({ type: "text", id: row.id, text: next, caret: start + link.length });
    return true;
  };
  /**
   * The paste routes a field shares: files to the host, a deep link as an item link, an outline
   * or several lines as rows (one parser for every paste path). Plain text is the field's own.
   */
  const routePaste = (data: DataTransfer, el: CaretField): boolean => {
    // Files (a screenshot, a PDF): the host stores them and the links land in the note.
    const files = [...(data.files ?? [])];
    if (files.length && ui.host.onAttach) {
      attachFiles(files);
      return true;
    }
    const text = data.getData("text/plain");
    // A deep link to an item of this outline pastes as an item link (`[[title|id]]`).
    if (field === "title" && pasteItemLink(text, el)) return true;
    const rich =
      [...(data.types ?? [])].includes(OUTLINE_MIME) || htmlHasStructure(data.getData("text/html"));
    if (field === "note" || (!text.includes("\n") && !rich)) return false;
    const replaceEmpty = !row.node.text && !row.hasChildren;
    const count = readClipboard(data, ol, row.id) ?? 0;
    if (count && replaceEmpty) ol.dispatch({ type: "delete", ids: [row.id] });
    ui.announce(ui.labels.pasted(count));
    return true;
  };

  const moveVertical = (id: string, direction: "up" | "down", el: CaretField) => {
    // A card's note never walks into the outline's rows (they are not on screen).
    if (board) return;
    const index = ol.rows.findIndex((candidate) => candidate.id === id);
    const target = ol.rows[direction === "up" ? index - 1 : index + 1];
    if (!target) return;
    const caretRect = fieldCaretRect(el, el.selectionStart);
    const targetEl = ui.listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${CSS.escape(target.id)}"] [data-src]`)
      ?.closest<HTMLElement>("span.block");
    let offset = direction === "up" ? target.node.text.length : 0;
    if (targetEl) {
      const box = targetEl.getBoundingClientRect();
      const y = direction === "up" ? box.bottom - 6 : box.top + 6;
      offset = sourceOffsetFromPoint(targetEl, caretRect.left, y, target.node.text.length);
    }
    ol.dispatch({ type: "focus", id: target.id, start: offset });
  };

  const aria = {
    "aria-label": field === "title" ? "Item text" : "Item note",
    role: "combobox",
    "aria-autocomplete": "list" as const,
    "aria-expanded": ac.open || slash.open ? ("true" as const) : ("false" as const),
    "aria-controls": slash.aria ? slash.aria.controls : ac.open ? listId : undefined,
    "aria-activedescendant": slash.aria
      ? slash.aria.activedescendant
      : ac.open
        ? `${listId}-${ac.active}`
        : undefined,
  };

  if (LiveField)
    return (
      <>
        <AutocompletePopover anchor={ref.current} state={ac} listId={listId} />
        {slash.panel}
        <LiveField
          rowId={row.id}
          field={field}
          host={host}
          committed={committed}
          renderedSeq={ol.renderedSeq}
          // A row zoomed into is the heading now (its row only animates out): the caret is the zoomed title's.
          caret={row.id === ol.state.hoistedId ? null : ol.state.caret}
          focusVersion={ol.state.focusVersion}
          holding={slash.open}
          elementRef={ref}
          marks={field === "title" ? row.match?.titleRanges : row.match?.noteRanges}
          resolveRef={(id) => {
            const node = findOutlineNode(ol.state.nodes, id)?.node;
            if (node) return node.text || ui.labels.untitled;
            const external = ol.external?.resolve(id);
            return external === undefined || external === null
              ? null
              : external || ui.labels.untitled;
          }}
          attributes={{
            ...aria,
            spellcheck: "true",
            "data-field": field,
            dir: "auto",
            ...(field === "note" ? { "aria-multiline": "true", "data-placeholder": "Note" } : {}),
          }}
          className={
            field === "title"
              ? cn(
                  "block w-full min-h-[var(--ol-leading)] caret-signal",
                  row.completed &&
                    "text-muted-foreground line-through decoration-muted-foreground/60",
                )
              : cn(
                  NOTE_CLASS.root,
                  "w-full pt-px text-[length:var(--ol-note)] leading-[var(--ol-note-leading)] text-muted-foreground caret-signal",
                  row.completed && "opacity-70",
                )
          }
          hooks={{
            menuKey: onMenuKey,
            key: onFieldKey,
            typed: (el) => {
              ac.sync(el, true);
              reportField("selection", el);
            },
            composition: (active, el) =>
              reportField(active ? "composition-start" : "composition-end", el),
            hold: (el) => slash.onChange(el),
            caretMoved: (el) => {
              reportField("selection", el);
              if (slash.onSelect(el)) return true;
              ac.sync(el);
              return false;
            },
            notice: (notice) => ui.announce(noticeText(ui, notice)),
            paste: routePaste,
            drop: (data) => {
              const files = [...(data.files ?? [])];
              if (!files.length || !ui.host.onAttach) return false;
              attachFiles(files);
              return true;
            },
            openDate: (chip) => {
              const date = chip.segment?.date;
              if (!date) return;
              ui.setDatePicker({
                rowId: row.id,
                field,
                start: chip.from,
                end: chip.to,
                src: chip.src,
                value: date.value,
                hasTime: date.hasTime,
                repeat: date.repeat,
                rangeEnd: date.end,
                rangeEndHasTime: date.endHasTime,
                time: date.time,
                rect: chip.rect,
              });
            },
            undo: (redo) => ol.dispatch({ type: redo ? "redo" : "undo" }),
            focus: () => ui.setEditing(true),
          }}
        />
      </>
    );

  // A note never edits as raw source: until the field's code arrives it shows as it reads.
  if (field === "note")
    return (
      <span
        data-ol-note=""
        aria-busy="true"
        className="block pt-px text-[length:var(--ol-note)] leading-[var(--ol-note-leading)] text-muted-foreground"
      >
        <RichNote source={committed} marks={row.match?.noteRanges} />
      </span>
    );

  return (
    <>
      <AutocompletePopover anchor={ref.current} state={ac} listId={listId} />
      {slash.panel}
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        data-field={field}
        {...aria}
        spellCheck
        onCompositionStart={(event) => reportField("composition-start", event.currentTarget)}
        onCompositionEnd={(event) => {
          const el = event.currentTarget;
          setTimeout(() => reportField("composition-end", el), 0);
        }}
        onMouseDown={() => (suppressSelect.current = false)}
        onChange={(event) => {
          // Typing the `/query` itself: shown, never stored (the menu filters on it).
          if (slash.onChange(event.target)) return;
          const text = event.target.value;
          const caret = event.target.selectionStart;
          // The host hears about it now (its own render is a transition); ours follows the paint.
          React.startTransition(() => {
            ol.dispatch(
              { type: "text", id: row.id, text, caret, time: Date.now() },
              { afterPaint: true },
            );
          });
          setDraft({ text, seq: ol.currentSeq() });
          ac.sync(event.target, true);
          reportField("selection", event.target);
        }}
        onSelect={(event) => {
          const el = event.currentTarget;
          // React can deliver a trailing select for a field that just lost focus (e.g. after
          // Shift+Enter moved to the note); only the focused field may report the caret.
          if (suppressSelect.current || !el.isConnected || document.activeElement !== el) return;
          if (slash.onSelect(el)) return;
          ac.sync(el);
          reportField("selection", el);
          ol.dispatch({
            type: "caret",
            id: row.id,
            start: el.selectionStart,
            end: el.selectionEnd,
          });
        }}
        onFocus={() => ui.setEditing(true)}
        onKeyDown={(event) => {
          // IME: the Enter (or Tab) that picks a candidate never splits, indents or submits.
          if (isComposingKey(event)) return;
          if (onMenuKey(event)) return;
          onFieldKey(event);
        }}
        onDrop={(event) => {
          const files = [...(event.dataTransfer?.files ?? [])];
          if (!files.length || !ui.host.onAttach) return;
          event.preventDefault();
          attachFiles(files);
        }}
        onPaste={(event) => {
          if (routePaste(event.clipboardData, event.currentTarget)) event.preventDefault();
        }}
        dir="auto"
        className={cn(
          "block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none [field-sizing:content] placeholder:text-muted-foreground/50",
          "min-h-[var(--ol-leading)] caret-signal",
          row.completed && "text-muted-foreground",
        )}
      />
    </>
  );
}

/* ───────────────────────────── Row-selection keyboard mode ───────────────────────────── */

function onSelectionKey(
  event: React.KeyboardEvent,
  ol: ReturnType<typeof useOutliner>,
  ui: OutlinerUi,
) {
  // The shared row handler (row-keys.ts) with the list's travel; PageUp/PageDown page by what fits.
  onRowKey(event, ol, ui, listNav(ol), {
    page: (from, dir) => {
      const index = from ? (ol.rowIndex.get(from) ?? -1) : -1;
      const rows = ol.rows;
      const step = rowsPerPage(ui, from);
      const to =
        index < 0
          ? dir === "down"
            ? 0
            : rows.length - 1
          : index + (dir === "down" ? step : -step);
      return rows[Math.max(0, Math.min(rows.length - 1, to))]?.id ?? null;
    },
  });
}

/**
 * The touch adapter: touch selection mode ends after a one-shot action (Complete, Duplicate,
 * a sheet action), as it did when every edit cleared the selection. Edits keep the selection now
 * (the keyboard target), so touch lets it go here. Moves keep it, as they always did,
 * and delete keeps the neighbour it selected.
 */
const KEEPS_TOUCH_SELECTION: ReadonlySet<string> = new Set([
  "move",
  "drop",
  "indent",
  "outdent",
  "undo",
  "redo",
  "delete",
]);
function useTouchSelectionClear(ol: OutlinerController, ui: OutlinerUi, coarse: boolean) {
  const seen = React.useRef(ol.lastEdit()?.seq ?? 0);
  React.useEffect(() => {
    const last = ol.lastEdit();
    if (!last || last.seq === seen.current) return;
    seen.current = last.seq;
    if (!coarse || ui.editing || KEEPS_TOUCH_SELECTION.has(last.type) || !ol.latestSelection().size)
      return;
    ol.dispatch({ type: "clear-selection" });
  });
}

/** Rows a PageUp/PageDown step crosses: what fits in the scroll viewport, by the cursor row's height. */
function rowsPerPage(ui: OutlinerUi, cursor: string | null): number {
  const list = ui.listRef.current;
  const scroller = list?.closest<HTMLElement>("[data-outliner-scroll]");
  const row = cursor
    ? list?.querySelector<HTMLElement>(`[data-row="${CSS.escape(cursor)}"]`)
    : null;
  const height = row?.getBoundingClientRect().height || 28;
  const viewport = scroller?.clientHeight || 0;
  // jsdom and an unmeasured layout report 0: a sensible page, never a no-op.
  return viewport ? Math.max(1, Math.floor(viewport / height) - 1) : 10;
}

function subtreeIds(node: OutlinerRow["node"]): string[] {
  const ids: string[] = [];
  const stack = [node];
  while (stack.length) {
    const next = stack.pop()!;
    if (next.children?.length) ids.push(next.id);
    stack.push(...(next.children ?? []));
  }
  return ids;
}

/* ───────────────────────────── Drag to reorder ───────────────────────────── */

interface DragState {
  readonly ids: readonly string[];
  readonly label: string;
  readonly pointer: { readonly x: number; readonly y: number };
  readonly gap: number;
  readonly depth: number;
  readonly top: number;
  readonly left: number;
  readonly valid: boolean;
  /** A folded row the pointer rests on: it opens after HOVER_EXPAND_MS (list-relative box). */
  readonly hover: { readonly id: string; readonly top: number; readonly height: number } | null;
  /** Over a host drop target outside the outline (no drop line is drawn). */
  readonly external?: boolean;
  /** ⌥/Alt held: the drop copies (fresh ids) instead of moving. */
  readonly copy?: boolean;
}

/** A `data-outline-drop` element under the pointer that is not part of this outline's list. */
function outsideDropTarget(x: number, y: number, list: HTMLElement): HTMLElement | null {
  const hit =
    document.elementFromPoint?.(x, y)?.closest<HTMLElement>("[data-outline-drop]") ?? null;
  return hit && !list.contains(hit) ? hit : null;
}

/** How long the pointer rests on a folded row during a drag before it opens. */
const HOVER_EXPAND_MS = 600;

/**
 * Pointer-driven move. The bullet is the handle (mouse: drag past 4px; touch: long-press).
 * Horizontal offset chooses nesting depth; the core's planOutlineDrop resolves the final
 * parent/index so a gap never adopts the row below it by accident. Resting on a folded row
 * opens it; rows opened that way fold again unless the drop landed inside them, and Esc
 * cancels the whole drag (and folds them all back).
 */
function useRowDrag() {
  const { ol, ui } = useOutlinerContext();
  const [state, setState] = React.useState<DragState | null>(null);
  const live = React.useRef<DragState | null>(null);
  // Rows change mid-drag (hover-expand): handlers read the controller of the latest render.
  const latest = React.useRef(ol);
  latest.current = ol;
  const baseDepth = ol.breadcrumbs.length;

  const start = React.useCallback(
    (event: React.PointerEvent, row: OutlinerRow) => {
      if (ol.readOnly || row.locked || event.button !== 0 || ol.view.query) return;
      const startX = event.clientX,
        startY = event.clientY;
      const touch = event.pointerType !== "mouse";
      const pointerId = event.pointerId;
      const target = event.currentTarget as HTMLElement;
      let active = false;
      let timer: number | undefined;
      const ids = ol.state.selection.has(row.id) ? [...ol.state.selection] : [row.id];
      const moving = new Set(ids);
      const label =
        ids.length > 1 ? `${ids.length} items` : inlineToPlain(row.node.text) || "Untitled";
      const scroller = ui.listRef.current?.closest<HTMLElement>("[data-outliner-scroll]") ?? null;
      let pointer = { x: startX, y: startY };
      let frame = 0;
      /** Folded rows this drag opened, in order; folded back unless the drop lands inside. */
      const opened: string[] = [];
      let hoverId: string | null = null;
      let hoverTimer: number | undefined;
      /** The host drop target under the pointer (marked `data-drop-over` while it is). */
      let overTarget: HTMLElement | null = null;
      /** ⌥/Alt-drag copies; the key can be pressed or released at any point of the drag. */
      let copy = event.altKey;
      const setCopy = (next: boolean) => {
        if (next === copy) return;
        copy = next;
        document.documentElement.toggleAttribute("data-outline-copy-drag", active && copy);
        if (active) update(pointer.x, pointer.y);
      };
      const clearHover = () => {
        window.clearTimeout(hoverTimer);
        hoverTimer = undefined;
        hoverId = null;
      };
      // Auto-scroll while the pointer rests near the scroller's top or bottom edge.
      const tick = () => {
        if (!active || !scroller) return;
        const box = scroller.getBoundingClientRect();
        const edge = 48;
        const delta =
          pointer.y < box.top + edge
            ? -(box.top + edge - pointer.y)
            : pointer.y > box.bottom - edge
              ? pointer.y - (box.bottom - edge)
              : 0;
        if (delta) {
          scroller.scrollTop += Math.max(-18, Math.min(18, delta / 3));
          update(pointer.x, pointer.y);
        }
        frame = requestAnimationFrame(tick);
      };
      const onKey = (key: KeyboardEvent) => {
        if (key.key === "Alt") setCopy(key.type === "keydown");
        if (key.key === "Escape" && active) {
          key.preventDefault();
          key.stopPropagation();
          live.current = null;
          cleanup(null);
        }
      };

      const activate = () => {
        active = true;
        frame = requestAnimationFrame(tick);
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("keyup", onKey, true);
        document.documentElement.toggleAttribute("data-outline-copy-drag", copy);
        target.setPointerCapture?.(pointerId);
        navigator.vibrate?.(8);
        ui.setEditing(false);
      };
      if (touch) timer = window.setTimeout(activate, 260);

      const update = (x: number, y: number) => {
        const list = ui.listRef.current;
        if (!list) return;
        // Over a host drop target outside the list (a workspace's document): that wins.
        const external = ui.host.onExternalDrop ? outsideDropTarget(x, y, list) : null;
        if (external !== overTarget) {
          overTarget?.removeAttribute("data-drop-over");
          external?.setAttribute("data-drop-over", "");
          overTarget = external;
        }
        if (external) {
          clearHover();
          const next: DragState = {
            ids,
            label,
            pointer: { x, y },
            gap: 0,
            depth: 0,
            top: -9999,
            left: 0,
            valid: true,
            hover: null,
            external: true,
            copy,
          };
          live.current = next;
          setState(next);
          return;
        }
        const rows = latest.current.rows;
        const rowEls = [...list.querySelectorAll<HTMLElement>("[data-row]")].filter(
          (el) => !moving.has(el.dataset.row!),
        );
        const listBox = list.getBoundingClientRect();
        let gap = rowEls.length;
        let lineTop = rowEls.length
          ? rowEls.at(-1)!.getBoundingClientRect().bottom - listBox.top
          : 0;
        let over: { id: string; top: number; height: number } | null = null;
        for (let i = 0; i < rowEls.length; i++) {
          const box = rowEls[i]!.getBoundingClientRect();
          if (!over && y >= box.top && y < box.bottom)
            over = { id: rowEls[i]!.dataset.row!, top: box.top - listBox.top, height: box.height };
          if (y < box.top + box.height / 2) {
            gap = i;
            lineTop = box.top - listBox.top;
            break;
          }
        }
        // Resting on a folded row opens it after a beat; moving off it cancels the timer.
        const overRow = over ? rows.find((r) => r.id === over!.id) : undefined;
        const folded =
          overRow && overRow.hasChildren && !overRow.expanded && !overRow.locked
            ? overRow.id
            : null;
        if (folded !== hoverId) {
          clearHover();
          if (folded) {
            hoverId = folded;
            hoverTimer = window.setTimeout(() => {
              if (!active || hoverId !== folded) return;
              latest.current.dispatch({ type: "expand", ids: [folded], expanded: true });
              opened.push(folded);
              clearHover();
              navigator.vibrate?.(4);
              // The children just mounted: re-measure gaps under the resting pointer.
              requestAnimationFrame(() =>
                requestAnimationFrame(() => active && update(pointer.x, pointer.y)),
              );
            }, HOVER_EXPAND_MS);
          }
        }
        const visibleIds = rowEls.map((el) => el.dataset.row!);
        const prev = gap > 0 ? rows.find((r) => r.id === visibleIds[gap - 1]) : undefined;
        const originDepth = rows.find((r) => r.id === row.id)?.depth ?? 0;
        const unit = indentPx(list);
        const rtl = getComputedStyle(list).direction === "rtl";
        const wanted = originDepth + Math.round((x - startX) / unit) * (rtl ? -1 : 1);
        const maxDepth = prev ? prev.depth + 1 : 0;
        const depth = Math.max(0, Math.min(maxDepth, wanted));
        const allVisible = rows.map((r) => r.id);
        const gapInAll =
          gap < visibleIds.length ? allVisible.indexOf(visibleIds[gap]!) : allVisible.length;
        const remainingBefore = allVisible
          .slice(0, gapInAll)
          .filter((id) => !moving.has(id)).length;
        const plan = planOutlineDrop(
          latest.current.state.nodes,
          allVisible,
          ids,
          remainingBefore,
          depth + baseDepth,
        );
        const next: DragState = {
          ids,
          label,
          pointer: { x, y },
          gap,
          depth,
          top: lineTop,
          left: depth * unit + 30,
          valid: !!plan && plan.depth >= baseDepth,
          hover: hoverId && over?.id === hoverId ? over : null,
          copy,
        };
        live.current = next;
        setState(next);
      };

      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) return;
        if (!active) {
          const distance = Math.hypot(move.clientX - startX, move.clientY - startY);
          if (touch) {
            if (distance > 8) cleanup(null);
            return;
          }
          if (distance < 4) return;
          activate();
        }
        move.preventDefault();
        if (move.altKey !== copy) {
          copy = move.altKey;
          document.documentElement.toggleAttribute("data-outline-copy-drag", copy);
        }
        pointer = { x: move.clientX, y: move.clientY };
        update(move.clientX, move.clientY);
      };
      const onUp = () => {
        const final = live.current;
        let landedIn: string | null = null;
        const target = overTarget?.dataset.outlineDrop;
        if (active && final?.external && target) {
          ui.host.onExternalDrop?.(ids, target);
        } else if (active && final?.valid) {
          const current = latest.current;
          const allVisible = current.rows.map((r) => r.id);
          const list = ui.listRef.current!;
          const rowEls = [...list.querySelectorAll<HTMLElement>("[data-row]")].filter(
            (el) => !moving.has(el.dataset.row!),
          );
          const visibleIds = rowEls.map((el) => el.dataset.row!);
          const gapInAll =
            final.gap < visibleIds.length
              ? allVisible.indexOf(visibleIds[final.gap]!)
              : allVisible.length;
          const remainingBefore = allVisible
            .slice(0, gapInAll)
            .filter((id) => !moving.has(id)).length;
          const plan = planOutlineDrop(
            current.state.nodes,
            allVisible,
            ids,
            remainingBefore,
            final.depth + baseDepth,
          );
          if (plan && final.copy) {
            // ⌥-drag: copies with fresh ids land at the drop line; the originals stay (one undo step).
            const { commands, created } = copyDropCommands(current.latestNodes(), ids, plan);
            const result = commands.length
              ? current.dispatch({ type: "transaction", commands })
              : null;
            if (result && !result.refusal) {
              landedIn = plan.parentId;
              if (plan.parentId)
                current.dispatch({ type: "expand", ids: [plan.parentId], expanded: true });
              current.dispatch({ type: "select", id: created[0]! });
              for (const id of created.slice(1))
                current.dispatch({ type: "select", id, toggle: true });
              // The Undo toast speaks it (one live channel).
              ui.offerUndo(ui.labels.copiedHere(created.length));
            }
          } else if (plan) {
            current.dispatch({ type: "drop", ids, parentId: plan.parentId, index: plan.index });
            landedIn = plan.parentId;
          }
        }
        if (active) {
          // Swallow the click that follows a drag so it doesn't zoom.
          const swallow = (click: MouseEvent) => {
            click.stopPropagation();
            click.preventDefault();
          };
          window.addEventListener("click", swallow, { capture: true, once: true });
          setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
        }
        cleanup(landedIn);
      };
      /** `landedIn`: the drop's parent (its ancestors stay open); null folds every hover-opened row. */
      const cleanup = (landedIn: string | null) => {
        window.clearTimeout(timer);
        clearHover();
        cancelAnimationFrame(frame);
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("keyup", onKey, true);
        document.documentElement.removeAttribute("data-outline-copy-drag");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        overTarget?.removeAttribute("data-drop-over");
        overTarget = null;
        if (opened.length) {
          const current = latest.current;
          const keep = new Set(
            landedIn ? getOutlinePath(current.state.nodes, landedIn).map((node) => node.id) : [],
          );
          const refold = opened.filter((id) => !keep.has(id));
          if (refold.length) current.dispatch({ type: "expand", ids: refold, expanded: false });
        }
        live.current = null;
        setState(null);
      };
      const onCancel = () => cleanup(null);
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [ol, ui, baseDepth],
  );
  return { state, start };
}

function DropIndicator({ drag }: { readonly drag: DragState | null }) {
  const { ui } = useOutlinerContext();
  return (
    <AnimatePresence>
      {drag?.hover && (
        <motion.div
          key={`hover-${drag.hover.id}`}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionTokens.quick}
          style={{ top: drag.hover.top, height: drag.hover.height }}
          className="pointer-events-none absolute inset-x-0 z-0 overflow-hidden rounded-md bg-signal/[0.06] ring-1 ring-signal/20 ring-inset"
        >
          {/* Fills while the folded row waits to open: the wait is visible, never a surprise. */}
          <motion.span
            className="absolute inset-y-0 start-0 block bg-signal/[0.07]"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: HOVER_EXPAND_MS / 1000, ease: "linear" }}
          />
        </motion.div>
      )}
      {drag && !drag.external && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{
            opacity: drag.valid ? 1 : 0.35,
            top: drag.top - 1,
            insetInlineStart: drag.left,
          }}
          exit={{ opacity: 0 }}
          transition={{
            top: { duration: 0.08 },
            insetInlineStart: { duration: 0.08 },
            opacity: motionTokens.quick,
          }}
          className="pointer-events-none absolute inset-e-0 z-10 h-0.5 rounded-full bg-signal"
        >
          {drag.copy ? (
            <span
              data-drop-copy=""
              className="absolute -top-[7px] -start-2 grid size-4 place-items-center rounded-full bg-signal text-signal-foreground"
            >
              <Plus className="size-3" strokeWidth={3} />
            </span>
          ) : (
            <span className="absolute -top-[3px] -start-1 size-2 rounded-full border-2 border-signal bg-surface" />
          )}
        </motion.div>
      )}
      {drag && (
        <motion.div
          key="ghost"
          aria-hidden
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={motionTokens.quick}
          // Below and after the pointer, so the row being dropped onto stays readable.
          style={{ position: "fixed", left: drag.pointer.x + 14, top: drag.pointer.y + 14 }}
          className="pointer-events-none z-50 flex max-w-64 items-center gap-2 rounded-md border bg-popover px-2 py-1 text-ui shadow-[0_8px_24px_-8px_rgb(0_0_0/0.25)]"
        >
          {drag.copy ? (
            <span className="flex shrink-0 items-center gap-0.5 rounded-[4px] bg-signal px-1 font-mono text-[10px] leading-4 text-signal-foreground">
              <Plus className="size-2.5" strokeWidth={3} /> {ui.labels.dragCopy}
            </span>
          ) : (
            <span className="size-1.5 shrink-0 rounded-full bg-signal" />
          )}
          <span className="truncate">{drag.label}</span>
          {!drag.valid && (
            <span className="shrink-0 font-mono text-[10px] text-destructive">can't drop</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
