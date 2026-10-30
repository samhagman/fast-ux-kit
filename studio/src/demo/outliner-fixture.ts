import type { OutlineItem } from "@/registry/outliner/types";
import { formatDateToken, type DateRepeat } from "@/registry/outliner/inline";
import { syncMirrors } from "@/registry/outliner/mirrors";

const day = (offset: number, hour?: number, repeat?: DateRepeat) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  if (hour !== undefined) date.setHours(hour, 0, 0, 0);
  return formatDateToken(date, hour !== undefined, repeat);
};

let seq = 0;
const id = (slug: string) => `${slug}-${++seq}`;

/** Original synthetic content: an eval-readiness plan for a fictional model launch. */
export function createLaunchOutline(): OutlineItem[] {
  seq = 0;
  const nodes: OutlineItem[] = [
    {
      id: id("goals"),
      text: "Launch goals",
      data: { heading: 2, note: "What “ready” means for the Halcyon-3 general availability review." },
      children: [
        { id: id("g"), text: "Ship to **all enterprise tenants** by end of quarter #launch", checked: false },
        { id: id("g"), text: "Hold p95 latency under `420ms` at 2× current traffic #perf", checked: true },
        { id: id("g"), text: "No regression on the safety eval suite vs. Halcyon-2 #safety", checked: false },
      ],
    },
    {
      id: id("evals"),
      text: "Evaluation readiness",
      data: { heading: 2, numbered: true },
      children: [
        {
          id: id("e"),
          text: "Freeze the eval harness at a tagged commit @rin",
          checked: true,
          data: { note: "Tag: `evals-2026.10`. Anything after this goes to the next cycle." },
        },
        {
          id: id("e"),
          text: "Run long-context retrieval suite " + day(0, 16),
          checked: false,
          data: { color: "blue" },
          children: [
            { id: id("e"), text: "128k needle tests", checked: true },
            { id: id("e"), text: "Multi-document synthesis set", checked: false },
            { id: id("e"), text: "Compare against [baseline dashboard](https://example.com/evals/baseline)", checked: false },
          ],
        },
        {
          id: id("e"),
          text: "Red-team review with external partner " + day(2) + " @marco #safety",
          checked: false,
          data: {
            color: "orange",
            note: "Scope: jailbreak transfer, tool-use abuse, long-horizon autonomy.\nPartner needs sandbox credentials 48h before kickoff.",
          },
        },
        { id: id("e"), text: "Write the ==model card== draft " + day(-1) + " #docs — cite [[Red-team review|e-11]]", checked: false, data: { color: "red" } },
      ],
    },
    {
      id: id("infra"),
      text: "Serving & capacity",
      data: { heading: 2 },
      children: [
        {
          id: id("i"),
          text: "Capacity plan per region",
          children: [
            { id: id("i"), text: "us-east — 40% headroom ✓", data: { completed: true } },
            { id: id("i"), text: "eu-west — waiting on quota approval " + day(1) },
            { id: id("i"), text: "ap-south — shadow traffic only" },
          ],
        },
        {
          id: id("i"),
          text: "Rollout stages",
          data: { numbered: true },
          children: [
            { id: id("i"), text: "Internal dogfood (5% of staff traffic)", checked: true },
            { id: id("i"), text: "Design partners, opt-in", checked: false },
            { id: id("i"), text: "Enterprise GA behind tenant flag", checked: false },
          ],
        },
        { id: id("i"), text: "Kill switch drill — confirm __rollback under 3 minutes__ #perf", checked: false },
        { id: "i-weekly", text: "Capacity review with SRE " + day(1, 10, { unit: "week", interval: 1 }), checked: false },
      ],
    },
    {
      id: id("comms"),
      text: "Launch comms",
      data: { heading: 2 },
      children: [
        { id: id("c"), text: "Blog post outline — see [[Launch goals|goals-1]]", data: { note: "Keep the benchmark table to five rows." } },
        { id: id("c"), text: "Customer webinar " + day(9, 17) + " @dana — agenda from [[Launch goals|goals-1]]" },
        { id: id("c"), text: "~~Press embargo list~~ moved to the PR tracker" },
        // A live mirror of "Rollout stages": edit either one, both change. Stored as a reference;
        // syncMirrors fills in the copy.
        { id: "c-rollout", text: "", data: { mirrorOf: "i-18" } },
      ],
    },
    {
      id: id("decisions"),
      text: "Decision log",
      data: { heading: 3, note: "Locked: edits go through the review board." },
      children: [
        { id: id("d"), text: "2026-10-21 — Defer multimodal output to the point release" },
        { id: id("d"), text: "2026-10-24 — Default context window stays at 200k" },
      ],
    },
    { id: id("loose"), text: "Ideas parking lot", children: [{ id: id("l"), text: "Streaming eval results into the launch dashboard" }, { id: id("l"), text: "A `/status` page for partner tenants" }] },
  ];
  const synced = syncMirrors(null, nodes);
  return synced.ok ? [...synced.nodes] : nodes;
}

export const isLockedItem = (node: OutlineItem) => node.id.startsWith("decisions-");

/** Synthetic stress document: ~2,500 items across four levels. */
export function createLargeOutline(): OutlineItem[] {
  const verbs = ["Review", "Draft", "Benchmark", "Audit", "Ship", "Profile", "Document", "Triage"];
  const nouns = ["eval shard", "tenant rollout", "latency budget", "red-team finding", "capacity plan", "model card", "incident", "dashboard"];
  let n = 0;
  const make = (depth: number, count: number): OutlineItem[] =>
    Array.from({ length: count }, () => {
      const i = n++;
      const text = `${verbs[i % verbs.length]} ${nouns[(i * 7) % nouns.length]} ${i}${i % 11 === 0 ? " #perf" : i % 13 === 0 ? " #safety" : ""}`;
      return {
        id: `big-${i}`,
        text,
        ...(depth >= 2 ? { checked: i % 3 === 0 } : {}),
        ...(depth < 3 ? { children: make(depth + 1, depth === 0 ? 12 : depth === 1 ? 8 : 6) } : {}),
      };
    });
  return make(0, 4);
}
