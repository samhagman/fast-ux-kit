// Demos for the shadcn-layer primitives the catalog lists. Each is imported from its own
// `components/ui/<file>` module, the way an application imports it.
import { useState } from "react";
import {
  ArchiveIcon,
  BellIcon,
  CopyIcon,
  FileTextIcon,
  InboxIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
} from "lucide-react";
import { Badge } from "@samhagman/fast-ux-kit/components/ui/badge";
import { Button } from "@samhagman/fast-ux-kit/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@samhagman/fast-ux-kit/components/ui/button-group";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@samhagman/fast-ux-kit/components/ui/command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@samhagman/fast-ux-kit/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@samhagman/fast-ux-kit/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@samhagman/fast-ux-kit/components/ui/empty";
import { Input } from "@samhagman/fast-ux-kit/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@samhagman/fast-ux-kit/components/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@samhagman/fast-ux-kit/components/ui/item";
import { Kbd, KbdGroup } from "@samhagman/fast-ux-kit/components/ui/kbd";
import { Label } from "@samhagman/fast-ux-kit/components/ui/label";
import { Skeleton } from "@samhagman/fast-ux-kit/components/ui/skeleton";
import { type ComponentFixture, Variants, click, example, input } from "./fixture-kit";

const notes = [
  { id: "walk", title: "Morning walk", detail: "Edited 2 hours ago" },
  { id: "seeds", title: "Seed order", detail: "Edited yesterday" },
];

type Report = (value: unknown) => void;

function SearchGroup({ report }: { report: Report }) {
  const [query, setQuery] = useState("");
  return (
    <InputGroup className="max-w-sm">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        aria-label="Search notes"
        placeholder="Search notes"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton onClick={() => report(`Searched ${query}`)}>Search</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

function ViewMenu({ report }: { report: Report }) {
  const [wrap, setWrap] = useState(true);
  const [sort, setSort] = useState("edited");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>View</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Display</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={wrap}
            onCheckedChange={(checked) => {
              setWrap(checked);
              report(checked ? "Wrap lines on" : "Wrap lines off");
            }}
          >
            Wrap lines
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sort}
            onValueChange={(value: string) => {
              setSort(value);
              report(`Sort by ${value}`);
            }}
          >
            <DropdownMenuRadioItem value="edited">Last edited</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="title">Title</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => report("Export Markdown")}>Markdown</DropdownMenuItem>
            <DropdownMenuItem onClick={() => report("Export PDF")}>PDF</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const primitiveFixtures: Readonly<Record<string, ComponentFixture>> = {
  Badge: example(
    "A short label for a status or a count. It is text, so it never takes focus.",
    () => (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Published</Badge>
          <Badge variant="secondary">Draft</Badge>
          <Badge variant="outline">3 comments</Badge>
          <Badge variant="destructive">Overdue</Badge>
        </div>
        <Variants title="In a heading">
          <p className="flex items-center gap-2 text-sm font-medium">
            Inbox <Badge variant="secondary">12</Badge>
          </p>
        </Variants>
      </>
    ),
    '[data-slot="badge"]',
  ),
  Kbd: example(
    "Keycaps for a shortcut written in a sentence or a tooltip.",
    () => (
      <>
        <p className="text-sm">
          Press{" "}
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>{" "}
          to open the palette.
        </p>
        <Variants title="Single keys">
          <Kbd>Esc</Kbd>
          <Kbd>Enter</Kbd>
          <Kbd>Tab</Kbd>
        </Variants>
      </>
    ),
    '[data-slot="kbd"]',
  ),
  Item: example(
    "Rows with an icon, a title, a description and actions. Open runs the row's action.",
    (s) => (
      <>
        <ItemGroup aria-label="Recent notes" className="max-w-md">
          {notes.map((note) => (
            // ItemGroup is a list, so each row says it is a list item.
            <Item key={note.id} role="listitem" variant="outline">
              <ItemMedia variant="icon">
                <FileTextIcon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{note.title}</ItemTitle>
                <ItemDescription>{note.detail}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Open ${note.title}`}
                  onClick={() => s.report(`Opened ${note.title}`)}
                >
                  Open
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
        <Variants title="Muted, small, with a separator" layout="stack">
          <div className="flex w-full max-w-md flex-col">
            <Item variant="muted" size="sm">
              <ItemContent>
                <ItemTitle>Sync is paused</ItemTitle>
              </ItemContent>
            </Item>
            <ItemSeparator />
            <Item variant="muted" size="sm">
              <ItemContent>
                <ItemTitle>Two notes are waiting to upload</ItemTitle>
              </ItemContent>
            </Item>
          </div>
        </Variants>
      </>
    ),
    '[data-slot="item"]',
    [click('[data-slot="item-actions"] button', ".fixture-status", "Opened Morning walk")],
  ),
  Skeleton: example(
    "Placeholders hold the layout while content loads. Finish loading swaps in the content.",
    (s) => (
      <div className="flex max-w-sm flex-col gap-4">
        {s.open ? (
          <div className="flex items-center gap-3" data-loaded="">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <BellIcon className="size-4" aria-hidden />
            </div>
            <div className="flex flex-col">
              <p className="text-sm font-medium">Three new replies</p>
              <p className="text-xs text-muted-foreground">On the seed order note</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3" aria-busy="true" aria-label="Loading">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        )}
        <div>
          <Button variant="outline" size="sm" onClick={() => s.setOpen(!s.open)}>
            {s.open ? "Show loading" : "Finish loading"}
          </Button>
        </div>
      </div>
    ),
    '[data-slot="skeleton"]',
    [click("button", "[data-loaded]", "Three new replies")],
  ),
  Empty: example(
    "Say why there is nothing here and offer the next step.",
    (s) => (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>No notes yet</EmptyTitle>
          <EmptyDescription>Notes you write or import show up here.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => s.report("New note")}>
              New note
            </Button>
            <Button size="sm" variant="outline" onClick={() => s.report("Import")}>
              Import
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    ),
    '[data-slot="empty"]',
    [click('[data-slot="empty-content"] button', ".fixture-status", "New note")],
  ),
  ButtonGroup: example(
    "Related actions joined into one bar. Each button keeps its own focus and label.",
    (s) => (
      <>
        <ButtonGroup aria-label="Note actions">
          <Button variant="outline" onClick={() => s.report("Archive")}>
            <ArchiveIcon data-icon="inline-start" />
            Archive
          </Button>
          <Button variant="outline" onClick={() => s.report("Duplicate")}>
            <CopyIcon data-icon="inline-start" />
            Duplicate
          </Button>
        </ButtonGroup>
        <Variants title="With text and a separator">
          <ButtonGroup aria-label="Zoom">
            <ButtonGroupText>Zoom</ButtonGroupText>
            <Button variant="outline" aria-label="Zoom out">
              −
            </Button>
            <ButtonGroupSeparator />
            <Button variant="outline" aria-label="Zoom in">
              +
            </Button>
          </ButtonGroup>
        </Variants>
      </>
    ),
    '[data-slot="button-group"]',
    [click('[data-slot="button-group"] button:nth-of-type(2)', ".fixture-status", "Duplicate")],
  ),
  Label: example(
    "A label tied to its control by id. Clicking it focuses the input.",
    (s) => (
      <div className="flex max-w-xs flex-col gap-2">
        <Label htmlFor="primitive-label-title">Title</Label>
        <Input
          id="primitive-label-title"
          placeholder="Untitled"
          onChange={(event) => s.report(event.target.value)}
        />
      </div>
    ),
    'label[data-slot="label"]',
    [input("#primitive-label-title", "Field notes")],
  ),
  InputGroup: example(
    "An input with an icon before it and a button after it, inside one border.",
    (s) => (
      <>
        <SearchGroup report={s.report} />
        <Variants title="Text addons and a text area" layout="stack">
          <InputGroup className="max-w-sm">
            <InputGroupAddon>
              <InputGroupText>https://</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput aria-label="Address" placeholder="example.test" />
          </InputGroup>
          <InputGroup className="max-w-sm">
            <InputGroupTextarea aria-label="Comment" placeholder="Add a comment" />
            <InputGroupAddon align="block-end">
              <InputGroupText className="ms-auto">Up to 280 characters</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </Variants>
      </>
    ),
    '[data-slot="input-group"]',
    [
      { target: '[aria-label="Search notes"]', event: "input", value: "seeds", expect: "input" },
      click('[data-slot="input-group"] button', ".fixture-status", "Searched seeds"),
    ],
  ),
  DropdownMenu: example(
    "A menu with checkbox and radio items, a group label and a submenu. Toggle an item.",
    (s) => (
      <div>
        <ViewMenu report={s.report} />
      </div>
    ),
    "button",
    [
      click("button", '[role="menuitemcheckbox"]'),
      click('[role="menuitemcheckbox"]', ".fixture-status", "Wrap lines off"),
    ],
  ),
  ContextMenu: example(
    "Right-click the note, or press and hold on touch, to open its menu.",
    (s) => (
      <ContextMenu>
        <ContextMenuTrigger className="flex h-32 max-w-sm items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          Seed order
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-48">
          <ContextMenuItem onClick={() => s.report("Rename")}>
            Rename
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => s.report("Duplicate")}>Duplicate</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => s.report("Delete")}>
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    ),
    '[data-slot="context-menu-trigger"]',
    [
      {
        target: '[data-slot="context-menu-trigger"]',
        event: "context",
        expect: '[role="menuitem"]',
      },
      click('[role="menuitem"]', ".fixture-status", "Rename"),
    ],
  ),
  Command: example(
    "Type to filter the commands. Arrow keys move, Enter runs the highlighted one.",
    (s) => {
      const commands = (
        <>
          <CommandGroup heading="Appearance">
            <CommandItem value="light" onSelect={() => s.report("Light theme")}>
              <SunIcon />
              Switch to light theme
            </CommandItem>
            <CommandItem value="dark" onSelect={() => s.report("Dark theme")}>
              <MoonIcon />
              Switch to dark theme
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Notes">
            <CommandItem value="new" onSelect={() => s.report("New note")}>
              <FileTextIcon />
              New note
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </>
      );
      return (
        <>
          <Command label="Commands" className="max-w-sm border">
            <CommandInput aria-label="Search commands" placeholder="Search commands" />
            <CommandList>
              <CommandEmpty>No matching commands.</CommandEmpty>
              {commands}
            </CommandList>
          </Command>
          <Variants title="As a palette">
            <Button variant="outline" onClick={() => s.setOpen(true)}>
              Open the palette
            </Button>
            <CommandDialog open={s.open} onOpenChange={s.setOpen}>
              <Command label="Commands">
                <CommandInput aria-label="Search commands" placeholder="Search commands" />
                <CommandList>
                  <CommandEmpty>No matching commands.</CommandEmpty>
                  {commands}
                </CommandList>
              </Command>
            </CommandDialog>
          </Variants>
        </>
      );
    },
    '[data-slot="command"]',
    [
      {
        target: '[data-slot="command-input"]',
        event: "input",
        value: "dark",
        expect: '[data-slot="command-item"]',
        text: "Switch to dark theme",
      },
      click('[data-slot="command-item"]', ".fixture-status", "Dark theme"),
    ],
  ),
};
