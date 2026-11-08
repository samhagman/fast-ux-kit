/** Portable page data. Type definitions and editor code are registered by the host, never loaded from data. */
export interface NotePage<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly version: number;
  readonly data: T;
}

export interface NotePageType<T = unknown> {
  /** Stable, namespaced identifier, e.g. "example.drawing". */
  readonly type: string;
  readonly label: string;
  readonly version: number;
  create(): T;
  validate(value: unknown): value is T;
  /** Explicitly upgrades any supported older version to this definition's version. Must not do I/O. */
  migrate?(data: unknown, fromVersion: number): T;
}

export type NotePageResolution =
  | { readonly status: "ready"; readonly original: NotePage; readonly definition: NotePageType }
  | {
      readonly status: "unknown-type" | "future-version" | "migration-required" | "invalid";
      readonly original: unknown;
      readonly message: string;
    };

/** JSON compatibility without invoking getters, accepting lossy values, or following cycles. */
export function isNotePageData(value: unknown): boolean {
  const ancestors = new Set<object>();
  const stack: { value: unknown; depth: number; exit?: boolean }[] = [{ value, depth: 0 }];
  let visited = 0;
  while (stack.length) {
    const entry = stack.pop()!;
    const item = entry.value;
    if (entry.exit && typeof item === "object" && item !== null) {
      ancestors.delete(item);
      continue;
    }
    if (++visited > 100_000 || entry.depth > 128) return false;
    if (item === null || typeof item === "string" || typeof item === "boolean") continue;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) return false;
      continue;
    }
    if (typeof item !== "object") return false;
    if (ancestors.has(item)) return false;
    const array = Array.isArray(item);
    if (
      !array &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      return false;
    const keys = Reflect.ownKeys(item);
    if (array && keys.length !== item.length + 1) return false;
    ancestors.add(item);
    stack.push({ value: item, depth: entry.depth, exit: true });
    for (const key of keys) {
      if (array && key === "length") continue;
      if (typeof key !== "string") return false;
      if (array && !/^(0|[1-9]\d*)$/.test(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!descriptor.enumerable || !("value" in descriptor)) return false;
      stack.push({ value: descriptor.value, depth: entry.depth + 1 });
    }
  }
  return true;
}

export function isNotePage(value: unknown): value is NotePage {
  if (!isNotePageData(value) || !value || typeof value !== "object" || Array.isArray(value))
    return false;
  const page = value as Partial<NotePage>;
  return (
    typeof page.id === "string" &&
    page.id.trim().length > 0 &&
    typeof page.type === "string" &&
    page.type.trim().length > 0 &&
    Number.isSafeInteger(page.version) &&
    (page.version ?? 0) >= 1 &&
    Object.prototype.hasOwnProperty.call(page, "data")
  );
}

/** Lossless JSON snapshot; unknown types and future versions remain serializable. */
export function serializeNotePage(page: NotePage): string {
  if (!isNotePage(page)) throw new TypeError("Invalid note page or non-JSON page data.");
  return JSON.stringify(page);
}
export function parseNotePage(source: string): NotePage {
  const page: unknown = JSON.parse(source);
  if (!isNotePage(page)) throw new TypeError("Invalid note page envelope.");
  return page;
}

export interface NotePageRegistry {
  list(): readonly NotePageType[];
  get(type: string): NotePageType | undefined;
  create(type: string, id: string): NotePage;
  resolve(page: unknown): NotePageResolution;
  /** Returns a new validated page. The original is not mutated; the host must explicitly save it. */
  migrate(page: NotePage): NotePage;
}

export function createNotePageRegistry(definitions: readonly NotePageType[]): NotePageRegistry {
  const types = new Map<string, NotePageType>();
  for (const input of definitions) {
    if (
      !input.type.trim() ||
      !input.label.trim() ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1
    )
      throw new TypeError("Page types require a nonempty type/label and positive schema version.");
    if (types.has(input.type)) throw new TypeError(`Duplicate note page type: ${input.type}`);
    // Snapshot the descriptor so later caller mutation cannot replace registered hooks.
    if (
      typeof input.create !== "function" ||
      typeof input.validate !== "function" ||
      (input.migrate !== undefined && typeof input.migrate !== "function")
    )
      throw new TypeError("Page types require create and validate functions.");
    types.set(
      input.type,
      Object.freeze({
        type: input.type,
        label: input.label,
        version: input.version,
        create: input.create,
        validate: input.validate,
        ...(input.migrate ? { migrate: input.migrate } : {}),
      }),
    );
  }
  const list = Object.freeze([...types.values()]);
  function valid(definition: NotePageType, data: unknown): boolean {
    try {
      return isNotePageData(data) && definition.validate(data);
    } catch {
      return false;
    }
  }
  function resolve(page: unknown): NotePageResolution {
    if (!isNotePage(page))
      return {
        status: "invalid",
        original: page,
        message: "The page envelope or data is invalid.",
      };
    const definition = types.get(page.type);
    if (!definition)
      return {
        status: "unknown-type",
        original: page,
        message: `The ${page.type} editor is not installed. Your data is preserved.`,
      };
    if (page.version > definition.version)
      return {
        status: "future-version",
        original: page,
        message: "This page needs a newer editor. Your data is preserved.",
      };
    if (page.version < definition.version)
      return {
        status: "migration-required",
        original: page,
        message: "This page needs an explicit schema upgrade before editing.",
      };
    if (!valid(definition, page.data))
      return {
        status: "invalid",
        original: page,
        message: "The page data does not match its editor. Your data is preserved.",
      };
    return { status: "ready", original: page, definition };
  }
  return Object.freeze({
    list: () => list,
    get: (type: string) => types.get(type),
    resolve,
    create(type: string, id: string): NotePage {
      const definition = types.get(type);
      if (!definition) throw new TypeError(`Unknown note page type: ${type}`);
      const page = { id, type, version: definition.version, data: definition.create() };
      if (resolve(page).status !== "ready")
        throw new TypeError("The page factory returned invalid data.");
      return parseNotePage(serializeNotePage(page));
    },
    migrate(page: NotePage): NotePage {
      const resolution = resolve(page);
      if (resolution.status === "ready") return parseNotePage(serializeNotePage(page));
      const definition = types.get(page.type);
      if (resolution.status !== "migration-required" || !definition?.migrate)
        throw new TypeError("No supported migration is available for this page.");
      const snapshot = parseNotePage(serializeNotePage(page));
      const migrated = {
        ...snapshot,
        version: definition.version,
        data: definition.migrate(snapshot.data, snapshot.version),
      };
      if (resolve(migrated).status !== "ready")
        throw new TypeError("The migration returned invalid data.");
      return parseNotePage(serializeNotePage(migrated));
    },
  });
}
