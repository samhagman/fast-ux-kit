// Gallery demos: Toggles, overlays, layout surfaces, media and toasts (overlays.tsx, media.tsx).
import * as C from "@samhagman/fast-ux-kit/components";
import { example, click, input, key, svgImage, type ComponentFixture } from "./fixture-kit";

export const overlaysMediaFixtures: Readonly<Record<string, ComponentFixture>> = {
  ToggleButton: example(
    "Toggle emphasis with a pointer or Space.",
    (s) => <C.ToggleButton onPressedChange={s.report}>Emphasis</C.ToggleButton>,
    'button[aria-pressed="false"]',
    [click("button", 'button[aria-pressed="true"]')],
  ),
  ToggleButtonGroup: example(
    "Choose an alignment.",
    (s) => (
      <C.ToggleButtonGroup defaultValue={["left"]} onValueChange={s.report}>
        <C.ToggleButtonGroupItem value="left">Left</C.ToggleButtonGroupItem>
        <C.ToggleButtonGroupItem value="center">Center</C.ToggleButtonGroupItem>
      </C.ToggleButtonGroup>
    ),
    '[data-slot="toggle-group"]',
    [click('[data-slot="toggle-group-item"]:last-child', ".fixture-status", "center")],
  ),
  Dialog: example(
    "Open a dialog with a title and description.",
    () => (
      <C.Dialog>
        <C.DialogTrigger render={<C.Button />}>Open dialog</C.DialogTrigger>
        <C.DialogContent>
          <C.DialogTitle>Document details</C.DialogTitle>
          <C.DialogDescription>Review this synthetic example.</C.DialogDescription>
        </C.DialogContent>
      </C.Dialog>
    ),
    "button",
    [click("button", '[role="dialog"]', "Document details")],
  ),
  ModalDialog: example(
    "Open and dismiss a controlled modal.",
    (s) => (
      <>
        <C.Button onClick={() => s.setOpen(true)}>Open modal</C.Button>
        <C.ModalDialog
          title="Confirm action"
          description="A controlled modal example."
          open={s.open}
          onOpenChange={s.setOpen}
        >
          <p>Modal content</p>
        </C.ModalDialog>
      </>
    ),
    "button",
    [click("button", '[role="dialog"]', "Confirm action")],
  ),
  Popover: example(
    "Open contextual content beside its trigger.",
    () => (
      <C.Popover>
        <C.PopoverTrigger render={<C.Button variant="outline" />}>Open popover</C.PopoverTrigger>
        <C.PopoverContent>
          <p>Contextual information</p>
        </C.PopoverContent>
      </C.Popover>
    ),
    "button",
    [click("button", '[role="dialog"]', "Contextual information")],
  ),
  Tooltip: example(
    "Hover or focus the trigger to reveal its description.",
    () => (
      <C.TooltipProvider>
        <C.Tooltip>
          <C.TooltipTrigger render={<C.Button variant="outline" />}>
            Keyboard shortcut
          </C.TooltipTrigger>
          <C.TooltipContent>Press Control K</C.TooltipContent>
        </C.Tooltip>
      </C.TooltipProvider>
    ),
    "button",
    [{ target: "button", event: "hover", expect: '[role="tooltip"]', text: "Press Control K" }],
  ),
  Sheet: example(
    "Open a side sheet with a named heading.",
    () => (
      <C.Sheet>
        <C.SheetTrigger render={<C.Button variant="outline" />}>Open sheet</C.SheetTrigger>
        <C.SheetContent>
          <C.SheetTitle>Document settings</C.SheetTitle>
          <C.SheetDescription>Settings stay local to this example.</C.SheetDescription>
        </C.SheetContent>
      </C.Sheet>
    ),
    "button",
    [click("button", '[role="dialog"]', "Document settings")],
  ),
  Separator: example(
    "A semantic separator divides related content.",
    () => (
      <>
        <p>Before</p>
        <C.Separator decorative={false} />
        <p>After</p>
      </>
    ),
    '[role="separator"]',
  ),
  Avatar: example(
    "Initials are shown when an image is unavailable.",
    () => <C.Avatar alt="Example Reader" fallback="ER" />,
    ".fux-avatar-fallback",
  ),
  Drawer: example(
    "Open a drawer with a title and dismissal action.",
    () => (
      <C.Drawer>
        <C.DrawerTrigger render={<C.Button variant="outline" />}>Open drawer</C.DrawerTrigger>
        <C.DrawerContent>
          <C.DrawerTitle>Quick actions</C.DrawerTitle>
          <C.DrawerDescription>Choose a document action.</C.DrawerDescription>
        </C.DrawerContent>
      </C.Drawer>
    ),
    "button",
    [click("button", '[role="dialog"]', "Quick actions")],
  ),
  FloatingPanel: example(
    "Open a panel, then move or resize it with its keyboard controls.",
    () => (
      <C.FloatingPanel title="Scratchpad" trigger="Open scratchpad">
        <C.Field label="Quick note" />
      </C.FloatingPanel>
    ),
    "button",
    [click("button", '[role="dialog"]', "Scratchpad")],
  ),
  HoverCard: example(
    "Focus the profile link to reveal a preview.",
    () => (
      <C.HoverCard>
        <C.HoverCardTrigger render={<C.Button variant="outline" />}>
          Profile preview
        </C.HoverCardTrigger>
        <C.HoverCardContent>
          <p>Example Reader</p>
          <p>A synthetic profile.</p>
        </C.HoverCardContent>
      </C.HoverCard>
    ),
    "button",
    [
      {
        target: "button",
        event: "focus",
        expect: '[data-slot="hover-card-content"]',
        text: "Example Reader",
      },
    ],
  ),
  ImageCropper: example(
    "Adjust image zoom or rotation.",
    (s) => (
      <C.ImageCropper
        src={svgImage}
        alt="Geometric landscape"
        onValueChange={(value) => s.report(`Zoom ${value.zoom.toFixed(2)}`)}
      />
    ),
    'section[aria-label="Crop Geometric landscape"]',
    [key('input[type="range"]', "ArrowRight", ".fixture-status", "Zoom 1.05")],
  ),
  ScrollArea: example(
    "Scroll the bounded list of notes.",
    () => (
      <C.ScrollArea className="h-40">
        <div className="fux-stack">
          {Array.from({ length: 15 }, (_, index) => (
            <p key={index}>Note {index + 1}</p>
          ))}
        </div>
      </C.ScrollArea>
    ),
    '[data-slot="scroll-area-viewport"]',
  ),
  SignaturePad: example(
    "Draw a signature or switch to keyboard entry.",
    (s) => (
      <C.SignaturePad
        label="Signature"
        onValueChange={(value) =>
          s.report(value.mode === "type" ? value.text : `${value.strokes.length} strokes`)
        }
      />
    ),
    'canvas[aria-label="Signature drawing surface"]',
    [click('button[aria-pressed="false"]:nth-child(2)', "input"), input("input", "Example Reader")],
  ),
  Splitter: example(
    "Drag the divider or use its arrow keys to resize panels.",
    () => (
      <C.Splitter.Root style={{ minHeight: 160 }}>
        <C.Splitter.Panel defaultSize={50}>
          <C.Panel>Outline</C.Panel>
        </C.Splitter.Panel>
        <C.Splitter.Handle />
        <C.Splitter.Panel defaultSize={50}>
          <C.Panel>Details</C.Panel>
        </C.Splitter.Panel>
      </C.Splitter.Root>
    ),
    '[role="separator"]',
  ),
  Toast: example(
    "Show a transient notification.",
    () => (
      <>
        <C.Button onClick={() => C.toast("Saved example")}>Show toast</C.Button>
        <C.Toast />
      </>
    ),
    "button",
    [click("button", "[data-sonner-toast]", "Saved example")],
  ),
  Tour: example(
    "Step through a short guided introduction.",
    () => (
      <C.Tour
        steps={[
          { id: "start", title: "Welcome", description: "Start with a document." },
          { id: "finish", title: "All set", description: "Your notebook is ready." },
        ]}
      />
    ),
    "button",
    [click("button", '[role="dialog"]', "Welcome")],
  ),
};
