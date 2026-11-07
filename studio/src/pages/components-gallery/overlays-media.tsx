// Gallery demos: Toggles, overlays, layout surfaces, media and toasts (overlays.tsx, media.tsx).
import * as React from "react";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArchiveIcon,
  BellIcon,
  BoldIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  FilterIcon,
  FolderInputIcon,
  ItalicIcon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
  UnderlineIcon,
  UserIcon,
  Undo2Icon,
} from "lucide-react";
import * as C from "@samhagman/fast-ux-kit/components";
import type { SignatureValue } from "@samhagman/fast-ux-kit/components";
import {
  example,
  click,
  input,
  key,
  svgImage,
  Variants,
  type ComponentFixture,
} from "./fixture-kit";

/** Small, flat avatar artwork so the demos need no network. */
const avatarArt = (hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 32% 78%)"/><circle cx="32" cy="25" r="11" fill="hsl(${hue} 30% 38%)"/><path d="M10 64c2-15 12-22 22-22s20 7 22 22z" fill="hsl(${hue} 30% 38%)"/></svg>`,
  )}`;

/** The main example sits in a row so a lone button keeps its natural width. */
function Main({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-start gap-3">{children}</div>;
}
const cancel = <C.DialogClose render={<C.Button variant="outline" />}>Cancel</C.DialogClose>;
const sheetCancel = <C.SheetClose render={<C.Button variant="outline" />}>Cancel</C.SheetClose>;

// ---------------------------------------------------------------- toggles

function StarToggle() {
  const [starred, setStarred] = React.useState(false);
  return (
    <C.ToggleButton variant="outline" pressed={starred} onPressedChange={setStarred}>
      <StarIcon className={starred ? "fill-current" : undefined} />
      {starred ? "Starred" : "Star"}
      <span className="font-mono text-xs tabular-nums opacity-70">{starred ? 13 : 12}</span>
    </C.ToggleButton>
  );
}

// ---------------------------------------------------------------- dialogs

function ModalDemo({
  trigger,
  title,
  description,
  size,
  variant,
  children,
  confirm,
  needs,
}: {
  trigger: string;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "destructive";
  children: React.ReactNode;
  confirm: string;
  needs?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  return (
    <>
      <C.Button variant="outline" onClick={() => setOpen(true)}>
        {trigger}
      </C.Button>
      <C.ModalDialog
        title={title}
        description={description}
        size={size}
        variant={variant}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setTyped("");
        }}
        footer={
          <>
            <C.Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </C.Button>
            <C.Button
              variant={variant === "destructive" ? "destructive" : "default"}
              disabled={Boolean(needs) && typed !== needs}
              onClick={() => setOpen(false)}
            >
              {confirm}
            </C.Button>
          </>
        }
      >
        {children}
        {needs && (
          <C.Field
            className="mt-3"
            label={`Type ${needs} to confirm`}
            value={typed}
            onValueChange={setTyped}
          />
        )}
      </C.ModalDialog>
    </>
  );
}

const releaseNotes = Array.from({ length: 16 }, (_, index) => ({
  version: `2.${16 - index}.0`,
  note: [
    "Timeline rows keep their place while the list reloads.",
    "Exports include comment threads and attachments.",
    "Keyboard shortcuts are listed in the command palette.",
    "Archived projects no longer count toward the plan limit.",
  ][index % 4],
}));

function EditProjectDialog({ size, label }: { size?: string; label: string }) {
  return (
    <C.Dialog>
      <C.DialogTrigger render={<C.Button variant="outline" />}>{label}</C.DialogTrigger>
      <C.DialogContent className={size}>
        <C.DialogHeader>
          <C.DialogTitle>Edit project</C.DialogTitle>
          <C.DialogDescription>
            Changes apply to everyone working in this project.
          </C.DialogDescription>
        </C.DialogHeader>
        <div className="flex flex-col gap-3">
          <C.Field label="Project name" defaultValue="Spring release plan" />
          <C.TextArea
            label="Summary"
            hint="Shown at the top of the project page."
            defaultValue="Milestones, owners and open risks for the spring release."
          />
        </div>
        <C.DialogFooter>
          {cancel}
          <C.DialogClose render={<C.Button />}>Save changes</C.DialogClose>
        </C.DialogFooter>
      </C.DialogContent>
    </C.Dialog>
  );
}

// ---------------------------------------------------------------- sheets and drawers

function SettingsBody() {
  return (
    <div className="fux-scroll-shadow flex min-h-0 flex-1 flex-col gap-4 px-4">
      <C.Field label="Project name" defaultValue="Spring release plan" />
      <C.TextArea
        label="Description"
        defaultValue="Milestones, owners and open risks for the spring release."
      />
      <C.Separator>Notifications</C.Separator>
      <C.Switch label="Email me when a task is assigned" defaultChecked />
      <C.Switch label="Daily summary at 9:00" />
      <C.Switch label="Notify on comments in threads I follow" defaultChecked />
      <C.Separator>Danger zone</C.Separator>
      <p className="text-sm text-muted-foreground">
        Archiving hides the project from search. You can restore it for 30 days.
      </p>
      <C.Button variant="destructive" className="self-start">
        <ArchiveIcon data-icon="inline-start" />
        Archive project
      </C.Button>
    </div>
  );
}

function SettingsSheet({
  label,
  side,
  size,
}: {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <C.Sheet>
      <C.SheetTrigger render={<C.Button variant="outline" />}>{label}</C.SheetTrigger>
      <C.SheetContent side={side} size={size}>
        <C.SheetHeader className="border-b pe-12">
          <C.SheetTitle>Project settings</C.SheetTitle>
          <C.SheetDescription>Settings stay local to this example.</C.SheetDescription>
        </C.SheetHeader>
        <SettingsBody />
        <C.SheetFooter className="flex-row justify-end border-t">
          {sheetCancel}
          <C.SheetClose render={<C.Button />}>Save</C.SheetClose>
        </C.SheetFooter>
      </C.SheetContent>
    </C.Sheet>
  );
}

const drawerActions = [
  { icon: CopyIcon, label: "Copy link" },
  { icon: FolderInputIcon, label: "Move to folder" },
  { icon: StarIcon, label: "Add to favourites" },
  { icon: ArchiveIcon, label: "Archive", destructive: true },
];

function ActionsDrawer({
  label,
  direction,
}: {
  label: string;
  direction?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <C.Drawer direction={direction}>
      <C.DrawerTrigger render={<C.Button variant="outline" />}>{label}</C.DrawerTrigger>
      <C.DrawerContent>
        <C.DrawerHeader>
          <C.DrawerTitle>Quick actions</C.DrawerTitle>
          <C.DrawerDescription>Choose a document action.</C.DrawerDescription>
        </C.DrawerHeader>
        <ul className="flex flex-col gap-0.5 px-2">
          {drawerActions.map(({ icon: Icon, label: action, destructive }) => (
            <li key={action}>
              <C.DrawerClose
                render={
                  <C.Button
                    variant="ghost"
                    className={
                      destructive
                        ? "h-10 w-full justify-start gap-3 text-destructive hover:text-destructive"
                        : "h-10 w-full justify-start gap-3"
                    }
                  />
                }
              >
                <Icon />
                {action}
              </C.DrawerClose>
            </li>
          ))}
        </ul>
        <C.DrawerFooter>
          <C.DrawerClose render={<C.Button variant="outline" />}>Cancel</C.DrawerClose>
        </C.DrawerFooter>
      </C.DrawerContent>
    </C.Drawer>
  );
}

// ---------------------------------------------------------------- scroll area

const notes = [
  ["Kickoff agenda", "Today"],
  ["Risk register review", "Today"],
  ["Vendor quote comparison", "Yesterday"],
  ["Launch checklist", "Yesterday"],
  ["Retro: sprint 14", "Mon"],
  ["Pricing page copy", "Mon"],
  ["Interview notes: onboarding", "Fri"],
  ["Support themes, March", "Fri"],
  ["Roadmap draft v3", "Thu"],
  ["Accessibility audit findings", "Thu"],
  ["Data export edge cases", "Wed"],
  ["Release train calendar", "Wed"],
  ["Budget assumptions", "Tue"],
  ["Customer call summary", "Tue"],
  ["Team offsite ideas", "Mon"],
] as const;

// ---------------------------------------------------------------- signature

const strokePoints = Array.from({ length: 36 }, (_, index) => ({
  x: 40 + index * 7,
  y: 96 + Math.sin(index / 3.2) * 34 - index * 0.6,
  pressure: 0.5,
  time: index * 16,
}));
const drawnSignature: SignatureValue = {
  mode: "draw",
  text: "",
  width: 320,
  height: 176,
  strokes: [
    {
      dotSize: 0,
      minWidth: 0.5,
      maxWidth: 2.5,
      penColor: "black",
      velocityFilterWeight: 0.7,
      compositeOperation: "source-over",
      points: strokePoints,
    },
  ],
};

// ---------------------------------------------------------------- splitter

/** Splitter groups fill their parent's height, so the frame carries the fixed size. */
function Frame({ children }: { children: React.ReactNode }) {
  return <div className="h-56 w-full overflow-hidden rounded-xl border bg-card">{children}</div>;
}

function Pane({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="border-b px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">{children}</div>
    </div>
  );
}
const outline = ["Overview", "Milestones", "Risks", "Decisions", "Open questions"];

// ---------------------------------------------------------------- tour

const tourSteps = [
  {
    id: "search",
    title: "Find anything",
    description: "Search across projects, tasks and notes from one place.",
    target: () => document.querySelector<HTMLElement>('[data-tour="search"]'),
  },
  {
    id: "filters",
    title: "Narrow the list",
    description: "Filters stay with the view, so teammates see the same thing.",
    target: () => document.querySelector<HTMLElement>('[data-tour="filters"]'),
  },
  {
    id: "new",
    title: "Start a project",
    description: "Create a blank project or begin from one of your templates.",
    target: () => document.querySelector<HTMLElement>('[data-tour="new"]'),
  },
  { id: "done", title: "All set", description: "Your workspace is ready." },
];

// ---------------------------------------------------------------- toasts

const toastId = "gallery";
const tone = (name: string) => ({ classNames: { icon: `mt-0.5 ${name}` }, toasterId: toastId });

export const overlaysMediaFixtures: Readonly<Record<string, ComponentFixture>> = {
  ToggleButton: example(
    "Toggle emphasis with a pointer or Space.",
    (s) => (
      <>
        <Main>
          <C.ToggleButton variant="outline" onPressedChange={s.report}>
            <BoldIcon />
            Emphasis
          </C.ToggleButton>
        </Main>
        <Variants title="Variants">
          <C.ToggleButton aria-label="Italic">
            <ItalicIcon />
          </C.ToggleButton>
          <C.ToggleButton variant="outline" defaultPressed aria-label="Underline">
            <UnderlineIcon />
          </C.ToggleButton>
          <StarToggle />
        </Variants>
        <Variants title="Sizes">
          <C.ToggleButton variant="outline" size="sm">
            Small
          </C.ToggleButton>
          <C.ToggleButton variant="outline">Default</C.ToggleButton>
          <C.ToggleButton variant="outline" size="lg">
            Large
          </C.ToggleButton>
        </Variants>
        <Variants title="States">
          <C.ToggleButton variant="outline">Off</C.ToggleButton>
          <C.ToggleButton variant="outline" defaultPressed>
            On
          </C.ToggleButton>
          <C.ToggleButton variant="outline" disabled>
            Disabled
          </C.ToggleButton>
          <C.ToggleButton variant="outline" disabled defaultPressed>
            Disabled on
          </C.ToggleButton>
          <C.ToggleButton variant="outline" aria-invalid>
            Invalid
          </C.ToggleButton>
        </Variants>
      </>
    ),
    'button[aria-pressed="false"]',
    [click("button", 'button[aria-pressed="true"]')],
  ),
  ToggleButtonGroup: example(
    "Choose an alignment.",
    (s) => (
      <>
        <C.ToggleButtonGroup defaultValue={["left"]} onValueChange={s.report}>
          <C.ToggleButtonGroupItem value="left" aria-label="Align left">
            <AlignLeftIcon />
            Left
          </C.ToggleButtonGroupItem>
          <C.ToggleButtonGroupItem value="center" aria-label="Align center">
            <AlignCenterIcon />
            Center
          </C.ToggleButtonGroupItem>
          <C.ToggleButtonGroupItem value="right" aria-label="Align right">
            <AlignRightIcon />
            Right
          </C.ToggleButtonGroupItem>
        </C.ToggleButtonGroup>
        <Variants title="Multiple selection">
          <C.ToggleButtonGroup multiple defaultValue={["bold", "underline"]}>
            <C.ToggleButtonGroupItem value="bold" aria-label="Bold">
              <BoldIcon />
            </C.ToggleButtonGroupItem>
            <C.ToggleButtonGroupItem value="italic" aria-label="Italic">
              <ItalicIcon />
            </C.ToggleButtonGroupItem>
            <C.ToggleButtonGroupItem value="underline" aria-label="Underline">
              <UnderlineIcon />
            </C.ToggleButtonGroupItem>
          </C.ToggleButtonGroup>
        </Variants>
        <Variants title="Sizes">
          {(["sm", "default", "lg"] as const).map((size) => (
            <C.ToggleButtonGroup key={size} size={size} defaultValue={["week"]}>
              <C.ToggleButtonGroupItem value="day">Day</C.ToggleButtonGroupItem>
              <C.ToggleButtonGroupItem value="week">Week</C.ToggleButtonGroupItem>
              <C.ToggleButtonGroupItem value="month">Month</C.ToggleButtonGroupItem>
            </C.ToggleButtonGroup>
          ))}
        </Variants>
        <Variants title="Separated, vertical and disabled">
          <C.ToggleButtonGroup variant="outline" spacing={2} defaultValue={["list"]}>
            <C.ToggleButtonGroupItem value="list">List</C.ToggleButtonGroupItem>
            <C.ToggleButtonGroupItem value="board">Board</C.ToggleButtonGroupItem>
            <C.ToggleButtonGroupItem value="timeline">Timeline</C.ToggleButtonGroupItem>
          </C.ToggleButtonGroup>
          <C.ToggleButtonGroup orientation="vertical" defaultValue={["all"]}>
            <C.ToggleButtonGroupItem value="all">All</C.ToggleButtonGroupItem>
            <C.ToggleButtonGroupItem value="mine">Mine</C.ToggleButtonGroupItem>
          </C.ToggleButtonGroup>
          <C.ToggleButtonGroup disabled defaultValue={["left"]}>
            <C.ToggleButtonGroupItem value="left">Left</C.ToggleButtonGroupItem>
            <C.ToggleButtonGroupItem value="right">Right</C.ToggleButtonGroupItem>
          </C.ToggleButtonGroup>
        </Variants>
      </>
    ),
    '[data-slot="toggle-group"]',
    [click('[data-slot="toggle-group-item"]:nth-child(2)', ".fixture-status", "center")],
  ),
  Dialog: example(
    "Open a dialog with a header, a form body and footer actions.",
    () => (
      <>
        <Main>
          <EditProjectDialog label="Open dialog" />
        </Main>
        <Variants title="Sizes">
          <EditProjectDialog label="Compact" size="sm:max-w-xs" />
          <EditProjectDialog label="Default" />
          <EditProjectDialog label="Wide" size="sm:max-w-2xl" />
        </Variants>
        <Variants title="Long content">
          <C.Dialog>
            <C.DialogTrigger render={<C.Button variant="outline" />}>Release notes</C.DialogTrigger>
            <C.DialogContent>
              <C.DialogHeader>
                <C.DialogTitle>Release notes</C.DialogTitle>
                <C.DialogDescription>Recent changes, newest first.</C.DialogDescription>
              </C.DialogHeader>
              <ol className="fux-dialog-body flex flex-col gap-3">
                {releaseNotes.map((item) => (
                  <li key={item.version} className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {item.version}
                    </span>
                    <span>{item.note}</span>
                  </li>
                ))}
              </ol>
              <C.DialogFooter showCloseButton />
            </C.DialogContent>
          </C.Dialog>
          <C.Dialog>
            <C.DialogTrigger render={<C.Button variant="outline" />}>
              Without close icon
            </C.DialogTrigger>
            <C.DialogContent showCloseButton={false}>
              <C.DialogHeader>
                <C.DialogTitle>Accept the new terms</C.DialogTitle>
                <C.DialogDescription>
                  Continue once you have read the updated usage terms.
                </C.DialogDescription>
              </C.DialogHeader>
              <C.DialogFooter>
                <C.DialogClose render={<C.Button />}>I agree</C.DialogClose>
              </C.DialogFooter>
            </C.DialogContent>
          </C.Dialog>
        </Variants>
      </>
    ),
    "button",
    [click("button", '[role="dialog"]', "Edit project")],
  ),
  ModalDialog: example(
    "Open and dismiss a controlled modal.",
    (s) => (
      <>
        <Main>
          <C.Button onClick={() => s.setOpen(true)}>Open modal</C.Button>
        </Main>
        <C.ModalDialog
          title="Publish release"
          description="Everyone with access will see version 2.4 straight away."
          open={s.open}
          onOpenChange={s.setOpen}
          footer={
            <>
              <C.Button variant="outline" onClick={() => s.setOpen(false)}>
                Cancel
              </C.Button>
              <C.Button onClick={() => s.setOpen(false)}>Publish</C.Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            You can unpublish from the release page at any time. Subscribers are emailed once.
          </p>
        </C.ModalDialog>
        <Variants title="Destructive confirmation">
          <ModalDemo
            trigger="Delete project"
            title="Delete this project?"
            description="This permanently removes the project and its 48 tasks."
            variant="destructive"
            confirm="Delete project"
            needs="spring-release"
          >
            <p className="text-sm text-muted-foreground">
              Attachments and comments are deleted too. This cannot be undone.
            </p>
          </ModalDemo>
          <ModalDemo
            trigger="Remove member"
            title="Remove Avery from the team?"
            description="They lose access to every project in this workspace."
            variant="destructive"
            size="sm"
            confirm="Remove"
          >
            <p className="text-sm text-muted-foreground">Their assigned tasks become unassigned.</p>
          </ModalDemo>
        </Variants>
        <Variants title="Sizes and scrolling body">
          <ModalDemo trigger="Small" size="sm" title="Rename view" confirm="Rename">
            <C.Field label="View name" defaultValue="Open risks" />
          </ModalDemo>
          <ModalDemo
            trigger="Large, long body"
            size="lg"
            title="Changelog"
            description="Everything that changed since the last major version."
            confirm="Done"
          >
            <ol className="flex flex-col gap-3">
              {releaseNotes.map((item) => (
                <li key={item.version} className="flex gap-3">
                  <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {item.version}
                  </span>
                  <span className="text-sm">{item.note}</span>
                </li>
              ))}
            </ol>
          </ModalDemo>
        </Variants>
      </>
    ),
    "button",
    [click("button", '[role="dialog"]', "Publish release")],
  ),
  Popover: example(
    "Open contextual content beside its trigger.",
    () => (
      <>
        <Main>
          <C.Popover>
            <C.PopoverTrigger render={<C.Button variant="outline" />}>
              <LinkIcon data-icon="inline-start" />
              Share
            </C.PopoverTrigger>
            <C.PopoverContent className="w-96 max-w-[calc(100vw-2rem)]" align="start">
              <C.PopoverHeader>
                <C.PopoverTitle>Share this project</C.PopoverTitle>
                <C.PopoverDescription>Anyone with the link can view it.</C.PopoverDescription>
              </C.PopoverHeader>
              <div className="flex items-end gap-2">
                <C.Field
                  className="min-w-0 flex-1"
                  label="Link"
                  readOnly
                  defaultValue="https://example.test/p/spring-release"
                />
                <C.Button variant="outline" size="icon" aria-label="Copy link">
                  <CopyIcon />
                </C.Button>
              </div>
            </C.PopoverContent>
          </C.Popover>
        </Main>
        <Variants title="Placement">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <C.Popover key={side}>
              <C.PopoverTrigger render={<C.Button variant="outline" size="sm" />}>
                {side}
              </C.PopoverTrigger>
              <C.PopoverContent side={side} className="w-44">
                <p className="text-center text-sm">Opens {side}</p>
              </C.PopoverContent>
            </C.Popover>
          ))}
        </Variants>
        <Variants title="With a form">
          <C.Popover>
            <C.PopoverTrigger render={<C.Button variant="outline" />}>
              <BellIcon data-icon="inline-start" />
              Notifications
            </C.PopoverTrigger>
            <C.PopoverContent className="w-72" align="start">
              <C.PopoverHeader>
                <C.PopoverTitle>Notify me about</C.PopoverTitle>
              </C.PopoverHeader>
              <div className="flex flex-col gap-3">
                <C.Switch label="Assignments" defaultChecked />
                <C.Switch label="Comments" defaultChecked />
                <C.Switch label="Due dates" />
              </div>
            </C.PopoverContent>
          </C.Popover>
        </Variants>
      </>
    ),
    "button",
    [click("button", '[role="dialog"]', "Share this project")],
  ),
  Tooltip: example(
    "Hover or focus the trigger to reveal its description.",
    () => (
      <C.TooltipProvider>
        <Main>
          <C.Tooltip>
            <C.TooltipTrigger render={<C.Button variant="outline" />}>
              <SearchIcon data-icon="inline-start" />
              Command palette
            </C.TooltipTrigger>
            <C.TooltipContent shortcut={["⌘", "K"]}>Open the palette</C.TooltipContent>
          </C.Tooltip>
        </Main>
        <Variants title="Icon buttons with shortcuts">
          {[
            { icon: BoldIcon, label: "Bold", keys: ["⌘", "B"] },
            { icon: ItalicIcon, label: "Italic", keys: ["⌘", "I"] },
            { icon: LinkIcon, label: "Insert link", keys: ["⌘", "⇧", "K"] },
          ].map(({ icon: Icon, label, keys }) => (
            <C.Tooltip key={label}>
              <C.TooltipTrigger
                render={<C.Button variant="outline" size="icon" aria-label={label} />}
              >
                <Icon />
              </C.TooltipTrigger>
              <C.TooltipContent shortcut={keys}>{label}</C.TooltipContent>
            </C.Tooltip>
          ))}
        </Variants>
        <Variants title="Sides">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <C.Tooltip key={side}>
              <C.TooltipTrigger render={<C.Button variant="ghost" size="sm" />}>
                {side}
              </C.TooltipTrigger>
              <C.TooltipContent side={side}>On the {side}</C.TooltipContent>
            </C.Tooltip>
          ))}
        </Variants>
        <Variants title="Long text and a disabled control">
          <C.Tooltip>
            <C.TooltipTrigger render={<C.Button variant="outline" />}>
              Why is this slow?
            </C.TooltipTrigger>
            <C.TooltipContent className="text-pretty">
              Large exports run in the background and are emailed when they finish, usually within a
              few minutes.
            </C.TooltipContent>
          </C.Tooltip>
          <C.Tooltip>
            <C.TooltipTrigger
              render={
                <span
                  tabIndex={0}
                  className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              }
            >
              <C.Button variant="outline" disabled>
                Publish
              </C.Button>
            </C.TooltipTrigger>
            <C.TooltipContent>Resolve 2 open comments to publish</C.TooltipContent>
          </C.Tooltip>
        </Variants>
      </C.TooltipProvider>
    ),
    "button",
    [{ target: "button", event: "hover", expect: '[role="tooltip"]', text: "Open the palette" }],
  ),
  Sheet: example(
    "Open a side sheet with a header, scrolling body and footer actions.",
    () => (
      <>
        <Main>
          <SettingsSheet label="Open sheet" />
        </Main>
        <Variants title="Sides">
          {(["right", "left", "top", "bottom"] as const).map((side) => (
            <SettingsSheet key={side} label={side} side={side} />
          ))}
        </Variants>
        <Variants title="Sizes">
          {(["sm", "md", "lg"] as const).map((size) => (
            <SettingsSheet key={size} label={size} size={size} />
          ))}
        </Variants>
      </>
    ),
    "button",
    [click("button", '[role="dialog"]', "Project settings")],
  ),
  Separator: example(
    "A semantic separator divides related content.",
    () => (
      <>
        <div className="flex max-w-sm flex-col gap-3 rounded-xl border bg-card p-4 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">Invoice INV-2028-014</span>
            <span className="font-mono text-xs text-muted-foreground">Due 12 Feb 2028</span>
          </div>
          <C.Separator decorative={false} />
          {[
            ["Design review", "1,200.00"],
            ["Prototype build", "3,400.00"],
          ].map(([name, amount]) => (
            <div key={name} className="flex justify-between">
              <span className="text-muted-foreground">{name}</span>
              <span className="tabular-nums">{amount}</span>
            </div>
          ))}
          <C.Separator />
          <div className="flex justify-between font-medium">
            <span>Total</span>
            <span className="tabular-nums">4,600.00</span>
          </div>
        </div>
        <Variants title="Labelled" layout="stack">
          <div className="flex w-full max-w-sm flex-col gap-3">
            <C.Button variant="outline">Continue with single sign-on</C.Button>
            <C.Separator>or</C.Separator>
            <C.Field label="Work email" />
          </div>
        </Variants>
        <Variants title="Vertical">
          <div className="flex h-5 items-center gap-3 text-sm">
            <span>Overview</span>
            <C.Separator orientation="vertical" />
            <span>Activity</span>
            <C.Separator orientation="vertical" />
            <span className="text-muted-foreground">Files</span>
          </div>
        </Variants>
      </>
    ),
    '[role="separator"]',
  ),
  Avatar: example(
    "Initials are shown when an image is unavailable.",
    () => (
      <>
        <C.Avatar alt="Example Reader" fallback="ER" />
        <Variants title="Sizes">
          {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
            <C.Avatar key={size} size={size} alt="Avery Lindqvist" src={avatarArt(200)} />
          ))}
        </Variants>
        <Variants title="Fallbacks">
          <C.Avatar alt="Avery Lindqvist" src="/missing-avatar.png" size="lg" />
          <C.Avatar alt="Noor" size="lg" />
          <C.Avatar
            alt="Guest"
            size="lg"
            src="/missing-avatar.png"
            fallback={<UserIcon className="size-1/2" />}
          />
        </Variants>
        <Variants title="Status">
          {(["online", "away", "busy", "offline"] as const).map((status, index) => (
            <C.Avatar
              key={status}
              size="lg"
              status={status}
              alt="Teammate"
              src={avatarArt(30 + index * 70)}
            />
          ))}
        </Variants>
        <Variants title="Group" layout="stack">
          <C.AvatarGroup label="Project members" max={4}>
            {[200, 20, 140, 300, 80, 250].map((hue) => (
              <C.Avatar key={hue} alt="Member" src={avatarArt(hue)} />
            ))}
          </C.AvatarGroup>
          <C.AvatarGroup label="Reviewers" size="sm">
            <C.Avatar alt="Mira Soto" src="/missing-avatar.png" />
            <C.Avatar alt="Jonas Pike" src="/missing-avatar.png" />
            <C.Avatar alt="Tamsin Reyes" src="/missing-avatar.png" />
          </C.AvatarGroup>
          <div className="flex items-center gap-3">
            <C.Avatar alt="Avery Lindqvist" src={avatarArt(200)} status="online" />
            <div className="flex flex-col text-sm leading-tight">
              <span className="font-medium">Avery Lindqvist</span>
              <span className="text-xs text-muted-foreground">Product designer</span>
            </div>
          </div>
        </Variants>
      </>
    ),
    '[data-slot="avatar-fallback"]',
  ),
  Drawer: example(
    "Open a drawer with a title and dismissal action.",
    () => (
      <>
        <Main>
          <ActionsDrawer label="Open drawer" />
        </Main>
        <Variants title="Directions">
          {(["right", "left", "top"] as const).map((direction) => (
            <ActionsDrawer key={direction} label={direction} direction={direction} />
          ))}
        </Variants>
      </>
    ),
    "button",
    [click("button", '[role="dialog"]', "Quick actions")],
  ),
  FloatingPanel: example(
    "Open a panel, then drag its header, or move and resize it with the keyboard controls.",
    () => (
      <>
        <Main>
          <C.FloatingPanel
            title="Scratchpad"
            trigger="Open scratchpad"
            defaultPosition={{ x: 560, y: 140 }}
          >
            <C.TextArea label="Quick note" rows={4} />
          </C.FloatingPanel>
        </Main>
        <Variants title="Other panels">
          <C.FloatingPanel
            title="Inspector"
            trigger="Inspector"
            defaultPosition={{ x: 600, y: 200 }}
            defaultSize={{ width: 300, height: 240 }}
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {[
                ["Owner", "Avery"],
                ["Status", "In review"],
                ["Due", "12 Feb 2028"],
                ["Estimate", "3 days"],
              ].map(([term, value]) => (
                <React.Fragment key={term}>
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd>{value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </C.FloatingPanel>
          <C.FloatingPanel
            title="Timer"
            trigger="Compact panel"
            defaultPosition={{ x: 640, y: 260 }}
            defaultSize={{ width: 220, height: 140 }}
          >
            <p className="text-center font-mono text-3xl tabular-nums">24:59</p>
          </C.FloatingPanel>
        </Variants>
      </>
    ),
    "button",
    [click("button", '[role="dialog"]', "Scratchpad")],
  ),
  HoverCard: example(
    "Focus the profile link to reveal a preview.",
    () => (
      <>
        <Main>
          <C.HoverCard>
            <C.HoverCardTrigger render={<C.Button variant="link" className="px-1" />}>
              @avery
            </C.HoverCardTrigger>
            <C.HoverCardContent>
              <div className="flex gap-3">
                <C.Avatar size="lg" alt="Avery Lindqvist" src={avatarArt(200)} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-sm font-medium">Avery Lindqvist</p>
                  <p className="text-xs text-muted-foreground">@avery</p>
                </div>
              </div>
              <p className="text-sm text-pretty">
                Designs onboarding flows and keeps the component library honest.
              </p>
              <p className="text-xs text-muted-foreground">Joined March 2027 · 14 projects</p>
            </C.HoverCardContent>
          </C.HoverCard>
        </Main>
        <Variants title="File preview">
          <C.HoverCard>
            <C.HoverCardTrigger render={<C.Button variant="outline" />}>
              <FileTextIcon data-icon="inline-start" />
              roadmap-v3.pdf
            </C.HoverCardTrigger>
            <C.HoverCardContent className="w-64 p-0">
              <img
                src={svgImage}
                alt=""
                className="aspect-video w-full rounded-t-lg border-b object-cover"
              />
              <div className="flex flex-col gap-0.5 p-3">
                <p className="truncate text-sm font-medium">roadmap-v3.pdf</p>
                <p className="text-xs text-muted-foreground">PDF · 2.4 MB · 18 pages</p>
                <p className="text-xs text-muted-foreground">Edited 2 hours ago by Avery</p>
              </div>
            </C.HoverCardContent>
          </C.HoverCard>
          <C.HoverCard>
            <C.HoverCardTrigger href="#/components">
              <span className="text-sm underline underline-offset-4">Release plan</span>
            </C.HoverCardTrigger>
            <C.HoverCardContent side="right" className="w-56">
              <p className="text-sm font-medium">Spring release plan</p>
              <p className="text-xs text-muted-foreground">48 tasks · 6 open risks</p>
            </C.HoverCardContent>
          </C.HoverCard>
        </Variants>
      </>
    ),
    "button",
    [
      {
        target: "button",
        event: "focus",
        expect: '[data-slot="hover-card-content"]',
        text: "Avery Lindqvist",
      },
    ],
  ),
  ImageCropper: example(
    "Adjust image zoom or rotation.",
    (s) => (
      <>
        <C.ImageCropper
          src={svgImage}
          alt="Geometric landscape"
          aspect={4 / 3}
          onValueChange={(value) => s.report(`Zoom ${value.zoom.toFixed(2)}`)}
          onExport={(blob) => s.report(`Exported ${blob.size} bytes`)}
        />
        <Variants title="Aspect ratios" layout="grid">
          <C.ImageCropper src={svgImage} alt="Profile photo" aspect={1} />
          <C.ImageCropper src={svgImage} alt="Banner" aspect={3} />
        </Variants>
        <Variants title="Image that fails to load" layout="stack">
          <C.ImageCropper className="w-full" src="/missing-photo.png" alt="Missing photo" />
        </Variants>
      </>
    ),
    'section[aria-label="Crop Geometric landscape"]',
    [key('input[type="range"]', "ArrowRight", ".fixture-status", "Zoom 1.05")],
  ),
  ScrollArea: example(
    "Scroll the bounded list of notes.",
    () => (
      <>
        <C.ScrollArea className="h-56 max-w-sm rounded-xl border bg-card">
          <div className="sticky top-0 z-10 border-b bg-card/95 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase backdrop-blur">
            Notes ({notes.length})
          </div>
          <ul>
            {notes.map(([title, when]) => (
              <li
                key={title}
                className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0"
              >
                <span className="truncate">{title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
              </li>
            ))}
          </ul>
        </C.ScrollArea>
        <Variants title="Horizontal" layout="stack">
          <C.ScrollArea
            orientation="horizontal"
            className="w-full max-w-sm rounded-xl border bg-card"
          >
            <div className="flex w-max gap-3 p-3 pb-4">
              {["Planning", "Design", "Build", "Review", "Launch", "Retro", "Archive"].map(
                (stage) => (
                  <div key={stage} className="w-28 rounded-lg border bg-background p-3 text-sm">
                    <p className="font-medium">{stage}</p>
                    <p className="text-xs text-muted-foreground">4 tasks</p>
                  </div>
                ),
              )}
            </div>
          </C.ScrollArea>
        </Variants>
        <Variants title="Both directions" layout="stack">
          <C.ScrollArea
            orientation="both"
            className="h-32 w-full max-w-sm rounded-xl border bg-card"
          >
            <pre className="w-max p-3 font-mono text-xs leading-5">
              {notes
                .map(
                  ([title, when], index) =>
                    `${String(index + 1).padStart(2, "0")}  ${title.padEnd(34)} ${when.padEnd(12)} owner=avery status=open`,
                )
                .join("\n")}
            </pre>
          </C.ScrollArea>
        </Variants>
        <Variants title="Short content" layout="stack">
          <C.ScrollArea className="h-24 w-full max-w-sm rounded-xl border bg-card">
            <p className="p-3 text-sm text-muted-foreground">Nothing to scroll here.</p>
          </C.ScrollArea>
        </Variants>
      </>
    ),
    '[data-slot="scroll-area-viewport"]',
  ),
  SignaturePad: example(
    "Draw a signature or switch to keyboard entry.",
    (s) => (
      <>
        <C.SignaturePad
          label="Signature"
          onValueChange={(value) =>
            s.report(value.mode === "type" ? value.text : `${value.strokes.length} strokes`)
          }
          onExport={(blob) => s.report(`Exported ${blob.size} bytes`)}
        />
        <Variants title="Typed" layout="stack">
          <C.SignaturePad
            className="w-full"
            label="Typed signature"
            defaultValue={{
              mode: "type",
              text: "Avery Lindqvist",
              width: 640,
              height: 180,
              strokes: [],
            }}
          />
        </Variants>
        <Variants title="Prefilled and disabled" layout="grid">
          <C.SignaturePad label="Prefilled signature" defaultValue={drawnSignature} />
          <C.SignaturePad label="Locked signature" defaultValue={drawnSignature} disabled />
        </Variants>
      </>
    ),
    'canvas[aria-label="Signature drawing surface"]',
    [click('button[aria-label="Type signature"]', "input"), input("input", "Example Reader")],
  ),
  Splitter: example(
    "Drag the divider or use its arrow keys to resize panels.",
    () => (
      <>
        <Frame>
          <C.Splitter.Root>
            <C.Splitter.Panel defaultSize={35} minSize={20}>
              <Pane title="Outline">
                <ul className="flex flex-col gap-1">
                  {outline.map((item, index) => (
                    <li
                      key={item}
                      className={
                        index === 1
                          ? "rounded-md bg-signal-muted px-2 py-1 text-signal"
                          : "rounded-md px-2 py-1 text-muted-foreground"
                      }
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </Pane>
            </C.Splitter.Panel>
            <C.Splitter.Handle />
            <C.Splitter.Panel defaultSize={65} minSize={30}>
              <Pane title="Milestones">
                <p className="text-pretty text-muted-foreground">
                  Drag the grip to give the list more or less room. The handle highlights as you
                  hover, and while you drag.
                </p>
              </Pane>
            </C.Splitter.Panel>
          </C.Splitter.Root>
        </Frame>
        <Variants title="Vertical and three panes" layout="grid">
          <Frame>
            <C.Splitter.Root orientation="vertical">
              <C.Splitter.Panel defaultSize={60} minSize={25}>
                <Pane title="Editor">
                  <p className="text-muted-foreground">Top pane</p>
                </Pane>
              </C.Splitter.Panel>
              <C.Splitter.Handle />
              <C.Splitter.Panel defaultSize={40} minSize={20}>
                <Pane title="Console">
                  <p className="font-mono text-xs text-muted-foreground">Build finished in 1.2s</p>
                </Pane>
              </C.Splitter.Panel>
            </C.Splitter.Root>
          </Frame>
          <Frame>
            <C.Splitter.Root>
              <C.Splitter.Panel defaultSize={25} minSize={15}>
                <Pane title="A" />
              </C.Splitter.Panel>
              <C.Splitter.Handle />
              <C.Splitter.Panel defaultSize={50} minSize={20}>
                <Pane title="B" />
              </C.Splitter.Panel>
              <C.Splitter.Handle grip={false} />
              <C.Splitter.Panel defaultSize={25} minSize={15}>
                <Pane title="C" />
              </C.Splitter.Panel>
            </C.Splitter.Root>
          </Frame>
        </Variants>
      </>
    ),
    '[role="separator"]',
  ),
  Toast: example(
    "Show a transient notification.",
    () => (
      <>
        <Main>
          <C.Button
            onClick={() =>
              C.toast.success("Saved example", {
                description: "Your changes are live.",
                ...tone("text-success"),
              })
            }
          >
            Show toast
          </C.Button>
          <C.Toast id={toastId} />
        </Main>
        <Variants title="Kinds">
          <C.Button
            variant="outline"
            onClick={() =>
              C.toast.error("Could not save", {
                description: "The connection dropped. Try again in a moment.",
                ...tone("text-destructive"),
              })
            }
          >
            Error
          </C.Button>
          <C.Button
            variant="outline"
            onClick={() => C.toast.info("2 new comments", { ...tone("text-signal") })}
          >
            Info
          </C.Button>
          <C.Button
            variant="outline"
            onClick={() =>
              C.toast.warning("Storage is almost full", {
                description: "You have used 92% of your plan.",
                ...tone("text-warning"),
              })
            }
          >
            Warning
          </C.Button>
        </Variants>
        <Variants title="Loading, then done">
          <C.Button
            variant="outline"
            onClick={() => {
              const id = "gallery-upload";
              C.toast("Uploading report.pdf", {
                id,
                duration: Infinity,
                toasterId: toastId,
                icon: (
                  <Loader2Icon className="mt-0.5 size-4 animate-spin motion-reduce:animate-none" />
                ),
              });
              window.setTimeout(() => {
                C.toast.dismiss(id);
                C.toast.success("Uploaded report.pdf", { id, ...tone("text-success") });
              }, 1800);
            }}
          >
            Upload a file
          </C.Button>
        </Variants>
        <Variants title="With an action">
          <C.Button
            variant="outline"
            onClick={() =>
              C.toast("Task archived", {
                description: "Moved to the archive.",
                toasterId: toastId,
                duration: 8000,
                closeButton: true,
                icon: <CheckIcon className="mt-0.5 size-4 text-success" />,
                action: {
                  label: (
                    <>
                      <Undo2Icon className="size-3.5" />
                      Undo
                    </>
                  ),
                  onClick: () => {},
                },
              })
            }
          >
            Archive a task
          </C.Button>
          <C.Button
            variant="outline"
            onClick={() =>
              C.toast("Invitation sent", {
                description: "avery@example.test will get an email shortly.",
                toasterId: toastId,
                closeButton: true,
                action: { label: "View", onClick: () => {} },
                cancel: { label: "Dismiss", onClick: () => {} },
              })
            }
          >
            Action and dismiss
          </C.Button>
        </Variants>
      </>
    ),
    "button",
    [click("button", "[data-sonner-toast]", "Saved example")],
  ),
  Tour: example(
    "Step through a short guided introduction.",
    () => (
      <>
        <div className="flex flex-col gap-4">
          <Main>
            <C.Tour steps={tourSteps} />
          </Main>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <div
              data-tour="search"
              className="flex h-8 min-w-40 flex-1 items-center gap-2 rounded-lg border bg-background px-2.5 text-sm text-muted-foreground"
            >
              <SearchIcon className="size-4" />
              Search projects
            </div>
            <C.Button data-tour="filters" variant="outline" size="sm">
              <FilterIcon data-icon="inline-start" />
              Filters
            </C.Button>
            <C.Button data-tour="new" size="sm">
              <PlusIcon data-icon="inline-start" />
              New project
            </C.Button>
            <C.Button variant="ghost" size="icon-sm" aria-label="Settings">
              <SettingsIcon />
            </C.Button>
          </div>
        </div>
        <Variants title="Without highlighted targets">
          <C.Tour
            trigger="Centered tour"
            steps={[
              { id: "a", title: "Welcome", description: "A two-step introduction." },
              { id: "b", title: "You are ready", description: "Press Finish to close the tour." },
            ]}
          />
        </Variants>
      </>
    ),
    "button",
    [click("button", '[role="dialog"]', "Find anything")],
  ),
};
