import * as React from "react";
import type { MachineNode } from "@fux/core";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MachineContext } from "./machine-context";

/** Building blocks every inspector panel shares: section headers, labelled fields, commit-on-blur inputs, node pickers. */
export function Section({ title, badge, action, children }: { readonly title: string; readonly badge?: React.ReactNode; readonly action?: React.ReactNode; readonly children: React.ReactNode }) {
  return (
    <section className="mb-4 min-w-0 last:mb-0">
      <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          <bdi>{title}</bdi>
          {badge}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Label wired to its control through a generated id (htmlFor / aria). */
export function Field({ label, hint, children }: { readonly label: string; readonly hint?: string; readonly children: (id: string) => React.ReactNode }) {
  const id = React.useId();
  return (
    <div className="mb-2.5 grid gap-1">
      <Label htmlFor={id} className="text-[11.5px] font-normal text-muted-foreground">
        <bdi>{label}</bdi>
      </Label>
      {children(id)}
      {/* English copy and interpolated names stay in their own direction inside an RTL page (no ".Moving…"). */}
      {hint && (
        <span className="text-[10.5px] leading-3.5 text-muted-foreground/80">
          <bdi>{hint}</bdi>
        </span>
      )}
    </div>
  );
}

/**
 * Commit-on-blur text field so each edit is one undo step, not one per keystroke.
 *
 * The draft follows `value`, with two exceptions that keep typing safe against a slow host:
 *  - Typing wins over an echo. While the field is focused and holds text newer than what it last
 *    synced or committed, a new `value` (the late echo of this field's own commit, or an outside
 *    change) does not overwrite it: "v23" → Enter → keep typing "b" → the echo of "v23" lands → the
 *    field still says "v23b". The next commit (Enter, blur) sends it; Esc goes back to the last
 *    committed text (`value`, or the commit still waiting for its echo).
 *  - A refusal snaps back. When ITS commit is refused (`onCommit` returns false or another falsy
 *    non-undefined value, the command was invalid, or a controlled host vetoed it: the controller's
 *    `refusals` bumps), the field shows the document again. A refusal of some other field's change
 *    never wipes a draft still being typed here.
 *
 * `readOnly` (a read-only view, or Simulate) renders a read-only input, not a disabled one: the
 * value keeps full contrast and can still be focused, selected and copied.
 */
export function CommitInput({
  id,
  value,
  onCommit,
  mono,
  multiline,
  placeholder,
  readOnly,
  focusKey,
}: {
  readonly id: string;
  readonly value: string;
  readonly onCommit: (value: string) => unknown;
  readonly mono?: boolean;
  readonly multiline?: boolean;
  readonly placeholder?: string;
  /** Shown, not edited (read-only view, Simulate). */
  readonly readOnly?: boolean;
  /** Changes to a new value → focus and select this field once. */
  readonly focusKey?: number;
}) {
  const [draft, setDraftState] = React.useState(value);
  const ref = React.useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const refusals = React.useContext(MachineContext)?.refusals ?? 0;
  /** The draft as effects see it (they run after the render that changed it). */
  const draftRef = React.useRef(value);
  /** The text this field last took from `value` or sent with a commit: typing beyond it is the user's. */
  const baseline = React.useRef(value);
  const setDraft = (next: string, sync = true) => {
    draftRef.current = next;
    if (sync) baseline.current = next;
    setDraftState(next);
  };
  /** This field committed and the document has not (yet) taken it. */
  const outstanding = React.useRef(false);
  const focused = () => ref.current !== null && ref.current === ref.current.ownerDocument.activeElement;
  React.useEffect(() => {
    outstanding.current = false;
    // Newer typing than the last sync or commit survives the echo (see above).
    if (focused() && draftRef.current !== baseline.current) return;
    setDraft(value);
  }, [value]);
  const seenRefusals = React.useRef(refusals);
  React.useEffect(() => {
    if (refusals === seenRefusals.current) return;
    seenRefusals.current = refusals;
    if (focused() && !outstanding.current) return;
    outstanding.current = false;
    setDraft(value);
    // `value` is read, not watched: only a new refusal resyncs here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refusals]);
  React.useEffect(() => {
    if (!focusKey) return;
    const frame = requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusKey]);
  const commit = () => {
    if (readOnly || draft === value) return;
    outstanding.current = true;
    baseline.current = draft;
    const result = onCommit(draft);
    if (result !== undefined && !result) {
      outstanding.current = false;
      setDraft(value);
    }
  };
  const props = {
    id,
    ref,
    value: draft,
    readOnly,
    "aria-readonly": readOnly || undefined,
    placeholder: readOnly ? undefined : placeholder,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value, false),
    onBlur: commit,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !(multiline && event.shiftKey)) {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        // Back to the last committed text: the document's, or this field's own commit while its
        // echo is still in flight (going to the older `value` would flash it until the echo lands).
        setDraft(outstanding.current ? baseline.current : value);
      }
    },
    // Document text keeps its own direction: an English description in an RTL page never
    // reorders its trailing period (".ready"), a Hebrew name in an LTR page never reorders either.
    // It still aligns with the page (`rtl:text-right`), like every other field there.
    dir: "auto",
    className: cn(
      "h-8 text-ui rtl:text-right placeholder:text-muted-foreground/70 placeholder:italic coarse:h-11",
      mono && "font-mono text-[12px]",
      readOnly && READ_ONLY_FIELD,
    ),
  };
  if (readOnly && !value) return <ReadOnlyValue id={id} value="" empty={placeholder ? readOnlyEmpty(placeholder) : "None"} mono={mono} />;
  return multiline ? <Textarea rows={2} {...props} className={cn(props.className, "min-h-14 resize-none")} /> : <Input {...props} />;
}

/** A read-only field: no fill, a hairline, full-contrast text that can be selected and copied. */
const READ_ONLY_FIELD = "bg-transparent dark:bg-transparent border-hairline shadow-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-border cursor-text";
/** "What this state means" is an invitation to type; a read-only view just says there is nothing. */
const readOnlyEmpty = (placeholder: string) => (/^(no |none|always)/i.test(placeholder) ? placeholder : "None");

/**
 * A value shown, not edited (read-only views, Simulate): a focusable read-only input, so it is
 * announced as a read-only field, keeps full contrast and can be selected and copied.
 */
export function ReadOnlyValue({ id, value, empty = "None", mono }: { readonly id: string; readonly value: string; readonly empty?: string; readonly mono?: boolean }) {
  return value ? (
    <Input id={id} dir="auto" readOnly aria-readonly value={value} className={cn("h-8 text-ui rtl:text-right coarse:h-11", mono && "font-mono text-[12px]", READ_ONLY_FIELD)} />
  ) : (
    <Input id={id} readOnly aria-readonly value="" placeholder={empty} className={cn("h-8 text-ui placeholder:text-muted-foreground coarse:h-11", READ_ONLY_FIELD)} />
  );
}

export function NodeSelect({
  id,
  value,
  options,
  onChange,
  disabled,
  readOnly,
  placeholder = "None",
  openKey,
}: {
  readonly id: string;
  readonly value: string | undefined;
  readonly options: readonly { id: string; label: string; meta?: string }[];
  readonly onChange: (id: string) => void;
  /** Nothing to choose right now (e.g. a compound with no children yet): a disabled picker. */
  readonly disabled?: boolean;
  /** Shown, not edited (read-only view, Simulate): the chosen label as read-only text. */
  readonly readOnly?: boolean;
  readonly placeholder?: string;
  /** Changes to a new value → focus the trigger and open the list once (after the phone sheet settles). */
  readonly openKey?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!openKey || readOnly) return;
    const timer = window.setTimeout(() => {
      trigger.current?.focus({ preventScroll: false });
      trigger.current?.scrollIntoView({ block: "nearest" });
      setOpen(true);
    }, SHEET_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [openKey, readOnly]);
  if (readOnly) return <ReadOnlyValue id={id} value={options.find((o) => o.id === value)?.label ?? ""} empty={placeholder} />;
  return (
    <Select value={value ?? ""} disabled={disabled} onValueChange={onChange} open={open} onOpenChange={setOpen}>
      <SelectTrigger ref={trigger} id={id} size="sm" className="w-full text-ui coarse:h-11 [&_[data-meta]]:hidden">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id} className="text-ui">
            {o.label}
            {o.meta && <span data-meta className="ms-auto font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase">{o.meta}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The phone sheet's open glide; a list opened before it lands would anchor to a moving trigger. */
const SHEET_SETTLE_MS = 360;

export const ROOT = "__machine-root";
/** True when `node` sits anywhere inside `ancestorId`. */
export const isWithin = (nodes: readonly MachineNode[], node: MachineNode, ancestorId: string) => {
  for (let p = node.parentId; p; p = nodes.find((n) => n.id === p)?.parentId) if (p === ancestorId) return true;
  return false;
};
export const split = (value: string) => {
  const list = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
};
export const depth = (nodes: readonly MachineNode[], node: MachineNode) => {
  let d = 0;
  for (let parent = node.parentId; parent; parent = nodes.find((n) => n.id === parent)?.parentId) d++;
  return d;
};

