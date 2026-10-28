import { useEffect, useState, type ReactNode } from "react";
import {
  Button,
  Checkbox,
  Field,
  IconButton,
  Link,
  ModalDialog,
  Pagination,
  Panel,
  Row,
  Stack,
} from "../../src/components/index.js";
import { Outliner, OutlineEditor, RichContent, HighlightText } from "../../src/react/index.js";
import type { OutlineNode } from "../../src/core/index.js";

export const sections = [
  ["overview", "Overview", "Start here"],
  ["installation", "Installation", "Start here"],
  ["components", "Components", "Build"],
  ["outline", "Outline reader", "Build"],
  ["editor", "Outline editor", "Build"],
  ["rich-content", "Rich content", "Build"],
  ["tokens", "Design tokens", "System"],
  ["accessibility", "Accessibility", "System"],
] as const;
const nodes: readonly OutlineNode[] = [
  {
    id: "design",
    text: "A little structure. A lot of possibility.",
    children: [
      {
        id: "read",
        text: "Start with a calm, readable surface",
        children: [
          { id: "detail", text: "Keep the details close, without showing them all at once." },
          { id: "focus", text: "Focus a branch to explore one idea at a time." },
        ],
      },
      { id: "control", text: "Add controls with clear interaction ownership" },
      { id: "compose", text: "Compose the experience in your application" },
    ],
  },
  {
    id: "ship",
    text: "Build with deliberate boundaries",
    children: [
      { id: "state", text: "Reader state is not document state." },
      { id: "permission", text: "UI visibility is never authorization." },
    ],
  },
];
function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setError(false);
    } catch {
      setError(true);
    }
  }
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>React / TypeScript</span>
        <Button size="compact" variant="quiet" onPress={() => void copy()}>
          {copied ? "Copied" : "Copy code"}
        </Button>
      </div>
      <pre tabIndex={0}>
        <code>{children}</code>
      </pre>
      <span role="status">
        {error
          ? "Clipboard unavailable. Select and copy the code above."
          : copied
            ? "Code copied."
            : ""}
      </span>
    </div>
  );
}
function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="doc-section" aria-labelledby={`${id}-title`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${id}-title`}>{title}</h2>
      <p className="section-intro">{intro}</p>
      {children}
    </section>
  );
}
function Preview({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="preview">
      <div className="preview-heading">
        <span>{label}</span>
        <span className="live-label">
          <i />
          Live preview
        </span>
      </div>
      <div className="preview-body">{children}</div>
    </div>
  );
}
export function DocsApp() {
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [presses, setPresses] = useState(0);
  const [name, setName] = useState("A thoughtful interface");
  const [checked, setChecked] = useState(true);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    new Set(["design", "read", "ship"]),
  );
  const [hoisted, setHoisted] = useState<string | null>(null);
  const [side, setSide] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  const visibleSections = sections.filter(([, label]) =>
    label.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a href="#overview" className="brand" aria-label="Fast UX Kit overview">
          <span className="brand-mark" aria-hidden="true">
            f.
          </span>
          <span>
            fast<span className="brand-light"> / ux kit</span>
          </span>
        </a>
        <span className="release">0.0.0-alpha.1</span>
        <div className="header-actions">
          <span className="private-label">PRIVATE PREVIEW</span>
          <Button
            variant="quiet"
            onPress={() => setDark(!dark)}
            aria-label={`Switch to ${dark ? "light" : "dark"} theme`}
          >
            {dark ? "Light mode" : "Dark mode"}
          </Button>
          <span className="mobile-menu">
            <Button aria-expanded={menu} aria-controls="docs-nav" onPress={() => setMenu(!menu)}>
              Menu
            </Button>
          </span>
        </div>
      </header>
      <div className="docs-layout">
        <aside className="sidebar" data-open={menu}>
          <nav id="docs-nav" aria-label="Documentation">
            <Field
              label="Find a section"
              placeholder="Filter documentation…"
              value={query}
              onChange={setQuery}
            />
            {["Start here", "Build", "System"].map((group) => (
              <div className="nav-group" key={group}>
                <p>{group}</p>
                {visibleSections
                  .filter(([, , category]) => category === group)
                  .map(([id, label]) => (
                    <a href={`#${id}`} key={id} onClick={() => setMenu(false)}>
                      {label}
                      <span aria-hidden="true">↗</span>
                    </a>
                  ))}
              </div>
            ))}
            {visibleSections.length === 0 && (
              <p role="status">No sections match. Try “outline” or “tokens”.</p>
            )}
            <div className="sidebar-note">
              <span className="status-dot" /> Independently built.
              <br />
              Intentionally composable.<p>Private prerelease. APIs may change.</p>
            </div>
          </nav>
        </aside>
        <main id="main" tabIndex={-1}>
          <section id="overview" className="hero" aria-labelledby="hero-title">
            <p className="eyebrow">THE BUILDING BLOCKS, WITHOUT THE WEIGHT</p>
            <h1 id="hero-title">
              Make room
              <br />
              for <span>good interaction.</span>
            </h1>
            <p className="hero-description">
              A compact React foundation for useful controls, readable outlines, and rich content.
              Shared tokens. Clear boundaries. Yours to compose.
            </p>
            <div className="hero-links">
              <a className="primary-link" href="#outline">
                Explore the playground <span aria-hidden="true">↗</span>
              </a>
              <a className="text-link" href="#installation">
                Start building →
              </a>
            </div>
            <div className="hero-grid" aria-hidden="true">
              <span>01 / CONTROLS</span>
              <span>02 / STRUCTURE</span>
              <span>03 / CONTENT</span>
            </div>
          </section>
          <div className="principles">
            <div>
              <strong>One visual language</strong>
              <p>Semantic tokens connect every control.</p>
            </div>
            <div>
              <strong>One interaction owner</strong>
              <p>React Aria by default. Explicit Ark primitives.</p>
            </div>
            <div>
              <strong>Read first, edit deliberately</strong>
              <p>Folding never changes your document.</p>
            </div>
          </div>
          <Section
            id="installation"
            eyebrow="01 / GET STARTED"
            title="Private by design. Easy to bring along."
            intro="You do not need npm publication to consume the kit. Use a versioned, locally packed artifact while the foundation is in prerelease."
          >
            <ol className="steps">
              <li>
                <strong>Verify the kit snapshot</strong>
                <p>
                  Run the local checks and packed-consumer test before distributing an artifact.
                </p>
              </li>
              <li>
                <strong>Pack and pin</strong>
                <p>
                  Build, then run <code>npm pack --ignore-scripts</code>. Install the resulting
                  tarball in your app and commit its lockfile. Keep the artifact in private storage.
                </p>
              </li>
              <li>
                <strong>Import only what you use</strong>
                <p>
                  React 19.2, React DOM 19.2 and React Aria Components are peers. Use the
                  components/aria entry for styled controls without Ark. The components entry
                  includes Ark pagination and needs the optional Ark peer installed.
                </p>
              </li>
            </ol>
            <Code>{`// In the kit checkout\nnpm ci --ignore-scripts --no-audit --no-fund\nnpm run check && npm run test:consumer\nnpm pack --ignore-scripts\n\n// In your private application\nnpm install ./vendor/samhagman-fast-ux-kit-0.0.0-alpha.1.tgz\n\nimport { Button } from "@samhagman/fast-ux-kit/components/aria";\nimport "@samhagman/fast-ux-kit/components.css";\n\n<Button variant="primary" onPress={() => { /* app action */ }}>\n  Continue\n</Button>`}</Code>
            <p className="callout">
              Keep application authorization, network calls, persistence and product-specific
              behavior in your app. This library owns presentation and interaction, not trust.
            </p>
          </Section>
          <Section
            id="components"
            eyebrow="02 / COMPONENTS"
            title="Small pieces. A consistent whole."
            intro="These are working kit components, not visual stand-ins. Try their keyboard behavior and switch themes to see the same tokens carry through."
          >
            <Preview label="Button · IconButton · Link">
              <Row wrap>
                <Button variant="primary" onPress={() => setPresses(presses + 1)}>
                  Primary action
                </Button>
                <Button onPress={() => setPresses(presses + 1)}>Secondary</Button>
                <Button variant="quiet" onPress={() => setPresses(presses + 1)}>
                  Quiet
                </Button>
                <Button variant="danger" onPress={() => setPresses(presses + 1)}>
                  Danger style
                </Button>
                <Button isDisabled>Disabled</Button>
                <IconButton label="Add one to demo counter" onPress={() => setPresses(presses + 1)}>
                  +
                </IconButton>
                <Link href="#accessibility">Accessibility notes</Link>
              </Row>
              <p className="demo-status" role="status">
                Demo actions: {presses}. No external actions are performed.
              </p>
            </Preview>
            <Code>{`<Button variant="primary" onPress={handlePress}>Continue</Button>\n<IconButton label="Add item" onPress={addItem}>+</IconButton>\n<Link href="#details">Read details</Link>`}</Code>
            <div className="two-up">
              <Preview label="Field · Checkbox">
                <Stack>
                  <Field
                    label="Project name"
                    value={name}
                    onChange={setName}
                    hint="A visible label and an associated description."
                    error={!name.trim() ? "Enter a project name." : undefined}
                  />
                  <Checkbox
                    label="Include helpful details"
                    isSelected={checked}
                    onChange={setChecked}
                  />
                  <p className="demo-status">
                    {checked ? "Details are included." : "A simpler view is selected."}
                  </p>
                </Stack>
              </Preview>
              <Preview label="ModalDialog">
                <Stack>
                  <p>A focused conversation, without losing your place.</p>
                  <Button onPress={() => setModal(true)}>Open dialog</Button>
                  <p className="demo-status">
                    Try Tab, Escape, or Close. Focus returns to the trigger.
                  </p>
                </Stack>
              </Preview>
            </div>
            <ModalDialog title="A little more context" isOpen={modal} onOpenChange={setModal}>
              <Stack>
                <p>This is a local demo. Nothing is saved or sent.</p>
                <Field label="A note for yourself" placeholder="Try focusing this field" />
                <Button onPress={() => setModal(false)}>Done</Button>
              </Stack>
            </ModalDialog>
            <Preview label="Pagination · Ark interaction owner">
              <Pagination
                label="Demo pagination"
                count={50}
                pageSize={10}
                page={page}
                onPageChange={setPage}
              />
              <p className="demo-status" role="status">
                Showing page {page} of 5.
              </p>
            </Preview>
            <Preview label="Stack · Row · Panel">
              <Panel>
                <Stack>
                  <strong>Compose, don’t reinvent.</strong>
                  <p>
                    Stack provides vertical rhythm. Row handles horizontal alignment and wrapping.
                    Panel creates a shared surface.
                  </p>
                  <Row wrap justify="between">
                    <span>Consistent spacing tokens</span>
                    <Button variant="quiet" onPress={() => setPresses(presses + 1)}>
                      Try a nested control →
                    </Button>
                  </Row>
                </Stack>
              </Panel>
            </Preview>
            <div className="api-table-wrap">
              <table>
                <caption>Component API at a glance</caption>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Key props</th>
                    <th>Interaction owner</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Button / IconButton</td>
                    <td>variant, size, onPress, isDisabled / label</td>
                    <td>React Aria</td>
                  </tr>
                  <tr>
                    <td>Field / Checkbox</td>
                    <td>label, value / isSelected, onChange</td>
                    <td>React Aria</td>
                  </tr>
                  <tr>
                    <td>ModalDialog</td>
                    <td>title, isOpen, onOpenChange, footer</td>
                    <td>React Aria</td>
                  </tr>
                  <tr>
                    <td>Pagination</td>
                    <td>label, count, pageSize, page, onPageChange</td>
                    <td>Ark</td>
                  </tr>
                  <tr>
                    <td>Stack / Row / Panel</td>
                    <td>gap / justify, wrap / padding</td>
                    <td>Layout only</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
          <Section
            id="outline"
            eyebrow="03 / OUTLINE READER"
            title="Keep the thought. Fold the detail."
            intro="A reader-first outline with in-place disclosures and optional branch focus. Expand and collapse without rewriting the underlying document."
          >
            <div className="playground-tools">
              <Row wrap>
                <Button onPress={() => setExpanded(new Set(["design", "read", "ship"]))}>
                  Expand all
                </Button>
                <Button onPress={() => setExpanded(new Set())}>Collapse all</Button>
                <Button
                  variant="quiet"
                  onPress={() => {
                    setHoisted(null);
                    setExpanded(new Set(["design", "read", "ship"]));
                  }}
                >
                  Reset view
                </Button>
                <Checkbox label="Disclosures at the start" isSelected={side} onChange={setSide} />
              </Row>
            </div>
            <Preview label="Outliner · controlled reader state">
              <Outliner
                nodes={nodes}
                aria-label="Interactive documentation outline"
                expandedIds={expanded}
                onExpandedChange={setExpanded}
                enableHoist
                hoistedId={hoisted}
                onHoistChange={setHoisted}
                disclosurePosition={side ? "start" : "end"}
              />
              <p className="demo-status" role="status">
                {expanded.size} expanded branches ·{" "}
                {hoisted ? "Focused on one branch" : "Showing the full outline"}
              </p>
            </Preview>
            <Code>{`import { Outliner } from "@samhagman/fast-ux-kit/react";\nimport "@samhagman/fast-ux-kit/styles.css";\n\n<Outliner\n  nodes={nodes}\n  aria-label="Project outline"\n  expandedIds={expanded}\n  onExpandedChange={setExpanded}\n  enableHoist\n/>`}</Code>
            <div className="two-up prose-grid">
              <div>
                <h3>Read with your keyboard</h3>
                <p>
                  Tab reaches disclosures and embedded controls. Enter or Space toggles a focused
                  disclosure. This is a nested disclosure list, not an ARIA tree.
                </p>
              </div>
              <div>
                <h3>Bring your own content</h3>
                <p>
                  Use <code>renderContent</code>, <code>renderBody</code>, or{" "}
                  <code>getRichContent</code> to compose trusted content. Embedded links remain
                  independent of folding.
                </p>
              </div>
            </div>
          </Section>
          <Section
            id="editor"
            eyebrow="04 / OUTLINE EDITOR"
            title="Editing is an explicit choice."
            intro="The editor starts read-only. Turn on editing to explore local text changes, hierarchy, tasks and undo. Reloading resets this example."
          >
            <Preview label="OutlineEditor · local demo">
              <Checkbox
                label="Enable editing in this demo"
                isSelected={editing}
                onChange={setEditing}
              />
              <div className="editor-demo">
                <OutlineEditor
                  readOnly={!editing}
                  defaultNodes={[
                    {
                      id: "draft",
                      text: "Make a little space for an idea",
                      children: [{ id: "nested", text: "Details can live one level deeper" }],
                    },
                    { id: "task", text: "Try editing this task", checked: false },
                  ]}
                />
              </div>
              <p className="demo-status">
                {editing
                  ? "Editing enabled. Enter splits a row; Tab indents; Shift+Tab outdents; the platform undo shortcut restores edits."
                  : "Read-only mode. Turn on editing deliberately before changing this example."}
              </p>
            </Preview>
            <Code>{`<OutlineEditor\n  readOnly={!editingAllowed}\n  defaultNodes={initialNodes}\n/>\n// Enforce authorization in application policy and server code too.`}</Code>
            <p className="callout">
              The demo changes only local component state. It is not a persistence or authorization
              example. Mobile IME and assistive-technology validation remain prerelease gates.
            </p>
          </Section>
          <Section
            id="rich-content"
            eyebrow="05 / RICH CONTENT"
            title="Structure with room for expression."
            intro="Render versioned document blocks, preserve Markdown source, and extend with consumer-owned trusted React renderers."
          >
            <Preview label="RichContent · safe Markdown">
              <RichContent
                document={{
                  schema: "fast-ux-rich",
                  version: 1,
                  blocks: [
                    {
                      id: "sample",
                      kind: "markdown",
                      source:
                        "### A readable document\n\nUse **emphasis**, `inline code`, and [ordinary links](#rich-content).\n\n- Keep source intact\n- Render content, not executable HTML\n\n| Boundary | Owner |\n| --- | --- |\n| Rendering | UX kit |\n| Authorization | Your application |",
                    },
                  ],
                }}
              />
            </Preview>
            <Code>{`<RichContent document={{\n  schema: "fast-ux-rich",\n  version: 1,\n  blocks: [{ id: "intro", kind: "markdown", source: "**Hello**" }]\n}} />`}</Code>
            <h3>Highlight without rewriting text</h3>
            <Preview label="HighlightText">
              <HighlightText
                text="A clear interface makes room for the important detail."
                highlights={[{ key: "interface", start: 2, end: 17 }]}
              />
            </Preview>
            <p>
              Media access is policy-controlled. Custom renderers are trusted application code;
              document data must not introduce executable code. Unsupported content receives a
              visible fallback.
            </p>
          </Section>
          <Section
            id="tokens"
            eyebrow="06 / DESIGN TOKENS"
            title="A shared language, not a locked-in look."
            intro="Override semantic tokens at the application root—including the portal root—rather than forking individual component geometry."
          >
            <div className="token-grid">
              {["surface", "text", "muted", "border", "accent", "danger", "focus", "selected"].map(
                (token) => (
                  <div className="token" key={token}>
                    <span className={`swatch swatch-${token}`} />
                    <code>--fux-{token}</code>
                  </div>
                ),
              )}
            </div>
            <Code>{`:root {\n  --fux-accent: #213d6b;\n  --fux-on-accent: #ffffff;\n  --fux-radius: 0.5rem;\n  --fux-target: 44px;\n}\n/* Define dark palette overrides on :root[data-theme="dark"].\n   Keep contrast, visible focus, and target size intact. */`}</Code>
            <p>
              Spacing steps: <code>xs</code> 0.25rem · <code>sm</code> 0.5rem · <code>md</code>{" "}
              0.75rem · <code>lg</code> 1rem · <code>xl</code> 1.5rem. Switch the page theme to
              inspect all previews together.
            </p>
          </Section>
          <Section
            id="accessibility"
            eyebrow="07 / PRINCIPLES & LIMITS"
            title="Good defaults. Honest verification."
            intro="A foundation is only useful when its boundaries are clear. These are the contracts we design around—not a claim that every browser and assistive technology has been certified."
          >
            <div className="two-up prose-grid">
              <div>
                <h3>Built into the layer</h3>
                <ul>
                  <li>44px minimum control targets</li>
                  <li>Visible labels and keyboard focus</li>
                  <li>Logical CSS properties for directionality</li>
                  <li>Reduced-motion support</li>
                  <li>One focus and overlay manager per primitive</li>
                </ul>
              </div>
              <div>
                <h3>Verify in your application</h3>
                <ul>
                  <li>Screen reader and mobile input flows</li>
                  <li>Theme contrast and 200% zoom</li>
                  <li>Interrupted dialogs and repeated interactions</li>
                  <li>Production-size document performance</li>
                  <li>Server-side authorization and data validation</li>
                </ul>
              </div>
            </div>
            <p className="callout">
              Private alpha. Do not treat this showcase as production acceptance. Run the kit
              checks, a packed-consumer test, and application-specific browser and accessibility
              checks before adoption.
            </p>
          </Section>
          <footer className="site-footer">
            <a className="brand" href="#overview">
              <span className="brand-mark" aria-hidden="true">
                f.
              </span>
              fast / ux kit
            </a>
            <p>Useful primitives. Deliberate boundaries.</p>
            <a href="./THIRD_PARTY_LICENSES.txt">Dependency licenses</a>
            <a href="#overview">Back to top ↑</a>
          </footer>
        </main>
      </div>
    </>
  );
}
