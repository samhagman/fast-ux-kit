import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type MouseEvent,
} from "react";
import {
  Button,
  Checkbox,
  ColorSwatchPicker,
  Field,
  IconButton,
  ModalDialog,
  Row,
  Slider,
} from "../../src/components/aria.js";
import { componentManifest, ownerFamilyCoverage } from "../../src/components/manifest.js";
import { experiencePages, utilityPages } from "./catalog.js";
import { ReaderDemo } from "./reader-demo.js";
import { useFamilyDemo } from "./demo-loader.js";
import { Code, DemoFrame, Notice, PageBoundary, PageHeading, PageReady, Symbol } from "./ui.js";
const ExperiencePage = lazy(() =>
  import("./experiences.js").then((module) => ({ default: module.ExperiencePage })),
);
const UtilityPage = lazy(() =>
  import("./utilities.js").then((module) => ({ default: module.UtilityPage })),
);

export const componentId = (name: string) =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
export const foundationPages = [
  {
    id: "overview",
    name: "Overview",
    category: "Get started",
    description: "A coherent React interface foundation.",
  },
  {
    id: "installation",
    name: "Installation",
    category: "Get started",
    description: "Bring the private kit into your application.",
  },
  {
    id: "components",
    name: "All components",
    category: "Get started",
    description: "Browse every styled component family.",
  },
  {
    id: "tokens",
    name: "Design tokens",
    category: "Foundations",
    description: "Color, spacing, type, motion and shared geometry.",
  },
  {
    id: "accessibility",
    name: "Accessibility",
    category: "Foundations",
    description: "Interaction principles and verification boundaries.",
  },
  {
    id: "composition",
    name: "Composition",
    category: "Foundations",
    description: "One behavior owner. One visual language.",
  },
  {
    id: "system-coverage",
    name: "System coverage",
    category: "Foundations",
    description:
      "Every installed owner family mapped to a coherent component, composition part or utility.",
  },
] as const;
export const aliasPages = ownerFamilyCoverage
  .filter(
    (entry) =>
      entry.kind === "alias" &&
      !componentManifest.some((item) => item.name.toLowerCase() === entry.name.toLowerCase()),
  )
  .map((entry) => ({
    ...entry,
    id: `alias-${componentId(entry.name)}`,
    category: "Component aliases",
    description: `${entry.name} is covered by ${entry.canonical.join(", ")} in the unified styled system.`,
  }));
const groupOrder = [
  "Get started",
  "Foundations",
  "Actions",
  "Inputs",
  "Selection",
  "Color",
  "Date and time",
  "Collections",
  "Navigation",
  "Disclosure",
  "Overlays",
  "Feedback",
  "Display",
  "Files",
  "Media",
  "Layout",
  "Outliner",
  "Utilities",
  "Component aliases",
];
const ungroupedPages = [
  ...foundationPages,
  ...componentManifest.map((item) => ({ ...item, id: componentId(item.name) })),
  ...experiencePages,
  ...utilityPages,
  ...aliasPages,
];
// Keep page-to-page navigation in the same order as the visible sidebar.
const pageGroups = [...new Set([...groupOrder, ...ungroupedPages.map((page) => page.category)])];
export const allPages = pageGroups.flatMap((category) =>
  ungroupedPages.filter((page) => page.category === category),
);
export const sections = allPages.map((page) => [page.id, page.name, page.category] as const);
const ownerNames = { aria: "React Aria", ark: "Ark UI", native: "Layout" };
function readRoute() {
  const id = typeof window === "undefined" ? "overview" : window.location.hash.slice(1);
  return allPages.some((page) => page.id === id) ? id : "overview";
}

/** Keep in-document rich-content anchors separate from the documentation's hash routes. */
function followLocalAnchor(event: MouseEvent<HTMLElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const element = event.target instanceof Element ? event.target : null;
  const anchor = element?.closest<HTMLAnchorElement>("a[href]");
  if (
    !anchor ||
    !event.currentTarget.contains(anchor) ||
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target !== "_self")
  )
    return;
  const url = new URL(anchor.href, window.location.href);
  if (
    url.origin !== window.location.origin ||
    url.pathname !== window.location.pathname ||
    url.search !== window.location.search ||
    !url.hash
  )
    return;
  let id: string;
  try {
    id = decodeURIComponent(url.hash.slice(1));
  } catch {
    return;
  }
  if (allPages.some((page) => page.id === id)) return;
  const target = document.getElementById(id);
  if (!target || !event.currentTarget.contains(target)) return;
  event.preventDefault();
  target.scrollIntoView?.({ block: "nearest" });
  const temporaryTabIndex = !target.hasAttribute("tabindex") && target.tabIndex < 0;
  if (temporaryTabIndex) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  if (temporaryTabIndex) {
    if (document.activeElement !== target) target.removeAttribute("tabindex");
    else target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
}
function Navigation({
  active,
  query,
  setQuery,
  onNavigate,
  mobile = false,
  searchRef,
}: {
  active: string;
  query: string;
  setQuery: (query: string) => void;
  onNavigate: () => void;
  mobile?: boolean;
  searchRef?: Ref<HTMLInputElement>;
}) {
  const id = useId(),
    normalized = query.trim().toLowerCase();
  const pages = allPages.filter((page) =>
    `${page.name} ${page.description} ${page.category} ${"parts" in page ? page.parts.join(" ") : ""}`
      .toLowerCase()
      .includes(normalized),
  );
  const categories = [...new Set([...groupOrder, ...allPages.map((page) => page.category)])];
  return (
    <nav
      id={mobile ? "mobile-docs-nav" : "docs-nav"}
      className="docs-navigation"
      aria-label={mobile ? "Mobile documentation" : "Documentation"}
    >
      <div className="nav-search">
        <label htmlFor={id} className="sr-only">
          Find a component
        </label>
        <Symbol name="search" size={16} />
        <input
          ref={searchRef}
          id={id}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a component…"
          autoComplete="off"
          spellCheck={false}
          type="search"
          autoFocus={mobile}
        />
        <kbd aria-hidden="true">⌘ K</kbd>
      </div>
      {normalized && (
        <p className="search-count" role="status">
          {pages.length} matching {pages.length === 1 ? "page" : "pages"}
        </p>
      )}
      <div className="nav-scroll">
        {categories.map((category) => {
          const group = pages.filter((page) => page.category === category);
          return group.length ? (
            <section className="nav-group" key={category} aria-label={category}>
              <h2>{category}</h2>
              {group.map((page) => (
                <a
                  key={page.id}
                  href={`#${page.id}`}
                  aria-current={active === page.id ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <span>{page.name}</span>
                  {active === page.id && <span className="nav-active-dot" aria-hidden="true" />}
                </a>
              ))}
            </section>
          ) : null;
        })}
        {!pages.length && (
          <div className="nav-empty">
            <strong>No matches yet.</strong>
            <p>Try “color”, “date” or “outline”.</p>
            <Button variant="quiet" onPress={() => setQuery("")}>
              Clear search
            </Button>
          </div>
        )}
      </div>
      <div className="nav-footer">
        <span className="status-dot" /> Private prerelease
        <span>{componentManifest.length} component families</span>
      </div>
    </nav>
  );
}
function OverviewComposition() {
  const [done, setDone] = useState(true),
    [value, setValue] = useState(64),
    [count, setCount] = useState(0);
  return (
    <div className="overview-composition">
      <div className="composition-controls">
        <div className="mini-eyebrow">SMALL PIECES, WORKING TOGETHER</div>
        <h2>Make it feel like you.</h2>
        <Field label="Project name" defaultValue="A little more clarity" />
        <ColorSwatchPicker
          label="Example accent"
          colors={[
            { color: "#2f6b4f", label: "Forest" },
            { color: "#a47e42", label: "Ochre" },
            { color: "#577aa5", label: "Blue" },
            { color: "#985c6c", label: "Rose" },
          ]}
          defaultValue="#2f6b4f"
        />
        <Slider
          label="A little more space"
          minValue={0}
          maxValue={100}
          value={value}
          onChange={setValue}
        />
        <Checkbox label="Keep the useful details" isSelected={done} onChange={setDone} />
        <Row wrap>
          <Button variant="primary" onPress={() => setCount(count + 1)}>
            Try an action <Symbol name="arrow" size={15} />
          </Button>
          <span className="demo-status" role="status">
            {count
              ? `${count} local ${count === 1 ? "action" : "actions"}`
              : "Nothing is sent or saved"}
          </span>
        </Row>
      </div>
      <div className="composition-outline">
        <ReaderDemo compact />
      </div>
    </div>
  );
}
function Overview() {
  return (
    <>
      <div className="overview-heading">
        <div className="page-breadcrumb">
          <span>Documentation</span>
          <span aria-hidden="true">/</span>
          <span>Overview</span>
        </div>
        <p className="eyebrow">THE REACT INTERFACE FOUNDATION</p>
        <h1 id="page-title" tabIndex={-1}>
          One system.
          <br />
          <span>Room for every detail.</span>
        </h1>
        <p className="overview-lede">
          Thoughtful components, an expressive outliner, and a shared visual language. Built to work
          together—and stay yours to shape.
        </p>
        <div className="overview-actions">
          <a className="primary-link" href="#components">
            Explore the components <Symbol name="arrow" />
          </a>
          <a className="secondary-link" href="#installation">
            Start building <Symbol name="external" size={16} />
          </a>
        </div>
        <div className="overview-facts">
          <span>
            <strong>{componentManifest.length}</strong> styled component families
          </span>
          <span>
            <strong>2</strong> clear interaction owners
          </span>
          <span>
            <strong>1</strong> shared token system
          </span>
        </div>
      </div>
      <OverviewComposition />
      <section className="reference-section">
        <div className="section-heading">
          <div>
            <p className="mini-eyebrow">A PLACE FOR EVERYTHING</p>
            <h2>Find your building block.</h2>
          </div>
          <a className="text-icon-link" href="#components">
            View all components <Symbol name="external" size={16} />
          </a>
        </div>
        <div className="category-grid">
          {(
            [
              ["color-picker", "Color", "A complete color vocabulary.", "color"],
              ["date-picker", "Date & time", "Calendars, ranges and segmented entry.", "calendar"],
              ["select", "Forms & choices", "Clear input, selection and feedback.", "form"],
              ["modal-dialog", "Overlays", "Context without losing your place.", "layers"],
              ["table", "Collections", "Make information easy to work with.", "table"],
              ["outline", "Outliner", "Keep the thought. Fold the detail.", "outline"],
            ] as const
          ).map(([id, title, description, icon]) => (
            <a href={`#${id}`} className="category-card" key={id}>
              <span className="category-icon" aria-hidden="true">
                <Symbol name={icon} size={22} />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
              <Symbol name="arrow" size={16} />
            </a>
          ))}
        </div>
      </section>
      <Notice title="A private foundation, not an application platform">
        The kit owns presentation and interaction. Your application owns its palette, data,
        persistence and authorization. Examples use synthetic content and local state.
      </Notice>
    </>
  );
}
function ComponentCatalog() {
  const categories = [...new Set(componentManifest.map((item) => item.category))];
  return (
    <>
      <PageHeading
        category="Get started"
        title="All components"
        description="Every styled family in one place. Each has its own live example, copyable usage and named composition parts."
      />
      <div className="catalog-summary">
        <strong>{componentManifest.length} component families</strong>
        <span>Shared tokens · Typed APIs · Explicit interaction ownership</span>
      </div>
      {categories.map((category) => (
        <section key={category} className="catalog-section">
          <h2>{category}</h2>
          <div className="catalog-grid">
            {componentManifest
              .filter((entry) => entry.category === category)
              .map((entry) => (
                <a href={`#${componentId(entry.name)}`} key={entry.name} className="catalog-card">
                  <div>
                    <strong>{entry.name}</strong>
                    <Symbol name="arrow" size={15} />
                  </div>
                  <p>{entry.description}</p>
                  <span className="catalog-owner">{ownerNames[entry.owner]}</span>
                </a>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
function Installation() {
  return (
    <>
      <PageHeading
        category="Get started"
        title="Installation"
        description="Use a verified, privately packed release in your React application. No public npm publication is needed."
      />
      <ol className="installation-steps">
        <li>
          <span>01</span>
          <div>
            <h2>Build and verify the kit</h2>
            <p>
              Run the aggregate checks, then verify the packed artifact in an independent consumer.
            </p>
            <Code title="Terminal">
              {
                "npm ci --ignore-scripts --no-audit --no-fund\nnpm run check\nnpm run test:consumer\nnpm pack --ignore-scripts"
              }
            </Code>
          </div>
        </li>
        <li>
          <span>02</span>
          <div>
            <h2>Install and pin the artifact</h2>
            <p>
              Keep the tarball in your private artifact storage or application vendor directory.
              Commit the consumer lockfile.
            </p>
            <Code title="Terminal">
              {"npm install ./vendor/samhagman-fast-ux-kit-0.0.0-alpha.1.tgz"}
            </Code>
            <p>
              React, React DOM and React Aria Components are peers. The optional Ark UI peer is
              required when importing the combined component entry.
            </p>
          </div>
        </li>
        <li>
          <span>03</span>
          <div>
            <h2>Import what you use</h2>
            <Code>
              {
                'import { Button, ColorPicker } from "@samhagman/fast-ux-kit/components";\nimport "@samhagman/fast-ux-kit/components.css";\n\n<Button variant="primary" onPress={handleContinue}>\n  Continue\n</Button>'
              }
            </Code>
            <p>
              The <code>/components/aria</code> entry keeps Ark out of the default dependency graph.
              Reader/editor components live in <code>/react</code>; portable data operations live in{" "}
              <code>/core</code>.
            </p>
          </div>
        </li>
      </ol>
      <Notice title="Before adopting a new snapshot">
        APIs are prerelease. Verify the exact packed artifact, your application theme, and its real
        browser/assistive-technology flows. A successful demo build is not production acceptance.
      </Notice>
    </>
  );
}
function Tokens() {
  return (
    <>
      <PageHeading
        category="Foundations"
        title="Design tokens"
        description="A shared vocabulary for every component. Change the expression of your product without rewriting its interaction behavior."
      />
      <section className="reference-section">
        <h2>Semantic color</h2>
        <p>Roles, not color names. Switch between light and dark to inspect the whole system.</p>
        <div className="token-grid">
          {[
            "surface",
            "text",
            "muted",
            "border",
            "accent",
            "on-accent",
            "selected",
            "focus",
            "danger",
            "on-danger",
          ].map((token) => (
            <div className="token-card" key={token}>
              <div className="token-swatch" style={{ background: `var(--fux-${token})` }} />
              <code>--fux-{token}</code>
            </div>
          ))}
        </div>
      </section>
      <section className="reference-section">
        <h2>Space & rhythm</h2>
        <div className="space-scale">
          {[
            ["xs", 4],
            ["sm", 8],
            ["md", 12],
            ["lg", 16],
            ["xl", 24],
          ].map(([name, size]) => (
            <div key={name}>
              <code>{name}</code>
              <span className="space-measure" style={{ inlineSize: `${Number(size) * 4}px` }} />
              <span>{size}px</span>
            </div>
          ))}
        </div>
      </section>
      <section className="reference-section">
        <h2>Geometry & motion</h2>
        <div className="principle-grid">
          <div>
            <h3>Comfortable targets</h3>
            <p>
              <code>--fux-target</code> starts at 44px. Compact visual treatments do not shrink the
              target.
            </p>
          </div>
          <div>
            <h3>Visible focus</h3>
            <p>
              Focus color and offset work together. Never remove the ring without an equally visible
              replacement.
            </p>
          </div>
          <div>
            <h3>Logical layout</h3>
            <p>Spacing and alignment use inline/block directions to support RTL.</p>
          </div>
          <div>
            <h3>Motion with a purpose</h3>
            <p>
              Transitions acknowledge state, not delay it. Reduced-motion preferences take
              precedence.
            </p>
          </div>
        </div>
      </section>
      <Code title="CSS">
        {
          ':root {\n  --fux-surface: #ffffff;\n  --fux-text: #24352b;\n  --fux-accent: #2f6b4f;\n  --fux-on-accent: #ffffff;\n  --fux-focus: #347854;\n  --fux-radius: 0.625rem;\n  --fux-target: 44px;\n}\n\n/* Apply the same token scope to portal content. */\n:root[data-theme="dark"] {\n  --fux-surface: #19251e;\n  --fux-text: #edf4ec;\n  --fux-accent: #acd29c;\n  --fux-on-accent: #17251a;\n}'
        }
      </Code>
    </>
  );
}
function Accessibility() {
  return (
    <>
      <PageHeading
        category="Foundations"
        title="Accessibility"
        description="Good interaction starts with clear semantics and ends with real people using it. Defaults are a foundation, not a certification."
      />
      <div className="principle-grid">
        <div>
          <h2>Keyboard first-class</h2>
          <p>
            Controls keep their owner's keyboard model. Tab reaches actions; composite controls own
            arrow navigation. Escape dismisses the nearest layer before its parent.
          </p>
        </div>
        <div>
          <h2>Focus has a home</h2>
          <p>
            Dialogs restore their trigger. Collapsed content leaves the tab order. Document
            navigation keeps a valid visible destination.
          </p>
        </div>
        <div>
          <h2>Readable on a phone</h2>
          <p>
            44px targets, 16px input text, bounded content and logical spacing. Overflow belongs
            inside tables and code—not the page.
          </p>
        </div>
        <div>
          <h2>State is explicit</h2>
          <p>
            Labels, descriptions, disabled controls, validation and announcements communicate the
            same information as color and shape.
          </p>
        </div>
      </div>
      <section className="reference-section">
        <h2>Check the whole experience</h2>
        <ul className="contract-list">
          <li>Keyboard navigation and focus after Close, Cancel, Back and repeated actions.</li>
          <li>
            Text enlargement, 200% zoom, high contrast, light/dark palettes and reduced motion.
          </li>
          <li>Touch scrolling, selection, drag cancellation, virtual keyboards and composition.</li>
          <li>Screen-reader reading order, selected states, suggestions and error messages.</li>
          <li>
            Long labels, empty collections, deep outlines, unavailable media and slow async work.
          </li>
        </ul>
      </section>
      <Notice title="Verification is specific">
        DOM tests establish state/event contracts. Screenshots establish rendered layout. Responsive
        browser windows are not physical Android/iOS, IME or screen-reader certification. Keep these
        gates separate.
      </Notice>
    </>
  );
}
function Composition() {
  return (
    <>
      <PageHeading
        category="Foundations"
        title="Composition"
        description="React Aria and Ark UI share a design language, not competing event handlers. Each interactive element has exactly one behavior owner."
      />
      <div className="owner-diagram">
        <div>
          <span>React Aria</span>
          <p>Controls · collections · dates · color · overlays</p>
        </div>
        <div className="owner-bridge">
          <strong>Fast UX</strong>
          <span>Tokens · geometry · typed recipes</span>
        </div>
        <div>
          <span>Ark UI</span>
          <p>Specialized controls · navigation · rich interaction</p>
        </div>
      </div>
      <section className="reference-section">
        <h2>Recipes for a complete control</h2>
        <Code>
          {
            '<ColorPicker\n  label="Accent color"\n  value={color}\n  onChange={setColor}\n  colors={["#2f6b4f", "#577aa5", "#a47e42"]}\n/>'
          }
        </Code>
        <h2>Parts for precise composition</h2>
        <p>
          The styled <code>Primitives</code> namespace keeps upstream prop signatures, render props
          and refs. Family pages list their parts; raw <code>/aria</code> and <code>/ark</code>{" "}
          entrypoints remain explicitly unstyled.
        </p>
        <Code>
          {
            'import { Primitives as P } from "@samhagman/fast-ux-kit/components/aria";\n\n<P.TextField>\n  <P.Label>Project name</P.Label>\n  <P.Input />\n  <P.Text slot="description">A useful, visible description.</P.Text>\n  <P.FieldError />\n</P.TextField>'
          }
        </Code>
      </section>
      <Notice title="Never double the interaction owner">
        Do not wrap an Ark trigger in a React Aria Button, combine two focus traps, or let two
        overlay systems dismiss the same popup. Test cross-library focus/portal boundaries
        explicitly.
      </Notice>
    </>
  );
}
function ComponentPage({ id }: { id: string }) {
  const entry = componentManifest.find((item) => componentId(item.name) === id)!;
  const { demo, loading, retry } = useFamilyDemo(entry);
  return (
    <>
      <PageHeading
        category={entry.category}
        title={entry.name}
        description={entry.description}
        owner={ownerNames[entry.owner]}
      />
      {demo ? (
        <DemoFrame key={id} demo={demo} title={`${entry.name} example`} />
      ) : loading ? (
        <p className="example-loading" role="status">
          Loading interactive example…
        </p>
      ) : (
        <Notice title="The example could not load">
          The component module is unavailable. <Button onPress={retry}>Retry example</Button>
        </Notice>
      )}
      <section className="reference-section">
        <h2>Usage</h2>
        {demo && <Code>{demo.code}</Code>}
        <p>
          Import <code>{entry.exportName}</code> from{" "}
          <code>@samhagman/fast-ux-kit/components{entry.owner === "ark" ? "" : "/aria"}</code> and
          include <code>components.css</code>.
        </p>
      </section>
      {entry.parts.length > 0 && (
        <section className="reference-section">
          <h2>Composition parts</h2>
          <p>Use the recipe above, or compose styled parts for more control.</p>
          <div className="parts-list">
            {entry.parts.map((part) => (
              <code key={part}>{part}</code>
            ))}
          </div>
        </section>
      )}
      {demo?.notes?.length ? (
        <section className="reference-section">
          <h2>Interaction notes</h2>
          <ul className="contract-list">
            {demo.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="component-footer-note">
        <Symbol name="check" size={16} />
        <span>Shared tokens. One interaction owner. Local example state.</span>
      </div>
    </>
  );
}
function SystemCoverage() {
  const [query, setQuery] = useState("");
  const matches = ownerFamilyCoverage.filter((entry) =>
    `${entry.name} ${entry.owner} ${entry.kind} ${entry.canonical.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  return (
    <>
      <PageHeading
        category="Foundations"
        title="System coverage"
        description="The combined system keeps the useful union without doubling interaction owners. Every installed owner module has an explicit classification."
      />
      <Notice title="A union, not two competing versions of every control">
        Shared families use one canonical styled owner. Specialized controls retain their own typed
        anatomy. Parts, aliases and infrastructure are documented without inflating the{" "}
        {componentManifest.length}-family total.
      </Notice>
      <Field
        label="Find an owner module"
        value={query}
        onChange={setQuery}
        placeholder="Try Accordion, color, or utility"
      />
      <p className="demo-status" role="status">
        {matches.length} matching owner modules
      </p>
      <div className="coverage-table-wrap">
        <table className="coverage-table">
          <caption>Installed owner module coverage</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Owner</th>
              <th scope="col">Classification</th>
              <th scope="col">In the system</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((entry) => (
              <tr key={`${entry.owner}-${entry.source}`}>
                <th scope="row">{entry.name}</th>
                <td>{ownerNames[entry.owner]}</td>
                <td>{entry.kind}</td>
                <td>
                  {entry.canonical.length ? (
                    entry.canonical.map((name, index) => (
                      <span key={name}>
                        {index > 0 && ", "}
                        <a href={`#${componentId(name)}`}>{name}</a>
                      </span>
                    ))
                  ) : (
                    <a href="#composition">Typed infrastructure</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!matches.length && <p>No owner modules match this filter.</p>}
      </div>
      <p className="fux-hint">
        Coverage is checked against the installed package inventories. It establishes catalog
        completeness—not browser, screen-reader, or physical-device certification.
      </p>
    </>
  );
}
function AliasPage({ id }: { id: string }) {
  const alias = aliasPages.find((item) => item.id === id)!;
  const entry = componentManifest.find((item) => item.name === alias.canonical[0])!;
  const { demo, loading, retry } = useFamilyDemo(entry);
  return (
    <>
      <PageHeading
        category="Component aliases"
        title={alias.name}
        description={alias.description}
      />
      <Notice title={`Use ${entry.name} in the styled system`}>
        This is a naming cross-reference, not another interaction owner or an additional component
        family.{" "}
        <a href={`#${componentId(entry.name)}`}>Open the complete {entry.name} documentation →</a>
      </Notice>
      {demo ? (
        <DemoFrame demo={demo} title={`${entry.name} example`} />
      ) : loading ? (
        <p className="example-loading" role="status">
          Loading interactive example…
        </p>
      ) : (
        <Notice title="The example could not load">
          <Button onPress={retry}>Retry example</Button>
        </Notice>
      )}
      <section className="reference-section">
        <h2>Canonical usage</h2>
        {demo && <Code>{demo.code}</Code>}
      </section>
    </>
  );
}
export function DocsApp() {
  const [active, setActive] = useState(readRoute),
    [dark, setDark] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false),
    [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null),
    mainRef = useRef<HTMLElement>(null),
    previousRoute = useRef(active);
  const page = allPages.find((item) => item.id === active)!,
    pageIndex = allPages.findIndex((item) => item.id === active),
    nextPage = allPages[pageIndex + 1],
    previousPage = allPages[pageIndex - 1];
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    const update = () => setActive(readRoute());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    document.title = `${page.name} — Fast UX Kit`;
    if (previousRoute.current !== active) {
      setMobileOpen(false);
    }
  }, [active, page.name]);
  const onPageReady = useCallback(() => {
    if (previousRoute.current === active) return;
    const frame = window.requestAnimationFrame(() => {
      previousRoute.current = active;
      mainRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (event.defaultPrevented) return;
        // Some owners hide siblings instead of adding aria-modal to their dialog.
        const modal = document.querySelector(
          '.fux-overlay [role="dialog"], .fux-sheet-overlay [role="dialog"], [aria-modal="true"], dialog[open], [data-scope="drawer"][data-part="content"][data-state="open"]',
        );
        if (modal && !modal.querySelector("#mobile-docs-nav")) return;
        event.preventDefault();
        const mobileSearch = document.querySelector<HTMLInputElement>("#mobile-docs-nav input");
        if (mobileSearch) mobileSearch.focus();
        else if (window.matchMedia?.("(max-width: 800px)").matches) setMobileOpen(true);
        else searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  const content: ReactNode =
    active === "overview" ? (
      <Overview />
    ) : active === "components" ? (
      <ComponentCatalog />
    ) : active === "installation" ? (
      <Installation />
    ) : active === "tokens" ? (
      <Tokens />
    ) : active === "accessibility" ? (
      <Accessibility />
    ) : active === "composition" ? (
      <Composition />
    ) : active === "system-coverage" ? (
      <SystemCoverage />
    ) : experiencePages.some((item) => item.id === active) ? (
      <ExperiencePage id={active} />
    ) : utilityPages.some((item) => item.id === active) ? (
      <UtilityPage id={active} />
    ) : aliasPages.some((item) => item.id === active) ? (
      <AliasPage id={active} />
    ) : (
      <ComponentPage id={active} />
    );
  return (
    <>
      <a
        href="#main"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <a href="#overview" className="brand" aria-label="Fast UX Kit overview">
          <span className="brand-mark" aria-hidden="true">
            f.
          </span>
          <span>
            fast <span className="brand-light">/ ux</span>
          </span>
        </a>
        <div className="header-context">
          <span>Documentation</span>
          <span className="version-badge">alpha.1</span>
        </div>
        <div className="header-actions">
          <a className="header-start text-icon-link" href="#installation">
            Get started <Symbol name="external" size={14} />
          </a>
          <span className="header-divider" />
          <IconButton
            label={`Switch to ${dark ? "light" : "dark"} theme`}
            onPress={() => setDark(!dark)}
          >
            <Symbol name={dark ? "sun" : "moon"} />
          </IconButton>
          <div className="mobile-menu">
            <Button
              variant="quiet"
              aria-label="Browse components"
              aria-expanded={mobileOpen}
              aria-controls="mobile-docs-nav"
              onPress={() => setMobileOpen(true)}
            >
              <Symbol name="menu" />
              <span>Menu</span>
            </Button>
          </div>
        </div>
      </header>
      <div className="docs-layout">
        <aside className="sidebar">
          <Navigation
            active={active}
            query={query}
            setQuery={setQuery}
            onNavigate={() => setMobileOpen(false)}
            searchRef={searchRef}
          />
        </aside>
        <main id="main" ref={mainRef} tabIndex={-1} onClick={followLocalAnchor}>
          <div className="page-content" key={active}>
            <PageBoundary key={active}>
              <Suspense
                fallback={
                  <p className="example-loading" role="status">
                    Loading documentation…
                  </p>
                }
              >
                <PageReady onReady={onPageReady}>{content}</PageReady>
              </Suspense>
            </PageBoundary>
            <nav className="page-pagination" aria-label="Documentation pages">
              {previousPage ? (
                <a href={`#${previousPage.id}`}>
                  <span>Previous</span>
                  <strong>← {previousPage.name}</strong>
                </a>
              ) : (
                <span />
              )}
              {nextPage && (
                <a href={`#${nextPage.id}`}>
                  <span>Next</span>
                  <strong>{nextPage.name} →</strong>
                </a>
              )}
            </nav>
            <footer className="site-footer">
              <span>fast / ux kit</span>
              <p>Clear interactions. Room to build.</p>
              <a href="./THIRD_PARTY_LICENSES.txt">Dependency licenses</a>
            </footer>
          </div>
        </main>
      </div>
      <ModalDialog
        title="Browse the system"
        isOpen={mobileOpen}
        onOpenChange={setMobileOpen}
        closeLabel="Close navigation"
      >
        <div className="mobile-navigation">
          <Navigation
            active={active}
            query={query}
            setQuery={setQuery}
            onNavigate={() => setMobileOpen(false)}
            mobile
          />
        </div>
      </ModalDialog>
    </>
  );
}
