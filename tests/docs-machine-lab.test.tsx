import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { browserErrors, dom } from "./components-dom.js";
import { machineLabCases, machineLabInspection } from "../examples/docs/machine-lab-data.js";
import {
  runMachineScenario,
  validateMachineDocument,
  machineTransitionCoverage,
} from "../src/core/machine/index.js";
Object.defineProperty(globalThis, "DOMRect", { configurable: true, value: dom.window.DOMRect });
const { act, cleanup, fireEvent, render, within } = await import("@testing-library/react");
const { MachineLab, scenarioInspection } = await import("../examples/docs/machine-lab.js");
afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), []);
});
async function click(element: Element) {
  await act(async () => {
    fireEvent.click(element);
  });
}
async function choose(element: Element, value: string) {
  await act(async () => {
    fireEvent.change(element, { target: { value } });
  });
}

test("machine lab fixtures are independently valid, and all exact-state scenarios pass", () => {
  assert.equal(machineLabCases.length, 4);
  for (const item of machineLabCases) {
    assert.deepEqual(
      validateMachineDocument(item.document).filter((issue) => issue.severity === "error"),
      [],
      item.id,
    );
    for (const scenario of item.scenarios) {
      const result = runMachineScenario(item.document, scenario, item.options);
      assert.equal(
        result.passed,
        true,
        `${item.id}: ${scenario.label}: ${result.snapshot.error ?? result.snapshot.activeIds.join(",")}`,
      );
    }
  }
});

test("scenario coverage describes observed transitions rather than claiming every graph or payload", () => {
  const item = machineLabCases[0]!;
  const results = item.scenarios.map((scenario) =>
    runMachineScenario(item.document, scenario, item.options),
  );
  const coverage = machineTransitionCoverage(
    results.flatMap((result) => result.snapshot.trace),
    item.document.machines[0]!.transitions.map((transition) => transition.id),
  );
  assert.equal(coverage.visited.length, 6);
  assert.equal(coverage.ratio, 1);
  assert.equal(results[1]!.snapshot.context.attempts, 2);
  assert.equal(results[3]!.snapshot.activeIds[0], "release-review");
});

test("test trace is marked simulation and does not invent historical context", () => {
  const fixture = machineLabCases[0]!;
  const result = runMachineScenario(fixture.document, fixture.scenarios[0]!, fixture.options);
  const session = scenarioInspection(result.snapshot);
  assert.equal(session.source, "simulation");
  assert.equal(session.frames[0]!.context, undefined);
  assert.deepEqual(session.frames.at(-1)!.context, result.snapshot.context);
  assert.equal(machineLabInspection.source, "committed");
  assert.equal(
    machineLabInspection.diagnostics?.effects?.find((effect) => effect.id === "notify-17")?.status,
    "unknown",
  );
});

test("lab starts nonediting with no claimed test pass and opt-in diagnostics", async () => {
  const view = render(<MachineLab />);
  assert.equal(
    (view.getByRole("checkbox", { name: "Enable local graph editing" }) as HTMLInputElement)
      .checked,
    false,
  );
  assert.equal(
    (view.getByRole("checkbox", { name: "Show optional diagnostic payloads" }) as HTMLInputElement)
      .checked,
    false,
  );
  assert.ok(view.getByText("Not run. No coverage or pass is claimed yet."));
  assert.equal(view.queryByTestId("machine-lab-coverage"), null);
  await click(view.getByRole("button", { name: "Run 4 scenarios" }));
  assert.match(view.getByTestId("machine-lab-coverage").textContent ?? "", /4\/4 passed.*6\/6/);
  assert.equal(view.getByTestId("machine-lab-requests").textContent, "0 local requests recorded");
});

test("changing examples clears tests and editing, and parallel scenarios remain useful", async () => {
  const view = render(<MachineLab />);
  await click(view.getByRole("checkbox", { name: "Enable local graph editing" }));
  await click(view.getByRole("button", { name: "Run 4 scenarios" }));
  await choose(view.getByRole("combobox", { name: "Choose a machine example" }), "launch");
  assert.equal(view.queryByTestId("machine-lab-coverage"), null);
  assert.equal(
    (view.getByRole("checkbox", { name: "Enable local graph editing" }) as HTMLInputElement)
      .checked,
    false,
  );
  await click(view.getByRole("button", { name: "Run 2 scenarios" }));
  assert.match(view.getByTestId("machine-lab-coverage").textContent ?? "", /2\/2 passed.*3\/3/);
  await click(view.getByRole("button", { name: "Reset example" }));
  assert.equal(view.queryByTestId("machine-lab-coverage"), null);
});

test("recorded test inspection and committed sample remain distinct and do not dispatch", async () => {
  const view = render(<MachineLab />);
  await click(view.getByRole("button", { name: "Run 4 scenarios" }));
  await click(view.getByRole("button", { name: "Inspect approved and released" }));
  assert.ok(
    view.getByText("Viewing Approved and released: simulated trace, not committed host data."),
  );
  await click(view.getByRole("button", { name: "Load committed sample" }));
  assert.ok(
    view.getByText("Synthetic committed observations loaded. No live service is connected."),
  );
  await choose(view.getByRole("combobox", { name: "Inspection connection" }), "gap");
  await click(view.getByRole("button", { name: "Append synthetic observation" }));
  assert.ok(view.getByText(/Synthetic observation 13 appended/));
  assert.equal(view.getByTestId("machine-lab-requests").textContent, "0 local requests recorded");
  const host = view.getByRole("region", { name: "Host inspection lab" });
  assert.ok(within(host).getByText(/History browsing never dispatches/));
});

test("integration snippet is an explicit disclosure, not an automatic clipboard action", async () => {
  const view = render(<MachineLab />);
  assert.equal(
    view.queryByText((sample) => sample.includes("const [document, setDocument]")),
    null,
  );
  await click(view.getByRole("button", { name: "Show integration example" }));
  assert.ok(view.getByText((text) => text.includes("const [document, setDocument]")));
  await click(view.getByRole("button", { name: "Hide integration example" }));
  assert.equal(
    view.queryByText((text) => text.includes("const [document, setDocument]")),
    null,
  );
});

test("explicit local host request and refusal never advance the observation", async () => {
  const view = render(<MachineLab />);
  await click(view.getByRole("button", { name: "Load committed sample" }));
  await choose(view.getByRole("combobox", { name: "Host request behavior" }), "record");
  await click(view.getByRole("tab", { name: "Runtime" }));
  await choose(view.getByRole("textbox", { name: "Event type" }), "REVIEW");
  await click(view.getByRole("button", { name: "Request host dispatch" }));
  assert.match(
    view.getByTestId("machine-lab-requests").textContent ?? "",
    /^1 local requests recorded/,
  );
  assert.ok(view.getByText("frame-11"));
  await choose(view.getByRole("combobox", { name: "Host request behavior" }), "reject");
  await click(view.getByRole("button", { name: "Request host dispatch" }));
  assert.match(
    view.getByTestId("machine-lab-requests").textContent ?? "",
    /^1 local requests recorded/,
  );
  assert.ok(view.getByText(/Host dispatch failed/));
  assert.ok(view.getByText("frame-11"));
});

test("host operational payloads are an explicit opt-in and remain non-executable", async () => {
  const view = render(<MachineLab />);
  await click(view.getByRole("button", { name: "Load committed sample" }));
  await click(view.getByRole("tab", { name: "Runtime" }));
  assert.equal(view.queryByText(/Reviewer notification/), null);
  await click(view.getByRole("checkbox", { name: "Show optional diagnostic payloads" }));
  assert.ok(view.getByText(/Reviewer notification/));
  assert.equal(view.queryByRole("button", { name: /retry reviewer/i }), null);
  assert.equal(view.getByTestId("machine-lab-requests").textContent, "0 local requests recorded");
  await click(view.getByRole("checkbox", { name: "Show optional diagnostic payloads" }));
  assert.equal(view.queryByText(/Reviewer notification/), null);
});

test("an accepted controlled graph edit invalidates earlier scenario results", async () => {
  const view = render(<MachineLab />);
  await click(view.getByRole("button", { name: "Run 4 scenarios" }));
  assert.ok(view.getByTestId("machine-lab-coverage"));
  await click(view.getByRole("checkbox", { name: "Enable local graph editing" }));
  await click(view.getByRole("button", { name: "Add state" }));
  assert.equal(view.queryByTestId("machine-lab-coverage"), null);
  assert.ok(
    view.getByText("Local graph updated. Previous test results and simulated traces were cleared."),
  );
});
