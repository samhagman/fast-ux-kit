import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { dom, browserErrors } from "./components-dom.js";
for (const key of [
  "Image",
  "HTMLImageElement",
  "HTMLAnchorElement",
  "HTMLIFrameElement",
  "HTMLFormElement",
  "HTMLFieldSetElement",
  "HTMLLabelElement",
  "ShadowRoot",
  "File",
  "Blob",
  "FileList",
  "DOMRect",
  "Range",
] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
Object.defineProperty(dom.window, "matchMedia", {
  configurable: true,
  value: (media: string) => ({
    matches: false,
    media,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  }),
});
Object.defineProperty(dom.window.HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value() {},
});
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { renderToString } = await import("react-dom/server");
const { arkDemos } = await import("../examples/docs/demos/ark-demos.js");
const K = await import("../src/components/ark-specialized.js");
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught browser errors");
});
for (const [name, demo] of Object.entries(arkDemos)) {
  test(`${name} specialized composition renders real styled DOM and stable server markup`, async () => {
    const html = renderToString(demo.render());
    assert.ok(html.length > 0);
    const view = render(demo.render());
    await act(async () => {
      await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
    });
    assert.ok(view.container.querySelector('[class*="fux-"]'));
    assert.equal(view.container.querySelector('[style*="NaN"]'), null);
    assert.equal(view.container.querySelector('[style*="undefined"]'), null);
  });
}

test("password visibility changes the same input without losing its value", async () => {
  const view = render(arkDemos.PasswordInput!.render());
  await act(async () => {
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
  const input = view.getByLabelText("Password") as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { value: "local-example" } });
  });
  assert.equal(input.type, "password");
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: /show password/i }));
  });
  assert.equal(input.type, "text");
  assert.equal(input.value, "local-example");
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: /hide password/i }));
  });
  assert.equal(input.type, "password");
});

test("inline edit supports cancel, commit and repeated editing", async () => {
  const view = render(arkDemos.Editable!.render());
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Edit name" }));
  });
  const input = view.getByRole("textbox", { name: "Project name" });
  await act(async () => {
    fireEvent.change(input, { target: { value: "Discard this" } });
    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
  });
  assert.ok(view.getByText("A considered workspace"));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Edit name" }));
  });
  await act(async () => {
    fireEvent.change(view.getByRole("textbox", { name: "Project name" }), {
      target: { value: "A new title" },
    });
    fireEvent.click(view.getByRole("button", { name: "Save name" }));
  });
  assert.ok(view.getByText("A new title"));
});

test("angle slider keyboard changes its owner value and hidden form value", async () => {
  const changes: number[] = [];
  const view = render(
    <K.AngleSlider.Root
      defaultValue={45}
      name="angle"
      onValueChange={(details) => changes.push(details.value)}
    >
      <K.AngleSlider.Label>Rotation</K.AngleSlider.Label>
      <K.AngleSlider.Control>
        <K.AngleSlider.Thumb />
      </K.AngleSlider.Control>
      <K.AngleSlider.HiddenInput />
    </K.AngleSlider.Root>,
  );
  const thumb = view.getByRole("slider", { name: "Rotation" });
  await act(async () => {
    thumb.focus();
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
  });
  assert.equal(changes.at(-1), 46);
  assert.equal(
    (view.container.querySelector('input[name="angle"]') as HTMLInputElement).value,
    "46",
  );
});

test("segment choices retain native radio selection and horizontal orientation", async () => {
  const view = render(arkDemos.SegmentGroup!.render());
  const month = view.getByRole("radio", { name: "Month" });
  await act(async () => {
    fireEvent.click(month);
  });
  assert.ok((month as HTMLInputElement).checked);
  assert.equal(view.getByRole("radiogroup").getAttribute("data-orientation"), "horizontal");
});

test("rating can be changed using keyboard rather than pointer-only stars", async () => {
  const changes: number[] = [];
  const view = render(
    <K.RatingGroup.Root
      count={5}
      defaultValue={3}
      onValueChange={(details) => changes.push(details.value)}
    >
      <K.RatingGroup.Label>Rating</K.RatingGroup.Label>
      <K.RatingGroup.Control>
        {[1, 2, 3, 4, 5].map((index) => (
          <K.RatingGroup.Item key={index} index={index}>
            ★
          </K.RatingGroup.Item>
        ))}
      </K.RatingGroup.Control>
      <K.RatingGroup.HiddenInput />
    </K.RatingGroup.Root>,
  );
  const group = view.getAllByRole("radio")[2]!;
  await act(async () => {
    group.focus();
    fireEvent.keyDown(group, { key: "ArrowRight" });
  });
  assert.equal(changes.at(-1), 4);
});

test("tag entry adds on Enter and deletion removes exactly one value", async () => {
  const view = render(arkDemos.TagsInput!.render());
  const input = view.getByPlaceholderText("Add a topic");
  await act(async () => {
    input.focus();
  });
  await act(async () => {
    fireEvent.input(input, { target: { value: "Build" } });
  });
  await act(async () => {
    fireEvent.keyDown(input, { key: "Enter" });
  });
  assert.ok(view.getByText("Build"));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Remove Research" }));
  });
  assert.ok(view.queryByText("Research") === null);
  assert.ok(view.getByText("Design"));
});

test("steps advance to completion and can return to the previous stage", async () => {
  const view = render(arkDemos.Steps!.render());
  assert.ok(view.getByText("First, add the project details."));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Next step" }));
  });
  assert.ok(view.getByText("Review the choices before continuing."));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Next step" }));
  });
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Next step" }));
  });
  assert.ok(view.getByText("All steps complete."));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Previous step" }));
  });
  assert.ok(view.getByText("Everything is ready to confirm."));
});

test("clipboard copies the supplied value and displays success feedback", async () => {
  const writes: string[] = [];
  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        writes.push(value);
      },
    },
  });
  const view = render(arkDemos.Clipboard!.render());
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Copy to clipboard" }));
  });
  assert.deepEqual(writes, ["A considered workspace"]);
  await waitFor(() => assert.ok(view.getByText("Copied")));
});

test("file upload accepts a local file and allows removal without network behavior", async () => {
  const view = render(arkDemos.FileUpload!.render());
  const input = view.container.querySelector('input[type="file"]')!;
  const file = new File(["Local notes"], "notes.txt", { type: "text/plain" });
  await act(async () => {
    fireEvent.input(input, { target: { files: [file] } });
  });
  await waitFor(() => assert.ok(view.getByText("notes.txt")));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Remove notes.txt" }));
  });
  assert.ok(view.queryByText("notes.txt") === null);
});

test("drawer opens one dialog and restores focus after dismissal and reopen", async () => {
  const view = render(arkDemos.Drawer!.render());
  const trigger = view.getByRole("button", { name: "Open drawer" });
  for (let round = 0; round < 2; round++) {
    await act(async () => {
      trigger.focus();
      fireEvent.click(trigger);
    });
    assert.equal(view.getAllByRole("dialog", { name: "Workspace options" }).length, 1);
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Close drawer" }));
    });
    await waitFor(() => assert.ok(view.queryByRole("dialog") === null));
    await waitFor(() => assert.ok(document.activeElement === trigger));
  }
});

test("toast announces content and its explicit close action removes it", async () => {
  const view = render(arkDemos.Toast!.render());
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Show notification" }));
  });
  assert.ok(view.getByText("Changes saved"));
  assert.ok(view.getByText("Your work is up to date."));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Dismiss notification" }));
  });
  await waitFor(() => assert.ok(view.queryByText("Changes saved") === null), { timeout: 2500 });
});

test("table of contents keeps unique IDs and scroll links do not replace the docs route", async () => {
  dom.window.location.hash = "toc";
  const view = render(arkDemos.Toc!.render());
  const ids = [...view.container.querySelectorAll("[id]")].map((element) => element.id);
  assert.equal(new Set(ids).size, ids.length);
  const link = view.getByRole("link", { name: "Principles" });
  assert.equal(link.getAttribute("href"), "#toc-principles");
  let allowed = true;
  await act(async () => {
    allowed = fireEvent.click(link);
  });
  assert.equal(allowed, false, "local article navigation prevents the route hash from changing");
  assert.equal(dom.window.location.hash, "#toc");
});
