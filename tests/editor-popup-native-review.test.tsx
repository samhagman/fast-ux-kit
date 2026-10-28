import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createRef, type ReactNode } from "react";
import { dom, browserErrors } from "./components-dom.js";
import type {
  TextCompletionOffer,
  TextCompletionProvider,
  TextHoverOffer,
  TextHoverProvider,
} from "../src/core/index.js";
import type { OutlineEditorHandle } from "../src/react/OutlineEditor.js";
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { OutlineEditor } = await import("../src/react/OutlineEditor.js");
Object.defineProperty(globalThis, "DOMRect", { configurable: true, value: dom.window.DOMRect });
const nodes = [
  { id: "before", text: "Before" },
  { id: "a", text: "Alpha" },
];
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});
async function key(element: Element, key: string, modifiers: Record<string, boolean> = {}) {
  let allowed = true;
  await act(async () => {
    allowed = fireEvent.keyDown(element, { key, ...modifiers });
  });
  return allowed;
}
function focus(input: HTMLTextAreaElement, start = 2, end = start) {
  act(() => {
    input.focus();
    input.setSelectionRange(start, end);
    fireEvent.select(input);
  });
}
function snapshot(ref: React.RefObject<OutlineEditorHandle | null>) {
  const state = ref.current!.getState();
  return {
    nodes: state.nodes,
    caret: state.caret,
    selection: [...state.selection],
    revision: state.revision,
    past: state.history.past.length,
    future: state.history.future.length,
  };
}

for (const kind of ["completion", "hover"] as const) {
  test(`Escape cancels pending keyboard ${kind} before row-mode selection and ignores late results`, async () => {
    let signal: AbortSignal | undefined;
    let finish: (() => void) | undefined;
    const completion: TextCompletionProvider = {
      id: "pending-completion",
      complete: (request) => {
        signal = request.signal;
        return new Promise<TextCompletionOffer | null>((resolve) => {
          finish = () =>
            resolve({ range: { start: 0, end: 5 }, items: [{ id: "alpine", label: "Alpine" }] });
        });
      },
    };
    const hover: TextHoverProvider<ReactNode> = {
      id: "pending-hover",
      hover: (request) => {
        signal = request.signal;
        return new Promise<TextHoverOffer<ReactNode> | null>((resolve) => {
          finish = () =>
            resolve({ range: { start: 0, end: 5 }, content: <a href="#late">Late information</a> });
        });
      },
    };
    const ref = createRef<OutlineEditorHandle>();
    let pluginEscapes = 0;
    const view = render(
      <OutlineEditor
        ref={ref}
        defaultNodes={nodes}
        readOnly={false}
        completionProviders={kind === "completion" ? [completion] : []}
        hoverProviders={kind === "hover" ? [hover] : []}
        plugins={[
          {
            id: "escape-observer",
            keymap: (event) => {
              if (event.key === "Escape") pluginEscapes++;
              return undefined;
            },
          },
        ]}
      />,
    );
    await act(async () => {
      ref.current!.dispatch({ type: "task", id: "before", checked: true });
      ref.current!.dispatch({ type: "task", id: "a", checked: true });
      ref.current!.dispatch({ type: "undo" });
    });
    assert.equal(ref.current!.getState().history.past.length, 1);
    assert.equal(ref.current!.getState().history.future.length, 1);
    const input = view.getByRole("textbox", { name: "Edit Alpha" }) as HTMLTextAreaElement;
    focus(input);
    await key(
      input,
      kind === "completion" ? " " : "F1",
      kind === "completion" ? { ctrlKey: true } : { altKey: true },
    );
    assert.ok(signal, "the asynchronous request started");
    assert.equal(signal.aborted, false);
    assert.equal(view.queryByRole("listbox"), null);
    assert.equal(view.queryByRole("dialog"), null);
    const before = snapshot(ref);
    assert.equal(await key(input, "Escape"), false);
    assert.equal(signal.aborted, true);
    assert.equal(pluginEscapes, 0, "pending popup dismissal precedes host keymaps");
    assert.equal(
      document.activeElement === input,
      true,
      "pending work owns this Escape, not row selection",
    );
    assert.equal(input.selectionStart, 2);
    assert.equal(input.selectionEnd, 2);
    assert.deepEqual(
      snapshot(ref),
      before,
      "dismissal preserves content, caret, selection and history",
    );
    await act(async () => finish?.());
    assert.equal(view.queryByRole("listbox"), null);
    assert.equal(view.queryByRole("dialog"), null);
    assert.equal(document.activeElement === input, true);
    assert.deepEqual(snapshot(ref), before);
    await key(input, "Escape");
    assert.equal(pluginEscapes, 1);
    assert.equal(
      ref.current!.getState().selection.has("a"),
      true,
      "the next Escape may enter row mode",
    );
    assert.equal(
      document.activeElement === view.container.querySelector('[data-node-id="a"]'),
      true,
    );
  });
}

function information(content: ReactNode): TextHoverProvider<ReactNode> {
  return { id: "keyboard-info", hover: () => ({ range: { start: 0, end: 5 }, content }) };
}

test("Tab enters keyboard information, Shift+Tab returns to its originating caret, and Escape restores focus", async () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor
      ref={ref}
      defaultNodes={nodes}
      readOnly={false}
      hoverProviders={[information(<a href="#details">Open details</a>)]}
    />,
  );
  const input = view.getByRole("textbox", { name: "Edit Alpha" }) as HTMLTextAreaElement;
  focus(input, 1, 3);
  await key(input, "F1", { altKey: true });
  await waitFor(() => assert.ok(view.getByRole("dialog", { name: "Text information" })));
  const before = snapshot(ref);
  const link = view.getByRole("link", { name: "Open details" });
  assert.equal(document.activeElement === input, true);
  assert.equal(await key(input, "Tab"), false);
  assert.equal(
    document.activeElement === link,
    true,
    "entry must be caused by Tab, not a test link.focus()",
  );
  assert.deepEqual(snapshot(ref), before, "Tab must not indent the row");
  assert.equal(await key(link, "Tab", { shiftKey: true }), false);
  assert.equal(document.activeElement === input, true);
  assert.equal(input.selectionStart, 1);
  assert.equal(input.selectionEnd, 3);
  assert.ok(view.getByRole("dialog", { name: "Text information" }));
  await key(input, "Tab");
  assert.equal(document.activeElement === link, true);
  await key(link, "Escape");
  await waitFor(() => assert.equal(view.queryByRole("dialog") === null, true));
  assert.equal(document.activeElement === input, true);
  assert.equal(input.selectionStart, 1);
  assert.equal(input.selectionEnd, 3);
  assert.deepEqual(snapshot(ref), before);
});

test("information Tab entry skips hidden, disabled, inert and excluded controls without trapping traversal", async () => {
  const view = render(
    <OutlineEditor
      defaultNodes={nodes}
      readOnly={false}
      hoverProviders={[
        information(
          <>
            <input type="hidden" value="Hidden input" readOnly />
            <div hidden>
              <button>Hidden ancestor</button>
            </div>
            <div style={{ display: "none" }}>
              <button>Display hidden ancestor</button>
            </div>
            <div style={{ visibility: "hidden" }}>
              <button>Invisible ancestor</button>
            </div>
            <div inert>
              <button>Inert ancestor</button>
            </div>
            <button disabled>Disabled</button>
            <fieldset disabled>
              <button>Disabled fieldset</button>
            </fieldset>
            <button tabIndex={-1}>Excluded tab stop</button>
            <a>Link without destination</a>
            <a href="#first">First usable link</a>
            <button type="button">Second usable control</button>
          </>,
        ),
      ]}
    />,
  );
  const input = view.getByRole("textbox", { name: "Edit Alpha" }) as HTMLTextAreaElement;
  focus(input);
  await key(input, "F1", { altKey: true });
  const link = await view.findByRole("link", { name: "First usable link" });
  await key(input, "Tab");
  assert.equal(document.activeElement === link, true);
  assert.equal(await key(link, "Tab", { shiftKey: true }), false);
  assert.equal(
    document.activeElement === input,
    true,
    "reverse entry skips the same excluded controls",
  );
  await key(input, "Tab");
  assert.equal(document.activeElement === link, true);
  assert.equal(
    await key(link, "Tab"),
    true,
    "ordinary forward Tab inside the popup remains native",
  );
  const close = view.getByRole("button", { name: "Close information" });
  assert.equal(await key(close, "Tab"), true, "last-control Tab is not a focus trap");
  assert.equal(
    await key(close, "Tab", { shiftKey: true }),
    true,
    "only the first control owns reverse entry",
  );
});

test("hover dismissal timers cannot remove information while keyboard focus is inside", async () => {
  const view = render(
    <OutlineEditor
      defaultNodes={nodes}
      readOnly={false}
      hoverProviders={[information(<a href="#timer">Timed information link</a>)]}
    />,
  );
  const input = view.getByRole("textbox", { name: "Edit Alpha" }) as HTMLTextAreaElement;
  focus(input);
  await key(input, "F1", { altKey: true });
  const popup = view.getByRole("dialog", { name: "Text information" });
  const link = view.getByRole("link", { name: "Timed information link" });
  await act(async () => fireEvent.pointerLeave(input));
  await key(input, "Tab");
  assert.equal(document.activeElement === link, true);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 220));
  });
  assert.equal(popup.isConnected, true, "entry clears an already scheduled anchor-leave timer");
  await act(async () => {
    fireEvent.pointerLeave(popup.parentElement!);
    await new Promise((resolve) => setTimeout(resolve, 220));
  });
  assert.equal(popup.isConnected, true, "pointer departure does not evict a focused keyboard user");
  await key(link, "Tab", { shiftKey: true });
  assert.equal(document.activeElement === input, true);
  await act(async () => {
    fireEvent.pointerLeave(popup.parentElement!);
    await new Promise((resolve) => setTimeout(resolve, 220));
  });
  assert.equal(
    popup.isConnected,
    false,
    "the same leave event dismisses after focus leaves the popup",
  );
});

test("keyboard information entry and Escape stay inside the enclosing modal ownership", async () => {
  const { ModalDialog } = await import("../src/components/aria.js");
  const openChanges: boolean[] = [];
  const view = render(
    <ModalDialog title="Edit in modal" isOpen onOpenChange={(open) => openChanges.push(open)}>
      <OutlineEditor
        defaultNodes={nodes}
        readOnly={false}
        hoverProviders={[information(<a href="#modal-link">Information in modal</a>)]}
      />
    </ModalDialog>,
  );
  const modal = view.getByRole("dialog", { name: "Edit in modal" });
  const input = view.getByRole("textbox", { name: "Edit Alpha" }) as HTMLTextAreaElement;
  focus(input);
  await key(input, "F1", { altKey: true });
  const popup = view.getByRole("dialog", { name: "Text information" });
  assert.equal(modal.contains(popup), true);
  await key(input, "Tab");
  const link = view.getByRole("link", { name: "Information in modal" });
  assert.equal(document.activeElement === link, true);
  await key(link, "Escape");
  await waitFor(() => assert.equal(popup.isConnected, false));
  assert.equal(modal.isConnected, true);
  assert.equal(document.activeElement === input, true);
  assert.deepEqual(openChanges, []);
});

test("editable-host variants are eligible but implicit nested editors are not (mocked contenteditable support)", async () => {
  // jsdom does not implement isContentEditable. Model only this browser property;
  // no browser editing, selection, layout or native Tab traversal is claimed.
  const original = Object.getOwnPropertyDescriptor(
    dom.window.HTMLElement.prototype,
    "isContentEditable",
  );
  Object.defineProperty(dom.window.HTMLElement.prototype, "isContentEditable", {
    configurable: true,
    get(this: HTMLElement): boolean {
      const value = this.getAttribute("contenteditable");
      if (value === "false") return false;
      if (value === "" || value === "true" || value === "plaintext-only") return true;
      return this.parentElement?.isContentEditable ?? false;
    },
  });
  try {
    for (const variant of ["empty", "plaintext-only", "nested"] as const) {
      const view = render(
        <OutlineEditor
          defaultNodes={nodes}
          readOnly={false}
          hoverProviders={[
            information(
              <>
                <div
                  contentEditable={variant === "plaintext-only" ? "plaintext-only" : true}
                  suppressContentEditableWarning
                  tabIndex={variant === "nested" ? -1 : undefined}
                  ref={(element) => {
                    if (element && variant === "empty") element.setAttribute("contenteditable", "");
                  }}
                  data-testid="editing-host"
                >
                  <div contentEditable suppressContentEditableWarning data-testid="nested-editor">
                    Editable text
                  </div>
                </div>
                <a href="#after-editable">After editable host</a>
              </>,
            ),
          ]}
        />,
      );
      const input = view.getByRole("textbox", { name: "Edit Alpha" }) as HTMLTextAreaElement;
      focus(input);
      await key(input, "F1", { altKey: true });
      await key(input, "Tab");
      const target =
        variant === "nested"
          ? view.getByRole("link", { name: "After editable host" })
          : view.getByTestId("editing-host");
      assert.equal(document.activeElement === target, true, variant);
      assert.equal(await key(target, "Tab", { shiftKey: true }), false);
      assert.equal(document.activeElement === input, true);
      view.unmount();
    }
  } finally {
    if (original)
      Object.defineProperty(dom.window.HTMLElement.prototype, "isContentEditable", original);
    else
      delete (dom.window.HTMLElement.prototype as unknown as Record<string, unknown>)
        .isContentEditable;
  }
});

test("reverse information entry uses the first successful focus target (mocked focus refusal)", async () => {
  let refusedAttempts = 0;
  const view = render(
    <OutlineEditor
      defaultNodes={nodes}
      readOnly={false}
      hoverProviders={[
        information(
          <>
            <button
              type="button"
              ref={(element) => {
                if (element)
                  element.focus = () => {
                    refusedAttempts++;
                  };
              }}
            >
              Simulated nonrendered candidate
            </button>
            <a href="#reachable">Reachable information link</a>
          </>,
        ),
      ]}
    />,
  );
  const input = view.getByRole("textbox", { name: "Edit Alpha" }) as HTMLTextAreaElement;
  focus(input);
  await key(input, "F1", { altKey: true });
  await key(input, "Tab");
  assert.equal(refusedAttempts, 1);
  const link = view.getByRole("link", { name: "Reachable information link" });
  assert.equal(document.activeElement === link, true);
  assert.equal(await key(link, "Tab", { shiftKey: true }), false);
  assert.equal(document.activeElement === input, true);
});

function pendingInformation() {
  let signal: AbortSignal | undefined;
  let finish: (() => void) | undefined;
  const provider: TextHoverProvider<ReactNode> = {
    id: "pending-information-entry",
    hover: (request) => {
      signal = request.signal;
      return new Promise<TextHoverOffer<ReactNode>>((resolve) => {
        finish = () =>
          resolve({ range: { start: 0, end: 5 }, content: <a href="#late-info">Late entry</a> });
      });
    },
  };
  return { provider, signal: () => signal, finish: () => finish?.() };
}

test("leaving a textarea cancels pending keyboard information before its late result arrives", async () => {
  const pending = pendingInformation();
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <>
      <button type="button">External action</button>
      <OutlineEditor
        ref={ref}
        defaultNodes={nodes}
        readOnly={false}
        hoverProviders={[pending.provider]}
      />
    </>,
  );
  const input = view.getByRole("textbox", { name: "Edit Alpha" }) as HTMLTextAreaElement;
  const outside = view.getByRole("button", { name: "External action" });
  focus(input, 1, 3);
  await key(input, "F1", { altKey: true });
  assert.equal(pending.signal()?.aborted, false);
  assert.equal(view.queryByRole("dialog"), null, "there is no session to dismiss yet");
  const before = snapshot(ref);
  act(() => outside.focus());
  assert.equal(pending.signal()?.aborted, true);
  await act(async () => pending.finish());
  assert.equal(view.queryByRole("dialog"), null);
  assert.equal(document.activeElement === outside, true);
  assert.deepEqual(snapshot(ref), before);
});

test("Info opener cancels pending work on Escape or focus departure without changing the outline", async () => {
  for (const dismissal of ["escape", "blur"] as const) {
    const pending = pendingInformation();
    const ref = createRef<OutlineEditorHandle>();
    const view = render(
      <>
        <button type="button">External action</button>
        <OutlineEditor
          ref={ref}
          defaultNodes={nodes}
          readOnly={false}
          hoverProviders={[pending.provider]}
        />
      </>,
    );
    const opener = view.getByRole("button", { name: "Information about Alpha" });
    const outside = view.getByRole("button", { name: "External action" });
    await act(async () => {
      opener.focus();
      fireEvent.click(opener);
    });
    assert.equal(pending.signal()?.aborted, false, dismissal);
    const before = snapshot(ref);
    if (dismissal === "escape") assert.equal(await key(opener, "Escape"), false);
    else act(() => outside.focus());
    assert.equal(pending.signal()?.aborted, true, dismissal);
    await act(async () => pending.finish());
    assert.equal(view.queryByRole("dialog"), null, dismissal);
    assert.equal(document.activeElement === (dismissal === "escape" ? opener : outside), true);
    assert.deepEqual(snapshot(ref), before, dismissal);
    view.unmount();
  }
});

test("Info opener Tab enters ready information and focus departure dismisses without trapping", async () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <>
      <button type="button">External action</button>
      <OutlineEditor
        ref={ref}
        defaultNodes={nodes}
        readOnly={false}
        hoverProviders={[information(<a href="#explicit-info">Explicit information link</a>)]}
      />
    </>,
  );
  const opener = view.getByRole("button", { name: "Information about Alpha" });
  const outside = view.getByRole("button", { name: "External action" });
  const input = view.getByRole("textbox", { name: "Edit Alpha" }) as HTMLTextAreaElement;
  focus(input, 1, 3);
  await act(async () => {
    opener.focus();
    fireEvent.click(opener);
  });
  const link = await view.findByRole("link", { name: "Explicit information link" });
  const before = snapshot(ref);
  assert.equal(document.activeElement === opener, true);
  assert.equal(await key(opener, "Tab"), false);
  assert.equal(document.activeElement === link, true, "Tab, not manual focus, enters the popup");
  assert.deepEqual(snapshot(ref), before);
  assert.equal(await key(link, "Tab", { shiftKey: true }), false);
  assert.equal(
    document.activeElement === input,
    true,
    "reverse entry retains the row-text contract",
  );
  assert.equal(input.selectionStart, 1);
  assert.equal(input.selectionEnd, 3);
  await key(input, "Tab");
  assert.equal(document.activeElement === link, true);
  assert.equal(await key(link, "Tab"), true, "forward traversal remains native, not trapped");
  // jsdom does not implement native Tab traversal; model its destination with focus().
  act(() => outside.focus());
  assert.equal(view.queryByRole("dialog"), null);
  assert.equal(document.activeElement === outside, true);
  await act(async () => {
    opener.focus();
    fireEvent.click(opener);
  });
  assert.ok(await view.findByRole("dialog", { name: "Text information" }));
  act(() => outside.focus());
  assert.equal(view.queryByRole("dialog"), null, "leaving the opener also dismisses ready content");
  assert.equal(document.activeElement === outside, true);
  assert.deepEqual(snapshot(ref), before);
});
