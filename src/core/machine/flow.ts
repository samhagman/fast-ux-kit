import {
  machineTreeRowId,
  type MachineTreeModel,
  type MachineTreeRegion,
  type MachineTreeRow,
} from "./tree.js";

/**
 * Flow presentation of a machine tree: which order a container's states are read in, which stand
 * side by side, and which declared regions they are drawn in.
 *
 *   document ──buildMachineTree──► model ──planMachineTreeFlow──► plan      (once per topology)
 *                                    └────presentMachineTree(model, plan)──► presented model
 *
 * It is a layer over the tree's rows. The document, its diagnostics, its limits and every row's
 * `node` and `graph` are left exactly as `buildMachineTree` produced them. A region is one extra
 * row (`row.region` is set) that its member rows hang under; it never changes how a machine runs.
 *
 * Placement, per container:
 *
 *   ┌ A ┐            A's routes to B and C fork: B and C are *columns*.
 *   ├──────┬──────┐  A route that reaches the next step directly is a column with no steps.
 *   ┌ B ┐  ┌ C ┐  │  D is reached by more than one branch, so it is not filed under either:
 *   └──────┴──────┘  it sits on A's spine, below the columns that lead to it.
 *   ┌ D ┐
 */

/** How a route lands when it does not simply carry on to the step drawn next. */
export type MachineFlowLanding =
  /** The step drawn next on this spine, or the head of its own column. */
  | "next"
  /** A step further down, reached by other routes as well. */
  | "down"
  /** A step further up that is not an ancestor on the way here. */
  | "up"
  /** A step already passed on the way here: a loop. */
  | "back"
  /** Leaves this container. */
  | "out"
  /** The state itself. */
  | "self"
  /** A state inside the step it starts from. */
  | "into"
  /** The target is not in the tree. */
  | "unknown";

export interface MachineFlowRoute {
  /** The transitions this line stands for: one the step declares, or every one from inside it to one place. */
  readonly transitionRowIds: readonly string[];
  /** The transitions start at states inside the step, not at the step itself. */
  readonly inside: boolean;
  /** The step of this container it reaches. Absent when it leaves the container or stays in the step. */
  readonly landsOn?: string;
  /** Every transition targets `landsOn` itself rather than a state inside it. */
  readonly exact: boolean;
  readonly landing: MachineFlowLanding;
}
export interface MachineFlowBranch {
  readonly routes: readonly MachineFlowRoute[];
  /** Empty for the direct route on to the next step. */
  readonly steps: readonly MachineFlowStep[];
  /** Its last step flows back into the spine it left. */
  readonly rejoins: boolean;
}
export interface MachineFlowStep {
  readonly rowId: string;
  /** The step above leads straight here. Otherwise routes from elsewhere meet here. */
  readonly linked: boolean;
  /** Routes listed beside the spine with their landing. */
  readonly side: readonly MachineFlowRoute[];
  /** Routes from inside this step that leave the container. Worth drawing only while the step is shut. */
  readonly exits: readonly MachineFlowRoute[];
  /** Alternatives, side by side. */
  readonly columns: readonly MachineFlowBranch[];
  /** Routes that carry on to the next step, when there are no columns. */
  readonly main: readonly MachineFlowRoute[];
}
export interface MachineFlowArrival {
  readonly sourceRowId: string;
  readonly transitionRowIds: readonly string[];
  readonly back: boolean;
}
export interface MachineFlow {
  readonly steps: readonly MachineFlowStep[];
  /** Arrivals a step does not get from the route drawn straight into it. */
  readonly arrivals: ReadonlyMap<string, readonly MachineFlowArrival[]>;
  /** Arrivals from outside this container. */
  readonly entries: ReadonlyMap<string, readonly MachineFlowArrival[]>;
  /** Steps a route is drawn straight into. */
  readonly owned: ReadonlySet<string>;
  /** Steps several forward routes reach without one of them owning it. */
  readonly meets: ReadonlySet<string>;
}
export interface MachineTreeFlowPlan {
  /** Region rows to add. Their activity is filled in by `presentMachineTree`. */
  readonly regions: readonly MachineTreeRow[];
  /** Children in presented order, for each row whose children change. */
  readonly childIds: ReadonlyMap<string, readonly string[]>;
  /** Member row → the region row it hangs under. */
  readonly parentIds: ReadonlyMap<string, string>;
  /** Placement by container row id. Absent where the plain wrapping list should be used. */
  readonly flows: ReadonlyMap<string, MachineFlow>;
}

/** Above these the plain list is used: placement is not worth its cost, and nobody reads it as a flow. */
const MAX_ROWS = 20_000;
const MAX_CHILDREN = 1_000;

const EMPTY_PLAN: MachineTreeFlowPlan = {
  regions: [],
  childIds: new Map(),
  parentIds: new Map(),
  flows: new Map(),
};

/** A key as words: "checkInbox" reads "Check inbox". */
function words(key: string): string {
  const spaced = key
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

interface DraftRoute {
  transitionRowIds: string[];
  inside: boolean;
  landsOn?: string;
  exact: boolean;
  landing: MachineFlowLanding;
}
interface DraftStep {
  rowId: string;
  linked: boolean;
  side: DraftRoute[];
  exits: DraftRoute[];
  columns: { routes: DraftRoute[]; steps: DraftStep[]; rejoins: boolean }[];
  main: DraftRoute[];
  /** The step this one flows straight on to, if any. */
  to: string | undefined;
  /** Ends a branch by flowing back into the spine the branch left. */
  rejoinsUp: boolean;
}
function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * The dominator tree of one container. A step's dominator is the last step every way in has to pass
 * through, so a step several routes reach hangs off the point where those routes split, not off
 * whichever of them happened to be listed first.
 */
function dominators(
  ids: readonly string[],
  edges: readonly DraftRoute[],
  sources: ReadonlyMap<DraftRoute, string>,
  start: string | undefined,
) {
  const out = new Map<string, DraftRoute[]>();
  for (const edge of edges) push(out, sources.get(edge)!, edge);
  const state = new Map<string, 1 | 2>();
  const back = new Set<DraftRoute>();
  const rpo = new Map<string, number>();
  const idom = new Map<string, string>();
  const rootOf = new Map<string, string>();
  const roots: string[] = [];
  const grow = (root: string) => {
    // Iterative depth-first walk: a long chain of states must not exhaust the call stack.
    const post: string[] = [];
    const stack: { id: string; at: number }[] = [{ id: root, at: 0 }];
    state.set(root, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const list = out.get(frame.id) ?? [];
      if (frame.at < list.length) {
        const edge = list[frame.at++]!;
        const seen = state.get(edge.landsOn!);
        if (seen === 1) back.add(edge);
        else if (!seen) {
          state.set(edge.landsOn!, 1);
          stack.push({ id: edge.landsOn!, at: 0 });
        }
      } else {
        state.set(frame.id, 2);
        post.push(frame.id);
        stack.pop();
      }
    }
    const order = post.reverse();
    const base = rpo.size;
    order.forEach((id, index) => {
      rpo.set(id, base + index);
      rootOf.set(id, root);
    });
    const preds = new Map<string, string[]>(order.map((id) => [id, []]));
    for (const edge of edges) {
      const s = sources.get(edge)!;
      if (rootOf.get(s) === root && rootOf.get(edge.landsOn!) === root)
        preds.get(edge.landsOn!)!.push(s);
    }
    idom.set(root, root);
    const meet = (first: string, second: string) => {
      let a = first;
      let b = second;
      while (a !== b) {
        while (rpo.get(a)! > rpo.get(b)!) a = idom.get(a)!;
        while (rpo.get(b)! > rpo.get(a)!) b = idom.get(b)!;
      }
      return a;
    };
    for (let changed = true; changed;) {
      changed = false;
      for (const id of order.slice(1)) {
        let next: string | undefined;
        for (const pred of preds.get(id)!)
          if (idom.has(pred)) next = next === undefined ? pred : meet(pred, next);
        if (next !== undefined && idom.get(id) !== next) {
          idom.set(id, next);
          changed = true;
        }
      }
    }
    roots.push(root);
  };
  if (start !== undefined && ids.includes(start)) grow(start);
  for (const id of ids) if (!state.has(id)) grow(id);
  const kidsOf = new Map<string, string[]>();
  for (const id of ids) if (idom.get(id) !== id) push(kidsOf, idom.get(id)!, id);
  for (const list of kidsOf.values()) list.sort((a, b) => rpo.get(a)! - rpo.get(b)!);
  const into = new Map<string, DraftRoute[]>();
  for (const edge of edges) push(into, edge.landsOn!, edge);
  /** Reached by a forward route that does not start at its dominator: several routes meet here. */
  const isMerge = (id: string) =>
    (into.get(id) ?? []).some((edge) => {
      const s = sources.get(edge)!;
      return !back.has(edge) && s !== idom.get(id) && rootOf.get(s) === rootOf.get(id);
    });
  // Depth and "reaches an end" over the dominator tree, children before parents.
  const byDepth = [...ids].sort((a, b) => rpo.get(b)! - rpo.get(a)!);
  const depth = new Map<string, number>();
  for (const id of byDepth)
    depth.set(id, 1 + Math.max(0, ...(kidsOf.get(id) ?? []).map((kid) => depth.get(kid) ?? 0)));
  return { roots, kids: (id: string) => kidsOf.get(id) ?? [], isMerge, back, depth };
}

/** Root-first list of rows from the machine row down to `rowId`. */
type PathOf = (rowId: string) => readonly string[];

export function planMachineTreeFlow(model: MachineTreeModel): MachineTreeFlowPlan {
  if (model.rows.length > MAX_ROWS) return EMPTY_PLAN;
  const byId = new Map<string, MachineTreeRow>(model.rows.map((row) => [row.id, row]));
  const occurrenceOf = new Map<string, number>();
  const machineOccurrence = (row: MachineTreeRow) => {
    let found = occurrenceOf.get(row.machineRowId);
    if (found === undefined) {
      found = (JSON.parse(row.machineRowId) as [string, number])[1];
      occurrenceOf.set(row.machineRowId, found);
    }
    return found;
  };
  const canonical = (row: MachineTreeRow, elementId: string) =>
    machineTreeRowId("node", row.machineId, elementId, 0, machineOccurrence(row));

  /* ── regions ── */
  const regions: MachineTreeRow[] = [];
  const parentIds = new Map<string, string>();
  /** State children (never notes) of every container, with regions standing in for their members. */
  const stateKids = new Map<string, string[]>();
  for (const row of model.rows) {
    if (row.kind === "transition") continue;
    const kids = row.childIds.filter((id) => {
      const child = byId.get(id);
      return child?.kind === "node" && child.node?.kind !== "note";
    });
    if (!kids.length) continue;
    const named = new Map<string, string[]>();
    if (row.node?.kind !== "parallel")
      for (const id of kids) {
        const child = byId.get(id)!;
        const name = child.node!.region;
        if (typeof name !== "string" || !name || child.node!.kind === "initial" || child.recovered)
          continue;
        push(named, name, id);
      }
    const boxOf = new Map<string, string>();
    for (const [name, members] of named) {
      if (members.length < 2) continue;
      const elementId = JSON.stringify([
        "region",
        row.kind === "node" ? row.elementId : null,
        name,
      ]);
      const id = canonical(row, elementId);
      if (byId.has(id)) continue;
      const declared = row.graph.regions;
      const options = declared && Object.hasOwn(declared, name) ? declared[name] : undefined;
      const label =
        typeof options?.label === "string" && options.label.trim() ? options.label : words(name);
      const region: MachineTreeRegion = {
        name,
        collapsed: options?.collapsed !== false,
        memberIds: members,
      };
      regions.push({
        id,
        machineRowId: row.machineRowId,
        kind: "node",
        machineId: row.machineId,
        elementId,
        label,
        parentId: row.id,
        childIds: members,
        depth: row.depth + 1,
        graph: row.graph,
        node: {
          id: elementId,
          label,
          kind: "compound",
          ...(row.kind === "node" ? { parentId: row.elementId } : {}),
        },
        initial: false,
        active: false,
        activeDescendant: false,
        recovered: false,
        region,
      });
      stateKids.set(id, members);
      for (const member of members) {
        parentIds.set(member, id);
        boxOf.set(member, id);
      }
    }
    const presented: string[] = [];
    const placed = new Set<string>();
    for (const id of kids) {
      const box = boxOf.get(id);
      if (!box) presented.push(id);
      else if (!placed.has(box)) {
        placed.add(box);
        presented.push(box);
      }
    }
    stateKids.set(row.id, presented);
  }
  const all = new Map(byId);
  for (const box of regions) all.set(box.id, box);
  const parentOf = (id: string) => parentIds.get(id) ?? all.get(id)?.parentId;
  const paths = new Map<string, readonly string[]>();
  const pathOf: PathOf = (rowId) => {
    const known = paths.get(rowId);
    if (known) return known;
    const path: string[] = [];
    // `buildMachineTree` already broke parent cycles; the bound is only a second guard.
    for (
      let id: string | undefined = rowId;
      id !== undefined && path.length < 512;
      id = parentOf(id)
    )
      path.unshift(id);
    paths.set(rowId, path);
    return path;
  };

  /* ── routes: each transition, at every container it matters to ── */
  const declared = new Map<string, DraftRoute[]>();
  const summaries = new Map<string, Map<string, DraftRoute>>();
  const exits = new Map<string, Map<string, DraftRoute>>();
  const entries = new Map<string, Map<string, Map<string, string[]>>>();
  const edgesOf = new Map<string, DraftRoute[]>();
  const sourceOf = new Map<DraftRoute, string>();
  const summary = (
    store: Map<string, Map<string, DraftRoute>>,
    step: string,
    key: string,
    make: () => DraftRoute,
  ) => {
    let mine = store.get(step);
    if (!mine) store.set(step, (mine = new Map()));
    let route = mine.get(key);
    if (!route) mine.set(key, (route = make()));
    return route;
  };
  const enter = (container: string, step: string, source: string, transition: string) => {
    let steps = entries.get(container);
    if (!steps) entries.set(container, (steps = new Map()));
    let bySource = steps.get(step);
    if (!bySource) steps.set(step, (bySource = new Map()));
    push(bySource, source, transition);
  };
  for (const row of model.rows) {
    if (row.kind !== "transition" || row.recovered || !row.parentId || !row.transition) continue;
    const source = row.parentId;
    const targetId = canonical(row, row.transition.targetId);
    const target = byId.get(targetId);
    if (!target || target.node?.kind === "note") {
      push(declared, source, {
        transitionRowIds: [row.id],
        inside: false,
        exact: false,
        landing: "unknown",
      });
      continue;
    }
    const from = pathOf(source);
    const to = pathOf(targetId);
    let shared = 0;
    while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared++;
    if (shared === from.length) {
      // The target is the source, or a state inside it.
      const landing = shared === to.length ? "self" : "into";
      push(declared, source, {
        transitionRowIds: [row.id],
        inside: false,
        exact: landing === "self",
        landing,
      });
      for (let at = shared + 1; at < to.length; at++) enter(to[at - 1]!, to[at]!, source, row.id);
      continue;
    }
    // Every box between the source and the container the two ends share is being left.
    const leaves = (stepAt: number) => {
      const step = from[stepAt]!;
      if (step === source)
        push(declared, source, {
          transitionRowIds: [row.id],
          inside: false,
          exact: false,
          landing: "out",
        });
      else
        summary(exits, step, targetId, () => ({
          transitionRowIds: [],
          inside: true,
          exact: false,
          landing: "out",
        })).transitionRowIds.push(row.id);
    };
    if (shared === to.length) {
      // The target is an enclosing state: the route leaves every box up to it.
      for (let at = from.length - 1; at >= shared; at--) leaves(at);
      continue;
    }
    for (let at = from.length - 1; at > shared; at--) leaves(at);
    const container = from[shared - 1]!;
    const a = from[shared]!;
    const b = to[shared]!;
    const exact = b === targetId;
    let route: DraftRoute;
    if (a === source) {
      route = { transitionRowIds: [row.id], inside: false, landsOn: b, exact, landing: "next" };
      push(declared, source, route);
      push(edgesOf, container, route);
      sourceOf.set(route, a);
    } else {
      const fresh = !summaries.get(a)?.has(b);
      route = summary(summaries, a, b, () => ({
        transitionRowIds: [],
        inside: true,
        landsOn: b,
        exact: true,
        landing: "next",
      }));
      route.transitionRowIds.push(row.id);
      route.exact &&= exact;
      if (fresh) {
        push(edgesOf, container, route);
        sourceOf.set(route, a);
      }
    }
    for (let at = shared + 1; at < to.length; at++) enter(to[at - 1]!, to[at]!, source, row.id);
  }
  /** A step's routes: the ones it declares, then one summary per place routes from inside it reach. */
  const routesOf = (step: string) => [
    ...(declared.get(step) ?? []),
    ...(summaries.get(step)?.values() ?? []),
  ];

  /* ── placement, per container ── */
  const flows = new Map<string, MachineFlow>();
  const order = new Map<string, readonly string[]>();
  const stepById = new Map<string, DraftStep>();
  for (const [containerId, kids] of stateKids) {
    const container = all.get(containerId)!;
    if (container.node?.kind === "parallel" || kids.length > MAX_CHILDREN) continue;
    // A recovered or duplicate child means the container's shape is not what the document says.
    if (
      kids.some((id) => {
        const kid = all.get(id)!;
        return kid.recovered || (!kid.region && id !== canonical(kid, kid.elementId));
      })
    )
      continue;
    const edges = edgesOf.get(containerId) ?? [];
    const arriving = entries.get(containerId);
    const start =
      kids.find((id) => all.get(id)!.node?.kind === "initial") ??
      kids.find(
        (id) =>
          all.get(id)!.initial ||
          (all.get(id)!.region?.memberIds.some((member) => byId.get(member)!.initial) ?? false),
      ) ??
      (container.region ? kids.find((id) => arriving?.has(id)) : undefined) ??
      kids[0];
    const D = dominators(kids, edges, sourceOf, start);
    const read: string[] = [];
    const owned = new Set<string>();
    const chips: { s: string; g: string; route: DraftRoute; back: boolean }[] = [];
    const ends = new Map<string, boolean>();
    const reachesEnd = (id: string): boolean => {
      let known = ends.get(id);
      if (known === undefined) {
        known = all.get(id)!.node?.kind === "final" || D.kids(id).some(reachesEnd);
        ends.set(id, known);
      }
      return known;
    };
    /** The branch that carries on down the spine: the longest, and of equals the one that reaches an end. */
    const rank = (id: string) => D.depth.get(id)! * 2 + (reachesEnd(id) ? 1 : 0);
    const build = (
      id: string,
      below: string | undefined,
      after: string | undefined,
    ): DraftStep[] => {
      read.push(id);
      const dominated = D.kids(id);
      const merges = dominated.filter(D.isMerge);
      const branches = dominated.filter((kid) => !D.isMerge(kid));
      const main =
        merges.length || !branches.length
          ? undefined
          : branches.reduce((x, y) => (rank(y) > rank(x) ? y : x));
      const spine = merges.length ? merges : main ? [main] : [];
      const next = spine[0] ?? below;
      const side: DraftRoute[] = [];
      const onward: DraftRoute[] = [];
      const rejoin: DraftRoute[] = [];
      const forks = new Map<string, DraftRoute[]>();
      for (const route of routesOf(id)) {
        const g = route.landsOn;
        if (g === undefined) {
          side.push(route);
          continue;
        }
        const back = D.back.has(route);
        if (g === next && !back) {
          onward.push(route);
          owned.add(g);
        } else if (branches.includes(g) && !back) {
          owned.add(g);
          push(forks, g, route);
        } else if (!spine.length && after !== undefined && g === after && !back) {
          // The end of a branch that flows back into the spine it left.
          chips.push({ s: id, g, route, back: false });
          rejoin.push(route);
        } else {
          chips.push({ s: id, g, route, back });
          side.push(route);
        }
      }
      const columns: DraftStep["columns"] = [];
      let rejoined = false;
      for (const [child, routes] of forks) {
        const steps = build(child, undefined, next);
        const rejoins = steps[steps.length - 1]!.rejoinsUp;
        rejoined ||= rejoins;
        columns.push({ routes, steps: link(steps), rejoins });
      }
      const carry = [...onward, ...rejoin];
      const step: DraftStep = {
        rowId: id,
        linked: false,
        side,
        exits: [...(exits.get(id)?.values() ?? [])],
        columns:
          columns.length && carry.length
            ? [{ routes: carry, steps: [], rejoins: true }, ...columns]
            : columns,
        main: columns.length ? [] : carry,
        to: onward.length || rejoined ? next : undefined,
        rejoinsUp: rejoin.length > 0,
      };
      stepById.set(id, step);
      const list = [step];
      spine.forEach((child, index) =>
        list.push(
          ...build(
            child,
            spine[index + 1] ?? below,
            index === spine.length - 1 ? after : undefined,
          ),
        ),
      );
      return list;
    };
    const link = (steps: DraftStep[]) => {
      steps.forEach(
        (step, index) => (step.linked = index > 0 && steps[index - 1]!.to === step.rowId),
      );
      return steps;
    };
    const steps = link(D.roots.flatMap((root) => build(root, undefined, undefined)));
    const position = new Map(read.map((id, index) => [id, index]));
    const arrivals = new Map<string, MachineFlowArrival[]>();
    for (const chip of chips) {
      chip.route.landing = chip.back
        ? "back"
        : position.get(chip.g)! > position.get(chip.s)!
          ? "down"
          : "up";
      push(arrivals, chip.g, {
        sourceRowId: chip.s,
        transitionRowIds: chip.route.transitionRowIds,
        back: chip.back,
      });
    }
    const meets = new Set<string>();
    for (const [g, list] of arrivals)
      if (!owned.has(g) && list.filter((arrival) => !arrival.back).length > 1) meets.add(g);
    const inFrom = new Map<string, MachineFlowArrival[]>();
    for (const [step, bySource] of arriving ?? [])
      inFrom.set(
        step,
        [...bySource].map(([sourceRowId, transitionRowIds]) => ({
          sourceRowId,
          transitionRowIds,
          back: false,
        })),
      );
    flows.set(containerId, { steps, arrivals, entries: inFrom, owned, meets });
    order.set(containerId, read);
  }

  /* ── presented child order: states as they are read, then notes, then the row's own routes ── */
  const childIds = new Map<string, readonly string[]>();
  const sameOrder = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((id, index) => id === b[index]);
  for (const row of all.values()) {
    if (row.kind === "transition") continue;
    const original = row.region ? row.region.memberIds : row.childIds;
    const states = order.get(row.id) ?? stateKids.get(row.id) ?? [];
    const notes = original.filter((id) => byId.get(id)?.node?.kind === "note");
    const routes = original.filter((id) => byId.get(id)?.kind === "transition");
    const step = stepById.get(row.id);
    let sorted = routes;
    if (step && routes.length > 1) {
      const rank = new Map<string, number>();
      const visit = (list: readonly DraftRoute[]) => {
        for (const route of list)
          if (!route.inside) for (const id of route.transitionRowIds) rank.set(id, rank.size);
      };
      visit(step.side);
      for (const column of step.columns) visit(column.routes);
      visit(step.main);
      // Array.prototype.sort is stable: routes that share a place keep the order they were declared in.
      sorted = [...routes].sort((a, b) => (rank.get(a) ?? rank.size) - (rank.get(b) ?? rank.size));
    }
    const next = [...states, ...notes, ...sorted];
    if (row.region || !sameOrder(next, row.childIds)) childIds.set(row.id, next);
  }
  if (!regions.length && !childIds.size && !flows.size) return EMPTY_PLAN;
  return { regions, childIds, parentIds, flows };
}

/**
 * The model as it is drawn: region rows added, children in reading order. Cheap enough to run for
 * every activity frame; the plan is what is worth keeping between frames.
 */
export function presentMachineTree(
  model: MachineTreeModel,
  plan: MachineTreeFlowPlan,
): MachineTreeModel {
  if (!plan.regions.length && !plan.childIds.size) return model;
  const source = new Map<string, MachineTreeRow>(model.rows.map((row) => [row.id, row]));
  for (const box of plan.regions) source.set(box.id, box);
  const rows: MachineTreeRow[] = [];
  const made = new Map<string, MachineTreeRow & { activeDescendant: boolean }>();
  const stack = [...model.rootIds].reverse().map((id) => ({ id, depth: 0 }));
  while (stack.length) {
    const entry = stack.pop()!;
    const row = source.get(entry.id);
    if (!row || made.has(entry.id)) continue;
    const childIds = (plan.childIds.get(row.id) ?? row.childIds).filter((id) => source.has(id));
    const parentId = plan.parentIds.get(row.id) ?? row.parentId;
    const next = {
      ...row,
      childIds,
      depth: entry.depth,
      ...(parentId === undefined ? {} : { parentId }),
    };
    made.set(row.id, next);
    rows.push(next);
    for (let index = childIds.length - 1; index >= 0; index--)
      stack.push({ id: childIds[index]!, depth: entry.depth + 1 });
  }
  // A region holds the run whenever one of its members does.
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = made.get(rows[index]!.id)!;
    if (row.region)
      row.activeDescendant = row.childIds.some((id) => {
        const child = made.get(id);
        return !!child && (child.active || child.activeDescendant);
      });
  }
  return { rows, rootIds: model.rootIds, issues: model.issues, truncated: model.truncated };
}
