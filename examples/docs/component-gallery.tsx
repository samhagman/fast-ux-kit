import {
  Component,
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

const categories = [
  ...new Set([...componentCategoryOrder, ...componentManifest.map((entry) => entry.category)]),
].filter((category) => componentManifest.some((entry) => entry.category === category));
export const galleryEntries = categories.flatMap((category) =>
  componentManifest.filter((entry) => entry.category === category),
);
const owners = { aria: "React Aria", ark: "Ark UI", native: "Layout" };
export interface GalleryPosition {
  name: string;
  scrollLeft: number;
}
function neighbors(index: number) {
  return [index - 1, index, index + 1, index + 2].filter(
    (value) => value >= 0 && value < galleryEntries.length,
  );
}

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="gallery-preview-message" role="alert">
        This preview could not render. Reset it below, or open the component documentation.
      </p>
    ) : (
      this.props.children
    );
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

/** All families form one row. Jumps move the viewport, never filter away component coverage. */
export function ComponentGallery({
  initialPosition,
  onPositionChange,
}: {
  initialPosition?: GalleryPosition;
  onPositionChange?: (position: GalleryPosition) => void;
}) {
  const initial = useRef(initialPosition);
  const initialIndex = Math.max(
    0,
    galleryEntries.findIndex((entry) => entry.name === initial.current?.name),
  );
  const [selected, setSelected] = useState(initialIndex);
  const [visible, setVisible] = useState(() => new Set<number>());
  const [retained, setRetained] = useState<number | undefined>(undefined);
  const selectedRef = useRef(selected);
  const viewport = useRef<HTMLDivElement>(null);
  const tiles = useRef(new Map<number, HTMLLIElement>());
  const scrollFrame = useRef<number | undefined>(undefined);
  const id = useId();
  const current = galleryEntries[selected]!;

  const remember = useCallback(
    (index: number) => {
      selectedRef.current = index;
      setSelected(index);
      onPositionChange?.({
        name: galleryEntries[index]!.name,
        scrollLeft: viewport.current?.scrollLeft ?? 0,
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
      const rtl = getComputedStyle(scroller).direction === "rtl";
      const offset = rtl ? targetRect.right - rootRect.right : targetRect.left - rootRect.left;
      // Physical geometry works with both LTR and native negative RTL scrollLeft values.
      // Instant movement also respects reduced motion and makes a distant jump predictable.
      scroller.scrollTo({ left: scroller.scrollLeft + offset, behavior: "instant" });
      remember(bounded);
      if (focus) target.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    },
    [remember],
  );

  useEffect(() => {
    const scroller = viewport.current;
    if (!scroller) return;
    if (initial.current) {
      scroller.scrollTo({ left: initial.current.scrollLeft, behavior: "instant" });
      // A viewport resize can change the saved pixel offset. Keep the named family in view.
      const target = tiles.current.get(initialIndex);
      const rootRect = scroller.getBoundingClientRect();
      const targetRect = target?.getBoundingClientRect();
      if (targetRect && (targetRect.right <= rootRect.left || targetRect.left >= rootRect.right))
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
      { root: scroller, rootMargin: "0px 400px" },
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
      const rtl = getComputedStyle(scroller).direction === "rtl";
      let nearest = selectedRef.current;
      let distance = Infinity;
      tiles.current.forEach((tile, index) => {
        const tileRect = tile.getBoundingClientRect();
        const candidate = Math.abs(rtl ? tileRect.right - rect.right : tileRect.left - rect.left);
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
        description="A live, side-by-side gallery. Try a component here; open its documentation for usage, anatomy and behavior."
      />
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
                neighbors(selected).includes(index) || visible.has(index) || retained === index
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
          Scroll sideways or use the jump controls. When the gallery is focused, use ← →, Home or
          End.
        </p>
        <span className="gallery-position" role="status" aria-live="polite" aria-atomic="true">
          {String(selected + 1).padStart(2, "0")} / {galleryEntries.length} · {current.name}
        </span>
      </div>
      <p className="gallery-scope-note">
        Nearby previews stay live; distant previews reset. All families stay in this row.{" "}
        <a href="#system-coverage">Explore aliases and utilities</a>.
      </p>
    </section>
  );
}
