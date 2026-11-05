import entries from "./catalog.json" with { type: "json" };

export interface ComponentManifestEntry {
  readonly name: string;
  readonly exportName: string;
  readonly category: string;
  readonly description: string;
  readonly owner: "base-ui" | "native";
  readonly status: "styled";
  readonly parts: readonly string[];
}

/** Canonical families are counted once, independently of compound parts. */
export const componentManifest = entries as readonly ComponentManifestEntry[];
export const componentUtilities = [
  {
    name: "Class composition",
    exportName: "cn",
    description: "Combines conditional classes and resolves Tailwind conflicts.",
  },
  {
    name: "Color values",
    exportName: "parseColor",
    description: "Portable color parsing and conversion.",
  },
  {
    name: "Date values",
    exportName: "@internationalized/date",
    description: "Calendar, date, time, and timezone values independent of React.",
  },
] as const;
