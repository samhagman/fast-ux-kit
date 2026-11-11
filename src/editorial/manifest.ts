import entries from "./catalog.json" with { type: "json" };

export type EditorialLevel = "atom" | "molecule" | "organism";
export interface EditorialManifestEntry {
  readonly name: string;
  readonly exportName: string;
  readonly level: EditorialLevel;
  /** The job the form does for a reader. */
  readonly job: string;
  /** How it does that job. */
  readonly description: string;
  readonly parts: readonly string[];
  /** True when the family is also exported from the app component catalog. */
  readonly app?: boolean;
}

/** Every editorial family, in reading order within its level. */
export const editorialManifest = entries as readonly EditorialManifestEntry[];
export const editorialLevels: readonly { id: EditorialLevel; label: string; summary: string }[] = [
  {
    id: "atom",
    label: "Atoms",
    summary: "Forms that live inside a sentence, or do one small job.",
  },
  { id: "molecule", label: "Molecules", summary: "One block in the reading column." },
  { id: "organism", label: "Organisms", summary: "Whole sections that shape the page." },
];
