/**
 * Every user-facing string the outliner speaks or shows in its chrome, so a host can translate
 * or re-voice it: `<Outliner labels={{ deleted: (n) => … }} />`. Pass only what you change; the
 * rest falls back to these English defaults. Functions take counts so plurals stay correct.
 */
const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

export const DEFAULT_LABELS = {
  // Toolbar
  search: "Search",
  searchOutline: "Search outline",
  searchPlaceholder: "Search…  #tag  is:todo  due:today",
  closeSearch: "Close search",
  flatResults: "Flat results",
  showInOutline: "Show in outline",
  agenda: "Agenda",
  undo: "Undo",
  redo: "Redo",
  zoomOut: "Zoom out",
  commands: "Commands",
  viewOptions: "View and document options",
  bookmarks: "Bookmarks",
  importFile: "Import…",
  // Rows and menus
  untitled: "Untitled",
  addItem: "Add item",
  emptyDocument: "Empty. Click to start writing.",
  noMatches: (query: string) => `No items match ${query}`,
  clearSearch: "Clear search",
  actionsFor: (title: string) => `Actions for ${title}`,
  actionsForSelection: (count: number) => `Actions for ${plural(count, "selected item")}`,
  selectionHeader: (count: number) => plural(count, "item"),
  select: "Select",
  complete: "Complete",
  markIncomplete: "Mark incomplete",
  addCheckbox: "Add checkbox",
  removeCheckbox: "Remove checkbox",
  addNote: "Add note",
  editNote: "Edit note",
  format: "Format",
  heading: (level: number) => `Heading ${level}`,
  normalText: "Normal text",
  numberChildren: "Number children",
  unnumberChildren: "Unnumber children",
  color: "Color",
  noColor: "No color",
  sortChildren: "Sort children",
  sortTitleAsc: "Title A → Z",
  sortTitleDesc: "Title Z → A",
  sortCompletion: "Incomplete first",
  sortDate: "By date, soonest first",
  sortDateDesc: "By date, latest first",
  sortReverse: "Reverse order",
  zoomIn: "Zoom in",
  expandAllInside: "Expand all inside",
  collapseAllInside: "Collapse all inside",
  moveTo: "Move to…",
  mirrorTo: "Mirror to…",
  duplicate: "Duplicate",
  copyMarkdown: "Copy as Markdown",
  copyLink: "Copy item link",
  bookmark: "Add bookmark",
  removeBookmark: "Remove bookmark",
  delete: "Delete",
  back: "Back",
  // Toasts and announcements
  deleted: (items: number, children: number) =>
    children ? `Deleted ${plural(items, "item")} and ${plural(children, "child", "children")}` : `Deleted ${plural(items, "item")}`,
  cut: (items: number, children: number) =>
    children ? `Cut ${plural(items, "item")} and ${plural(children, "child", "children")}` : `Cut ${plural(items, "item")}`,
  copied: (count: number) => `Copied ${plural(count, "item")}`,
  pasted: (count: number) => `Pasted ${plural(count, "item")}`,
  copiedMarkdown: "Copied as Markdown",
  copiedLink: "Item link copied",
  undoAction: "Undo",
  markedComplete: "Marked complete",
  markedIncomplete: "Marked incomplete",
  nextOccurrence: (when: string) => `Next: ${when}`,
  dueOn: (when: string) => `Due ${when}`,
  dateRemoved: "Date removed",
  mirrored: (count: number) => `Mirrored ${plural(count, "item")}`,
  moved: (count: number) => `Moved ${plural(count, "item")}`,
  locked: "That item is locked.",
  readOnly: "This outline is read-only.",
  cannotMoveInside: "An item can't move inside itself.",
  itemsSelected: (count: number) => `${plural(count, "item")} selected`,
  linkedItemDeleted: "The linked item was deleted.",
  bookmarked: "Bookmarked",
  bookmarkRemoved: "Bookmark removed",
  searchSaved: "Search saved",
  removeSavedSearch: (name: string) => `Remove saved search ${name}`,
  removeStarred: (name: string) => `Remove bookmark ${name}`,
  recentlyChanged: "Recently changed",
  changeRejected: (count: number) =>
    count > 1 ? `Change not accepted · ${plural(count, "edit")} undone` : "Change not accepted · undone",
  /** Sticky strip of the top row's ancestors while scrolled deep. */
  ancestors: "Ancestors of the top item",
  // Backlinks and mirrors
  linkedFrom: (count: number) => `Linked from ${plural(count, "item")}`,
  mirroredIn: (count: number) => `Mirrored in ${plural(count, "place")}`,
  mirrorOf: (title: string) => `Mirror of ${title}`,
  showLinksInSearch: "Show in search",
  // Status strip
  browsing: "Browsing",
  editing: "Editing",
  editingNote: "Editing note",
  readOnlyMode: "Read-only",
  selected: (count: number) => `${count.toLocaleString()} selected`,
  searching: (count: number) => `Searching · ${plural(count, "match", "matches")}`,
  typingQuery: "typing…",
  invalidQuery: "invalid query · showing everything",
  // Agenda
  agendaGroups: {
    overdue: "Overdue",
    today: "Today",
    tomorrow: "Tomorrow",
    week: "This week",
    later: "Later",
    earlier: "Earlier, done",
    none: "No date",
  },
} as const;

type Widen<T> = T extends string ? string : T extends (...args: infer A) => string ? (...args: A) => string : { readonly [K in keyof T]: Widen<T[K]> };
export type OutlinerLabels = { readonly [K in keyof typeof DEFAULT_LABELS]: Widen<(typeof DEFAULT_LABELS)[K]> };

export function resolveLabels(overrides?: Partial<OutlinerLabels>): OutlinerLabels {
  if (!overrides) return DEFAULT_LABELS;
  return {
    ...DEFAULT_LABELS,
    ...overrides,
    agendaGroups: { ...DEFAULT_LABELS.agendaGroups, ...overrides.agendaGroups },
  };
}
