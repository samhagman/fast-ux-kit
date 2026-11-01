import type { OutlineDocument, OutlineItem, OutlineWorkspaceLayout } from "@/registry/outliner/types";
import { formatDateToken, type DateRepeat } from "@/registry/outliner/inline";
import { syncMirrors } from "@/registry/outliner/mirrors";

const day = (offset: number, hour?: number, repeat?: DateRepeat) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  if (hour !== undefined) date.setHours(hour, 0, 0, 0);
  return formatDateToken(date, hour !== undefined, repeat);
};

let seq = 0;
/** A Markdown code fence (kept out of template text so it reads plainly). */
const fence = "```";
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
    // Board view: the same tree, shown as columns (children) and cards (grandchildren).
    {
      id: "board",
      text: "Launch board",
      data: { view: "board", note: "Zoom in to see it as a board. Drag cards between columns." },
      children: [
        {
          id: "col-todo",
          text: "To do",
          children: [
            { id: "card-faq", text: "Draft the customer FAQ " + day(3) + " #docs", checked: false },
            { id: "card-pricing", text: "Pricing page review @dana", checked: false, data: { note: "Needs the enterprise tier table." } },
            { id: "card-status", text: "Status page copy #launch", checked: false },
          ],
        },
        {
          id: "col-doing",
          text: "In progress",
          children: [
            {
              id: "card-evals",
              text: "Long-context eval run " + day(0, 16) + " #perf",
              checked: false,
              data: { color: "blue" },
              children: [
                { id: "card-evals-1", text: "128k needle tests", checked: true },
                { id: "card-evals-2", text: "Multi-document synthesis", checked: false },
              ],
            },
            { id: "card-redteam", text: "Red-team follow-ups @marco #safety", checked: false, data: { color: "orange" } },
          ],
        },
        { id: "col-review", text: "Review", children: [{ id: "card-card", text: "Model card draft — see [[Write the model card draft|e-12]]", checked: false }] },
        { id: "col-done", text: "Done", children: [{ id: "card-kickoff", text: "Kickoff with design partners", checked: true }] },
      ],
    },
    // Article view: the same tree read as prose (headings, paragraphs, notes with rich content).
    {
      id: "article",
      text: "Halcyon-3 model card",
      data: {
        view: "article",
        note: "Draft for the GA review. Zoom in to read it as an article; print it from ⌘K.",
      },
      children: [
        {
          id: "mc-summary",
          text: "Summary",
          data: { heading: 1 },
          children: [
            {
              id: "mc-summary-1",
              text: "Halcyon-3 is a **long-context** assistant model tuned for tool use. It ships behind the `halcyon-3` alias with a 200k context window.",
            },
            {
              id: "mc-summary-2",
              text: "Scores are reported as mean ± standard error over five seeds; $\\bar{x} \\pm \\sigma/\\sqrt{n}$ with $n = 5$.",
            },
          ],
        },
        {
          id: "mc-evals",
          text: "Evaluations",
          data: {
            heading: 2,
            note: [
              "| Suite | Halcyon-2 | Halcyon-3 |",
              "|:------|----------:|----------:|",
              "| Long-context recall | 81.4 | **93.2** |",
              "| Tool-use success | 72.0 | **84.6** |",
              "| Refusal accuracy | 95.1 | 96.3 |",
            ].join("\n"),
          },
          children: [
            {
              id: "mc-evals-curve",
              text: "Training converged without the late-stage spikes seen in the previous run.",
              data: { note: "![Training and held-out loss over 60k steps](/demo/eval-curve.svg =640x300 \"Loss, train vs held-out\")" },
            },
            {
              id: "mc-evals-objective",
              text: "Objective",
              data: { note: "$$\n\\mathcal{L}(\\theta) = -\\sum_{t=1}^{T} \\log p_\\theta(x_t \\mid x_{<t})\n$$" },
            },
            { id: "mc-evals-task-1", text: "Re-run the refusal suite on the final checkpoint " + day(2), checked: false },
            { id: "mc-evals-task-2", text: "Publish the eval harness config", checked: true },
          ],
        },
        {
          id: "mc-usage",
          text: "Using the model",
          data: { heading: 2 },
          children: [
            {
              id: "mc-usage-1",
              text: "Call it through the standard messages endpoint.",
              data: {
                note: [
                  fence + "python",
                  "client = Client()",
                  "reply = client.messages.create(",
                  '    model="halcyon-3",',
                  "    max_tokens=1024,",
                  '    messages=[{"role": "user", "content": "Summarize the incident log."}],',
                  ")",
                  "print(reply.text)",
                  fence,
                ].join("\n"),
              },
            },
            {
              id: "mc-usage-2",
              text: "Known limitations",
              data: {
                note: [
                  "- Arithmetic over very long tables can drift past ~150k tokens.",
                  "- Tool calls are sequential; parallel calls arrive in the point release.",
                  "  - Workaround: batch independent lookups into one call.",
                  "> Report regressions in #halcyon-evals with a minimal repro.",
                ].join("\n"),
              },
            },
            {
              id: "mc-usage-3",
              text: "Walkthrough recording",
              data: { note: [fence + "embed:video", "Halcyon-3 launch walkthrough · 4:12", fence].join("\n") },
            },
            {
              id: "mc-usage-4",
              text: "Latency by region",
              data: { note: [fence + "embed:chart", "us-east 182", "eu-west 214", "ap-south 268", "sa-east 301", fence].join("\n") },
            },
          ],
        },
      ],
    },
    // Mind map view: the same tree drawn as a map.
    {
      id: "map",
      text: "Launch map",
      data: { view: "mindmap", note: "Zoom in to see it as a mind map. Click a node to zoom into it." },
      children: [
        { id: "map-evals", text: "Evals", children: [{ id: "map-evals-1", text: "Long context" }, { id: "map-evals-2", text: "Tool use" }, { id: "map-evals-3", text: "Refusals", checked: true }] },
        { id: "map-safety", text: "Safety", data: { color: "orange" }, children: [{ id: "map-safety-1", text: "Red team" }, { id: "map-safety-2", text: "Partner sandbox" }] },
        { id: "map-docs", text: "Docs", children: [{ id: "map-docs-1", text: "Model card" }, { id: "map-docs-2", text: "API reference" }, { id: "map-docs-3", text: "Migration guide" }] },
        { id: "map-gtm", text: "Go to market", data: { color: "blue" }, children: [{ id: "map-gtm-1", text: "Pricing" }, { id: "map-gtm-2", text: "Launch post", children: [{ id: "map-gtm-2a", text: "Benchmark table" }, { id: "map-gtm-2b", text: "Customer quotes" }] }] },
        { id: "map-support", text: "Support", children: [{ id: "map-support-1", text: "Runbooks" }, { id: "map-support-2", text: "Escalation rota" }] },
      ],
    },
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

/**
 * A small workspace for `?workspace=1`: three documents that link to each other with
 * `[[label|documentId/itemId]]` (cross-document links resolve and back-link).
 */
/** Folders, a starred document and the inbox for the `?workspace=1` demo. */
export function createWorkspaceLayout(): OutlineWorkspaceLayout {
  return {
    folders: [
      { id: "f-projects", title: "Projects" },
      { id: "f-team", title: "Team" },
      { id: "f-rituals", title: "Rituals", parentId: "f-team" },
    ],
    starred: ["launch"],
    inboxId: "inbox",
  };
}

/** `!(start → end)` days from today (a date range). */
const range = (from: number, to: number) => {
  const iso = (offset: number) => formatDateToken(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + offset)).slice(2, -1);
  return `!(${iso(from)} → ${iso(to)})`;
};

export function createWorkspaceDocuments(): OutlineDocument[] {
  const launch = createLaunchOutline();
  return [
    {
      id: "inbox",
      title: "Inbox",
      nodes: [
        { id: "in-1", text: "Ask Marco about the eval harness budget @marco", data: { createdAt: Date.now() - 3_600_000, editedAt: Date.now() - 3_600_000 } },
        { id: "in-2", text: "Read the interpretability paper Priya shared #research", data: { createdAt: Date.now() - 86_400_000, editedAt: Date.now() - 86_400_000 } },
        { id: "in-3", text: "Offsite logistics " + range(3, 5) + " #team", data: { createdAt: Date.now() - 2 * 86_400_000, editedAt: Date.now() - 2 * 86_400_000 } },
      ],
    },
    { id: "launch", title: "Halcyon-3 launch plan", nodes: launch, folderId: "f-projects" },
    {
      id: "partners",
      title: "Partner program",
      folderId: "f-projects",
      nodes: [
        {
          id: "p-1",
          text: "Design partner cohort",
          data: { heading: 2 },
          children: [
            { id: "p-2", text: "Confirm the red-team window — [[Red-team review|launch/e-11]]", checked: false },
            { id: "p-3", text: "Share the rollout plan: [[Rollout stages|launch/i-18]]", checked: false },
            { id: "p-4", text: "Sandbox credentials for partners " + day(1) + " @marco", checked: true },
          ],
        },
        {
          id: "p-5",
          text: "Pilot board",
          data: { view: "board" },
          children: [
            { id: "p-6", text: "Invited", children: [{ id: "p-7", text: "Northwind Labs" }, { id: "p-8", text: "Fabrikam Research" }] },
            { id: "p-9", text: "Onboarding", children: [{ id: "p-10", text: "Contoso AI — see [[Meeting notes|notes/n-2]]" }] },
            { id: "p-11", text: "Live", children: [] },
          ],
        },
      ],
    },
    {
      id: "notes",
      title: "Meeting notes",
      folderId: "f-rituals",
      nodes: [
        {
          id: "n-1",
          text: "Weekly launch sync " + day(-2),
          children: [
            { id: "n-2", text: "Contoso pilot kickoff notes" },
            { id: "n-3", text: "Decision: GA gates on [[Launch goals|launch/goals-1]]" },
            { id: "n-4", text: "Action: refresh the [[Pilot board|partners/p-5]]", checked: false },
          ],
        },
      ],
    },
  ];
}
