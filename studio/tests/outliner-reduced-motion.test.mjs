// Reduced motion: the outliner wraps everything in one MotionConfig that follows the user's
// `prefers-reduced-motion`, and every animation runs on the shared motion tokens. With the
// preference set, movement (here: the zoom transition's slide) lands at once; without it the same
// transition is still in flight a frame later. The tokens themselves are short and never bouncy.
//
//   cd studio && node --test tests/outliner-reduced-motion.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { domEnv, load, media, mountOutliner, stopVite } from "./harness/outliner-dom.mjs";

/*
 * A live matchMedia (the harness's answers are fixed at call time): the motion library reads the
 * preference once and then listens for changes, as it does in a browser.
 */
const listeners = new Map();
const setPreference = (reduce) => {
  for (const query of ["(prefers-reduced-motion)", "(prefers-reduced-motion: reduce)"]) {
    media[query] = reduce;
    for (const fn of listeners.get(query) ?? []) fn({ matches: reduce, media: query });
  }
};
let motion;
before(async () => {
  await domEnv();
  window.matchMedia = (query) => {
    const add = (fn) =>
      (listeners.get(query) ?? listeners.set(query, new Set()).get(query)).add(fn);
    return {
      get matches() {
        return !!media[query];
      },
      media: query,
      addEventListener: (_type, fn) => add(fn),
      removeEventListener: (_type, fn) => listeners.get(query)?.delete(fn),
      addListener: add,
      removeListener: (fn) => listeners.get(query)?.delete(fn),
    };
  };
  motion = await load("/src/lib/motion.ts");
});
after(() => stopVite());

const doc = () => [
  {
    id: "a",
    text: "Alpha",
    children: [
      { id: "a1", text: "One" },
      { id: "a2", text: "Two" },
    ],
  },
  { id: "b", text: "Beta" },
];

/** The outliner's MotionConfig, read from React's current fiber tree. */
function motionConfig(container) {
  const key = Object.keys(container).find((k) => k.startsWith("__reactContainer"));
  const stack = [container[key].stateNode.current];
  while (stack.length) {
    const fiber = stack.pop();
    if (!fiber) continue;
    if (fiber.type?.name === "MotionConfig") return fiber.memoizedProps;
    if (fiber.sibling) stack.push(fiber.sibling);
    if (fiber.child) stack.push(fiber.child);
  }
  return null;
}
/** The node the zoom transition animates (it holds the document title and the list). */
const zoomLayer = (ui) => ui.container.querySelector("[data-outliner-content] > div");
const offsetY = (el) => {
  const match = /translateY\((-?[\d.]+)px\)/.exec(el.style.transform);
  return match ? Number(match[1]) : 0;
};

async function zoomOffsetAfterAFrame() {
  const ui = await mountOutliner({ defaultValue: doc() });
  assert.equal(
    motionConfig(ui.container)?.reducedMotion,
    "user",
    "one MotionConfig follows the user's setting",
  );
  await ui.act(() => ui.handle.current.zoomTo("a"));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const y = offsetY(zoomLayer(ui));
  await ui.unmount();
  return y;
}

test("reduced motion: with prefers-reduced-motion the zoom's slide lands at once", async () => {
  setPreference(true);
  try {
    assert.equal(await zoomOffsetAfterAFrame(), 0, "no movement in flight");
  } finally {
    setPreference(false);
  }
});

test("reduced motion: without the preference the same transition is still moving a frame later", async () => {
  setPreference(false);
  const y = await zoomOffsetAfterAFrame();
  assert.ok(y > 0.5 && y < 6, `mid-slide (${y}px of 6)`);
});

test("motion tokens: short, decelerating, and the layout spring never overshoots", () => {
  const { motionTokens, ease } = motion;
  for (const [name, token] of Object.entries(motionTokens))
    if ("duration" in token) assert.ok(token.duration <= 0.3, `${name} is short`);
  assert.deepEqual([...ease], [0.2, 0, 0, 1], "one decelerating curve");
  const { stiffness, damping, mass } = motionTokens.layout;
  assert.ok(damping >= 2 * Math.sqrt(stiffness * mass), "critically damped or more: no bounce");
});
