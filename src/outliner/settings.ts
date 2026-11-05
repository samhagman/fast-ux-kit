import type { OutlineNoteDisplay } from "./types.js";
import type { KeyboardProfile, ShortcutOverrides } from "./keymap.js";

/**
 * The reader's preferences, as plain data the host stores (or not) however it likes. The
 * outliner owns them only when uncontrolled (`defaultSettings`); with `settings` +
 * `onSettingsChange` the host does. The outliner itself never touches storage.
 */
export interface OutlinerSettings {
  /** Row spacing: compact (the default) or cozy (a little more air between rows). */
  readonly density: OutlineDensity;
  readonly fontSize: OutlineFontSize;
  /** What a bullet click does. The other action stays on ⌥/Alt-click and in the item menu. */
  readonly bulletClick: OutlineBulletClick;
  /** Standard keys, or the power profile (⌘↑/↓ swap, ⌥⌘1–3 levels, notes take ⌘⇧↵ for a line). */
  readonly keyboard: KeyboardProfile;
  /** How notes show when the document opens (the view menu changes it for the session too). */
  readonly noteDisplay: OutlineNoteDisplay;
  /** Remapped shortcuts on top of the profile (see keymap.ts). */
  readonly shortcuts: ShortcutOverrides;
}

export type OutlineDensity = "compact" | "cozy";
export type OutlineFontSize = "small" | "default" | "large";
export type OutlineBulletClick = "zoom" | "fold";

export const DEFAULT_SETTINGS: OutlinerSettings = {
  density: "compact",
  fontSize: "default",
  bulletClick: "zoom",
  keyboard: "standard",
  noteDisplay: "show",
  shortcuts: {},
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

/**
 * Settings from anything a host stored (an older shape, a hand-edited value): unknown fields
 * are dropped and missing or invalid ones fall back to the defaults.
 */
export function resolveSettings(value?: Partial<OutlinerSettings> | null): OutlinerSettings {
  if (!value) return DEFAULT_SETTINGS;
  const shortcuts: Record<string, readonly string[]> = {};
  if (value.shortcuts && typeof value.shortcuts === "object")
    for (const [id, keys] of Object.entries(value.shortcuts))
      if (Array.isArray(keys) && keys.every((key) => typeof key === "string")) shortcuts[id] = keys;
  return {
    density: pick(value.density, ["compact", "cozy"], DEFAULT_SETTINGS.density),
    fontSize: pick(value.fontSize, ["small", "default", "large"], DEFAULT_SETTINGS.fontSize),
    bulletClick: pick(value.bulletClick, ["zoom", "fold"], DEFAULT_SETTINGS.bulletClick),
    keyboard: pick(value.keyboard, ["standard", "power"], DEFAULT_SETTINGS.keyboard),
    noteDisplay: pick(
      value.noteDisplay,
      ["show", "first-line", "hide"],
      DEFAULT_SETTINGS.noteDisplay,
    ),
    shortcuts: shortcuts as ShortcutOverrides,
  };
}

/**
 * The type scale and row rhythm as CSS custom properties on the outliner's root. Rows, notes,
 * bullets and headings size from these, so a setting never needs a second render path.
 *   --ol-text / --ol-leading   title size and line height
 *   --ol-note / --ol-note-leading
 *   --ol-pad                   vertical padding inside a row (touch adds its own on top)
 */
export function settingsStyle(settings: OutlinerSettings): Record<string, string> {
  const type = TYPE_SCALE[settings.fontSize];
  return {
    "--ol-text": `${type.text}px`,
    "--ol-leading": `${type.leading}px`,
    "--ol-note": `${type.note}px`,
    "--ol-note-leading": `${type.noteLeading}px`,
    "--ol-pad": settings.density === "cozy" ? "6px" : "3px",
  };
}

const TYPE_SCALE: Record<
  OutlineFontSize,
  { text: number; leading: number; note: number; noteLeading: number }
> = {
  small: { text: 13, leading: 20, note: 12, noteLeading: 18 },
  default: { text: 14, leading: 22, note: 13, noteLeading: 20 },
  large: { text: 16, leading: 25, note: 14.5, noteLeading: 22 },
};
