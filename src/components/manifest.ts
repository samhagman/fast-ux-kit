import entries from "./catalog.json" with { type: "json" };

/**
 * Where an entry sits in the kit. A family is a styled recipe exported from
 * `@samhagman/fast-ux-kit/components`. A primitive is a shadcn-layer building block, imported from
 * its own `@samhagman/fast-ux-kit/components/ui/<file>` module, that no family already covers.
 */
export type ComponentLayer = "family" | "primitive";

export interface ComponentManifestEntry {
  readonly name: string;
  readonly exportName: string;
  readonly category: string;
  readonly description: string;
  readonly owner: "base-ui" | "native";
  readonly status: "styled";
  readonly parts: readonly string[];
  readonly layer: ComponentLayer;
  /** The module that exports `exportName` and every part. */
  readonly importPath: string;
}

/** The import path of every family. Primitives name their own module in the catalog. */
export const componentFamilyImportPath = "@samhagman/fast-ux-kit/components";

type CatalogEntry = Omit<ComponentManifestEntry, "layer" | "importPath"> &
  Partial<Pick<ComponentManifestEntry, "layer" | "importPath">>;

/**
 * Canonical families, then the primitives, each counted once, independently of compound parts.
 * In `catalog.json` an entry without `layer` is a family imported from `/components`.
 */
export const componentManifest: readonly ComponentManifestEntry[] = (
  entries as readonly CatalogEntry[]
).map((entry) => ({
  ...entry,
  layer: entry.layer ?? "family",
  importPath: entry.importPath ?? componentFamilyImportPath,
}));
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
