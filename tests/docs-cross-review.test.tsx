import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { useEffect, useState } from "react";
import { dom, browserErrors } from "./components-dom.js";
Object.defineProperty(dom.window, "scrollTo", { value() {}, configurable: true });
const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { DocsApp } = await import("../examples/docs/App.js");
const { DemoFrame, PageBoundary } = await import("../examples/docs/ui.js");
const { Button } = await import("../src/components/aria.js");
afterEach(async () => {
  await act(async () => {
    cleanup();
    dom.window.history.replaceState(null, "", "/");
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught browser errors");
});
async function at(route: string) {
  dom.window.history.replaceState(null, "", `/#${route}`);
  const view = render(<DocsApp />);
  await waitFor(
    () =>
      assert.equal(
        Boolean(view.queryByText(/Loading (interactive example|documentation)…/)),
        false,
      ),
    { timeout: 10000 },
  );
  return view;
}

test("an example factory exception stays in the local resettable boundary rather than replacing the page", () => {
  let broken = true;
  const view = render(
    <PageBoundary>
      <DemoFrame
        title="Recovery example"
        demo={{
          code: "<Example />",
          render: () => {
            if (broken) throw new Error("Expected local factory failure");
            return <p>Recovered example</p>;
          },
        }}
      />
    </PageBoundary>,
  );
  assert.ok(view.getByText("This example could not render."));
  assert.equal(view.queryByRole("heading", { name: "The page could not load" }), null);
  broken = false;
  fireEvent.click(view.getByRole("button", { name: "Reset recovery example" }));
  assert.ok(view.getByText("Recovered example"));
});

test("search shortcut stays inside existing mobile navigation after the viewport becomes wide", async () => {
  const original = Object.getOwnPropertyDescriptor(dom.window, "matchMedia");
  let narrow = true;
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: narrow,
      media: "(max-width: 800px)",
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => true,
    }),
  });
  try {
    const view = await at("overview");
    await act(async () => fireEvent.click(view.getByRole("button", { name: "Browse components" })));
    const modal = view.getByRole("dialog", { name: "Browse the system" });
    const modalSearch = within(modal).getByRole("searchbox", { name: "Find a component" });
    const backgroundSearch = view.container.querySelector<HTMLInputElement>("#docs-nav input")!;
    let backgroundFocusAttempts = 0;
    const nativeFocus = backgroundSearch.focus;
    backgroundSearch.focus = () => {
      backgroundFocusAttempts++;
    };
    try {
      narrow = false;
      act(() => modalSearch.focus());
      fireEvent.keyDown(modalSearch, { key: "k", ctrlKey: true });
      assert.equal(
        backgroundFocusAttempts,
        0,
        "the still-open navigation owns shortcut focus after a breakpoint change",
      );
      assert.equal(document.activeElement, modalSearch);
    } finally {
      backgroundSearch.focus = nativeFocus;
    }
  } finally {
    if (original) Object.defineProperty(dom.window, "matchMedia", original);
    else Reflect.deleteProperty(dom.window, "matchMedia");
  }
});

test("reset tears down the previous example, preserves toolbar focus and starts fresh local state", () => {
  const lifecycle: string[] = [];
  function StatefulExample() {
    const [value, setValue] = useState(0);
    useEffect(() => {
      lifecycle.push("mount");
      return () => {
        lifecycle.push("cleanup");
      };
    }, []);
    return <Button onPress={() => setValue(value + 1)}>Example value {value}</Button>;
  }
  const view = render(
    <DemoFrame
      title="Lifecycle example"
      demo={{ code: "<StatefulExample />", render: () => <StatefulExample /> }}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Example value 0" }));
  const reset = view.getByRole("button", { name: "Reset lifecycle example" });
  act(() => reset.focus());
  fireEvent.click(reset);
  assert.ok(view.getByRole("button", { name: "Example value 0" }));
  assert.deepEqual(lifecycle, ["mount", "cleanup", "mount"]);
  assert.equal(document.activeElement, reset);
});

test("rich-document footnotes and backlinks scroll locally without replacing the documentation route", async () => {
  const view = await at("rich-content");
  const sample = view.container.querySelector<HTMLElement>(".rich-sample")!;
  const reference = [...sample.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].find((link) =>
    link.getAttribute("aria-describedby")?.includes("footnote"),
  );
  assert.ok(reference, "real Markdown sample contains a footnote reference");
  const footnoteId = decodeURIComponent(reference.hash.slice(1));
  const footnote = document.getElementById(footnoteId)!;
  assert.ok(footnote, "scoped footnote target exists");
  let scrolled = 0;
  Object.defineProperty(footnote, "scrollIntoView", {
    configurable: true,
    value: () => {
      scrolled++;
    },
  });
  await act(async () => {
    fireEvent.click(reference);
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  assert.equal(dom.window.location.hash, "#rich-content");
  assert.ok(view.getByRole("heading", { name: "Rich content", level: 1 }));
  assert.equal(scrolled, 1);
  assert.equal(document.activeElement, footnote);
  const backlink = footnote.querySelector<HTMLAnchorElement>('a[href^="#"]')!;
  assert.ok(backlink);
  await act(async () => fireEvent.click(backlink));
  assert.equal(dom.window.location.hash, "#rich-content");
  assert.equal(document.activeElement, reference);
});

test("ordinary Markdown documentation links still navigate to registered pages", async () => {
  const view = await at("rich-content");
  const link = view.getByRole("link", { name: "ordinary links" });
  await act(async () => {
    fireEvent.click(link);
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  await waitFor(() => assert.ok(view.queryByRole("heading", { name: "Outline reader", level: 1 })));
  assert.equal(dom.window.location.hash, "#outline");
});

test("route departure unmounts a floating demo portal rather than leaving an unrelated owner behind", async () => {
  const view = await at("floating-panel");
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Open floating panel" })));
  assert.ok(document.querySelector('[data-scope="floating-panel"][data-part="content"]'));
  await act(async () => {
    dom.window.history.pushState(null, "", "/#installation");
    dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  });
  await waitFor(() =>
    assert.equal(
      Boolean(document.querySelector('[data-scope="floating-panel"][data-part="content"]')),
      false,
    ),
  );
  assert.ok(view.getByRole("heading", { name: "Installation", level: 1 }));
});

test("switching a live preview to code does not leave its portalled floating panel visible", async () => {
  const view = await at("floating-panel");
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Open floating panel" })));
  assert.ok(document.querySelector('[data-scope="floating-panel"][data-part="content"]'));
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Code" })));
  assert.equal(view.queryByRole("button", { name: "Open floating panel" }), null);
  assert.equal(
    document.querySelector('[data-scope="floating-panel"][data-part="content"]') === null,
    true,
    "hidden preview must not leak an independently portalled surface",
  );
  fireEvent.click(view.getByRole("button", { name: "Preview" }));
  assert.ok(view.getByRole("button", { name: "Open floating panel" }));
});

test("local-anchor routing respects modified activation, owner prevention, missing targets and external destinations", async () => {
  const view = await at("installation");
  const main = view.getByRole("main");
  const target = document.createElement("p");
  target.id = "cross-review-local-target";
  target.textContent = "Local destination";
  const anchor = document.createElement("a");
  anchor.href = "#cross-review-local-target";
  anchor.textContent = "Local link";
  main.append(anchor, target);
  let scrolled = 0;
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: () => {
      scrolled++;
    },
  });
  const prevented: boolean[] = [];
  // Observe the app's decision, then suppress jsdom's native navigation itself.
  // This does not claim that new-tab or OS modifier behavior ran.
  const observeDefault = (event: MouseEvent) => {
    prevented.push(event.defaultPrevented);
    event.preventDefault();
  };
  document.addEventListener("click", observeDefault);
  try {
    for (const modifier of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
      { button: 1 },
    ])
      fireEvent.click(anchor, modifier);
    assert.deepEqual(prevented, [false, false, false, false, false]);
    assert.equal(scrolled, 0);
    const owner = (event: Event) => event.preventDefault();
    anchor.addEventListener("click", owner);
    fireEvent.click(anchor);
    anchor.removeEventListener("click", owner);
    assert.equal(prevented.at(-1), true, "the existing owner retains its prevented event");
    assert.equal(scrolled, 0, "app routing must not take over an owner-prevented anchor");
    for (const href of [
      "#cross-review-missing-target",
      "https://example.invalid/#cross-review-local-target",
      "#overview",
      "#%malformed",
    ]) {
      anchor.href = href;
      fireEvent.click(anchor);
      assert.equal(prevented.at(-1), false, `${href} is left to its own navigation contract`);
    }
    assert.equal(scrolled, 0);
  } finally {
    document.removeEventListener("click", observeDefault);
  }
});

test("an encoded same-document target is resolved without a selector and receives temporary keyboard focus", async () => {
  const view = await at("installation");
  const main = view.getByRole("main");
  const target = document.createElement("p");
  target.id = "cross-review:α";
  target.textContent = "Encoded destination";
  const anchor = document.createElement("a");
  anchor.href = `${dom.window.location.origin}${dom.window.location.pathname}#${encodeURIComponent(target.id)}`;
  anchor.textContent = "Encoded local link";
  main.append(anchor, target);
  let scrolled = 0;
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: () => {
      scrolled++;
    },
  });
  await act(async () => fireEvent.click(anchor));
  assert.equal(scrolled, 1);
  assert.equal(document.activeElement, target);
  assert.equal(dom.window.location.hash, "#installation");
});

test("Code view unmounts the example and returning to Preview starts a clean instance", () => {
  const lifecycle: string[] = [];
  function StatefulPreview() {
    const [value, setValue] = useState(0);
    useEffect(() => {
      lifecycle.push("mount");
      return () => {
        lifecycle.push("cleanup");
      };
    }, []);
    return <Button onPress={() => setValue(value + 1)}>Temporary value {value}</Button>;
  }
  const view = render(
    <DemoFrame demo={{ code: "<StatefulPreview />", render: () => <StatefulPreview /> }} />,
  );
  fireEvent.click(view.getByRole("button", { name: "Temporary value 0" }));
  assert.ok(view.getByRole("button", { name: "Temporary value 1" }));
  const code = view.getByRole("button", { name: "Code" });
  act(() => code.focus());
  fireEvent.click(code);
  assert.deepEqual(lifecycle, ["mount", "cleanup"]);
  assert.equal(document.activeElement, code);
  const preview = view.getByRole("button", { name: "Preview" });
  act(() => preview.focus());
  fireEvent.click(preview);
  assert.deepEqual(lifecycle, ["mount", "cleanup", "mount"]);
  assert.ok(view.getByRole("button", { name: "Temporary value 0" }));
  assert.equal(document.activeElement, preview);
});
