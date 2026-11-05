import * as React from "react";
import {
  ArrowDownAZ,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarX2,
  CheckSquare,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleCheck,
  ClipboardCopy,
  CopyPlus,
  Focus,
  Heading1,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Link2,
  ListChecks,
  ListOrdered,
  MousePointerClick,
  MoveRight,
  Palette,
  Repeat,
  Repeat2,
  Star,
  StickyNote,
  Text,
  Trash2,
  Eye,
} from "lucide-react";
import { toast } from "../components/ui/sonner.js";
import { findOutlineNode } from "../core/index.js";
import { cn } from "../lib/utils.js";
import { useOutlinerContext, usePlatformKeys, type OutlinerUi } from "./context.js";
import { COLOR_STYLES, OUTLINE_COLORS, type OutlineItem } from "./types.js";
import { titleDate, type OutlinerController, type OutlinerRow } from "./use-outliner.js";
import { fixedKeyHint, primaryShortcut, type ShortcutId } from "./keymap.js";
import type { SelectPolicy } from "./target.js";
import { spokenDate, type DateRepeat } from "./inline.js";
import { setItemView, shownView, viewMeta, VIEWS } from "./outliner-views.js";
import type { OutlinerItemCommand } from "./seams.js";

/**
 * THE registry: everything you can do to an item, defined once. Every surface renders this
 * list, so ids, labels, enablement and key hints can never drift apart:
 *
 *   surface                 renders                         file
 *   ─────────────────────   ─────────────────────────────   ────────────────────
 *   `/` item menu, ⇧F10     pages, filter, Enter runs        item-menu.tsx
 *   ⋯ dropdown, right-click submenus                        outliner-chrome.tsx
 *   phone action sheet      pages with a Back row            outliner-chrome.tsx
 *   ⌘K palette              every leaf, flattened            outliner-chrome.tsx
 *   chords (⌘↵, ⌥⌘1 …)      the entry whose `chord` matches  shortcut-actions.ts
 *   ⌘/ sheet                the chords' keys                 outliner-chrome.tsx
 *
 * `itemActions(ctx)` is the pure builder (key handlers call it outside render);
 * `useItemActions(ids, row)` is the thin hook for components. Host `itemCommands` are adapted
 * here and never leak further; a host callback that throws (listing, label or run) is caught
 * and reported as a toast, and the rest of the menu keeps working. Every run first checks that
 * its targets still exist: a menu that outlived them (a remote delete) refuses instead.
 */
export interface ItemAction {
  readonly kind: "action";
  /** The same as `commandId` (kept for the renderers' keys). */
  readonly id: string;
  /** Stable, identical on every surface: "item.complete", "date.tomorrow", "host.calendar". */
  readonly commandId: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  /** The key hint: the chord's live binding, or the fixed key's platform label. */
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  /** Marks the current choice inside a submenu (colour, heading, repeat, view). */
  readonly current?: boolean;
  /** Extra words the `/` menu and ⌘K match on (never shown). */
  readonly keywords?: readonly string[];
  /** The remappable shortcut that runs this entry (its hint comes from the keymap). */
  readonly chord?: ShortcutId;
  /** Where the target goes afterwards. Absent: "keep". */
  readonly select?: SelectPolicy;
  /** Running it again undoes it: always ("self"), from a uniform target, or another command. */
  readonly inverse?: "self" | "self-when-uniform" | (string & {});
  /** It opens a surface that takes focus (a field, the date picker, the palette): menus close first. */
  readonly opensSurface?: boolean;
  /** It is a mode of the ⌘K palette itself: the palette switches instead of closing. */
  readonly paletteMode?: "move" | "mirror";
  readonly run: () => void;
}
export interface ItemSubmenu {
  readonly kind: "submenu";
  readonly id: string;
  readonly commandId: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly disabled?: boolean;
  readonly keywords?: readonly string[];
  readonly items: readonly ItemEntry[];
}
export type ItemEntry =
  ItemAction | ItemSubmenu | { readonly kind: "separator"; readonly id: string };

/** Where the registry is shown; `ItemMenuContent`'s variants are "dropdown" and "context". */
export type ItemSurface = "menu" | "dropdown" | "context" | "sheet" | "palette" | "shortcuts";

/**
 * The written, reviewed exceptions to "every surface shows every command". Today the only
 * surface that shows less is the ⌘/ sheet: it lists keys, so it shows the commands that have a
 * chord (and the fixed keys), not the ones you can only pick from a menu.
 */
export const SURFACE_EXCEPTIONS: {
  readonly [S in ItemSurface]: S extends "shortcuts" ? "chorded-only" : readonly string[];
} = {
  menu: [],
  dropdown: [],
  context: [],
  sheet: [],
  palette: [],
  shortcuts: "chorded-only",
};

export interface ItemActionsContext {
  readonly ol: OutlinerController;
  readonly ui: OutlinerUi;
  /** What the commands act on (the target). */
  readonly ids: readonly string[];
  /** The row the single-item commands mean (the cursor, the clicked row). */
  readonly row: OutlinerRow;
  /** Hints only. */
  readonly isMac: boolean;
  /** Opened from a note's line: the heading entries mean that line, not the row. */
  readonly noteLine?: { readonly level?: number; set(level: 1 | 2 | 3 | undefined): void };
}

const sep = (id: string): ItemEntry => ({ kind: "separator", id });

/** Delete with an honest receipt: "Deleted 1 item and 684 children", Undo bound to that entry. */
export function deleteItems(
  { ol, ui }: { readonly ol: OutlinerController; readonly ui: OutlinerUi },
  ids: readonly string[],
  verb: "delete" | "cut" = "delete",
) {
  const result = ol.commands.remove(ids);
  if (!result.items) return;
  const message = (verb === "cut" ? ui.labels.cut : ui.labels.deleted)(
    result.items,
    result.descendants,
  );
  // One live channel: the Undo toast speaks the receipt; announcing it too read it twice.
  // A big subtree stays on screen until dismissed: it is the one loss you must not miss.
  ui.offerUndo(message, { sticky: result.items + result.descendants > 50 });
  requestAnimationFrame(() => {
    ui.focusList();
    if (result.selected) ui.scrollToRow(result.selected);
  });
}

/**
 * Run `fn` once a closing menu has handed focus back (its own return runs a frame later), so a
 * surface `fn` opens (a field, the date picker, the palette) keeps the focus it takes.
 */
export function afterFocusReturn(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/** Reported after the render that found it (a toast is state of its own), once per message. */
function reportLater(message: string, error?: unknown) {
  if (error !== undefined) console.error(error);
  setTimeout(() => toast.error(message, { id: `outliner-command:${message}` }), 0);
}

type Draft = Omit<ItemAction, "kind" | "id"> | Omit<ItemSubmenu, "kind" | "id">;
const isPage = (draft: Draft): draft is Omit<ItemSubmenu, "kind" | "id"> => "items" in draft;

export function itemActions(ctx: ItemActionsContext): readonly ItemEntry[] {
  const { ol, ui, ids, row, isMac, noteLine } = ctx;
  const L = ui.labels;
  // Menu hints follow the active keyboard profile and remaps.
  const keys = (id: ShortcutId) => primaryShortcut(ui.keymap, id, isMac);
  const locked = row.locked || ids.some((id) => id !== row.id && ol.isItemLocked(id));
  const editable = !ol.readOnly && !locked;
  const many = ids.length > 1;
  const starred = ol.bookmarks.items.includes(ol.commands.identityOf(row.id));
  const nodes = () => ol.latestNodes();
  const nodeOf = (id: string) => findOutlineNode(nodes(), id)?.node as OutlineItem | undefined;

  /** Every run: the targets still exist (else refuse), and a throw is reported, never a broken menu. */
  const guard = (label: string, run: () => unknown) => () => {
    if (!ids.length || ids.some((id) => !findOutlineNode(nodes(), id))) {
      toast(L.targetGone, { id: "outliner-target-gone" });
      return;
    }
    try {
      const result = run();
      if (result && typeof (result as Promise<unknown>).then === "function")
        (result as Promise<unknown>).catch((error) =>
          reportLater(L.hostCommandFailed(label), error),
        );
    } catch (error) {
      reportLater(L.hostCommandFailed(label), error);
    }
  };
  const make = (draft: Draft): ItemEntry =>
    isPage(draft)
      ? { kind: "submenu", id: draft.commandId, ...draft }
      : { kind: "action", id: draft.commandId, ...draft, run: guard(draft.label, draft.run) };
  const selectIds = (targets: readonly string[]) => {
    if (!targets.length) return;
    ui.setEditing(false);
    ol.dispatch({ type: "select", id: targets[0]! });
    for (const id of targets.slice(1)) ol.dispatch({ type: "select", id, toggle: true });
    ui.focusList();
    ui.announce(L.itemsSelected(targets.length));
  };
  const headingIcon = (level: 1 | 2 | 3) =>
    level === 1 ? <Heading1 /> : level === 2 ? <Heading2 /> : <Heading3 />;

  /* ── Date ▸ and Repeat ▸ (the title's first `!(…)` date) ── */
  const dated = ids.some((id) => titleDate(nodeOf(id)?.text ?? ""));
  const firstDate = titleDate(row.node.text)?.date;
  const day = (offset: number) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return date;
  };
  const setDate = (date: Date | null) => {
    ol.commands.setDate(ids, date);
    ui.announce(date ? L.dueOn(spokenDate({ value: date, hasTime: false })) : L.dateRemoved);
  };
  const repeats: readonly (readonly [string, string, DateRepeat | undefined])[] = [
    ["none", L.noRepeat, undefined],
    ["daily", L.daily, { unit: "day", interval: 1 }],
    ["weekdays", L.weekdays, { unit: "weekday", interval: 1 }],
    ["weekly", L.weekly, { unit: "week", interval: 1 }],
    ["monthly", L.monthly, { unit: "month", interval: 1 }],
  ];
  const sameRepeat = (a?: DateRepeat, b?: DateRepeat) =>
    a?.unit === b?.unit && a?.interval === b?.interval;

  /* ── Select ▸ ── */
  const childIds = ids.flatMap((id) => nodeOf(id)?.children?.map((child) => child.id) ?? []);
  const siblingIds = [
    ...new Set(
      ids.flatMap((id) => {
        const parent = findOutlineNode(nodes(), id)?.parentId ?? null;
        return ((parent ? nodeOf(parent)?.children : nodes()) ?? []).map((node) => node.id);
      }),
    ),
  ];
  const completedIds = ol.rows
    .filter((candidate) => candidate.completed && !candidate.context)
    .map((candidate) => candidate.id);

  /* ── View as ▸ ── */
  const view = shownView(ol, row.node);

  const drafts: (Draft | "separator" | false)[] = [
    !many && {
      commandId: "item.select",
      label: L.selectItem,
      icon: <MousePointerClick />,
      run: () => selectIds([row.id]),
    },
    {
      commandId: "item.complete",
      label: row.completed ? L.markIncomplete : L.complete,
      icon: <CircleCheck />,
      chord: "complete",
      shortcut: keys("complete"),
      keywords: ["done", "finish", "check", "task"],
      inverse: "self-when-uniform",
      disabled: !editable,
      run: () => ui.announceToggle(ol.commands.toggleComplete(ids)),
    },
    {
      commandId: "item.checkbox",
      label: row.details.checkbox ? L.removeCheckbox : L.addCheckbox,
      icon: <CheckSquare />,
      chord: "checkbox",
      shortcut: keys("checkbox"),
      keywords: ["todo", "task"],
      inverse: "self-when-uniform",
      disabled: !editable,
      run: () => {
        const outcome = ol.commands.toggleCheckbox(ids);
        if (outcome) ui.announce(outcome === "added" ? L.checkboxAdded : L.checkboxRemoved);
      },
    },
    !many && {
      commandId: "item.note",
      label: row.details.note ? L.editNote : L.addNote,
      icon: <StickyNote />,
      shortcut: fixedKeyHint("item.note", isMac),
      keywords: ["description", "comment"],
      opensSurface: true,
      disabled: !editable,
      run: () => {
        ol.dispatch({
          type: "focus",
          id: row.id,
          field: "note",
          start: (nodeOf(row.id)?.data?.note ?? "").length,
        });
        ui.setEditing(true);
      },
    },
    {
      commandId: "item.date",
      label: L.date,
      icon: <CalendarDays />,
      keywords: ["due", "when", "schedule", "deadline"],
      disabled: !editable,
      items: [
        make({
          commandId: "date.today",
          label: L.today,
          icon: <CalendarDays />,
          run: () => setDate(day(0)),
        }),
        make({
          commandId: "date.tomorrow",
          label: L.tomorrow,
          icon: <CalendarPlus />,
          run: () => setDate(day(1)),
        }),
        make({
          commandId: "date.nextWeek",
          label: L.nextWeek,
          icon: <CalendarClock />,
          keywords: ["seven days", "+1 week"],
          run: () => setDate(day(7)),
        }),
        ...(many
          ? []
          : [
              make({
                commandId: "date.pick",
                label: L.pickDate,
                icon: <CalendarDays />,
                keywords: ["calendar", "choose", "custom"],
                opensSurface: true,
                run: () => openDatePicker(ctx),
              }),
            ]),
        sep("d1"),
        make({
          commandId: "date.clear",
          label: L.clearDate,
          icon: <CalendarX2 />,
          keywords: ["remove", "none"],
          disabled: !dated,
          run: () => setDate(null),
        }),
      ],
    },
    {
      commandId: "item.repeat",
      label: L.repeat,
      icon: <Repeat />,
      keywords: ["recurring", "every", "again"],
      disabled: !editable,
      items: repeats.map(([key, label, repeat]) =>
        make({
          commandId: `repeat.${key}`,
          label,
          current: !!firstDate && sameRepeat(repeat, firstDate.repeat),
          run: () => ol.commands.setRepeat(ids, repeat),
        }),
      ),
    },
    "separator",
    {
      commandId: "item.format",
      label: L.format,
      icon: <Text />,
      keywords: ["heading", "style", "turn into"],
      disabled: !editable,
      items: [
        ...([1, 2, 3] as const).map((level) =>
          noteLine
            ? make({
                commandId: `format.h${level}`,
                label: L.heading(level),
                icon: headingIcon(level),
                keywords: ["title", "line"],
                current: noteLine.level === level,
                run: () => noteLine.set(noteLine.level === level ? undefined : level),
              })
            : make({
                commandId: `format.h${level}`,
                label: L.heading(level),
                icon: headingIcon(level),
                chord: `heading${level}`,
                shortcut: keys(`heading${level}`),
                keywords: ["title"],
                current: row.details.heading === level,
                // The level the whole target already has turns back to text.
                inverse: "self-when-uniform",
                run: () => ol.commands.toggleHeading(ids, level),
              }),
        ),
        noteLine
          ? make({
              commandId: "format.text",
              label: L.normalText,
              icon: <Text />,
              keywords: ["plain", "paragraph"],
              run: () => noteLine.set(undefined),
            })
          : make({
              commandId: "format.text",
              label: L.normalText,
              icon: <Text />,
              chord: "heading0",
              shortcut: keys("heading0"),
              keywords: ["plain", "paragraph"],
              run: () => ol.commands.setHeading(ids, undefined),
            }),
        sep("f1"),
        make({
          commandId: "format.numbered",
          label: row.node.data?.numbered ? L.unnumberChildren : L.numberChildren,
          icon: <ListOrdered />,
          keywords: ["ordered", "list"],
          inverse: "self-when-uniform",
          run: () => ol.commands.toggleNumbered(ids),
        }),
      ],
    },
    {
      commandId: "item.color",
      label: L.color,
      icon: <Palette />,
      keywords: ["colour", "label"],
      disabled: !editable,
      items: [
        ...OUTLINE_COLORS.map((color) =>
          make({
            commandId: `color.${color}`,
            label: COLOR_STYLES[color].label,
            icon: <span className={cn("size-2.5 rounded-full", COLOR_STYLES[color].dot)} />,
            current: row.details.color === color,
            run: () => ol.commands.setColor(ids, color),
          }),
        ),
        sep("c1"),
        make({
          commandId: "color.none",
          label: L.noColor,
          keywords: ["clear"],
          run: () => ol.commands.setColor(ids, undefined),
        }),
      ],
    },
    row.hasChildren &&
      !many && {
        commandId: "item.sort",
        label: L.sortChildren,
        icon: <ArrowDownAZ />,
        keywords: ["order"],
        disabled: !editable,
        items: [
          make({
            commandId: "sort.az",
            label: L.sortTitleAsc,
            run: () => ol.commands.sortChildren(row.id, "title"),
          }),
          make({
            commandId: "sort.za",
            label: L.sortTitleDesc,
            run: () => ol.commands.sortChildren(row.id, "title", "descending"),
          }),
          make({
            commandId: "sort.done",
            label: L.sortCompletion,
            run: () => ol.commands.sortChildren(row.id, "completion"),
          }),
          make({
            commandId: "sort.date",
            label: L.sortDate,
            run: () => ol.commands.sortChildren(row.id, "date"),
          }),
          make({
            commandId: "sort.dateDesc",
            label: L.sortDateDesc,
            run: () => ol.commands.sortChildren(row.id, "date", "descending"),
          }),
          make({
            commandId: "sort.created",
            label: L.sortCreatedDesc,
            run: () => ol.commands.sortChildren(row.id, "created", "descending"),
          }),
          make({
            commandId: "sort.createdAsc",
            label: L.sortCreated,
            run: () => ol.commands.sortChildren(row.id, "created"),
          }),
          make({
            commandId: "sort.edited",
            label: L.sortEditedDesc,
            run: () => ol.commands.sortChildren(row.id, "edited", "descending"),
          }),
          make({
            commandId: "sort.reverse",
            label: L.sortReverse,
            run: () => ol.commands.sortChildren(row.id, "reverse"),
          }),
        ],
      },
    "separator",
    {
      commandId: "item.selectMore",
      label: L.select,
      icon: <ListChecks />,
      keywords: ["selection", "range"],
      items: [
        make({
          commandId: "select.children",
          label: L.selectChildren,
          keywords: ["subitems", "kids"],
          disabled: !childIds.length,
          run: () => {
            // A folded parent opens first: core selects only rows that are listed.
            const folded = ids.filter(
              (id) => nodeOf(id)?.children?.length && !ol.state.expandedIds.has(id),
            );
            if (folded.length) ol.dispatch({ type: "expand", ids: folded, expanded: true });
            selectIds(childIds);
          },
        }),
        make({
          commandId: "select.siblings",
          label: L.selectSiblings,
          keywords: ["level", "peers"],
          run: () => selectIds(siblingIds),
        }),
        make({
          commandId: "select.completed",
          label: L.selectCompleted,
          keywords: ["done"],
          disabled: !completedIds.length,
          run: () => selectIds(completedIds),
        }),
        make({
          commandId: "select.all",
          label: L.selectAll,
          keywords: ["everything"],
          run: () => {
            ui.setEditing(false);
            ol.dispatch({ type: "select-all" });
            ui.focusList();
            ui.announce(L.itemsSelected(ol.latestSelection().size));
          },
        }),
      ],
    },
    {
      commandId: "item.indent",
      label: L.indent,
      icon: <IndentIncrease />,
      shortcut: fixedKeyHint("item.indent", isMac),
      inverse: "item.outdent",
      disabled: !editable,
      run: () => shift(ctx, "indent"),
    },
    {
      commandId: "item.outdent",
      label: L.outdent,
      icon: <IndentDecrease />,
      shortcut: fixedKeyHint("item.outdent", isMac),
      inverse: "item.indent",
      disabled: !editable,
      run: () => shift(ctx, "outdent"),
    },
    "separator",
    !many && {
      commandId: "item.zoom",
      label: L.zoomIn,
      icon: <Focus />,
      chord: "zoomIn",
      shortcut: keys("zoomIn"),
      keywords: ["focus", "open", "hoist"],
      run: () => ol.dispatch({ type: "hoist", id: row.id }),
    },
    !many && {
      commandId: "item.view",
      label: L.viewAs,
      icon: <Eye />,
      keywords: ["board", "kanban", "article", "mind map", "list"],
      // A reader picks how to read (locally); a locked item's view stays put.
      disabled: locked && !ol.readOnly,
      items: VIEWS.map((option) => {
        const meta = viewMeta(option, L);
        return make({
          commandId: `view.${option}`,
          label: meta.label,
          icon: <meta.Icon />,
          keywords: meta.keywords.split(" "),
          current: option === view,
          run: () => {
            if (option !== view) setItemView(ol, ui, row.id, option);
            // A board, an article or a map is what you asked to see: it opens.
            if (option !== "list" && ol.state.hoistedId !== row.id)
              ol.dispatch({ type: "hoist", id: row.id });
          },
        });
      }),
    },
    row.hasChildren &&
      !many && {
        commandId: "item.expandInside",
        label: row.expanded ? L.collapseAllInside : L.expandAllInside,
        icon: row.expanded ? <ChevronsDownUp /> : <ChevronsUpDown />,
        keywords: ["fold", "unfold"],
        inverse: "self",
        run: () =>
          ol.dispatch({ type: "expand", ids: collectBranchIds(row.node), expanded: !row.expanded }),
      },
    !many && {
      commandId: "item.bookmark",
      label: starred ? L.removeBookmark : L.bookmark,
      icon: <Star className={cn(starred && "fill-current")} />,
      keywords: ["star", "favorite"],
      inverse: "self",
      run: () => {
        const added = ol.commands.toggleBookmark(row.id);
        ui.announce(added ? L.bookmarked : L.bookmarkRemoved);
      },
    },
    {
      commandId: "item.move",
      label: L.moveTo,
      icon: <MoveRight />,
      shortcut: keys("moveTo"),
      keywords: ["parent", "relocate"],
      opensSurface: true,
      paletteMode: "move",
      disabled: !editable,
      run: () => openPalette(ctx, "move"),
    },
    {
      commandId: "item.mirror",
      label: L.mirrorTo,
      icon: <Repeat2 />,
      keywords: ["live copy", "transclude"],
      opensSurface: true,
      paletteMode: "mirror",
      disabled: ol.readOnly,
      run: () => openPalette(ctx, "mirror"),
    },
    {
      commandId: "item.duplicate",
      label: L.duplicate,
      icon: <CopyPlus />,
      keywords: ["copy", "clone"],
      select: "result",
      disabled: !editable,
      run: () => ol.commands.duplicate(ids),
    },
    // A deep link (`?zoom=<id>`, or the host's `linkFor`); pasted into a title it becomes an item link again.
    !many && {
      commandId: "item.link",
      label: L.copyLink,
      icon: <Link2 />,
      chord: "copyLink",
      shortcut: keys("copyLink"),
      keywords: ["url", "share"],
      run: () => ui.copyLink(row.id),
    },
    {
      commandId: "item.markdown",
      label: L.copyMarkdown,
      icon: <ClipboardCopy />,
      keywords: ["export", "clipboard"],
      run: async () => {
        await navigator.clipboard?.writeText(ol.commands.copyMarkdown(ids));
        toast.success(L.copiedMarkdown);
      },
    },
  ];
  const entries: ItemEntry[] = [];
  let separators = 0;
  for (const draft of drafts) {
    if (!draft) continue;
    entries.push(draft === "separator" ? sep(`s${++separators}`) : make(draft));
  }
  // Integrations: the host's own actions on these items (SEAMS.md), each one safe on its own.
  const host = hostCommands(ctx, guard);
  if (host.length) entries.push(sep("host"), ...host);
  entries.push(
    sep("end"),
    make({
      commandId: "item.delete",
      label: L.delete,
      icon: <Trash2 />,
      shortcut: fixedKeyHint("item.delete", isMac),
      keywords: ["remove", "trash"],
      destructive: true,
      select: "neighbour",
      disabled: !editable,
      run: () => deleteItems(ctx, ids),
    }),
  );
  return entries;
}

export function useItemActions(ids: readonly string[], row: OutlinerRow): readonly ItemEntry[] {
  const { isMac } = usePlatformKeys();
  const { ol, ui } = useOutlinerContext();
  return itemActions({ ol, ui, ids, row, isMac });
}

function hostCommands(
  { ui, ids }: ItemActionsContext,
  guard: (label: string, run: () => unknown) => () => void,
): ItemAction[] {
  const L = ui.labels;
  let commands: readonly OutlinerItemCommand[];
  try {
    commands = ui.host.itemCommands?.(ids) ?? [];
    if (!Array.isArray(commands)) commands = [];
  } catch (error) {
    reportLater(L.hostCommandsFailed, error);
    return [];
  }
  const out: ItemAction[] = [];
  for (const command of commands) {
    try {
      const { id, label, icon, disabled, run } = command;
      out.push({
        kind: "action",
        id: `host.${id}`,
        commandId: `host.${id}`,
        label: String(label),
        icon,
        disabled,
        run: guard(String(label), () => run(ids)),
      });
    } catch (error) {
      reportLater(L.hostCommandsFailed, error);
    }
  }
  return out;
}

function shift({ ol, ui, ids }: ItemActionsContext, direction: "indent" | "outdent") {
  const outcome = ol.commands.shift(ids, direction);
  const L = ui.labels;
  if (outcome === "moved") ui.announce(direction === "outdent" ? L.outdented : L.indented);
  else if (outcome === "noop")
    ui.announce(direction === "outdent" ? L.cannotOutdent : L.cannotIndent);
}

function openPalette({ ol, ui, ids }: ItemActionsContext, mode: "move" | "mirror") {
  ol.dispatch({ type: "select", id: ids[0]! });
  for (const id of ids.slice(1)) ol.dispatch({ type: "select", id, toggle: true });
  ui.setPaletteMode(mode);
  ui.setPaletteOpen(true);
}

/** The date picker opens from the keyboard too, on the row's first date (or a new one at the end). */
function openDatePicker({ ol, ui, row }: ItemActionsContext) {
  const node = findOutlineNode(ol.latestNodes(), row.id)?.node as OutlineItem | undefined;
  if (!node) return;
  const found = titleDate(node.text);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const root = ui.rootRef.current;
  const el =
    root?.querySelector<HTMLElement>(`[data-row="${CSS.escape(row.id)}"] [data-ol-title]`) ??
    root?.querySelector<HTMLElement>(`[data-row="${CSS.escape(row.id)}"]`) ??
    ui.listRef.current;
  const rect = el?.getBoundingClientRect() ?? new DOMRect();
  ui.setDatePicker({
    rowId: row.id,
    field: "title",
    start: found?.start ?? node.text.length,
    end: found?.end ?? node.text.length,
    value: found?.date.value ?? today,
    hasTime: found?.date.hasTime ?? false,
    repeat: found?.date.repeat,
    rangeEnd: found?.date.end,
    rangeEndHasTime: found?.date.endHasTime,
    time: found?.date.time,
    rect,
  });
}

function collectBranchIds(node: OutlineItem): string[] {
  const out: string[] = [];
  const stack = [node];
  while (stack.length) {
    const next = stack.pop()!;
    if (next.children?.length) out.push(next.id);
    stack.push(...(next.children ?? []));
  }
  return out;
}

/* ───────────────────────────── Reading the registry ───────────────────────────── */

/** Every action, depth first, with the page labels above it ("Date" for Tomorrow). */
export function flattenActions(
  entries: readonly ItemEntry[],
  path: readonly string[] = [],
): { readonly action: ItemAction; readonly path: readonly string[] }[] {
  return entries.flatMap((entry) =>
    entry.kind === "action"
      ? [{ action: entry, path }]
      : entry.kind === "submenu"
        ? flattenActions(entry.items, [...path, entry.label]).map((leaf) =>
            entry.disabled ? { ...leaf, action: { ...leaf.action, disabled: true } } : leaf,
          )
        : [],
  );
}

/** The entry (action or page) with this command id, at any depth. */
export function findEntry(
  entries: readonly ItemEntry[],
  commandId: string,
): ItemAction | ItemSubmenu | null {
  for (const entry of entries) {
    if (entry.kind === "separator") continue;
    if (entry.commandId === commandId) return entry;
    if (entry.kind === "submenu") {
      const inner = findEntry(entry.items, commandId);
      if (inner) return inner;
    }
  }
  return null;
}

/**
 * Every typed word must appear (prefix-weighted); avoids fuzzy noise like "red" ⇒ "Freeze". A
 * word in the label outranks the same word in the rest (its page, its keywords, an item's
 * path): "launch comms" finds the "Launch comms" item before its children.
 *
 * `value`: `label \u0001 rest \u0000 key` (the key after U+0000 is for uniqueness, never matched).
 */
export function wordFilter(value: string, search: string) {
  const [title = "", path = ""] = value.split("\u0000")[0]!.toLowerCase().split("\u0001");
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let score = 0;
  for (const word of words) {
    const inTitle = title.indexOf(word);
    const at = inTitle >= 0 ? inTitle : path.indexOf(word);
    if (at < 0) return 0;
    const haystack = inTitle >= 0 ? title : path;
    score += (at === 0 || /\s/.test(haystack[at - 1]!) ? 2 : 1) * (inTitle >= 0 ? 2 : 1);
  }
  return score / (words.length * 4);
}

/** The filter value for an entry: its label first, then its page path and keywords. */
export const filterValue = (entry: ItemAction | ItemSubmenu, path: readonly string[] = []) =>
  `${entry.label}\u0001${[...path, ...(entry.keywords ?? [])].join(" ")}\u0000${entry.commandId}`;
