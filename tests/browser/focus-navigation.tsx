/** Visible-control fixture for manual native Tab and modal-containment checks. */
import { useState, type KeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import { Button, ModalDialog } from "../../src/components/aria.js";
import { OutlineEditor } from "../../src/react/index.js";
import "../../src/components.css";
import "../../src/styles.css";

type Cancellation = "none" | "capture" | "bubble";

function FocusExample({
  name,
  cancellation,
  after = true,
}: {
  name: string;
  cancellation: Cancellation;
  after?: boolean;
}) {
  const [history, setHistory] = useState({ revision: 0, undo: 0 });
  const cancelTab = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key === "Tab" &&
      event.target instanceof HTMLElement &&
      event.target.classList.contains("fast-ux-editor")
    )
      event.preventDefault();
  };
  return (
    <div
      onKeyDownCapture={cancellation === "capture" ? cancelTab : undefined}
      onKeyDown={cancellation === "bubble" ? cancelTab : undefined}
    >
      <Button>{name} before</Button>
      <OutlineEditor
        aria-label={`${name} outline`}
        defaultNodes={[
          { id: "first", text: `${name} first row` },
          { id: "second", text: `${name} second row` },
        ]}
        readOnly={false}
        onStateChange={(state) =>
          setHistory({ revision: state.revision, undo: state.history.past.length })
        }
      />
      <output aria-label={`${name} document state`}>
        Revision {history.revision}; undo {history.undo}
      </output>
      {after && <Button>{name} after</Button>}
    </div>
  );
}

function Fixture() {
  const [open, setOpen] = useState(false);
  const [after, setAfter] = useState(true);
  const [cancellation, setCancellation] = useState<Cancellation>("none");
  return (
    <main>
      <h1>Native outline focus checks</h1>
      <p>Focus a row, press Escape twice, then Tab or Shift+Tab. No document change is expected.</p>
      <label>
        Cancel container Tab
        <select
          value={cancellation}
          onChange={(event) => setCancellation(event.target.value as Cancellation)}
        >
          <option value="none">Do not cancel</option>
          <option value="capture">Capture cancellation</option>
          <option value="bubble">Ancestor bubble cancellation</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={after}
          onChange={(event) => setAfter(event.target.checked)}
        />
        Modal has a following control
      </label>
      <FocusExample name="Page" cancellation={cancellation} />
      <Button onPress={() => setOpen(true)}>Open modal focus example</Button>
      <ModalDialog title="Modal focus example" isOpen={open} onOpenChange={setOpen}>
        <FocusExample name="Modal" cancellation={cancellation} after={after} />
      </ModalDialog>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
