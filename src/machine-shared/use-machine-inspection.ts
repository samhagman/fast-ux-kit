import * as React from "react";
import {
  compareMachineInspectionContexts,
  machineAncestors,
  sameMachineInspectionSubject,
  type MachineDocument,
  type MachineInspectionFrame,
  type MachineInspectionSession,
  type MachinePresentation,
} from "../core/index.js";

export interface MachineInspectionAction {
  readonly id: string;
  readonly label: string;
  readonly enabled?: boolean;
  readonly reason?: string;
}
export interface MachineInspectionProps {
  readonly inspectionSession?: MachineInspectionSession;
  readonly inspectionActorId?: string;
  readonly onInspectionActorChange?: (actorId: string) => void;
  /** null follows latest. IDs may be qualified with inspectionFrameKey to disambiguate streams. */
  readonly inspectionFrameId?: string | null;
  readonly onInspectionFrameChange?: (frameId: string | null) => void;
  readonly showDiagnostics?: boolean;
  readonly presentation?: MachinePresentation;
  readonly inspectionActions?: readonly MachineInspectionAction[];
  readonly onInspectionAction?: (
    actionId: string,
    frame: MachineInspectionFrame,
    request: { readonly id: string; readonly signal: AbortSignal; readonly input?: unknown },
  ) => void | Promise<void>;
  readonly renderInspectionAction?: (props: {
    readonly action: MachineInspectionAction;
    readonly disabled: boolean;
    readonly pending: boolean;
    readonly submit: (input?: unknown) => void;
  }) => React.ReactNode;
  readonly renderInspectionDetails?: (frame: MachineInspectionFrame) => React.ReactNode;
}
export const inspectionFrameKey = (frame: MachineInspectionFrame) =>
  JSON.stringify([frame.streamId ?? "", frame.id]);

/** View state only. The host supplies facts and performs every real action. */
export function useMachineInspection(document: MachineDocument, props: MachineInspectionProps) {
  const session = props.inspectionSession;
  const frames = React.useMemo(() => (session?.frames ?? []).slice(-2000), [session?.frames]);
  const actors = React.useMemo(() => [...new Set(frames.map((f) => f.actorId))], [frames]);
  const [ownActor, setOwnActor] = React.useState<string>();
  const actorId =
    props.inspectionActorId ?? (ownActor && actors.includes(ownActor) ? ownActor : actors[0]);
  const actorFrames = React.useMemo(
    () => frames.filter((f) => f.actorId === actorId),
    [frames, actorId],
  );
  const latest = actorFrames.at(-1);
  const [ownFrame, setOwnFrame] = React.useState<string | null>(null);
  React.useEffect(() => {
    setOwnActor(undefined);
    setOwnFrame(null);
  }, [session?.id]);
  const selectedId = props.inspectionFrameId === undefined ? ownFrame : props.inspectionFrameId;
  const matches =
    selectedId === null
      ? []
      : actorFrames.filter((f) => inspectionFrameKey(f) === selectedId || f.id === selectedId);
  const frame = selectedId === null ? latest : matches.length === 1 ? matches[0] : undefined;
  const historical = selectedId !== null;
  const graph = document.machines.find((g) => g.id === frame?.machineId);
  const version = frame && props.presentation?.machineVersions?.[frame.machineId];
  const mismatch =
    !!frame &&
    (!graph ||
      (version !== undefined &&
        frame.machineVersion !== undefined &&
        String(version) !== String(frame.machineVersion)));
  const unknownIds =
    frame && graph
      ? frame.activeIds.filter((id) => !graph.nodes.some((n) => n.id === id && n.kind !== "note"))
      : [];
  const activeKey = JSON.stringify(frame?.activeIds ?? []);
  const activeSet = React.useMemo(() => {
    const result = new Set<string>();
    if (mismatch || !graph) return result;
    for (const id of JSON.parse(activeKey) as string[]) {
      if (!graph.nodes.some((n) => n.id === id && n.kind !== "note")) continue;
      result.add(id);
      for (const n of machineAncestors(graph, id)) result.add(n.id);
    }
    return result;
  }, [activeKey, graph, mismatch]);
  const leafIds = React.useMemo(
    () =>
      new Set(
        [...activeSet].filter(
          (id) => !graph?.nodes.some((n) => n.parentId === id && activeSet.has(n.id)),
        ),
      ),
    [activeSet, graph],
  );
  const index = frame ? actorFrames.indexOf(frame) : -1;
  const previous = frame
    ? actorFrames.slice(0, index).findLast((f) => sameMachineInspectionSubject(f, frame))
    : undefined;
  const diff = React.useMemo(
    () =>
      props.showDiagnostics
        ? compareMachineInspectionContexts(previous, frame, { continuity: session?.continuity })
        : undefined,
    [previous, frame, props.showDiagnostics, session?.continuity],
  );
  const actionBlock = !session
    ? "No observations supplied"
    : historical
      ? "Return to latest to act"
      : session.connection !== "connected"
        ? "Actions need a connected feed"
        : session.source === "simulation"
          ? "This feed is a simulation"
          : !frame
            ? "No current observation"
            : mismatch || unknownIds.length > 0
              ? "The observation does not match this topology"
              : !props.onInspectionAction
                ? "The app has not supplied an action handler"
                : undefined;
  const [requests, setRequests] = React.useState<
    Record<string, { pending: boolean; message: string }>
  >({});
  const locks = React.useRef(new Set<string>());
  const controllers = React.useRef(new Set<AbortController>());
  const generation = React.useRef(0);
  const acceptingRequests = React.useRef(false);
  const currentEligibility = React.useRef({ frame, actionBlock });
  currentEligibility.current = { frame, actionBlock };
  const scope = JSON.stringify([
    session?.id,
    session?.connection,
    session?.source,
    latest && inspectionFrameKey(latest),
    actorId,
  ]);
  React.useEffect(() => {
    acceptingRequests.current = true;
    generation.current++;
    locks.current.clear();
    setRequests({});
    return () => {
      acceptingRequests.current = false;
      generation.current++;
      controllers.current.forEach((c) => c.abort());
      controllers.current.clear();
    };
  }, [scope]);
  const propsRef = React.useRef(props);
  propsRef.current = props;
  const currentScope = React.useRef(scope);
  currentScope.current = scope;
  const selectFrame = (id: string | null) => {
    if (props.inspectionFrameId === undefined) setOwnFrame(id);
    props.onInspectionFrameChange?.(id);
  };
  const selectActor = (id: string) => {
    if (props.inspectionActorId === undefined) setOwnActor(id);
    props.onInspectionActorChange?.(id);
    selectFrame(null);
  };
  const submit = async (action: MachineInspectionAction, input?: unknown) => {
    const currentAction = propsRef.current.inspectionActions?.find((a) => a.id === action.id);
    if (
      !acceptingRequests.current ||
      currentEligibility.current.actionBlock ||
      currentEligibility.current.frame !== frame ||
      scope !== currentScope.current ||
      actionBlock ||
      !currentAction ||
      currentAction.enabled === false ||
      action.enabled === false ||
      !frame ||
      locks.current.has(action.id)
    )
      return;
    locks.current.add(action.id);
    const controller = new AbortController();
    controllers.current.add(controller);
    const token = generation.current;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setRequests((r) => ({ ...r, [action.id]: { pending: true, message: "Sending request…" } }));
    try {
      await propsRef.current.onInspectionAction!(action.id, frame, {
        id,
        signal: controller.signal,
        input,
      });
      if (token === generation.current && !controller.signal.aborted)
        setRequests((r) => ({
          ...r,
          [action.id]: { pending: true, message: "Request sent. Waiting for an observation." },
        }));
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) {
        locks.current.delete(action.id);
        setRequests((r) => ({
          ...r,
          [action.id]: {
            pending: false,
            message: error instanceof Error ? error.message : "The request was rejected",
          },
        }));
      }
    } finally {
      controllers.current.delete(controller);
    }
  };
  return {
    session,
    frames,
    actorFrames,
    actors,
    actorId,
    latest,
    frame,
    previous,
    diff,
    historical,
    selectedId,
    selectFrame,
    selectActor,
    mismatch,
    unknownIds,
    activeSet,
    leafIds,
    actionBlock,
    requests,
    submit,
    props,
  };
}
export type MachineInspectionController = ReturnType<typeof useMachineInspection>;
