import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { componentManifest, type ComponentManifestEntry } from "../../src/components/manifest.js";
import { componentCategoryOrder, componentId } from "./catalog.js";
import { useFamilyDemo } from "./demo-loader.js";
import { PageHeading, Symbol } from "./ui.js";
const GalleryReader = lazy(() =>
  import("./reader-demo.js").then((module) => ({ default: module.ReaderDemo })),
);

const categories = [
  ...new Set([...componentCategoryOrder, ...componentManifest.map((entry) => entry.category)]),
].filter((category) => componentManifest.some((entry) => entry.category === category));
export const galleryEntries = categories.flatMap((category) =>
  componentManifest.filter((entry) => entry.category === category),
);
const owners = { aria: "React Aria", ark: "Ark UI", native: "Layout" };
export interface GalleryPosition {
  name: string;
  /** Retained for saved locations from the earlier horizontal gallery. */
  scrollLeft: number;
  scrollTop?: number;
  query?: string;
}
function neighbors(index: number) {
  return [index - 1, index, index + 1, index + 2].filter(
    (value) => value >= 0 && value < galleryEntries.length,
  );
}

class PreviewBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed
      ? (this.props.fallback ?? (
          <p className="gallery-preview-message" role="alert">
            This preview could not render. Reset it below, or open the component documentation.
          </p>
        ))
      : this.props.children;
  }
}

/** The same live component as its documentation, without code, API tables or a second owner. */
function FamilyPreview({ entry }: { entry: ComponentManifestEntry }) {
  const { demo, loading, retry } = useFamilyDemo(entry);
  if (demo) return demo.render();
  if (loading)
    return (
      <p className="gallery-preview-message" role="status">
        Loading {entry.name} preview…
      </p>
    );
  return (
    <div className="gallery-preview-message">
      <p role="alert">The {entry.name} preview could not load.</p>
      <button type="button" className="gallery-action" onClick={retry}>
        Retry preview
      </button>
    </div>
  );
}

function GalleryTile({
  entry,
  index,
  enabled,
  selected,
  register,
  activate,
  retain,
}: {
  entry: ComponentManifestEntry;
  index: number;
  enabled: boolean;
  selected: boolean;
  register: (node: HTMLLIElement | null) => void;
  activate: () => void;
  retain: () => void;
}) {
  const [version, setVersion] = useState(0);
  const headingId = useId();
  return (
    <li
      ref={register}
      className="gallery-tile"
      data-gallery-index={index}
      data-family={entry.name}
      data-selected={selected || undefined}
      data-live={enabled || undefined}
      onFocusCapture={(event) => {
        if (event.target.closest(".gallery-preview")) retain();
        activate();
      }}
      aria-labelledby={headingId}
    >
      <div className="gallery-tile-heading">
        <span className="gallery-number" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div>
          <span className="gallery-category">{entry.category}</span>
          <h2 id={headingId} tabIndex={-1}>
            {entry.name}
          </h2>
        </div>
      </div>
      <div
        className="gallery-preview"
        role="group"
        aria-label={`${entry.name} preview`}
        tabIndex={0}
      >
        <PreviewBoundary key={version}>
          {enabled ? (
            <FamilyPreview entry={entry} />
          ) : (
            <div className="gallery-preview-message">
              <span className="gallery-preview-outline" aria-hidden="true">
                <Symbol name="grid" size={24} />
              </span>
              <span>Preview loads when in view.</span>
            </div>
          )}
        </PreviewBoundary>
      </div>
      <p className="gallery-description">{entry.description}</p>
      <div className="gallery-tile-footer">
        <a href={`#${componentId(entry.name)}`} aria-label={`${entry.name} documentation`}>
          Documentation <Symbol name="arrow" size={15} />
        </a>
        <span className="gallery-owner">{owners[entry.owner]}</span>
        <button
          type="button"
          className="gallery-icon-action"
          aria-label={`Reset ${entry.name} preview`}
          onClick={() => {
            activate();
            setVersion((value) => value + 1);
          }}
        >
          <Symbol name="reset" size={15} />
        </button>
      </div>
    </li>
  );
}

/** A responsive catalog. Finding a family never hides the rest of the library. */
export function ComponentGallery({
  initialPosition,
  onPositionChange,
  machinePreview,
  machineTreePreview,
}: {
  initialPosition?: GalleryPosition;
  onPositionChange?: (position: GalleryPosition) => void;
  /** A consumer-owned, lazy Machine View composition. */
  machinePreview?: ReactNode;
  /** An independently reusable hierarchy-first composition. */
  machineTreePreview?: ReactNode;
}) {
  const initial = useRef(initialPosition);
  const initialIndex = Math.max(
    0,
    galleryEntries.findIndex((entry) => entry.name === initial.current?.name),
  );
  const [selected, setSelected] = useState(initialIndex);
  const [query, setQuery] = useState(initial.current?.query ?? "");
  const queryRef = useRef(query);
  queryRef.current = query;
  const [visible, setVisible] = useState(() => new Set<number>());
  const [retained, setRetained] = useState<number | undefined>(undefined);
  const selectedRef = useRef(selected);
  const viewport = useRef<HTMLDivElement>(null);
  const tiles = useRef(new Map<number, HTMLLIElement>());
  const scrollFrame = useRef<number | undefined>(undefined);
  const id = useId();
  const current = galleryEntries[selected]!;
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = galleryEntries.flatMap((entry, index) =>
    terms.every((term) =>
      `${entry.name} ${entry.category} ${entry.description}`.toLocaleLowerCase().includes(term),
    )
      ? [index]
      : [],
  );

  const remember = useCallback(
    (index: number) => {
      selectedRef.current = index;
      setSelected(index);
      onPositionChange?.({
        name: galleryEntries[index]!.name,
        scrollLeft: 0,
        scrollTop: viewport.current?.scrollTop ?? 0,
        query: queryRef.current,
      });
    },
    [onPositionChange],
  );

  const jump = useCallback(
    (index: number, focus = false) => {
      const bounded = Math.max(0, Math.min(index, galleryEntries.length - 1));
      const scroller = viewport.current;
      const target = tiles.current.get(bounded);
      if (!scroller || !target) return;
      const rootRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offset = targetRect.top - rootRect.top;
      // Vertical physical geometry is the same in LTR and RTL. No smooth-scroll
      // race when finding a distant family, and no reduced-motion exception needed.
      scroller.scrollTo({ top: scroller.scrollTop + offset, behavior: "instant" });
      remember(bounded);
      if (focus) target.querySelector<HTMLElement>("h2")?.focus();
    },
    [remember],
  );

  useEffect(() => {
    const scroller = viewport.current;
    if (!scroller) return;
    if (initial.current) {
      scroller.scrollTo({ top: initial.current.scrollTop ?? 0, behavior: "instant" });
      // A viewport resize can change the saved pixel offset. Keep the named family in view.
      const target = tiles.current.get(initialIndex);
      const rootRect = scroller.getBoundingClientRect();
      const targetRect = target?.getBoundingClientRect();
      if (targetRect && (targetRect.bottom <= rootRect.top || targetRect.top >= rootRect.bottom))
        jump(initialIndex);
    }
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const index = Number((entry.target as HTMLElement).dataset.galleryIndex);
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next;
        });
      },
      { root: scroller, rootMargin: "160px 0px" },
    );
    tiles.current.forEach((tile) => observer.observe(tile));
    return () => observer.disconnect();
    // Restore once per route mount, not when theme or unrelated app state changes.
  }, [initialIndex, jump]);

  useEffect(
    () => () => {
      if (scrollFrame.current !== undefined) cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );

  function onScroll() {
    if (scrollFrame.current !== undefined) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = undefined;
      const scroller = viewport.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      let nearest = selectedRef.current;
      // Preserve the selected column when several cards share the same row.
      const currentTile = tiles.current.get(nearest);
      let distance = currentTile
        ? Math.abs(currentTile.getBoundingClientRect().top - rect.top)
        : Infinity;
      tiles.current.forEach((tile, index) => {
        const tileRect = tile.getBoundingClientRect();
        const candidate = Math.abs(tileRect.top - rect.top);
        if (candidate < distance) {
          distance = candidate;
          nearest = index;
        }
      });
      remember(nearest);
    });
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.target !== event.currentTarget ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? galleryEntries.length - 1
          : event.key === "ArrowDown"
            ? selectedRef.current + 1
            : event.key === "ArrowUp"
              ? selectedRef.current - 1
              : event.key === "ArrowRight"
                ? selectedRef.current + (rtl ? -1 : 1)
                : event.key === "ArrowLeft"
                  ? selectedRef.current + (rtl ? 1 : -1)
                  : undefined;
    if (next !== undefined) {
      event.preventDefault();
      jump(next);
    }
  }

  return (
    <section className="component-gallery" aria-labelledby="page-title">
      <PageHeading
        category="Get started"
        title="All components"
        description="Working interfaces, built from small parts. Explore the compositions, then try every component in the catalog."
      />
      <div className="gallery-showcases" aria-label="Application components">
        <article className="gallery-showcase">
          <header>
            <div>
              <span className="gallery-category">Document workspace</span>
              <h2>Outliner</h2>
            </div>
            <Symbol name="outline" />
          </header>
          <div className="gallery-showcase-preview">
            <PreviewBoundary
              fallback={
                <p role="alert">
                  The outliner preview could not render. Open the outliner lab to try the full
                  workspace.
                </p>
              }
            >
              <Suspense fallback={<p role="status">Loading outliner preview…</p>}>
                <GalleryReader compact />
              </Suspense>
            </PreviewBoundary>
          </div>
          <footer>
            <p>Fold the details. Keep the bigger picture.</p>
            <a href="#outliner-lab">
              Open outliner lab <Symbol name="arrow" size={16} />
            </a>
          </footer>
        </article>
        <article className="gallery-showcase">
          <header>
            <div>
              <span className="gallery-category">Behavior workspace</span>
              <h2>Machine View</h2>
            </div>
            <Symbol name="layers" />
          </header>
          <div className="gallery-showcase-preview gallery-machine-preview">
            {machinePreview ?? (
              <div className="gallery-machine-intro">
                <span className="gallery-category">Model · inspect · replay</span>
                <p>Follow a system through its states.</p>
                <p>
                  Explore nested behavior, inspect transitions and trace what happens next in the
                  dedicated workbench.
                </p>
              </div>
            )}
          </div>
          <footer>
            <p>A clear view of changing behavior.</p>
            <a href="#machine-view">
              Open Machine View <Symbol name="arrow" size={16} />
            </a>
          </footer>
        </article>
        <article className="gallery-showcase gallery-showcase--tree">
          <header>
            <div>
              <span className="gallery-category">Behavior, unfolded</span>
              <h2>Machine Tree View</h2>
            </div>
            <Symbol name="outline" />
          </header>
          <div className="gallery-showcase-preview gallery-tree-preview">
            <PreviewBoundary
              fallback={
                <p role="alert">
                  The hierarchy preview could not render. Open Machine Tree View to try the full
                  reader.
                </p>
              }
            >
              {machineTreePreview ?? (
                <p>Explore nested states and outgoing transition routes without a canvas.</p>
              )}
            </PreviewBoundary>
          </div>
          <footer>
            <p>Nested behavior. Clear destinations.</p>
            <a href="#machine-tree-view">
              Open Machine Tree View <Symbol name="arrow" size={16} />
            </a>
          </footer>
        </article>
      </div>
      <div className="gallery-catalog-heading">
        <div>
          <span className="gallery-category">The building blocks</span>
          <h2>Component catalog</h2>
        </div>
        <p>Every family. Real controls. Separate documentation.</p>
      </div>
      <div className="gallery-controls">
        <div className="gallery-heading-meta">
          <strong>{galleryEntries.length} components</strong>
          <span>{categories.length} categories</span>
        </div>
        <label className="gallery-jump">
          <span>Jump to</span>
          <select
            aria-label="Jump to component"
            value={current.name}
            onChange={(event) =>
              jump(galleryEntries.findIndex((entry) => entry.name === event.target.value))
            }
          >
            {categories.map((category) => (
              <optgroup key={category} label={category}>
                {galleryEntries
                  .filter((entry) => entry.category === category)
                  .map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="gallery-step-controls" role="group" aria-label="Browse gallery">
          <button
            type="button"
            className="gallery-icon-action gallery-previous"
            aria-label="Previous component"
            aria-controls={`${id}-viewport`}
            disabled={selected === 0}
            onClick={() => jump(selected - 1)}
          >
            <Symbol name="arrow" />
          </button>
          <button
            type="button"
            className="gallery-icon-action gallery-next"
            aria-label="Next component"
            aria-controls={`${id}-viewport`}
            disabled={selected === galleryEntries.length - 1}
            onClick={() => jump(selected + 1)}
          >
            <Symbol name="arrow" />
          </button>
        </div>
      </div>
      <form
        className="gallery-find"
        role="search"
        aria-label="Find a component"
        onSubmit={(event) => {
          event.preventDefault();
          if (matches[0] !== undefined) jump(matches[0], true);
        }}
      >
        <label htmlFor={`${id}-find`}>Find in catalog</label>
        <div className="gallery-find-field">
          <Symbol name="search" size={17} />
          <input
            id={`${id}-find`}
            type="search"
            value={query}
            placeholder="Name, category or capability…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button className="gallery-action" type="submit" disabled={matches.length === 0}>
          Find component
        </button>
        {terms.length > 0 && matches.length > 1 && (
          <button
            type="button"
            className="gallery-action"
            onClick={() => jump(matches.find((index) => index > selected) ?? matches[0]!, true)}
          >
            Next match
          </button>
        )}
        <span className="gallery-find-status" role="status">
          {terms.length
            ? `${matches.length} matching ${matches.length === 1 ? "family" : "families"} · all ${galleryEntries.length} remain below`
            : "Search jumps to a match; it never hides a component."}
        </span>
      </form>
      <nav className="gallery-categories" aria-label="Component categories">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={current.category === category}
            aria-controls={`${id}-viewport`}
            onClick={() =>
              jump(
                galleryEntries.findIndex((entry) => entry.category === category),
                true,
              )
            }
          >
            {category}
            <span aria-hidden="true">
              {galleryEntries.filter((entry) => entry.category === category).length}
            </span>
          </button>
        ))}
      </nav>
      <div
        ref={viewport}
        id={`${id}-viewport`}
        className="gallery-viewport"
        role="region"
        aria-label="Interactive component gallery"
        aria-describedby={`${id}-instructions`}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
      >
        <ol className="gallery-ribbon">
          {galleryEntries.map((entry, index) => (
            <GalleryTile
              key={entry.name}
              entry={entry}
              index={index}
              enabled={
                neighbors(selected).includes(index) ||
                [...visible].slice(0, 8).includes(index) ||
                retained === index
              }
              selected={selected === index}
              register={(node) => {
                if (node) tiles.current.set(index, node);
                else tiles.current.delete(index);
              }}
              activate={() => remember(index)}
              retain={() => setRetained(index)}
            />
          ))}
        </ol>
      </div>
      <div className="gallery-caption">
        <p id={`${id}-instructions`}>
          Scroll down or use the find and jump controls. With the catalog focused, use arrow keys,
          Home or End.
        </p>
        <span className="gallery-position" role="status" aria-live="polite" aria-atomic="true">
          {String(selected + 1).padStart(2, "0")} / {galleryEntries.length} · {current.name}
        </span>
      </div>
      <p className="gallery-scope-note">
        Nearby previews stay live; distant previews reset. Your last focused preview stays mounted.
        All families remain in the catalog.{" "}
        <a href="#system-coverage">Explore aliases and utilities</a>.
      </p>
    </section>
  );
}
