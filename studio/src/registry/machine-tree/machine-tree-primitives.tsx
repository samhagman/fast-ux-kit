/**
 * Small shared parts of the Machine Tree: the icon button every bar uses, and the per-instance
 * touch toaster (the shared `machineToast`). Both keep 44px targets on coarse pointers.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MachineToasterHost, useMachineToaster, type MachineToaster, type MachineToastOptions } from "@/registry/machine-shared/machine-toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ModelCtx } from "./machine-tree-store";

/**
 * Ghost icon button with a tooltip. The tooltip opens on hover and on keyboard focus only: a
 * focus the component moved itself (Simulate → Restart) or a mouse-click focus never pops it.
 */
export function IconButton({
  label,
  kbd,
  pressed,
  children,
  className,
  onFocus,
  ...props
}: React.ComponentProps<typeof Button> & { readonly label: string; readonly kbd?: string; readonly pressed?: boolean }) {
  const handoff = React.useContext(ModelCtx)?.handoff;
  // No hover, no hover tooltip: on touch the label is the aria-label, and a tooltip would only pop
  // where a drag or tap happened to end.
  const hover = useMediaQuery("(hover: hover)");
  const button = (
    <Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={pressed} className={cn("coarse:size-11", pressed && "bg-muted text-foreground", className)} onFocus={hover ? undefined : onFocus} {...props}>
      {children}
    </Button>
  );
  if (!hover) return button;
  return (
    <Tooltip>
      <TooltipTrigger
        asChild
        onFocus={(event) => {
          onFocus?.(event as React.FocusEvent<HTMLButtonElement>);
          // Radix skips its own open handler when the event is default-prevented.
          if (handoff?.active || !event.currentTarget.matches(":focus-visible")) event.preventDefault();
        }}
      >
        {button}
      </TooltipTrigger>
      <TooltipContent>
        {label} {kbd && <Kbd dir="ltr" className="coarse:hidden">{kbd}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export type { MachineToastAction as TreeToastAction } from "@/registry/machine-shared/machine-toast";

export type TreeToastOptions = Omit<MachineToastOptions, "attrs" | "toasterId">;
export type TreeToaster = MachineToaster;

/**
 * One tree instance's toaster: the shared per-instance toaster (machine-shared/machine-toast),
 * offset below this tree's toolbar. Its toasts carry `data-mt-portal`, so the tree's keyboard
 * shortcuts keep working while focus is inside one.
 */
export function useTreeToaster(rootRef: React.RefObject<HTMLElement | null>) {
  return useMachineToaster(rootRef, { toolbar: "[data-mt-toolbar]", attrs: TREE_TOAST_ATTRS });
}
const TREE_TOAST_ATTRS = { "data-mt-portal": "" } as const;

/** The instance's own toaster (the shared host). */
export const TreeToasterHost = MachineToasterHost;
