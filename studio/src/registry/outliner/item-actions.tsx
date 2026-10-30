import * as React from "react";
import {
  ArrowDownAZ,
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
  Link2,
  ListOrdered,
  MousePointerClick,
  MoveRight,
  Palette,
  Repeat2,
  Star,
  StickyNote,
  Text,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOutlinerContext, usePlatformKeys } from "./context";
import { COLOR_STYLES, OUTLINE_COLORS, type OutlineItem } from "./types";
import type { OutlinerRow } from "./use-outliner";

/**
 * The ONE definition of what you can do to an item. The ⋯ dropdown, the right-click context
 * menu and the phone action sheet all render this list, so they can never drift apart.
 */
export interface ItemAction {
  readonly kind: "action";
  readonly id: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  /** Marks the current choice inside a submenu (colour, heading). */
  readonly current?: boolean;
  readonly run: () => void;
}
export interface ItemSubmenu {
  readonly kind: "submenu";
  readonly id: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly disabled?: boolean;
  readonly items: readonly ItemEntry[];
}
export type ItemEntry = ItemAction | ItemSubmenu | { readonly kind: "separator"; readonly id: string };

const sep = (id: string): ItemEntry => ({ kind: "separator", id });

/** Delete with an honest receipt: "Deleted 1 item and 684 children", Undo bound to that entry. */
export function deleteItems({ ol, ui }: ReturnType<typeof useOutlinerContext>, ids: readonly string[], verb: "delete" | "cut" = "delete") {
  const result = ol.commands.remove(ids);
  if (!result.items) return;
  const message = (verb === "cut" ? ui.labels.cut : ui.labels.deleted)(result.items, result.descendants);
  ui.announce(message);
  // A big subtree stays on screen until dismissed: it is the one loss you must not miss.
  ui.offerUndo(message, { sticky: result.items + result.descendants > 50 });
  requestAnimationFrame(() => {
    ui.focusList();
    if (result.selected) ui.scrollToRow(result.selected);
  });
}

export function useItemActions(ids: readonly string[], row: OutlinerRow): readonly ItemEntry[] {
  const { modKey, shift, alt } = usePlatformKeys();
  const context = useOutlinerContext();
  const { ol, ui } = context;
  const L = ui.labels;
  const editable = !ol.readOnly && !row.locked;
  const many = ids.length > 1;
  const starred = ol.bookmarks.items.includes(ol.commands.identityOf(row.id));
  const headingIcon = (level: 1 | 2 | 3) => (level === 1 ? <Heading1 /> : level === 2 ? <Heading2 /> : <Heading3 />);
  const entries: (ItemEntry | false)[] = [
    !many && {
      kind: "action",
      id: "select",
      label: L.select,
      icon: <MousePointerClick />,
      shortcut: "Esc",
      run: () => {
        const selection = ol.latestSelection();
        if (!selection.has(row.id)) ol.dispatch({ type: "select", id: row.id, toggle: selection.size > 0 });
        ui.focusList();
      },
    },
    {
      kind: "action",
      id: "complete",
      label: row.completed ? L.markIncomplete : L.complete,
      icon: <CircleCheck />,
      shortcut: `${modKey}↵`,
      disabled: !editable,
      run: () => ui.announceToggle(ol.commands.toggleComplete(ids)),
    },
    {
      kind: "action",
      id: "checkbox",
      label: row.details.checkbox ? L.removeCheckbox : L.addCheckbox,
      icon: <CheckSquare />,
      shortcut: `${shift}${modKey}C`,
      disabled: !editable,
      run: () => ol.commands.toggleCheckbox(ids),
    },
    !many && {
      kind: "action",
      id: "note",
      label: row.details.note ? L.editNote : L.addNote,
      icon: <StickyNote />,
      shortcut: `${shift}↵`,
      disabled: !editable,
      run: () => {
        ol.dispatch({ type: "focus", id: row.id, field: "note", start: (row.details.note ?? "").length });
        ui.setEditing(true);
      },
    },
    sep("s1"),
    {
      kind: "submenu",
      id: "format",
      label: L.format,
      icon: <Text />,
      disabled: !editable,
      items: [
        ...([1, 2, 3] as const).map(
          (level): ItemEntry => ({
            kind: "action",
            id: `h${level}`,
            label: L.heading(level),
            icon: headingIcon(level),
            shortcut: `${alt}${modKey}${level}`,
            current: row.details.heading === level,
            run: () => ol.commands.setHeading(ids, row.details.heading === level ? undefined : level),
          }),
        ),
        { kind: "action", id: "h0", label: L.normalText, icon: <Text />, shortcut: `${alt}${modKey}0`, run: () => ol.commands.setHeading(ids, undefined) },
        sep("f1"),
        {
          kind: "action",
          id: "numbered",
          label: row.node.data?.numbered ? L.unnumberChildren : L.numberChildren,
          icon: <ListOrdered />,
          run: () => ol.commands.toggleNumbered(ids),
        },
      ],
    },
    {
      kind: "submenu",
      id: "color",
      label: L.color,
      icon: <Palette />,
      disabled: !editable,
      items: [
        ...OUTLINE_COLORS.map(
          (color): ItemEntry => ({
            kind: "action",
            id: `color-${color}`,
            label: COLOR_STYLES[color].label,
            icon: <span className={cn("size-2.5 rounded-full", COLOR_STYLES[color].dot)} />,
            current: row.details.color === color,
            run: () => ol.commands.setColor(ids, color),
          }),
        ),
        sep("c1"),
        { kind: "action", id: "color-none", label: L.noColor, run: () => ol.commands.setColor(ids, undefined) },
      ],
    },
    row.hasChildren &&
      !many && {
        kind: "submenu",
        id: "sort",
        label: L.sortChildren,
        icon: <ArrowDownAZ />,
        disabled: !editable,
        items: [
          { kind: "action", id: "sort-az", label: L.sortTitleAsc, run: () => ol.commands.sortChildren(row.id, "title") },
          { kind: "action", id: "sort-za", label: L.sortTitleDesc, run: () => ol.commands.sortChildren(row.id, "title", "descending") },
          { kind: "action", id: "sort-done", label: L.sortCompletion, run: () => ol.commands.sortChildren(row.id, "completion") },
          { kind: "action", id: "sort-date", label: L.sortDate, run: () => ol.commands.sortChildren(row.id, "date") },
          { kind: "action", id: "sort-date-desc", label: L.sortDateDesc, run: () => ol.commands.sortChildren(row.id, "date", "descending") },
          { kind: "action", id: "sort-reverse", label: L.sortReverse, run: () => ol.commands.sortChildren(row.id, "reverse") },
        ],
      },
    sep("s2"),
    !many && { kind: "action", id: "zoom", label: L.zoomIn, icon: <Focus />, shortcut: `${modKey}]`, run: () => ol.dispatch({ type: "hoist", id: row.id }) },
    row.hasChildren &&
      !many && {
        kind: "action",
        id: "expand-inside",
        label: row.expanded ? L.collapseAllInside : L.expandAllInside,
        icon: row.expanded ? <ChevronsDownUp /> : <ChevronsUpDown />,
        run: () => ol.dispatch({ type: "expand", ids: collectBranchIds(row.node), expanded: !row.expanded }),
      },
    !many && {
      kind: "action",
      id: "bookmark",
      label: starred ? L.removeBookmark : L.bookmark,
      icon: <Star className={cn(starred && "fill-current")} />,
      run: () => {
        const added = ol.commands.toggleBookmark(row.id);
        ui.announce(added ? L.bookmarked : L.bookmarkRemoved);
      },
    },
    {
      kind: "action",
      id: "move",
      label: L.moveTo,
      icon: <MoveRight />,
      shortcut: `${shift}${modKey}M`,
      disabled: !editable,
      run: () => openPalette(context, ids, "move"),
    },
    {
      kind: "action",
      id: "mirror",
      label: L.mirrorTo,
      icon: <Repeat2 />,
      disabled: ol.readOnly,
      run: () => openPalette(context, ids, "mirror"),
    },
    { kind: "action", id: "duplicate", label: L.duplicate, icon: <CopyPlus />, disabled: !editable, run: () => ol.commands.duplicate(ids) },
    !many && {
      kind: "action",
      id: "link",
      label: L.copyLink,
      icon: <Link2 />,
      run: async () => {
        await navigator.clipboard?.writeText(ol.commands.linkTo(row.id));
        toast.success(L.copiedLink);
      },
    },
    {
      kind: "action",
      id: "markdown",
      label: L.copyMarkdown,
      icon: <ClipboardCopy />,
      run: async () => {
        await navigator.clipboard?.writeText(ol.commands.exportAs("markdown", ids));
        toast.success(L.copiedMarkdown);
      },
    },
    sep("s3"),
    {
      kind: "action",
      id: "delete",
      label: L.delete,
      icon: <Trash2 />,
      shortcut: "⌫",
      destructive: true,
      disabled: !editable,
      run: () => deleteItems(context, ids),
    },
  ];
  return entries.filter(Boolean) as ItemEntry[];
}

function openPalette({ ol, ui }: ReturnType<typeof useOutlinerContext>, ids: readonly string[], mode: "move" | "mirror") {
  ol.dispatch({ type: "select", id: ids[0]! });
  for (const id of ids.slice(1)) ol.dispatch({ type: "select", id, toggle: true });
  ui.setPaletteMode(mode);
  ui.setPaletteOpen(true);
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
