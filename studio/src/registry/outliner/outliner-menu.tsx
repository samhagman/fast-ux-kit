import * as React from "react";
import { motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motionTokens } from "@/lib/motion";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * One menu, two presentations. The entries are data; a fine pointer gets a dropdown (with
 * submenus and shortcut hints), touch gets a bottom sheet with 44 px rows where a submenu is a
 * second page with a Back row. Both run the same `run` functions, so they cannot drift apart.
 *
 *   pointer                         touch
 *   ┌───────────────────────┐       ┌─────────────────────────────┐
 *   │ ⌕ Find document…   ⌘O │       │ ▔▔▔                         │
 *   │ ── VIEW ───────────── │       │ View & document             │
 *   │ ⇕ Expand all          │       │ ⌕ Find document…            │
 *   │ ☰ Show levels       ▸ │       │ ☰ Show levels             › │
 *   │ ✓ Hide completed  ⌘⇧H │       │ Hide completed            ✓ │
 *   └───────────────────────┘       └─────────────────────────────┘
 */
export type MenuEntry =
  | {
      readonly kind: "item";
      readonly id: string;
      readonly label: string;
      readonly icon?: React.ReactNode;
      /** A keyboard shortcut (shown with a pointer only; never truncated). */
      readonly hint?: string | null;
      readonly disabled?: boolean;
      /** A checkbox entry when set. */
      readonly checked?: boolean;
      /** Opens its own surface (a dialog, a sheet, the find bar), which keeps the focus. */
      readonly surface?: boolean;
      /** Only in this presentation. */
      readonly only?: "pointer" | "touch";
      readonly run: () => void;
    }
  | {
      readonly kind: "page";
      readonly id: string;
      readonly label: string;
      readonly icon?: React.ReactNode;
      /** A single-choice page: entry ids are the values. */
      readonly radio?: { readonly value: string; readonly onChange: (value: string) => void };
      readonly entries: readonly MenuEntry[];
    }
  | { readonly kind: "label"; readonly id: string; readonly label: string; readonly only?: "pointer" | "touch" }
  | { readonly kind: "separator"; readonly id: string; readonly only?: "pointer" | "touch" };

type Page = Extract<MenuEntry, { kind: "page" }>;

const visible = (entries: readonly MenuEntry[], mode: "pointer" | "touch") =>
  entries.filter((entry) => !("only" in entry) || !entry.only || entry.only === mode);

export function ResponsiveMenu({
  touch,
  trigger,
  tooltip,
  title,
  backLabel = "Back",
  entries,
  onCloseAutoFocus,
  contentProps,
}: {
  readonly backLabel?: string;
  /** Touch presentation (a bottom sheet). */
  readonly touch: boolean;
  /** The trigger button (it receives the open handlers). */
  readonly trigger: React.ReactElement<{ onClick?: (event: React.MouseEvent) => void }>;
  /** A pointer-only tooltip for the trigger. */
  readonly tooltip?: React.ReactNode;
  /** The sheet's title (and the menu's accessible name). */
  readonly title: string;
  readonly entries: readonly MenuEntry[];
  /** Called when the menu closes without handing focus to a surface. */
  readonly onCloseAutoFocus?: (event: Event) => void;
  readonly contentProps?: Partial<React.ComponentProps<typeof DropdownMenuContent>> & Record<`data-${string}`, string>;
}) {
  /** An entry that opens its own surface keeps the focus it moves there. */
  const handoff = React.useRef(false);
  const run = (entry: Extract<MenuEntry, { kind: "item" }>) => {
    if (entry.surface) handoff.current = true;
    // After the menu starts closing: its focus return would otherwise steal a field's focus.
    window.setTimeout(entry.run, 0);
  };
  const closeFocus = (event: Event) => {
    if (handoff.current) {
      handoff.current = false;
      event.preventDefault();
      return;
    }
    onCloseAutoFocus?.(event);
  };
  if (touch) return <MenuSheet trigger={trigger} title={title} backLabel={backLabel} entries={visible(entries, "touch")} run={run} onCloseAutoFocus={closeFocus} />;
  const render = (list: readonly MenuEntry[]): React.ReactNode =>
    visible(list, "pointer").map((entry) => {
      switch (entry.kind) {
        case "separator":
          return <DropdownMenuSeparator key={entry.id} />;
        case "label":
          return (
            <DropdownMenuLabel key={entry.id} className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
              {entry.label}
            </DropdownMenuLabel>
          );
        case "page":
          return (
            <DropdownMenuSub key={entry.id}>
              <DropdownMenuSubTrigger>
                {entry.icon} <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-44">
                {entry.radio ? (
                  <DropdownMenuRadioGroup value={entry.radio.value} onValueChange={entry.radio.onChange}>
                    {visible(entry.entries, "pointer").map((child) =>
                      child.kind === "item" ? (
                        <DropdownMenuRadioItem key={child.id} value={child.id}>
                          {child.label}
                        </DropdownMenuRadioItem>
                      ) : null,
                    )}
                  </DropdownMenuRadioGroup>
                ) : (
                  render(entry.entries)
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        case "item": {
          const body = (
            <>
              {entry.icon}
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              {entry.hint && <DropdownMenuShortcut className="shrink-0 ps-3 whitespace-nowrap">{entry.hint}</DropdownMenuShortcut>}
            </>
          );
          return entry.checked !== undefined ? (
            <DropdownMenuCheckboxItem key={entry.id} checked={entry.checked} disabled={entry.disabled} onCheckedChange={() => entry.run()}>
              {body}
            </DropdownMenuCheckboxItem>
          ) : (
            <DropdownMenuItem key={entry.id} disabled={entry.disabled} onSelect={() => run(entry)}>
              {body}
            </DropdownMenuItem>
          );
        }
      }
    });
  return (
    <DropdownMenu>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        align="end"
        // Wide enough that a shortcut never truncates; a long label truncates instead.
        className="w-auto max-w-[min(20rem,calc(100vw-1rem))] min-w-60"
        aria-label={title}
        onCloseAutoFocus={closeFocus}
        {...contentProps}
      >
        {render(entries)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuSheet({
  trigger,
  title,
  backLabel,
  entries,
  run,
  onCloseAutoFocus,
}: {
  readonly trigger: React.ReactElement<{ onClick?: (event: React.MouseEvent) => void }>;
  readonly title: string;
  readonly backLabel: string;
  readonly entries: readonly MenuEntry[];
  readonly run: (entry: Extract<MenuEntry, { kind: "item" }>) => void;
  readonly onCloseAutoFocus: (event: Event) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [page, setPage] = React.useState<Page | null>(null);
  const list = React.useRef<HTMLDivElement>(null);
  // Paging keeps keyboard focus: into a page lands on its first row, Back on the row that opened it.
  const cameFrom = React.useRef<string | null>(null);
  const turned = React.useRef(false);
  React.useEffect(() => {
    if (!turned.current) return;
    turned.current = false;
    const el = list.current;
    const target = page
      ? el?.querySelector<HTMLElement>("[data-sheet-entry]:not([data-sheet-back]):not(:disabled)")
      : cameFrom.current
        ? el?.querySelector<HTMLElement>(`[data-sheet-entry="${CSS.escape(cameFrom.current)}"]`)
        : null;
    target?.focus({ preventScroll: true });
  }, [page]);
  const turn = (next: Page | null) => {
    turned.current = true;
    if (next) cameFrom.current = next.id;
    setPage(next);
  };
  const close = () => {
    setOpen(false);
    setPage(null);
  };
  const rows = page ? visible(page.entries, "touch") : entries;
  return (
    <>
      {React.cloneElement(trigger, {
        onClick: (event: React.MouseEvent) => {
          trigger.props.onClick?.(event);
          setOpen(true);
        },
        "aria-haspopup": "dialog",
        "aria-expanded": open,
      } as Record<string, unknown>)}
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPage(null);
        }}
      >
        <DrawerContent
          data-menu-sheet=""
          className="pb-[env(safe-area-inset-bottom)]"
          onOpenAutoFocus={(event) => {
            // Focus starts on the first row (never the drag handle), without a ring: the sheet
            // opened from a tap; the ring appears once the user moves focus with keys.
            event.preventDefault();
            requestAnimationFrame(() =>
              list.current?.querySelector<HTMLElement>("[data-sheet-entry]:not(:disabled)")?.focus({ preventScroll: true, focusVisible: false } as FocusOptions),
            );
          }}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <DrawerHeader className="flex-row items-center gap-1 px-3 pt-2 pb-1 text-start!">
            {page && (
              <button
                type="button"
                aria-label={backLabel}
                data-sheet-back=""
                onClick={() => turn(null)}
                className="-ms-1 grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-signal/30 active:bg-muted"
              >
                <ChevronLeft className="size-[18px] rtl:rotate-180" />
              </button>
            )}
            <DrawerTitle className={cn("min-w-0 flex-1 truncate text-[15px] leading-6 font-semibold", !page && "ps-1")}>{page ? page.label : title}</DrawerTitle>
            <DrawerDescription className="sr-only">{title}</DrawerDescription>
          </DrawerHeader>
          <motion.div
            ref={list}
            key={page?.id ?? "root"}
            initial={{ opacity: 0, x: page ? 12 : turned.current ? -12 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            transition={motionTokens.quick}
            role={page?.radio ? "radiogroup" : "menu"}
            aria-label={page ? page.label : title}
            className="max-h-[65vh] min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-hairline px-2 py-1"
          >
            {rows.map((entry) => {
              switch (entry.kind) {
                case "separator":
                  return <div key={entry.id} role="separator" className="mx-2 my-1 h-px bg-hairline" />;
                case "label":
                  return (
                    <div key={entry.id} role="presentation" className="px-3 pt-2.5 pb-1 font-mono text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
                      {entry.label}
                    </div>
                  );
                case "page":
                  return (
                    <SheetRow key={entry.id} id={entry.id} icon={entry.icon} label={entry.label} onClick={() => turn(entry)}>
                      <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
                    </SheetRow>
                  );
                case "item": {
                  const radio = page?.radio;
                  const checked = radio ? radio.value === entry.id : entry.checked;
                  return (
                    <SheetRow
                      key={entry.id}
                      id={entry.id}
                      icon={entry.icon}
                      label={entry.label}
                      disabled={entry.disabled}
                      role={radio ? "menuitemradio" : checked !== undefined ? "menuitemcheckbox" : "menuitem"}
                      checked={checked}
                      onClick={() => {
                        if (radio) {
                          radio.onChange(entry.id);
                          return close();
                        }
                        close();
                        run(entry);
                      }}
                    >
                      {checked && <Check className="size-4 text-signal" strokeWidth={2.5} />}
                    </SheetRow>
                  );
                }
              }
            })}
          </motion.div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function SheetRow({
  id,
  icon,
  label,
  disabled,
  role = "menuitem",
  checked,
  onClick,
  children,
}: {
  readonly id: string;
  readonly icon?: React.ReactNode;
  readonly label: string;
  readonly disabled?: boolean;
  readonly role?: "menuitem" | "menuitemcheckbox" | "menuitemradio";
  readonly checked?: boolean;
  readonly onClick: () => void;
  readonly children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "menuitem" ? undefined : !!checked}
      data-sheet-entry={id}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-start text-[15px] transition-colors outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-signal/30 active:bg-muted disabled:opacity-40 [&>svg:first-child]:size-[18px] [&>svg:first-child]:shrink-0 [&>svg:first-child]:text-muted-foreground"
    >
      {icon}
      <bdi className="block min-w-0 flex-1 truncate text-start">{label}</bdi>
      {children}
    </button>
  );
}
