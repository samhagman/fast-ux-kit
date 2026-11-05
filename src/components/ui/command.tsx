"use client";

import * as React from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { SearchIcon } from "lucide-react";
import { cn } from "../../lib/utils.js";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog.js";
import { InputGroup, InputGroupAddon } from "./input-group.js";

type CommandEntry = {
  value: string;
  label: string;
  keywords: readonly string[];
  disabled: boolean;
  id: string;
  order: number;
};
type CommandContextValue = {
  query: string;
  setQuery: (query: string) => void;
  active: string;
  shouldFilter: boolean;
  filter?: (value: string, search: string, keywords?: string[]) => number;
  entries: ReadonlyMap<string, CommandEntry>;
  orderedEntries: readonly CommandEntry[];
  register: (key: string, entry: CommandEntry | null) => void;
};
const CommandContext = React.createContext<CommandContextValue | null>(null);
function useCommand() {
  const value = React.useContext(CommandContext);
  if (!value) throw new Error("Command parts must be inside Command");
  return value;
}
function matches(
  entry: CommandEntry,
  context: Pick<CommandContextValue, "query" | "shouldFilter" | "filter">,
) {
  if (!context.shouldFilter || !context.query.trim()) return true;
  if (context.filter) return context.filter(entry.value, context.query, [...entry.keywords]) > 0;
  return `${entry.label} ${entry.value} ${entry.keywords.join(" ")}`
    .toLocaleLowerCase()
    .includes(context.query.trim().toLocaleLowerCase());
}

interface CommandProps extends Omit<React.ComponentProps<"div">, "onValueChange" | "defaultValue"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  shouldFilter?: boolean;
  filter?: (value: string, search: string, keywords?: string[]) => number;
  loop?: boolean;
  label?: string;
}
function Command({
  className,
  children,
  value,
  defaultValue = "",
  onValueChange,
  shouldFilter = true,
  filter,
  loop = false,
  label,
  onKeyDown,
  ...props
}: CommandProps) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(defaultValue);
  const [entries, setEntries] = React.useState<ReadonlyMap<string, CommandEntry>>(new Map());
  const register = React.useCallback((key: string, entry: CommandEntry | null) => {
    setEntries((current) => {
      const previous = current.get(key);
      if (!entry && !previous) return current;
      if (
        entry &&
        previous &&
        entry.value === previous.value &&
        entry.label === previous.label &&
        entry.disabled === previous.disabled &&
        entry.id === previous.id &&
        entry.order === previous.order &&
        entry.keywords.join("\0") === previous.keywords.join("\0")
      )
        return current;
      const next = new Map(current);
      if (entry) next.set(key, entry);
      else next.delete(key);
      return next;
    });
  }, []);
  const orderedEntries = React.useMemo(
    () => [...entries.values()].sort((a, b) => a.order - b.order),
    [entries],
  );
  const context = React.useMemo(
    () => ({
      query,
      setQuery,
      active: value ?? active,
      shouldFilter,
      filter,
      entries,
      orderedEntries,
      register,
    }),
    [query, value, active, shouldFilter, filter, entries, orderedEntries, register],
  );
  const items = React.useMemo(
    () => orderedEntries.filter((entry) => matches(entry, context)).map((entry) => entry.value),
    [orderedEntries, query, shouldFilter, filter],
  );
  return (
    <CommandContext.Provider value={context}>
      <Autocomplete.Root<string>
        inline
        open
        mode="none"
        autoHighlight={value === undefined ? "always" : false}
        keepHighlight
        loopFocus={loop}
        items={items}
        filter={null}
        value={query}
        onValueChange={(next, details) => {
          if (details.reason === "item-press") details.cancel();
          else setQuery(next);
        }}
        onItemHighlighted={(next, details) => {
          if (next !== undefined && (value === undefined || details.reason !== "none")) {
            setActive(next);
            onValueChange?.(next);
          }
        }}
      >
        <div
          data-slot="command"
          cmdk-root=""
          aria-label={label}
          className={cn(
            "flex size-full flex-col overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground",
            className,
          )}
          onKeyDownCapture={(event) => {
            onKeyDown?.(event);
            if (
              event.defaultPrevented ||
              value === undefined ||
              event.nativeEvent.isComposing ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            )
              return;
            const choices = orderedEntries.filter(
              (entry) => !entry.disabled && matches(entry, context),
            );
            const current = choices.findIndex((entry) => entry.value === value);
            let next = current;
            switch (event.key) {
              case "ArrowDown":
                next = current + 1;
                break;
              case "ArrowUp":
                next = current < 0 ? choices.length - 1 : current - 1;
                break;
              case "Home":
                next = 0;
                break;
              case "End":
                next = choices.length - 1;
                break;
              case "Enter":
                if (event.shiftKey || current < 0) return;
                event.preventDefault();
                event.stopPropagation();
                document.getElementById(choices[current]!.id)?.click();
                return;
              default:
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (!choices.length) return;
            next = loop
              ? (next + choices.length) % choices.length
              : Math.max(0, Math.min(next, choices.length - 1));
            onValueChange?.(choices[next]!.value);
          }}
          {...props}
        >
          {children}
        </div>
      </Autocomplete.Root>
    </CommandContext.Provider>
  );
}
function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run",
  children,
  className,
  showCloseButton = false,
  onCloseAutoFocus,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  children?: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn("top-1/3 translate-y-0 overflow-hidden rounded-xl p-0", className)}
        showCloseButton={showCloseButton}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
interface CommandInputProps extends Omit<React.ComponentProps<"input">, "onChange"> {
  onValueChange?: (value: string) => void;
}
function CommandInput({ className, value, onValueChange, ...props }: CommandInputProps) {
  const context = useCommand();
  React.useLayoutEffect(() => {
    if (value !== undefined) context.setQuery(String(value));
  }, [value, context.setQuery]);
  const activeId = [...context.entries.values()].find(
    (entry) => entry.value === context.active,
  )?.id;
  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      <InputGroup className="h-8 rounded-lg border-input/30 bg-input/30 shadow-none">
        <Autocomplete.Input
          cmdk-input=""
          data-slot="command-input"
          aria-activedescendant={activeId}
          className={cn(
            "w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
          onChange={(event) => {
            context.setQuery(event.target.value);
            onValueChange?.(event.target.value);
          }}
        />
        <InputGroupAddon>
          <SearchIcon className="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
function CommandList({ className, ...props }: React.ComponentProps<"div">) {
  const context = useCommand();
  const activeId = [...context.entries.values()].find(
    (entry) => entry.value === context.active,
  )?.id;
  return (
    <Autocomplete.List
      cmdk-list=""
      data-slot="command-list"
      aria-activedescendant={activeId}
      className={cn(
        "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        className,
      )}
      {...props}
    />
  );
}
function CommandEmpty({ className, children, ...props }: React.ComponentProps<"div">) {
  const context = useCommand();
  const empty = ![...context.entries.values()].some((entry) => matches(entry, context));
  return (
    <div
      data-slot="command-empty"
      role="status"
      className={empty ? cn("py-6 text-center text-sm", className) : "sr-only"}
      {...props}
    >
      {empty ? children : null}
    </div>
  );
}
function CommandGroup({
  className,
  heading,
  children,
  ...props
}: React.ComponentProps<"div"> & { heading?: React.ReactNode }) {
  return (
    <Autocomplete.Group
      cmdk-group=""
      data-slot="command-group"
      className={cn("overflow-hidden p-1 text-foreground", className)}
      {...props}
    >
      {heading && (
        <Autocomplete.GroupLabel
          cmdk-group-heading=""
          className="px-2 py-1.5 text-xs font-medium text-muted-foreground"
        >
          {heading}
        </Autocomplete.GroupLabel>
      )}
      {children}
    </Autocomplete.Group>
  );
}
function CommandSeparator({
  className,
  alwaysRender: _alwaysRender,
  ...props
}: React.ComponentProps<"div"> & { alwaysRender?: boolean }) {
  return (
    <div
      role="separator"
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  );
}
interface CommandItemProps extends Omit<React.ComponentProps<"div">, "onSelect"> {
  value?: string;
  keywords?: string[];
  disabled?: boolean;
  onSelect?: (value: string) => void;
  forceMount?: boolean;
}
function CommandItem({
  className,
  children,
  value,
  keywords = [],
  disabled = false,
  onSelect,
  forceMount = false,
  ref,
  id: suppliedId,
  onClick,
  ...props
}: CommandItemProps) {
  const context = useCommand();
  const key = React.useId();
  const id = suppliedId ?? `command-${key.replaceAll(":", "")}`;
  const element = React.useRef<HTMLDivElement | null>(null);
  const [label, setLabel] = React.useState(value ?? "");
  const resolved = value ?? label;
  const entry = { value: resolved, label, keywords, disabled, id, order: -1 };
  React.useLayoutEffect(() => {
    const text = element.current?.textContent?.trim() ?? value ?? "";
    if (text !== label) setLabel(text);
    const siblings = element.current?.closest("[cmdk-root]")?.querySelectorAll("[cmdk-item]");
    const order = siblings ? [...siblings].indexOf(element.current!) : -1;
    context.register(key, { ...entry, label: text, value: value ?? text, order });
  });
  React.useLayoutEffect(() => () => context.register(key, null), [key, context.register]);
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  const hidden = !forceMount && !matches(entry, context);
  const index = context.orderedEntries
    .filter((item) => matches(item, context))
    .findIndex((item) => item.id === id);
  if (hidden)
    return (
      <div hidden ref={setRef}>
        {children}
      </div>
    );
  return (
    <Autocomplete.Item
      render={<div id={id} />}
      ref={setRef}
      value={resolved}
      index={index < 0 ? undefined : index}
      disabled={disabled}
      cmdk-item=""
      data-slot="command-item"
      data-value={resolved}
      data-selected={context.active === resolved}
      aria-selected={context.active === resolved}
      data-disabled={disabled}
      className={cn(
        "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-muted data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) onSelect?.(resolved);
      }}
    >
      {children}
    </Autocomplete.Item>
  );
}
function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ms-auto text-xs tracking-widest text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
