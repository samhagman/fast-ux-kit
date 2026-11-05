import { formatShortcut, isApplePlatform } from "../lib/platform.js";

/**
 * The outliner's remappable shortcuts as plain data: one table of actions, two profiles
 * (standard and power), the reader's own overrides on top, and the keys nobody may take.
 *
 * A combo is written `Mod+Alt+Shift+Key` (modifiers always in that order). `Mod` is ⌘ on Apple
 * and Ctrl elsewhere (either key counts, as everywhere else in the outliner). Keys are
 * `event.key` names, lower-case for characters: `a`, `1`, `.`, `[`, `Enter`, `ArrowUp`, `Space`.
 *
 *   const keymap = buildKeymap("power", { moveUp: ["Mod+Alt+ArrowUp"] });
 *   matchShortcut(keymap, event, "row");     // "moveUp" | … | null
 *   formatCombo("Mod+Alt+1", true);          // "⌥⌘1"
 *
 * Pure: no React, no DOM beyond the shape of a keyboard event.
 */

export type ShortcutId =
  | "palette"
  | "search"
  | "shortcuts"
  | "moveTo"
  | "findReplace"
  | "settings"
  | "moveUp"
  | "moveDown"
  | "complete"
  | "fold"
  | "zoomIn"
  | "zoomOut"
  | "checkbox"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading0"
  | "hideCompleted"
  | "levels1"
  | "levels2"
  | "levels3"
  | "levelsAll"
  | "copyLink"
  | "bold"
  | "italic"
  | "code"
  | "strike"
  | "highlight";

/**
 * Where a shortcut answers. `global`: anywhere in the outliner (fields, tree, toolbar).
 * `item`: an item being edited or the selected rows. `text`: only while editing text.
 */
export type ShortcutScope = "global" | "item" | "text";
/** Where a key event happened: editing a field, or browsing rows in the tree. */
export type KeyContext = "text" | "row";

export type KeyboardProfile = "standard" | "power";
export const KEYBOARD_PROFILES: readonly KeyboardProfile[] = ["standard", "power"];

export type ShortcutGroup = "Document" | "Structure" | "Folding" | "Writing" | "Formatting";
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  "Document",
  "Structure",
  "Folding",
  "Writing",
  "Formatting",
];

export interface ShortcutDef {
  readonly id: ShortcutId;
  readonly label: string;
  readonly group: ShortcutGroup;
  readonly scope: ShortcutScope;
  readonly standard: readonly string[];
  /** The power profile's keys; absent: the same as standard. */
  readonly power?: readonly string[];
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  {
    id: "palette",
    label: "Command palette",
    group: "Document",
    scope: "global",
    standard: ["Mod+k"],
  },
  { id: "search", label: "Search", group: "Document", scope: "global", standard: ["Mod+f"] },
  {
    id: "findReplace",
    label: "Find and replace",
    group: "Document",
    scope: "global",
    standard: ["Mod+Alt+f"],
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    group: "Document",
    scope: "global",
    standard: ["Mod+/"],
  },
  { id: "settings", label: "Settings", group: "Document", scope: "global", standard: [] },
  {
    id: "moveTo",
    label: "Move to…",
    group: "Structure",
    scope: "global",
    standard: ["Mod+Shift+m"],
  },
  {
    id: "moveUp",
    label: "Move up",
    group: "Structure",
    scope: "item",
    standard: ["Alt+Shift+ArrowUp", "Mod+Shift+ArrowUp"],
    power: ["Mod+ArrowUp", "Alt+Shift+ArrowUp", "Mod+Shift+ArrowUp"],
  },
  {
    id: "moveDown",
    label: "Move down",
    group: "Structure",
    scope: "item",
    standard: ["Alt+Shift+ArrowDown", "Mod+Shift+ArrowDown"],
    power: ["Mod+ArrowDown", "Alt+Shift+ArrowDown", "Mod+Shift+ArrowDown"],
  },
  { id: "zoomIn", label: "Zoom in", group: "Structure", scope: "item", standard: ["Mod+]"] },
  { id: "zoomOut", label: "Zoom out", group: "Structure", scope: "item", standard: ["Mod+["] },
  { id: "copyLink", label: "Copy item link", group: "Structure", scope: "item", standard: [] },
  { id: "fold", label: "Fold · unfold", group: "Folding", scope: "item", standard: ["Mod+."] },
  {
    id: "levels1",
    label: "Show 1 level",
    group: "Folding",
    scope: "item",
    standard: [],
    power: ["Mod+Alt+1"],
  },
  {
    id: "levels2",
    label: "Show 2 levels",
    group: "Folding",
    scope: "item",
    standard: [],
    power: ["Mod+Alt+2"],
  },
  {
    id: "levels3",
    label: "Show 3 levels",
    group: "Folding",
    scope: "item",
    standard: [],
    power: ["Mod+Alt+3"],
  },
  {
    id: "levelsAll",
    label: "Show all levels",
    group: "Folding",
    scope: "item",
    standard: [],
    power: ["Mod+Alt+0"],
  },
  {
    id: "hideCompleted",
    label: "Hide completed",
    group: "Folding",
    scope: "item",
    standard: ["Mod+Alt+h"],
  },
  { id: "complete", label: "Complete", group: "Writing", scope: "item", standard: ["Mod+Enter"] },
  { id: "checkbox", label: "Checkbox", group: "Writing", scope: "item", standard: ["Mod+Shift+c"] },
  // The power profile gives ⌥⌘1–3 to folding, so headings move to ⌥⇧1–3.
  {
    id: "heading1",
    label: "Heading 1",
    group: "Writing",
    scope: "item",
    standard: ["Mod+Alt+1"],
    power: ["Alt+Shift+1"],
  },
  {
    id: "heading2",
    label: "Heading 2",
    group: "Writing",
    scope: "item",
    standard: ["Mod+Alt+2"],
    power: ["Alt+Shift+2"],
  },
  {
    id: "heading3",
    label: "Heading 3",
    group: "Writing",
    scope: "item",
    standard: ["Mod+Alt+3"],
    power: ["Alt+Shift+3"],
  },
  {
    id: "heading0",
    label: "Normal text",
    group: "Writing",
    scope: "item",
    standard: ["Mod+Alt+0"],
    power: ["Alt+Shift+0"],
  },
  { id: "bold", label: "Bold", group: "Formatting", scope: "text", standard: ["Mod+b"] },
  { id: "italic", label: "Italic", group: "Formatting", scope: "text", standard: ["Mod+i"] },
  { id: "code", label: "Inline code", group: "Formatting", scope: "text", standard: ["Mod+e"] },
  {
    id: "strike",
    label: "Strikethrough",
    group: "Formatting",
    scope: "text",
    standard: ["Mod+Shift+x"],
  },
  {
    id: "highlight",
    label: "Highlight",
    group: "Formatting",
    scope: "text",
    standard: ["Mod+Shift+h"],
  },
];

const DEFS = new Map(SHORTCUTS.map((def) => [def.id, def]));
export const shortcutDef = (id: ShortcutId) => DEFS.get(id)!;

/** The reader's changes: an action's full key list (`[]` unbinds it). Absent: the profile's keys. */
export type ShortcutOverrides = Readonly<Partial<Record<ShortcutId, readonly string[]>>>;

/**
 * Keys that cannot be assigned. `fixed` are the outliner's own structural keys (typing, Tab,
 * arrows, undo, clipboard); `host` belong to the surrounding app (a workspace's ⌘O finder and
 * ⌘⇧Space quick capture); `browser` are taken by the browser before a page sees them.
 */
export interface ReservedShortcut {
  readonly combo: string;
  readonly label: string;
  readonly owner: "fixed" | "host" | "browser";
}

const fixed = (combo: string, label: string): ReservedShortcut => ({
  combo,
  label,
  owner: "fixed",
});
const browser = (combo: string, label: string): ReservedShortcut => ({
  combo,
  label,
  owner: "browser",
});
export const RESERVED_SHORTCUTS: readonly ReservedShortcut[] = [
  fixed("Mod+z", "Undo"),
  fixed("Mod+Shift+z", "Redo"),
  fixed("Mod+y", "Redo"),
  fixed("Mod+a", "Select all"),
  fixed("Mod+c", "Copy"),
  fixed("Mod+x", "Cut"),
  fixed("Mod+v", "Paste"),
  fixed("Enter", "New item"),
  fixed("Shift+Enter", "Note"),
  fixed("Mod+Shift+Enter", "Line break in a note"),
  fixed("Tab", "Indent"),
  fixed("Shift+Tab", "Outdent"),
  fixed("Escape", "Select / clear"),
  fixed("Backspace", "Delete"),
  fixed("Delete", "Delete"),
  fixed("Space", "Complete"),
  fixed("ArrowUp", "Up"),
  fixed("ArrowDown", "Down"),
  fixed("ArrowLeft", "Left"),
  fixed("ArrowRight", "Right"),
  fixed("Shift+ArrowUp", "Extend selection"),
  fixed("Shift+ArrowDown", "Extend selection"),
  fixed("Home", "First item"),
  fixed("End", "Last item"),
  { combo: "Mod+o", label: "Open document", owner: "host" },
  { combo: "Mod+Shift+Space", label: "Quick capture", owner: "host" },
  browser("Mod+w", "Close tab"),
  browser("Mod+t", "New tab"),
  // Every desktop browser bookmarks the page on ⌘D / Ctrl+D before the outliner could answer.
  browser("Mod+d", "Bookmark page"),
  browser("Mod+n", "New window"),
  browser("Mod+q", "Quit"),
  browser("Mod+r", "Reload"),
  browser("Mod+l", "Address bar"),
  browser("Mod+p", "Print"),
  browser("Mod+,", "Browser settings"),
  browser("Mod+Shift+t", "Reopen tab"),
  browser("Mod+Shift+n", "New private window"),
  browser("Mod+Shift+w", "Close window"),
  browser("Mod+Tab", "Switch tab"),
  browser("Mod+h", "Hide app"),
  browser("Mod+m", "Minimize"),
];

export interface Keymap {
  readonly profile: KeyboardProfile;
  /** Every action's effective keys (profile, then overrides). */
  readonly bindings: ReadonlyMap<ShortcutId, readonly string[]>;
  /** Combo → actions bound to it (more than one only when overrides conflict). */
  readonly byCombo: ReadonlyMap<string, readonly ShortcutId[]>;
  readonly overrides: ShortcutOverrides;
}

export function profileKeys(id: ShortcutId, profile: KeyboardProfile): readonly string[] {
  const def = shortcutDef(id);
  return profile === "power" && def.power ? def.power : def.standard;
}

export function buildKeymap(
  profile: KeyboardProfile = "standard",
  overrides: ShortcutOverrides = {},
): Keymap {
  const bindings = new Map<ShortcutId, readonly string[]>();
  const byCombo = new Map<string, ShortcutId[]>();
  for (const def of SHORTCUTS) {
    const own = Object.prototype.hasOwnProperty.call(overrides, def.id)
      ? overrides[def.id]
      : undefined;
    const keys = (own ?? profileKeys(def.id, profile))
      .map(normalizeCombo)
      .filter((combo): combo is string => !!combo);
    bindings.set(def.id, keys);
    for (const combo of keys) byCombo.set(combo, [...(byCombo.get(combo) ?? []), def.id]);
  }
  return { profile, bindings, byCombo, overrides };
}

/** Do two scopes ever hear the same key event? Text actions and row-mode never meet. */
export function scopesOverlap(a: ShortcutScope, b: ShortcutScope): boolean {
  return a === "global" || b === "global" || a === b || a === "item" || b === "item";
}
const answersIn = (scope: ShortcutScope, context: KeyContext | "global") =>
  context === "global"
    ? scope === "global"
    : scope === "item" || (scope === "text" && context === "text");

/** The modifier and key parts of a combo string (null when it is not one). */
export function parseCombo(combo: string): {
  readonly mod: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly key: string;
} | null {
  const parts = combo.split("+");
  // "Mod++" would be a plus key: written "Mod+Plus" instead, so a bare "+" never splits oddly.
  const key = parts.pop();
  if (!key) return null;
  const mods = new Set(parts.map((part) => part.toLowerCase()));
  for (const mod of mods) if (mod !== "mod" && mod !== "alt" && mod !== "shift") return null;
  return {
    mod: mods.has("mod"),
    alt: mods.has("alt"),
    shift: mods.has("shift"),
    key: normalizeKey(key),
  };
}

const NAMED = new Map(
  [
    "Enter",
    "Escape",
    "Tab",
    "Backspace",
    "Delete",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Space",
    "Plus",
    "Insert",
  ].map((name) => [name.toLowerCase(), name]),
);
function normalizeKey(key: string): string {
  if (key === " ") return "Space";
  if (key === "+") return "Plus";
  const named = NAMED.get(key.toLowerCase());
  if (named) return named;
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(key)) return key.toUpperCase();
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Canonical spelling (modifier order, key case), or null when it is not a combo. */
export function normalizeCombo(combo: string): string | null {
  const parsed = parseCombo(combo);
  return parsed ? joinCombo(parsed) : null;
}
const joinCombo = ({
  mod,
  alt,
  shift,
  key,
}: {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}) => [mod && "Mod", alt && "Alt", shift && "Shift", key].filter(Boolean).join("+");

export interface ComboEvent {
  readonly key: string;
  readonly code?: string;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly isComposing?: boolean;
  /** Safari reports the Enter that commits an IME candidate with keyCode 229 (isComposing false). */
  readonly keyCode?: number;
  getModifierState?(key: "AltGraph"): boolean;
}

/** IME input in progress (or the key that commits it): never a shortcut, a split or a submit. */
export function isComposingKey(event: {
  readonly isComposing?: boolean;
  readonly keyCode?: number;
  readonly nativeEvent?: { readonly isComposing?: boolean; readonly keyCode?: number };
}): boolean {
  return !!(
    event.isComposing ||
    event.nativeEvent?.isComposing ||
    event.keyCode === 229 ||
    event.nativeEvent?.keyCode === 229
  );
}

/**
 * AltGr typing a character. Windows and Linux report AltGr as Ctrl+Alt: on a German layout
 * AltGr+0 is "}" and AltGr+Q is "@". That is text, never Mod+Alt+0 or Mod+Alt+Q. Known from
 * the AltGraph modifier state, or (where a browser does not report it) from Ctrl+Alt without
 * Meta producing a character other than the key's own letter or digit. Apple keyboards have no
 * AltGr: ⌥ never sets Ctrl.
 */
export function isAltGraphText(
  event: ComboEvent,
  apple = isApplePlatform(typeof navigator === "undefined" ? undefined : navigator),
): boolean {
  if (event.getModifierState?.("AltGraph")) return true;
  if (apple || event.metaKey || !event.ctrlKey || !event.altKey || [...event.key].length !== 1)
    return false;
  const code = event.code ?? "";
  const own = /^Key[A-Z]$/.test(code)
    ? code.slice(3).toLowerCase()
    : /^Digit[0-9]$/.test(code)
      ? code.slice(5)
      : /^Numpad[0-9]$/.test(code)
        ? code.slice(6)
        : null;
  // Shift changes a digit's character on every layout: only a letter is checked then.
  if (own === null || (event.shiftKey && !/^[a-z]$/.test(own))) return false;
  return event.key.toLowerCase() !== own;
}

const MODIFIER_KEYS = new Set([
  "Meta",
  "Control",
  "Alt",
  "Shift",
  "OS",
  "AltGraph",
  "CapsLock",
  "Fn",
  "Hyper",
  "Super",
]);
/** A key event as a combo. Null for a lone modifier, composition (IME) input or AltGr text. */
export function comboFromEvent(event: ComboEvent): string | null {
  if (isComposingKey(event) || MODIFIER_KEYS.has(event.key) || isAltGraphText(event)) return null;
  const alt = !!event.altKey,
    shift = !!event.shiftKey;
  let key = event.key;
  // ⌥ and ⇧ change the character (⌥1 is "¡", ⇧1 is "!"): letters and digits come from the
  // physical key then, so ⌥⌘1 is "Mod+Alt+1" on every layout that has a 1 key.
  const code = event.code ?? "";
  if ((alt || shift) && /^(Key[A-Z]|Digit[0-9])$/.test(code))
    key = code.slice(code.startsWith("Key") ? 3 : 5);
  else if (alt && /^Numpad[0-9]$/.test(code)) key = code.slice(6);
  return joinCombo({ mod: !!(event.metaKey || event.ctrlKey), alt, shift, key: normalizeKey(key) });
}

/** The action a key event runs here, or null. */
export function matchShortcut(
  keymap: Keymap,
  event: ComboEvent,
  context: KeyContext | "global",
): ShortcutId | null {
  const combo = comboFromEvent(event);
  if (!combo) return null;
  const ids = keymap.byCombo.get(combo);
  if (!ids) return null;
  return ids.find((id) => answersIn(shortcutDef(id).scope, context)) ?? null;
}

export function reservedShortcut(
  combo: string,
  extra: readonly ReservedShortcut[] = [],
): ReservedShortcut | null {
  const normal = normalizeCombo(combo);
  if (!normal) return null;
  return (
    [...extra, ...RESERVED_SHORTCUTS].find(
      (reserved) => normalizeCombo(reserved.combo) === normal,
    ) ?? null
  );
}

/** Why a recorded combo cannot be used at all (no modifier, a typing key), or null. */
export function unusableCombo(combo: string): "needs-modifier" | null {
  const parsed = parseCombo(combo);
  if (!parsed) return "needs-modifier";
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(parsed.key)) return null;
  // A combo must survive typing: Shift alone only changes the character.
  return parsed.mod || parsed.alt ? null : "needs-modifier";
}

export interface ShortcutConflict {
  readonly combo: string;
  readonly ids: readonly ShortcutId[];
}

/** Every combo that two actions answer to in an overlapping place. */
export function findConflicts(keymap: Keymap): readonly ShortcutConflict[] {
  const out: ShortcutConflict[] = [];
  for (const [combo, ids] of keymap.byCombo) {
    if (ids.length < 2) continue;
    const clashing = ids.filter((id) =>
      ids.some(
        (other) => other !== id && scopesOverlap(shortcutDef(id).scope, shortcutDef(other).scope),
      ),
    );
    if (clashing.length > 1) out.push({ combo, ids: clashing });
  }
  return out;
}

export type AssignCheck =
  | { readonly ok: true; readonly combo: string; readonly conflicts: readonly ShortcutId[] }
  | {
      readonly ok: false;
      readonly combo: string | null;
      readonly reason: "needs-modifier" | "reserved";
      readonly reserved?: ReservedShortcut;
    };

/**
 * May `combo` be given to `id`? Reserved and unmodified keys are refused; actions already using
 * it where `id` also answers come back as `conflicts` (the caller warns, then replaces or not).
 */
export function checkAssignment(
  keymap: Keymap,
  id: ShortcutId,
  combo: string,
  extraReserved: readonly ReservedShortcut[] = [],
): AssignCheck {
  const normal = normalizeCombo(combo);
  if (!normal || unusableCombo(normal))
    return { ok: false, combo: normal, reason: "needs-modifier" };
  const reserved = reservedShortcut(normal, extraReserved);
  if (reserved) return { ok: false, combo: normal, reason: "reserved", reserved };
  const scope = shortcutDef(id).scope;
  const conflicts = (keymap.byCombo.get(normal) ?? []).filter(
    (other) => other !== id && scopesOverlap(scope, shortcutDef(other).scope),
  );
  return { ok: true, combo: normal, conflicts };
}

/**
 * New overrides after giving `combo` to `id` (it replaces the action's keys). With `replace`,
 * every conflicting action loses that combo; without it they keep it (a known conflict).
 */
export function assignShortcut(
  keymap: Keymap,
  id: ShortcutId,
  combo: string,
  options: { readonly replace?: boolean } = {},
): ShortcutOverrides {
  const normal = normalizeCombo(combo);
  if (!normal) return keymap.overrides;
  const next: Partial<Record<ShortcutId, readonly string[]>> = {
    ...keymap.overrides,
    [id]: [normal],
  };
  if (options.replace) {
    const scope = shortcutDef(id).scope;
    for (const other of keymap.byCombo.get(normal) ?? []) {
      if (other === id || !scopesOverlap(scope, shortcutDef(other).scope)) continue;
      next[other] = (keymap.bindings.get(other) ?? []).filter((key) => key !== normal);
    }
  }
  return tidyOverrides(next, keymap.profile);
}

/** Overrides without `id` (back to the profile's keys). */
export function resetShortcut(overrides: ShortcutOverrides, id: ShortcutId): ShortcutOverrides {
  if (!Object.prototype.hasOwnProperty.call(overrides, id)) return overrides;
  const { [id]: _removed, ...rest } = overrides;
  return rest;
}

export function unbindShortcut(keymap: Keymap, id: ShortcutId): ShortcutOverrides {
  return tidyOverrides({ ...keymap.overrides, [id]: [] }, keymap.profile);
}

/** An override equal to the profile's own keys is dropped, so "modified" stays honest. */
function tidyOverrides(
  overrides: Partial<Record<ShortcutId, readonly string[]>>,
  profile: KeyboardProfile,
): ShortcutOverrides {
  const out: Partial<Record<ShortcutId, readonly string[]>> = {};
  for (const [id, keys] of Object.entries(overrides) as [
    ShortcutId,
    readonly string[] | undefined,
  ][]) {
    if (!keys || !DEFS.has(id)) continue;
    const base = profileKeys(id, profile).map(normalizeCombo);
    const same = keys.length === base.length && keys.every((key, index) => key === base[index]);
    if (!same) out[id] = keys;
  }
  return out;
}

export const isOverridden = (keymap: Keymap, id: ShortcutId) =>
  Object.prototype.hasOwnProperty.call(keymap.overrides, id);

const KEY_GLYPHS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Enter: "↵",
  Backspace: "⌫",
  Delete: "⌦",
  Escape: "Esc",
  Tab: "Tab",
  Space: "Space",
  Plus: "+",
  PageUp: "PgUp",
  PageDown: "PgDn",
};
/** Windows and Linux name the keys rather than draw Apple's glyphs. Arrows keep their arrows. */
const KEY_NAMES: Record<string, string> = {
  ...KEY_GLYPHS,
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Del",
};

/**
 * A combo as the platform writes it: "⌥⌘1" on Apple; elsewhere the platform's own order and
 * names, "Ctrl Alt Shift 1", "Shift Enter", "Del".
 */
export function formatCombo(combo: string, apple: boolean): string {
  const parsed = parseCombo(combo);
  if (!parsed) return combo;
  const names = apple ? KEY_GLYPHS : KEY_NAMES;
  const key =
    names[parsed.key] ?? (parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
  if (!apple)
    return [parsed.mod && "Ctrl", parsed.alt && "Alt", parsed.shift && "Shift", key]
      .filter(Boolean)
      .join(" ");
  const parts = [parsed.mod && "mod", parsed.alt && "alt", parsed.shift && "shift", key].filter(
    (part): part is string => !!part,
  );
  return formatShortcut(apple, ...parts);
}

/** An action's keys for menus and the shortcut sheet ("⌥⇧↑ · ⇧⌘↑"); "" when unbound. */
export function shortcutLabel(
  keymap: Keymap,
  id: ShortcutId,
  apple: boolean,
  separator = " · ",
): string {
  return (keymap.bindings.get(id) ?? []).map((combo) => formatCombo(combo, apple)).join(separator);
}
/** The first key only, for a compact menu hint. */
export function primaryShortcut(
  keymap: Keymap,
  id: ShortcutId,
  apple: boolean,
): string | undefined {
  const first = keymap.bindings.get(id)?.[0];
  return first ? formatCombo(first, apple) : undefined;
}

/** The standard profile with no remaps (built last: it needs every helper above). */
export const DEFAULT_KEYMAP = buildKeymap();

/* ───────────────────────────── Fixed keys ───────────────────────────── */

/**
 * The keys that are never remapped (Space, Tab, arrows …) as data: key → command id. The row
 * handler runs whatever this table says, and the shortcut sheet can list it. Command ids are the
 * item registry's ids (`item.*`) or the cursor's own moves (`cursor.*`, `selection.*`).
 */
export type FixedCommand =
  | "cursor.up"
  | "cursor.down"
  | "cursor.first"
  | "cursor.last"
  | "cursor.pageUp"
  | "cursor.pageDown"
  | "cursor.in"
  | "cursor.out"
  | "item.edit"
  | "item.note"
  | "item.complete"
  | "item.indent"
  | "item.outdent"
  | "item.delete"
  | "selection.escape";

export interface FixedKey {
  readonly command: FixedCommand;
  /** `event.key` names (Space is " "). */
  readonly keys: readonly string[];
  /** ⇧ extends the selection instead of moving the cursor (movement keys). */
  readonly extends?: boolean;
  /** true: needs ⇧; false: never with ⇧; absent: either. */
  readonly shift?: boolean;
  /** Never with ⌘/Ctrl/⌥ (those chords belong to the keymap: ⌘↵ completes, ⌘⇧Space captures). */
  readonly plain?: boolean;
  /** How the shortcut sheet names it. */
  readonly label: string;
  /** The combo menus show as its hint (formatCombo), per platform; absent: no hint. */
  readonly hint?: { readonly apple: string; readonly other: string };
}

/** Row mode (the tree has focus, no field is being edited). */
export const FIXED_KEYS: readonly FixedKey[] = [
  { command: "cursor.up", keys: ["ArrowUp"], extends: true, label: "Previous item" },
  { command: "cursor.down", keys: ["ArrowDown"], extends: true, label: "Next item" },
  { command: "cursor.first", keys: ["Home"], extends: true, label: "First item" },
  { command: "cursor.last", keys: ["End"], extends: true, label: "Last item" },
  { command: "cursor.pageUp", keys: ["PageUp"], extends: true, label: "Page up" },
  { command: "cursor.pageDown", keys: ["PageDown"], extends: true, label: "Page down" },
  { command: "cursor.in", keys: ["ArrowRight"], label: "Unfold · next item" },
  { command: "cursor.out", keys: ["ArrowLeft"], label: "Fold · parent" },
  { command: "item.edit", keys: ["Enter"], shift: false, plain: true, label: "Edit" },
  {
    command: "item.note",
    keys: ["Enter"],
    shift: true,
    plain: true,
    label: "Edit note",
    hint: { apple: "Shift+Enter", other: "Shift+Enter" },
  },
  {
    command: "item.complete",
    keys: [" "],
    plain: true,
    label: "Complete",
    hint: { apple: "Space", other: "Space" },
  },
  {
    command: "item.indent",
    keys: ["Tab"],
    shift: false,
    label: "Indent",
    hint: { apple: "Tab", other: "Tab" },
  },
  {
    command: "item.outdent",
    keys: ["Tab"],
    shift: true,
    label: "Outdent",
    hint: { apple: "Shift+Tab", other: "Shift+Tab" },
  },
  // Apple keyboards say ⌫ for the key that deletes; elsewhere Del is the key people press.
  {
    command: "item.delete",
    keys: ["Backspace", "Delete"],
    label: "Delete",
    hint: { apple: "Backspace", other: "Delete" },
  },
  { command: "selection.escape", keys: ["Escape"], label: "Collapse selection · clear search" },
];

/** A fixed key's menu hint ("⌫" on Apple, "Del" elsewhere), or undefined. */
export function fixedKeyHint(command: FixedCommand, apple: boolean): string | undefined {
  const hint = FIXED_KEYS.find((def) => def.command === command)?.hint;
  return hint ? formatCombo(apple ? hint.apple : hint.other, apple) : undefined;
}

/** Opens the item menu in row mode and in a field: ⇧F10 and the ContextMenu key. "/" is typed. */
export function isItemMenuKey(event: ComboEvent): boolean {
  if (isComposingKey(event) || event.metaKey || event.ctrlKey || event.altKey) return false;
  return event.key === "ContextMenu" || (event.key === "F10" && !!event.shiftKey);
}

/**
 * The fixed command a key runs in row mode, or null. Remappable chords are matched first
 * (matchShortcut); a chord nobody claimed falls back to its plain key (⌘↑ travels like ↑).
 */
export function matchFixedKey(
  event: ComboEvent,
): { readonly command: FixedCommand; readonly extend: boolean } | null {
  if (isComposingKey(event)) return null;
  const shift = !!event.shiftKey;
  const modified = !!(event.metaKey || event.ctrlKey || event.altKey);
  for (const def of FIXED_KEYS) {
    if (!def.keys.includes(event.key)) continue;
    if (def.shift !== undefined && def.shift !== shift) continue;
    if (def.plain && modified) continue;
    return { command: def.command, extend: !!def.extends && shift };
  }
  return null;
}

/** A fixed key as the shortcut sheet writes it: "↑", "⇧Tab", "⌫ · ⌦" (and "⇧ extends" for moves). */
export function fixedKeyText(def: FixedKey, apple: boolean): string {
  const keys = def.keys
    .map((key) => formatCombo(`${def.shift ? "Shift+" : ""}${key === " " ? "Space" : key}`, apple))
    .join(" · ");
  return def.extends ? `${keys} (${apple ? "⇧" : "Shift"} extends)` : keys;
}
