import { useMediaQuery } from "../hooks/use-media-query.js";
import { ArrowRight, ExternalLink, Plus, Trash2 } from "lucide-react";
import type { MachineNode } from "../core/index.js";
import { cn } from "../lib/utils.js";
import { Button } from "../components/ui/button.js";
import { Kbd } from "../components/ui/kbd.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select.js";
import {
  KIND_LABEL,
  countStates,
  countTransitions,
  kindTag,
  useMachine,
  useMachineChrome,
} from "./machine-context.js";
import {
  CommitInput,
  Field,
  NodeSelect,
  ROOT,
  ReadOnlyValue,
  Section,
  depth,
  isWithin,
  split,
} from "./inspector-fields.js";
import { transitionLabel } from "./layout.js";
import { KEY } from "../machine-shared/machine-copy.js";

/** Inspect tab: the selected state or transition, else the machine overview. */
/**
 * "Initial state" lists real states only. When the machine starts through an explicit initial
 * pseudo-state (a dot with an eventless arrow), the field shows and edits where that arrow
 * points: the pseudo-state's own label is never drawn, so naming it here would name nothing.
 */
function InitialStateField({ disabled }: { readonly disabled: boolean }) {
  const mv = useMachine();
  const roots = mv.graph.nodes.filter(
    (n) => !n.parentId && n.kind !== "note" && n.kind !== "initial",
  );
  const initial = mv.graph.nodes.find((n) => n.id === mv.graph.initialId);
  const viaPseudo =
    initial?.kind === "initial"
      ? mv.graph.transitions.find((t) => t.sourceId === initial.id && !t.event)
      : undefined;
  return (
    <Field label="Initial state" hint={viaPseudo ? "Through the initial marker." : undefined}>
      {(id) => (
        <NodeSelect
          id={id}
          value={viaPseudo ? viaPseudo.targetId : mv.graph.initialId}
          readOnly={disabled}
          options={roots.map((n) => ({ id: n.id, label: n.label, meta: KIND_LABEL[n.kind] }))}
          onChange={(target) =>
            viaPseudo
              ? mv.run(
                  {
                    type: "update-transition",
                    machineId: mv.machineId,
                    id: viaPseudo.id,
                    patch: { targetId: target },
                  },
                  { label: "change the initial state" },
                )
              : mv.run(
                  { type: "update-machine", machineId: mv.machineId, patch: { initialId: target } },
                  { label: "change the initial state" },
                )
          }
        />
      )}
    </Field>
  );
}

const STATE_KINDS = ["atomic", "compound", "parallel", "final", "submachine"] as const;

export function InspectPanel() {
  const mv = useMachine();
  // Phone shell (where the quick actions live: the bottom bar) and pointer (what the verb is).
  const touch = useMachineChrome().compact;
  const coarse = useMediaQuery("(pointer: coarse)");
  const disabled = !mv.editable || mv.mode !== "design";
  const selection = mv.selection;
  const label = (id: string) => mv.graph.nodes.find((n) => n.id === id)?.label ?? id;
  const node =
    selection?.type === "node" ? mv.graph.nodes.find((n) => n.id === selection.id) : undefined;
  const transition =
    selection?.type === "transition"
      ? mv.graph.transitions.find((t) => t.id === selection.id)
      : undefined;

  if (node) {
    const update = (patch: Partial<MachineNode>) =>
      mv.run({ type: "update-node", machineId: mv.machineId, id: node.id, patch });
    const outgoing = mv.graph.transitions.filter((t) => t.sourceId === node.id);
    const incoming = mv.graph.transitions.filter((t) => t.targetId === node.id);
    const children = mv.graph.nodes.filter((n) => n.parentId === node.id && n.kind !== "note");
    const note = node.kind === "note";
    const pseudo = node.kind === "initial";
    return (
      <>
        <Section title={note ? "Note" : pseudo ? "Initial marker" : "State"}>
          <Field label={note ? "Text" : "Name"}>
            {(id) => (
              <CommitInput
                id={id}
                multiline={note}
                value={node.label}
                onCommit={(value) =>
                  value.trim() &&
                  mv.run(
                    {
                      type: "update-node",
                      machineId: mv.machineId,
                      id: node.id,
                      patch: { label: value.trim() },
                    },
                    {
                      onAccept: () =>
                        mv.announce(note ? "Note text changed" : `Renamed to ${value.trim()}`),
                    },
                  )
                }
                readOnly={disabled}
              />
            )}
          </Field>
          {!note && !pseudo && (
            <Field label="Kind">
              {(id) =>
                disabled ? (
                  <ReadOnlyValue
                    id={id}
                    value={KIND_LABEL[node.kind].replace(/^./, (c) => c.toUpperCase())}
                  />
                ) : (
                  <Select
                    value={node.kind}
                    onValueChange={(kind) => update({ kind: kind as MachineNode["kind"] })}
                  >
                    <SelectTrigger
                      id={id}
                      size="sm"
                      className="w-full text-ui capitalize coarse:h-11"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATE_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind} className="text-ui capitalize">
                          {KIND_LABEL[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            </Field>
          )}
          {!pseudo && !note && (
            <Field label="Inside" hint="Moving a state re-lays it out inside its new parent.">
              {(id) => (
                <NodeSelect
                  id={id}
                  value={node.parentId ?? ROOT}
                  readOnly={disabled}
                  options={[
                    { id: ROOT, label: mv.graph.label, meta: "machine" },
                    ...mv.graph.nodes
                      .filter(
                        (c) =>
                          (c.kind === "compound" || c.kind === "parallel") &&
                          c.id !== node.id &&
                          !isWithin(mv.graph.nodes, c, node.id),
                      )
                      .map((c) => ({ id: c.id, label: c.label, meta: kindTag(mv.graph, c) })),
                  ]}
                  onChange={(parentId) =>
                    mv.reparent(node.id, parentId === ROOT ? undefined : parentId)
                  }
                />
              )}
            </Field>
          )}
          {node.kind === "compound" && (
            <Field
              label="Initial child"
              hint={
                children.length
                  ? undefined
                  : "Drag a state into this compound, or select it and add one from the palette."
              }
            >
              {(id) => (
                <NodeSelect
                  id={id}
                  value={node.initialId}
                  readOnly={disabled}
                  disabled={!children.length}
                  placeholder={children.length ? "Choose a child" : "No children yet"}
                  options={children
                    .filter((c) => c.kind !== "initial")
                    .map((c) => ({ id: c.id, label: c.label, meta: KIND_LABEL[c.kind] }))}
                  onChange={(initialId) => update({ initialId })}
                />
              )}
            </Field>
          )}
          {node.kind === "parallel" && (
            <p className="mb-2.5 text-[11px] leading-4 text-muted-foreground">
              <bdi>
                Every region of a parallel state starts together, so it has no single initial child.
              </bdi>
            </p>
          )}
          {node.kind === "submachine" && (
            <Field label="Machine">
              {(id) => (
                <div className="flex gap-1.5">
                  <div className="min-w-0 flex-1">
                    <NodeSelect
                      id={id}
                      value={node.machineId}
                      readOnly={disabled}
                      placeholder="Choose a machine"
                      options={mv.machines
                        .filter((m) => m.id !== mv.machineId)
                        .map((m) => ({ id: m.id, label: m.label }))}
                      onChange={(machineId) => update({ machineId })}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Open submachine"
                    disabled={!node.machineId}
                    onClick={() => node.machineId && mv.openMachine(node.machineId)}
                    className="coarse:size-11"
                  >
                    <ExternalLink />
                  </Button>
                </div>
              )}
            </Field>
          )}
          {!note && !pseudo && (
            <>
              <Field label="Description">
                {(id) => (
                  <CommitInput
                    id={id}
                    multiline
                    value={node.description ?? ""}
                    placeholder="What this state means"
                    onCommit={(description) =>
                      update({ description: description.trim() || undefined })
                    }
                    readOnly={disabled}
                  />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Entry actions">
                  {(id) => (
                    <CommitInput
                      id={id}
                      mono
                      value={(node.entry ?? []).join(", ")}
                      placeholder="action, …"
                      onCommit={(value) => update({ entry: split(value) })}
                      readOnly={disabled}
                    />
                  )}
                </Field>
                <Field label="Exit actions">
                  {(id) => (
                    <CommitInput
                      id={id}
                      mono
                      value={(node.exit ?? []).join(", ")}
                      placeholder="action, …"
                      onCommit={(value) => update({ exit: split(value) })}
                      readOnly={disabled}
                    />
                  )}
                </Field>
              </div>
              <Field label="Tags">
                {(id) => (
                  <CommitInput
                    id={id}
                    mono
                    value={(node.tags ?? []).join(", ")}
                    placeholder="tag, …"
                    onCommit={(value) => update({ tags: split(value) })}
                    readOnly={disabled}
                  />
                )}
              </Field>
            </>
          )}
          {node.position && !disabled && (
            <button
              type="button"
              onClick={() => update({ position: undefined })}
              className="mb-2 font-mono text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              moved by hand · return to auto layout
            </button>
          )}
        </Section>
        {!note && (
          <Section title={`Transitions · ${outgoing.length} out · ${incoming.length} in`}>
            <ul className="divide-y divide-hairline rounded-lg border">
              {[
                ...outgoing.map((t) => ["out", t] as const),
                ...incoming.map((t) => ["in", t] as const),
              ].map(([dir, t]) => (
                <li key={dir + t.id}>
                  <button
                    type="button"
                    onClick={() => mv.setSelection({ type: "transition", id: t.id })}
                    aria-label={`${transitionLabel(t)}, ${dir === "out" ? "to" : "from"} ${label(dir === "out" ? t.targetId : t.sourceId)}`}
                    className="flex h-8 w-full items-center gap-2 px-2.5 text-start transition-colors hover:bg-muted/60 coarse:h-11"
                  >
                    <span className="font-mono text-[10.5px] font-semibold">
                      {t.event || "always"}
                    </span>
                    {t.guard && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        [{t.guard}]
                      </span>
                    )}
                    {/* Mirrors in RTL (the route reads right to left there); "in" rows point back at this state. */}
                    <ArrowRight
                      className={cn(
                        "size-3 shrink-0 text-muted-foreground rtl:-scale-x-100",
                        dir === "in" && "rotate-180",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {label(dir === "out" ? t.targetId : t.sourceId)}
                    </span>
                  </button>
                </li>
              ))}
              {!outgoing.length && !incoming.length && (
                <li className="px-2.5 py-2 text-muted-foreground">
                  <bdi>
                    {touch
                      ? "No transitions yet. Add connected state below creates one."
                      : "No transitions. Drag from a state's edge handle to connect, or press A."}
                  </bdi>
                </li>
              )}
            </ul>
          </Section>
        )}
        {!disabled && (
          <div className="flex flex-wrap gap-1.5">
            {!note && !pseudo && node.kind !== "final" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => mv.addConnected(node.id)}
                className="coarse:h-11"
              >
                <Plus /> Add connected state
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={mv.deleteSelection}
              className="coarse:h-11"
            >
              <Trash2 /> Delete {note ? "note" : "state"}
            </Button>
          </div>
        )}
      </>
    );
  }

  if (transition) {
    const t = transition;
    const update = (patch: Record<string, unknown>) =>
      mv.run({ type: "update-transition", machineId: mv.machineId, id: t.id, patch });
    const endpoints = mv.graph.nodes.filter((n) => n.kind !== "note");
    return (
      <>
        <Section title="Transition">
          <div className="mb-3 flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-2">
            <button
              type="button"
              className="truncate font-medium hover:underline"
              onClick={() => mv.setSelection({ type: "node", id: t.sourceId })}
            >
              {label(t.sourceId)}
            </button>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground rtl:-scale-x-100" />
            <button
              type="button"
              className="truncate font-medium hover:underline"
              onClick={() => mv.setSelection({ type: "node", id: t.targetId })}
            >
              {label(t.targetId)}
            </button>
          </div>
          <Field label="Event">
            {(id) => (
              <CommitInput
                id={id}
                mono
                value={t.event ?? ""}
                placeholder="always (eventless)"
                onCommit={(event) => update({ event: event.trim() || undefined })}
                readOnly={disabled}
                focusKey={mv.focusRequest?.field === "event" ? mv.focusRequest.nonce : undefined}
              />
            )}
          </Field>
          <Field label="Guard">
            {(id) => (
              <CommitInput
                id={id}
                mono
                value={t.guard ?? ""}
                placeholder="No guard"
                onCommit={(guard) => update({ guard: guard.trim() || undefined })}
                readOnly={disabled}
              />
            )}
          </Field>
          <Field label="Actions">
            {(id) => (
              <CommitInput
                id={id}
                mono
                value={(t.actions ?? []).join(", ")}
                placeholder="No actions"
                onCommit={(value) => update({ actions: split(value) })}
                readOnly={disabled}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">
              {(id) => (
                <NodeSelect
                  id={id}
                  value={t.sourceId}
                  readOnly={disabled}
                  options={endpoints
                    .filter((n) => n.kind !== "final")
                    .map((n) => ({ id: n.id, label: n.label }))}
                  onChange={(sourceId) => update({ sourceId })}
                />
              )}
            </Field>
            <Field label="To">
              {(id) => (
                <NodeSelect
                  id={id}
                  value={t.targetId}
                  readOnly={disabled}
                  options={endpoints
                    .filter((n) => n.kind !== "initial")
                    .map((n) => ({ id: n.id, label: n.label }))}
                  onChange={(targetId) => update({ targetId })}
                  openKey={mv.focusRequest?.field === "target" ? mv.focusRequest.nonce : undefined}
                />
              )}
            </Field>
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">
            <bdi>
              Guards and actions are names resolved by trusted host code. Nothing in the document is
              executed.
            </bdi>
          </p>
        </Section>
        {!disabled && (
          <Button
            variant="destructive"
            size="sm"
            onClick={mv.deleteSelection}
            className="coarse:h-11"
          >
            <Trash2 /> Delete transition
          </Button>
        )}
      </>
    );
  }

  // Nothing (or something that no longer exists) is selected: the machine overview.
  const states = mv.graph.nodes.filter((n) => n.kind !== "note");
  // Initial pseudo-states are markers, not states: the list matches the "States" count.
  const listed = states.filter((n) => n.kind !== "initial");
  return (
    <>
      <Section title="Machine">
        <Field label="Name">
          {(id) => (
            <CommitInput
              id={id}
              value={mv.graph.label}
              onCommit={(value) =>
                value.trim() &&
                mv.run({
                  type: "update-machine",
                  machineId: mv.machineId,
                  patch: { label: value.trim() },
                })
              }
              readOnly={disabled}
            />
          )}
        </Field>
        <InitialStateField disabled={disabled} />
      </Section>
      <Section title="Overview">
        <dl className="grid grid-cols-3 gap-2">
          {[
            ["States", countStates(mv.graph)],
            ["Transitions", countTransitions(mv.graph)],
            ["Issues", mv.issues.length],
          ].map(([name, value]) => (
            <div key={name} className="rounded-lg border px-2.5 py-1.5">
              <dt className="text-[10.5px] text-muted-foreground">{name}</dt>
              <dd className="font-mono text-[14px] font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="States">
        <ul className="rounded-lg border py-0.5">
          {listed.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => mv.setSelection({ type: "node", id: n.id })}
                className="flex h-7 w-full items-center gap-2 px-2.5 text-start transition-colors hover:bg-muted/60 coarse:h-11"
                style={{ paddingInlineStart: 10 + depth(mv.graph.nodes, n) * 12 }}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    mv.activeSet.has(n.id) ? "bg-signal" : "bg-foreground/25",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{n.label}</span>
                {n.id === mv.graph.initialId && (
                  <span className="font-mono text-[9.5px] tracking-wider text-muted-foreground/70 uppercase">
                    start
                  </span>
                )}
                <span className="font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase">
                  {kindTag(mv.graph, n)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
      {mv.mode === "design" && mv.editable && (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {touch ? (
            // This copy only shows inside the open sheet, where the bottom bar is hidden: it names the
            // control the user will see here once a state is selected.
            <bdi>{`${coarse ? "Tap" : "Click"} a state or transition to edit it. With a state selected, Add connected state (below its fields) adds one; drag a state into a compound to nest it.`}</bdi>
          ) : (
            <bdi>
              Select a state or transition to edit it. Drag from a state's edge handle to connect,
              drag a state into a compound to nest it. <Kbd dir="ltr">{KEY.delete}</Kbd> deletes,{" "}
              <Kbd>?</Kbd> lists shortcuts.
            </bdi>
          )}
        </p>
      )}
    </>
  );
}
