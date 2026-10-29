import { Component, useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "../../src/components/aria.js";

export interface ComponentDemo {
  render: () => ReactNode;
  code: string;
  notes?: string[];
}

export function Symbol({
  name,
  size = 18,
}: {
  name:
    | "search"
    | "sun"
    | "moon"
    | "menu"
    | "close"
    | "arrow"
    | "external"
    | "check"
    | "copy"
    | "reset"
    | "grid"
    | "color"
    | "calendar"
    | "form"
    | "layers"
    | "table"
    | "outline";
  size?: number;
}) {
  const paths: Record<typeof name, ReactNode> = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    moon: <path d="M20.5 13.4A8.6 8.6 0 0 1 10.6 3.5 8.6 8.6 0 1 0 20.5 13.4Z" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    external: <path d="M6 18 18 6M6 6h12v12" />,
    color: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" />
      </>
    ),
    calendar: (
      <>
        <rect x="4" y="5" width="16" height="16" rx="2" />
        <path d="M8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 3h2m4 0h2" />
      </>
    ),
    form: (
      <>
        <rect x="3" y="5" width="4" height="4" rx="1" />
        <rect x="3" y="15" width="4" height="4" rx="1" />
        <path d="M11 7h10M11 17h10" />
      </>
    ),
    layers: (
      <>
        <rect x="3" y="3" width="13" height="13" rx="2" />
        <rect x="8" y="8" width="13" height="13" rx="2" fill="var(--paper)" />
      </>
    ),
    table: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M3 14h18M10 4v16" />
      </>
    ),
    outline: <path d="M5 4v16M5 6h6m-6 6h6m-6 6h6M15 6h6m-6 6h6m-6 6h6" />,
    check: <path d="m5 12 4 4L19 6" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
      </>
    ),
    reset: (
      <>
        <path d="M3 11a9 9 0 1 1 3 7M3 4v7h7" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export function Code({
  children,
  title = "React / TypeScript",
}: {
  children: string;
  title?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    if (state !== "copied") return;
    const timeout = window.setTimeout(() => setState("idle"), 2200);
    return () => window.clearTimeout(timeout);
  }, [state]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setState("copied");
    } catch {
      setState("error");
    }
  }
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{title}</span>
        <Button variant="quiet" size="compact" onPress={() => void copy()}>
          <Symbol name={state === "copied" ? "check" : "copy"} size={14} />
          {state === "copied" ? "Copied" : "Copy code"}
        </Button>
      </div>
      <pre tabIndex={0}>
        <code>{children}</code>
      </pre>
      <span className="copy-status" role="status">
        {state === "error"
          ? "Clipboard unavailable. Select the code above to copy it manually."
          : state === "copied"
            ? "Code copied."
            : ""}
      </span>
    </div>
  );
}

class DemoBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="demo-error" role="alert">
        <strong>This example could not render.</strong>
        <p>Reset the example to try again. No data was saved or transmitted.</p>
      </div>
    ) : (
      this.props.children
    );
  }
}

// Invoke factories inside the boundary, not while rendering its parent.
function DemoContent({ demo }: { demo: ComponentDemo }) {
  return demo.render();
}

export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="docs-page-error" role="alert">
        <h1 id="page-title" tabIndex={-1}>
          The page could not load
        </h1>
        <p>
          The documentation module is unavailable. You can still choose another page from the
          navigation.
        </p>
        <Button onPress={() => window.location.reload()}>Reload documentation</Button>
        <p className="fux-hint">
          Reloading resets temporary example state. Nothing is uploaded or saved automatically.
        </p>
      </section>
    ) : (
      this.props.children
    );
  }
}

/** Commits only after a suspended page resolves, so route focus never targets a missing heading. */
export function PageReady({
  children,
  onReady,
}: {
  children: ReactNode;
  onReady: () => void | (() => void);
}) {
  useEffect(onReady, [onReady]);
  return children;
}

export function DemoFrame({
  demo,
  title = "Interactive example",
  compact = false,
}: {
  demo: ComponentDemo;
  title?: string;
  compact?: boolean;
}) {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [version, setVersion] = useState(0);
  const id = useId();
  return (
    <div className={`demo-frame${compact ? " demo-frame--compact" : ""}`}>
      <div className="demo-toolbar">
        <div className="demo-view-controls" aria-label="Example view">
          <Button
            variant="quiet"
            aria-pressed={view === "preview"}
            onPress={() => setView("preview")}
            aria-controls={`${id}-preview`}
          >
            Preview
          </Button>
          <Button
            variant="quiet"
            aria-pressed={view === "code"}
            onPress={() => setView("code")}
            aria-controls={`${id}-code`}
          >
            Code
          </Button>
        </div>
        <span className="demo-live">
          <i /> Live component
        </span>
        <Button
          variant="quiet"
          size="compact"
          aria-label={`Reset ${title.toLowerCase()}`}
          onPress={() => setVersion(version + 1)}
        >
          <Symbol name="reset" size={15} />
          <span className="reset-text">Reset</span>
        </Button>
      </div>
      <div
        id={`${id}-preview`}
        hidden={view !== "preview"}
        className="demo-stage"
        aria-label={title}
      >
        {view === "preview" && (
          <DemoBoundary key={version}>
            <DemoContent demo={demo} />
          </DemoBoundary>
        )}
      </div>
      <div id={`${id}-code`} hidden={view !== "code"}>
        <p className="demo-view-note">
          Switching to Code closes the preview and resets its temporary state. Return to Preview for
          a fresh example.
        </p>
        <Code>{demo.code}</Code>
      </div>
    </div>
  );
}

export function Notice({
  title,
  children,
  tone = "info",
}: {
  title?: string;
  children: ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <aside className="docs-notice" data-tone={tone}>
      {title && <strong>{title}</strong>}
      <div>{children}</div>
    </aside>
  );
}

export function PageHeading({
  category,
  title,
  description,
  owner,
}: {
  category: string;
  title: string;
  description: string;
  owner?: string;
}) {
  return (
    <header className="page-heading">
      <div className="page-breadcrumb">
        <span>Documentation</span>
        <span aria-hidden="true">/</span>
        <span>{category}</span>
      </div>
      <div className="heading-title">
        <h1 id="page-title" tabIndex={-1}>
          {title}
        </h1>
        {owner && <span className="owner-badge">{owner}</span>}
      </div>
      <p>{description}</p>
    </header>
  );
}
