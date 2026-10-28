"use client";

import {
  Component,
  useEffect,
  useId,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  safeRichUrl,
  validateRichDocument,
  type AudioBlock,
  type CalloutBlock,
  type DiagramBlock,
  type DrawingBlock,
  type ImageBlock,
  type LinkBlock,
  type MarkdownBlock,
  type ReactBlock,
  type RichBlock,
  type RichDocument,
  type VideoBlock,
} from "../rich/index.js";

export interface RichRendererProps<B extends RichBlock = RichBlock> {
  readonly block: B;
  readonly reducedMotion: boolean;
}
/** Application code only. A trusted registry is NOT a sandbox for imported JavaScript. */
export interface RichRendererRegistry {
  /** Trusted renderers for application-defined kinds; built-in kinds retain their safe defaults. */
  readonly blocks?: Readonly<Record<string, ComponentType<RichRendererProps>>>;
  readonly diagrams?: Readonly<Record<string, ComponentType<RichRendererProps<DiagramBlock>>>>;
  readonly react?: Readonly<Record<string, ComponentType<RichRendererProps<ReactBlock>>>>;
}
export interface RichContentProps {
  readonly document: RichDocument;
  readonly registry?: RichRendererRegistry;
  /** Default deny. Called only after protocol checks; policy does not grant iframe or script permission. */
  readonly allowMedia?: (url: string, block: RichBlock) => boolean;
  readonly className?: string;
}

function useReducedMotion() {
  // Conservative and hydration-stable until the browser preference is available.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
function Fallback({ children }: { children: ReactNode }) {
  return (
    <span className="fast-ux-rich__fallback" role="note">
      {children}
    </span>
  );
}
class RendererBoundary extends Component<
  { children: ReactNode; label: string; resetKey: unknown; renderer: unknown },
  { failed: boolean; resetKey: unknown; renderer: unknown }
> {
  state = { failed: false, resetKey: null as unknown, renderer: null as unknown };
  static getDerivedStateFromProps(
    props: { resetKey: unknown; renderer: unknown },
    state: { resetKey: unknown; renderer: unknown },
  ) {
    return props.resetKey !== state.resetKey || props.renderer !== state.renderer
      ? { failed: false, resetKey: props.resetKey, renderer: props.renderer }
      : null;
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Fallback>{this.props.label}: renderer unavailable.</Fallback>
    ) : (
      this.props.children
    );
  }
}
function Image({ src, alt, permitted }: { src: string; alt: string; permitted: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return permitted && !failed ? (
    <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
  ) : (
    <Fallback>{alt || "Image"}: image unavailable.</Fallback>
  );
}
function Media({
  block,
  permit,
}: {
  block: AudioBlock | VideoBlock;
  permit: (url: string) => boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [block.src]);
  const allowed = permit(block.src);
  return (
    <figure className="fast-ux-rich__media">
      {allowed && !failed ? (
        block.kind === "video" ? (
          <video
            aria-label={block.label}
            controls
            preload="none"
            playsInline
            onError={() => setFailed(true)}
            poster={block.poster && permit(block.poster) ? block.poster : undefined}
          >
            <source src={block.src} onError={() => setFailed(true)} />
            {block.tracks
              ?.filter((track) => permit(track.src))
              .map((track, index) => (
                <track
                  key={`${track.src}-${index}`}
                  kind="captions"
                  src={track.src}
                  label={track.label}
                  srcLang={track.language}
                />
              ))}
          </video>
        ) : (
          <audio
            aria-label={block.label}
            controls
            preload="none"
            onError={() => setFailed(true)}
            src={block.src}
          />
        )
      ) : (
        <Fallback>{block.label}: media unavailable.</Fallback>
      )}
      <figcaption>{block.label}</figcaption>
      {block.transcript && (
        <details>
          <summary>Transcript</summary>
          <p>{block.transcript}</p>
        </details>
      )}
    </figure>
  );
}
function SafeLink({
  href,
  children,
  title,
  id,
  ariaLabel,
  ariaDescribedBy,
}: {
  href?: string;
  children: ReactNode;
  title?: string;
  id?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}) {
  const safe = href && safeRichUrl(href);
  const external = safe && /^https?:/i.test(safe);
  return safe ? (
    <a
      href={safe}
      title={title}
      id={id}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      {children}
      {external && <span className="fast-ux-rich__external-label"> (opens in new tab)</span>}
    </a>
  ) : (
    <span>{children}</span>
  );
}
const MAX_RENDER_SOURCE = 200_000;
function scopedMarkdownIds(prefix: string) {
  return () => (tree: unknown) => {
    type Ast = {
      type?: string;
      tagName?: string;
      value?: string;
      properties?: Record<string, unknown>;
      children?: Ast[];
    };
    const nodes: Ast[] = [],
      pending = [{ node: tree as Ast, depth: 0 }];
    const ids = new Map<string, string>();
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (depth > 128 || nodes.length >= 20_000)
        throw new TypeError("Markdown exceeds its syntax rendering budget.");
      nodes.push(node);
      if (
        node.tagName === "li" &&
        Array.isArray(node.properties?.className) &&
        node.properties.className.includes("task-list-item")
      ) {
        const descendants = [...(node.children ?? [])].reverse();
        const inputs: Ast[] = [];
        const text: string[] = [];
        while (descendants.length) {
          const descendant = descendants.pop()!;
          // Nested list tasks have independent names, not the parent's name.
          if (descendant.tagName === "ul" || descendant.tagName === "ol") continue;
          if (descendant.tagName === "input") inputs.push(descendant);
          if (descendant.type === "text" && descendant.value) text.push(descendant.value);
          const children = descendant.children ?? [];
          for (let index = children.length - 1; index >= 0; index--)
            descendants.push(children[index]!);
        }
        const label = text.join("").trim();
        for (const input of inputs)
          if (input.properties && label)
            input.properties.ariaLabel = `${input.properties.checked ? "Completed" : "Incomplete"}: ${label}`;
      }
      const id = node.properties?.id;
      if (typeof id === "string") ids.set(id, `${prefix}-${id}`);
      for (const child of node.children ?? []) pending.push({ node: child, depth: depth + 1 });
    }
    for (const node of nodes) {
      const props = node.properties;
      if (!props) continue;
      if (typeof props.id === "string") props.id = ids.get(props.id) ?? props.id;
      if (
        typeof props.href === "string" &&
        props.href.startsWith("#") &&
        ids.has(props.href.slice(1))
      )
        props.href = `#${ids.get(props.href.slice(1))}`;
      if (Array.isArray(props.ariaDescribedBy))
        props.ariaDescribedBy = props.ariaDescribedBy.map((id) =>
          typeof id === "string" ? (ids.get(id) ?? id) : id,
        );
    }
  };
}
function markdownContent(
  block: MarkdownBlock,
  permit: (url: string) => boolean,
  prefix: string,
): ReactNode {
  // Parsing budgets are separate from lossless storage budgets; oversized source remains exportable.
  if (
    block.source.length > MAX_RENDER_SOURCE ||
    block.source.split(/\r?\n/).some((line) => /^(?:[ \t>]){128}/.test(line))
  )
    return <Fallback>Markdown is preserved, but exceeds the inline rendering budget.</Fallback>;
  try {
    // The synchronous public renderer performs parsing here, inside the bounded failure boundary,
    // rather than executing imported HTML, MDX, diagrams, or module paths.
    return Markdown({
      children: block.source,
      remarkPlugins: [remarkGfm],
      rehypePlugins: [scopedMarkdownIds(prefix)],
      skipHtml: true,
      urlTransform: (url, key) => safeRichUrl(url, key === "src" ? "media" : "link") ?? "",
      components: {
        a: ({
          href,
          children,
          title,
          id,
          "aria-label": ariaLabel,
          "aria-describedby": ariaDescribedBy,
        }) => (
          <SafeLink
            href={href}
            title={title}
            id={id}
            ariaLabel={ariaLabel}
            ariaDescribedBy={ariaDescribedBy}
          >
            {children}
          </SafeLink>
        ),
        img: ({ src, alt }) => (
          <Image
            src={typeof src === "string" ? src : ""}
            alt={alt ?? ""}
            permitted={typeof src === "string" && permit(src)}
          />
        ),
        table: ({ children }) => (
          <div className="fast-ux-rich__scroll" role="region" aria-label="Table" tabIndex={0}>
            <table>{children}</table>
          </div>
        ),
        pre: ({ children }) => (
          <pre className="fast-ux-rich__scroll" tabIndex={0}>
            {children}
          </pre>
        ),
        // Task state is display-only. Markdown editing requires an explicit source-edit transaction.
        input: ({ checked, "aria-label": label }) => (
          <input
            type="checkbox"
            checked={!!checked}
            disabled
            aria-label={label ?? (checked ? "Completed task" : "Incomplete task")}
            readOnly
          />
        ),
      },
    });
  } catch {
    return <Fallback>Markdown is preserved, but could not be rendered safely.</Fallback>;
  }
}

/** Readable rich flow. No raw source pane, network media by default, HTML injection, iframe, eval or MDX execution. */
export function RichContent({ document, registry, allowMedia, className }: RichContentProps) {
  useMemo(() => validateRichDocument(document), [document]);
  const reducedMotion = useReducedMotion();
  const instanceId = useId();
  function renderBlock(block: RichBlock): ReactNode {
    const permit = (url: string) =>
      !!safeRichUrl(url, "media") && allowMedia?.(url, block) === true;
    let body: ReactNode;
    switch (block.kind) {
      case "markdown":
        body = markdownContent(
          block as MarkdownBlock,
          permit,
          `${instanceId}-${[...block.id].map((character) => character.codePointAt(0)!.toString(16)).join("-")}`,
        );
        break;
      case "image": {
        const image = block as ImageBlock;
        body = (
          <figure>
            <Image src={image.src} alt={image.alt} permitted={permit(image.src)} />
            {image.caption && <figcaption>{image.caption}</figcaption>}
          </figure>
        );
        break;
      }
      case "drawing": {
        const drawing = block as DrawingBlock;
        body = (
          <figure>
            {drawing.snapshot ? (
              <Image
                src={drawing.snapshot}
                alt={drawing.label}
                permitted={permit(drawing.snapshot)}
              />
            ) : (
              <Fallback>{drawing.label}: drawing snapshot unavailable.</Fallback>
            )}
            <figcaption>{drawing.label}</figcaption>
          </figure>
        );
        break;
      }
      case "diagram": {
        const diagram = block as DiagramBlock;
        const Renderer =
          registry?.diagrams && Object.hasOwn(registry.diagrams, diagram.renderer)
            ? registry.diagrams[diagram.renderer]
            : undefined;
        body = Renderer ? (
          <RendererBoundary
            key={`${block.id}-${diagram.renderer}`}
            label={diagram.label}
            resetKey={block}
            renderer={Renderer}
          >
            <Renderer block={diagram} reducedMotion={reducedMotion} />
          </RendererBoundary>
        ) : (
          <Fallback>{diagram.label}: diagram renderer unavailable.</Fallback>
        );
        break;
      }
      case "react": {
        const react = block as ReactBlock;
        const Renderer =
          registry?.react && Object.hasOwn(registry.react, react.renderer)
            ? registry.react[react.renderer]
            : undefined;
        body = Renderer ? (
          <RendererBoundary
            key={`${block.id}-${react.renderer}`}
            label={react.label}
            resetKey={block}
            renderer={Renderer}
          >
            <Renderer block={react} reducedMotion={reducedMotion} />
          </RendererBoundary>
        ) : (
          <Fallback>{react.label}: interactive renderer unavailable.</Fallback>
        );
        break;
      }
      case "video":
      case "audio":
        body = <Media block={block as VideoBlock | AudioBlock} permit={permit} />;
        break;
      case "link": {
        const link = block as LinkBlock;
        body = (
          <p>
            <SafeLink href={link.href}>{link.label}</SafeLink>
            {link.description && <span> — {link.description}</span>}
          </p>
        );
        break;
      }
      case "callout": {
        const callout = block as CalloutBlock;
        body = (
          <aside aria-label={callout.label}>
            <strong>{callout.label}</strong>
            {callout.blocks.map(renderBlock)}
          </aside>
        );
        break;
      }
      default: {
        const Renderer =
          registry?.blocks && Object.hasOwn(registry.blocks, block.kind)
            ? registry.blocks[block.kind]
            : undefined;
        body = Renderer ? (
          <RendererBoundary key={block.id} label={block.kind} resetKey={block} renderer={Renderer}>
            <Renderer block={block} reducedMotion={reducedMotion} />
          </RendererBoundary>
        ) : (
          <Fallback>Unsupported content: {block.kind}. Data is preserved.</Fallback>
        );
      }
    }
    return (
      <div
        key={block.id}
        className="fast-ux-rich__block"
        data-block-id={block.id}
        data-block-kind={block.kind}
      >
        {body}
      </div>
    );
  }
  return (
    <div
      className={["fast-ux-rich", className].filter(Boolean).join(" ")}
      data-read-only="true"
      data-reduced-motion={reducedMotion}
    >
      {document.blocks.map(renderBlock)}
    </div>
  );
}
