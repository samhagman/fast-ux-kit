import * as React from "react";
import {
  createNotePageRegistry,
  type NotePage,
  type NotePageResolution,
  type NotePageType,
} from "../core/note-pages.js";

export interface NotePageEditorProps<T = unknown> {
  readonly pageId: string;
  readonly data: T;
  readonly readOnly: boolean;
  /** False when blocked, stale, invalid or read-only. No storage operation is performed here. */
  readonly onChange: (data: T) => boolean;
}
export interface NotePageExtension {
  readonly definition: NotePageType;
  readonly Editor: React.ComponentType<NotePageEditorProps>;
}
/** Bind a typed, trusted React editor to a portable definition. Never register code from page data. */
export function defineNotePageExtension<T>(
  definition: NotePageType<T>,
  Editor: React.ComponentType<NotePageEditorProps<T>>,
): NotePageExtension {
  function TypedEditor(props: NotePageEditorProps) {
    if (!definition.validate(props.data)) throw new TypeError("Invalid editor data.");
    return <Editor {...props} data={props.data} />;
  }
  return Object.freeze({ definition, Editor: TypedEditor });
}

export interface NotePageViewProps {
  readonly page: NotePage;
  /** Register outside render or memoize to retain each editor's component identity. */
  readonly extensions: readonly NotePageExtension[];
  /** Defaults to true. This is a UI boundary, not server authorization. */
  readonly readOnly?: boolean;
  readonly onChange?: (page: NotePage) => void;
  readonly onError?: (error: Error) => void;
  readonly fallback?: (
    resolution: Exclude<NotePageResolution, { status: "ready" }>,
  ) => React.ReactNode;
}

class EditorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }
  render() {
    if (this.state.error)
      return (
        <div role="alert">
          <p>This page's editor could not open. Your saved data is unchanged.</p>
          <button type="button" onClick={() => this.setState({ error: false })}>
            Retry editor
          </button>
        </div>
      );
    return this.props.children;
  }
}

function MountedEditor({
  page,
  extension,
  readOnly,
  onChange,
  onError,
}: {
  page: NotePage;
  extension: NotePageExtension;
  readOnly: boolean;
  onChange?: (page: NotePage) => void;
  onError?: (error: Error) => void;
}) {
  const current = React.useRef({ page, extension, readOnly, onChange, onError });
  const mounted = React.useRef(false);
  React.useLayoutEffect(() => {
    current.current = { page, extension, readOnly, onChange, onError };
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  });
  const change = React.useCallback(
    (data: unknown): boolean => {
      const latest = current.current;
      if (!mounted.current || latest.extension !== extension || latest.readOnly || !latest.onChange)
        return false;
      const next = { ...latest.page, data };
      const registry = createNotePageRegistry([extension.definition]);
      if (registry.resolve(next).status !== "ready") {
        latest.onError?.(new TypeError("The editor proposed invalid page data."));
        return false;
      }
      latest.onChange(next);
      return true;
    },
    [extension],
  );
  const Editor = extension.Editor;
  return <Editor pageId={page.id} data={page.data} readOnly={readOnly} onChange={change} />;
}

/** No migrations or persistence occur during rendering. Missing/invalid editors cannot overwrite data. */
export function NotePageView({
  page,
  extensions,
  readOnly = true,
  onChange,
  onError,
  fallback,
}: NotePageViewProps) {
  const registry = React.useMemo(
    () => createNotePageRegistry(extensions.map((entry) => entry.definition)),
    [extensions],
  );
  const resolution = registry.resolve(page);
  if (resolution.status !== "ready")
    return <>{fallback ? fallback(resolution) : <p role="status">{resolution.message}</p>}</>;
  const extension = extensions.find((entry) => entry.definition.type === page.type)!;
  const key = JSON.stringify([page.id, page.type, page.version]);
  return (
    <EditorBoundary key={key} onError={onError}>
      <MountedEditor
        key={key}
        page={page}
        extension={extension}
        readOnly={readOnly}
        onChange={onChange}
        onError={onError}
      />
    </EditorBoundary>
  );
}
