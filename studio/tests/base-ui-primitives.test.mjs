import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { domEnv, load, stopVite, waitFor } from "./harness/outliner-dom.mjs";

let React,
  act,
  createRoot,
  command,
  dialog,
  drawer,
  select,
  menu,
  contextMenu,
  notifications,
  tooltip,
  hoverCard;
before(async () => {
  await domEnv();
  React = await import("react");
  act = React.act;
  ({ createRoot } = await import("react-dom/client"));
  [command, dialog, drawer, select, menu, contextMenu, notifications, tooltip, hoverCard] =
    await Promise.all(
      [
        "command",
        "dialog",
        "drawer",
        "select",
        "dropdown-menu",
        "context-menu",
        "sonner",
        "tooltip",
        "hover-card",
      ].map((name) => load(`/src/components/ui/${name}.tsx`)),
    );
});
after(() => stopVite());
const h = (...args) => React.createElement(...args);
const pause = () => new Promise((resolve) => setTimeout(resolve, 30));
async function mount(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(() => root.render(element));
  return {
    container,
    async unmount() {
      await act(() => root.unmount());
      container.remove();
    },
  };
}
async function click(element) {
  assert.ok(element, "the click target exists");
  await act(() => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      element.dispatchEvent(
        new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }),
      );
    }
  });
}
async function key(element, value) {
  await act(() =>
    element.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }),
    ),
  );
}
async function type(element, value) {
  await act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(
      element,
      value,
    );
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

test("Base Command highlights immediately, filters by labels and keywords, and selects with the keyboard", async () => {
  const selected = [];
  const { Command, CommandInput, CommandList, CommandItem, CommandEmpty } = command;
  const ui = await mount(
    h(
      Command,
      null,
      h(CommandInput, { "aria-label": "Find a command" }),
      h(
        CommandList,
        null,
        h(CommandEmpty, null, "No matches"),
        h(
          CommandItem,
          { value: "first", onSelect: (value) => selected.push(value) },
          "First action",
        ),
        h(CommandItem, { value: "disabled", disabled: true }, "Unavailable action"),
        h(
          CommandItem,
          { value: "last", keywords: ["finish"], onSelect: (value) => selected.push(value) },
          "Last action",
        ),
      ),
    ),
  );
  try {
    const input = ui.container.querySelector("input");
    await act(() => input.focus());
    await waitFor(() => ui.container.querySelector('[data-value="first"][data-selected="true"]'));
    await key(input, "ArrowDown");
    await key(input, "Enter");
    assert.deepEqual(selected, [], "disabled options cannot run");
    await key(input, "ArrowDown");
    await waitFor(() => ui.container.querySelector('[data-value="last"][data-selected="true"]'));
    await key(input, "Enter");
    assert.deepEqual(selected, ["last"]);
    await type(input, "finish");
    await waitFor(() => !ui.container.querySelector('[data-value="first"]'));
    await key(input, "Enter");
    assert.deepEqual(selected, ["last", "last"]);
    assert.equal(input.value, "finish", "selecting keeps the search query");
    await type(input, "missing");
    await waitFor(() => ui.container.querySelector('[role="status"]').textContent === "No matches");
  } finally {
    await ui.unmount();
  }
});

test("controlled Command runs its highlighted item and moves from that item", async () => {
  const selected = [];
  const { Command, CommandInput, CommandList, CommandItem } = command;
  function ControlledCommand() {
    const [active, setActive] = React.useState("last");
    return h(
      Command,
      { value: active, onValueChange: setActive },
      h(CommandInput, { "aria-label": "Controlled commands" }),
      h(
        CommandList,
        null,
        h(CommandItem, { value: "first", onSelect: (value) => selected.push(value) }, "First"),
        h(CommandItem, { value: "last", onSelect: (value) => selected.push(value) }, "Last"),
      ),
    );
  }
  const ui = await mount(h(ControlledCommand));
  try {
    const input = ui.container.querySelector("input");
    await act(() => input.focus());
    await key(input, "Enter");
    assert.deepEqual(selected, ["last"], "the controlled highlight wins over DOM order");
    await key(input, "ArrowUp");
    await key(input, "Enter");
    assert.deepEqual(selected, ["last", "first"]);
  } finally {
    await ui.unmount();
  }
});

test("Base dialog focus callbacks receive the popup element and preserve cancellation", async () => {
  let focusTarget;
  const { Dialog, DialogTrigger, DialogContent, DialogTitle } = dialog;
  const ui = await mount(
    h(
      Dialog,
      null,
      h(DialogTrigger, null, "Open dialog"),
      h(
        DialogContent,
        {
          onOpenAutoFocus(event) {
            focusTarget = event.currentTarget;
            event.preventDefault();
            focusTarget.focus();
          },
        },
        h(DialogTitle, null, "Details"),
        h("input", { "aria-label": "Detail" }),
      ),
    ),
  );
  try {
    const trigger = ui.container.querySelector("button");
    await click(trigger);
    const popup = await waitFor(() => document.querySelector('[data-slot="dialog-content"]'));
    await waitFor(() => document.activeElement === popup);
    assert.equal(focusTarget, popup);
    await key(popup, "Escape");
    await waitFor(() => !document.querySelector('[data-slot="dialog-content"]'));
    assert.equal(document.activeElement, trigger);
  } finally {
    await ui.unmount();
  }
});

test("Base select resolves the closed value label before opening", async () => {
  const { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } = select;
  const ui = await mount(
    h(
      Select,
      { defaultValue: "second" },
      h(SelectTrigger, { "aria-label": "Choice" }, h(SelectValue)),
      h(
        SelectContent,
        null,
        h(SelectItem, { value: "first" }, "First choice"),
        h(SelectItem, { value: "second" }, "Second choice"),
      ),
    ),
  );
  try {
    assert.match(ui.container.querySelector("button").textContent, /Second choice/);
  } finally {
    await ui.unmount();
  }
});

test("Base dropdown opens with a click and its submenu returns keyboard focus", async () => {
  const {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuItem,
  } = menu;
  const ui = await mount(
    h(
      DropdownMenu,
      null,
      h(DropdownMenuTrigger, null, "Open menu"),
      h(
        DropdownMenuContent,
        null,
        h(
          DropdownMenuSub,
          null,
          h(DropdownMenuSubTrigger, null, "More"),
          h(DropdownMenuSubContent, null, h(DropdownMenuItem, null, "Nested action")),
        ),
      ),
    ),
  );
  try {
    const trigger = ui.container.querySelector("button");
    await click(trigger);
    const subTrigger = await waitFor(() =>
      document.querySelector('[data-slot="dropdown-menu-sub-trigger"]'),
    );
    await act(() => subTrigger.focus());
    await key(subTrigger, "ArrowRight");
    const nested = await waitFor(() =>
      document.querySelector('[data-slot="dropdown-menu-sub-content"] [role="menuitem"]'),
    );
    await act(() => nested.focus());
    await key(nested, "ArrowLeft");
    await waitFor(() => !document.querySelector('[data-slot="dropdown-menu-sub-content"]'));
    assert.equal(document.activeElement, subTrigger);
    await key(subTrigger, "Escape");
    await waitFor(() => !document.querySelector('[data-slot="dropdown-menu-content"]'));
  } finally {
    await ui.unmount();
  }
});

test("Base context menu opens on right-click", async () => {
  const { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } = contextMenu;
  const ui = await mount(
    h(
      ContextMenu,
      null,
      h(ContextMenuTrigger, { "data-context-target": "" }, "Right click"),
      h(ContextMenuContent, null, h(ContextMenuItem, null, "Context action")),
    ),
  );
  try {
    await act(() =>
      ui.container.querySelector("[data-context-target]").dispatchEvent(
        new window.MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 10,
          clientY: 10,
        }),
      ),
    );
    const item = await waitFor(() =>
      document.querySelector('[data-slot="context-menu-content"] [role="menuitem"]'),
    );
    assert.equal(item.textContent, "Context action");
    await key(item, "Escape");
  } finally {
    await ui.unmount();
  }
});

test("Base drawer opens, receives focus, and dismisses with Escape", async () => {
  const { Drawer, DrawerTrigger, DrawerContent, DrawerTitle, DrawerDescription } = drawer;
  const ui = await mount(
    h(
      Drawer,
      null,
      h(DrawerTrigger, null, "Open drawer"),
      h(
        DrawerContent,
        null,
        h(DrawerTitle, null, "Drawer"),
        h(DrawerDescription, null, "Drawer contents"),
        h("button", null, "Action"),
      ),
    ),
  );
  try {
    await click(ui.container.querySelector("button"));
    const popup = await waitFor(() => document.querySelector('[data-slot="drawer-content"]'));
    await waitFor(() => popup.contains(document.activeElement));
    await key(document.activeElement, "Escape");
    await waitFor(() => !document.querySelector('[data-slot="drawer-content"]'));
  } finally {
    await ui.unmount();
  }
});

test("Base toast routes by instance, updates in place, applies styles, and runs its action", async () => {
  const { Toaster, toast } = notifications;
  let actions = 0;
  const ui = await mount(
    h(
      React.Fragment,
      null,
      h(Toaster, { id: "primitive-a", customAriaLabel: "A notices", duration: 60_000 }),
      h(Toaster, { id: "primitive-b", customAriaLabel: "B notices", duration: 60_000 }),
    ),
  );
  try {
    await act(() => toast("First", { id: "primitive-notice", toasterId: "primitive-a" }));
    await act(() =>
      toast("Updated", {
        id: "primitive-notice",
        toasterId: "primitive-a",
        classNames: { toast: "custom-notice" },
        closeButton: true,
        action: { label: "Undo", onClick: () => actions++ },
      }),
    );
    const a = await waitFor(() => document.querySelector('[aria-label="A notices"]'));
    assert.equal(a.querySelectorAll("[data-sonner-toast]").length, 1);
    assert.match(a.textContent, /Updated/);
    assert.ok(a.querySelector(".custom-notice"));
    assert.equal(
      document.querySelector('[aria-label="B notices"]').querySelectorAll("[data-sonner-toast]")
        .length,
      0,
    );
    assert.ok(a.querySelector('[aria-label="Dismiss notification"]'));
    await click([...a.querySelectorAll("button")].find((button) => button.textContent === "Undo"));
    await waitFor(() => !a.querySelector("[data-sonner-toast]"));
    assert.equal(actions, 1);
  } finally {
    await act(() => toast.dismiss("primitive-notice"));
    await ui.unmount();
  }
});

test("Base tooltip trigger is described by the visible tooltip", async () => {
  const { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } = tooltip;
  const ui = await mount(
    h(
      TooltipProvider,
      null,
      h(
        Tooltip,
        { open: true },
        h(TooltipTrigger, null, "Help"),
        h(TooltipContent, null, "Helpful detail"),
      ),
    ),
  );
  try {
    await act(pause);
    const trigger = ui.container.querySelector("button");
    const content = await waitFor(() => document.querySelector('[role="tooltip"]'));
    assert.ok(content.id);
    assert.ok(trigger.getAttribute("aria-describedby").split(" ").includes(content.id));
  } finally {
    await ui.unmount();
  }
});

test("HoverCard opens on focus and click with accessible interactive content", async () => {
  const { HoverCard, HoverCardTrigger, HoverCardContent } = hoverCard;
  const ui = await mount(
    h(
      HoverCard,
      null,
      h(HoverCardTrigger, null, "Show details"),
      h(
        HoverCardContent,
        { "aria-label": "Account details" },
        h("a", { href: "#details" }, "Read details"),
      ),
    ),
  );
  try {
    const trigger = ui.container.querySelector("button");
    await act(() => trigger.focus());
    const content = await waitFor(() => document.querySelector('[data-slot="hover-card-content"]'));
    assert.equal(content.getAttribute("aria-label"), "Account details");
    assert.notEqual(content.getAttribute("aria-hidden"), "true");
    const link = content.querySelector("a[href]");
    assert.ok(link);
    await act(() => link.focus());
    await key(link, "Escape");
    await waitFor(() => !document.querySelector('[data-slot="hover-card-content"]'));
    await click(trigger);
    await waitFor(() => document.querySelector('[data-slot="hover-card-content"]'));
  } finally {
    await ui.unmount();
  }
});
