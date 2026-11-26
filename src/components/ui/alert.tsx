import type * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";
import { Slot, type AsChildProps } from "./compat.js";

/** The four tones an alert can take. */
export type AlertTone = "info" | "success" | "warning" | "error";
/** A tone, or shadcn's names for two of them: `default` is `info`, `destructive` is `error`. */
export type AlertVariant = AlertTone | "default" | "destructive";

const aliases: Record<AlertVariant, AlertTone> = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
  default: "info",
  destructive: "error",
};

/**
 * `default` sits among other content. `page` is a full-page refusal ("This link expired"): a
 * display-size title, body-size text, roomier padding and no icon.
 */
export type AlertSize = "default" | "page";

/** The tone an alert variant renders in, with shadcn's names resolved. */
export function alertTone(variant: AlertVariant = "info"): AlertTone {
  return aliases[variant] ?? "info";
}

/**
 * Every color is a mix of theme tokens. `--fux-alert-tone` carries the variant's token, and a
 * consumer can set it (or the tokens it reads) to restyle an alert. The accent (icon and
 * leading edge) is the tone pulled toward the foreground, so it stays readable in light and
 * dark themes.
 */
const alertVariants = cva(
  "group/alert relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-lg border-y border-e border-s-3 border-y-[color:var(--fux-alert-border)] border-e-[color:var(--fux-alert-border)] border-s-[color:var(--fux-alert-accent)] bg-[color-mix(in_oklab,var(--fux-alert-tone)_8%,var(--card))] px-4 py-3 text-start text-sm text-card-foreground [--fux-alert-accent:color-mix(in_oklab,var(--fux-alert-tone)_65%,var(--foreground))] [--fux-alert-border:color-mix(in_oklab,var(--fux-alert-tone)_30%,var(--border))] has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 has-[>[data-slot=alert-icon]]:grid-cols-[auto_1fr] has-[>[data-slot=alert-icon]]:gap-x-3 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:text-[color:var(--fux-alert-accent)]",
  {
    variants: {
      variant: {
        info: "[--fux-alert-tone:var(--signal)]",
        success: "[--fux-alert-tone:var(--success)]",
        warning: "[--fux-alert-tone:var(--warning)]",
        error: "[--fux-alert-tone:var(--destructive)]",
      },
      size: {
        default: "",
        page: "gap-y-2 rounded-xl px-6 py-6 has-[>svg]:grid-cols-[0_1fr] has-[>svg]:gap-x-0 [&>svg]:hidden",
      },
    },
    defaultVariants: { variant: "info", size: "default" },
  },
);

export interface AlertProps extends React.ComponentProps<"div"> {
  /** `error` (or `destructive`) interrupts as `role="alert"`; the others are `role="status"`. */
  variant?: AlertVariant;
  /** A leading icon. It is decoration: the title says what happened. Not shown at `page` size. */
  icon?: React.ReactNode;
  /** `page` makes the alert a full-page refusal. Roles and tones stay the same. */
  size?: AlertSize;
}

/**
 * A message that stays in the page: what happened, and the next step that works. Unlike a
 * toast it does not time out. Mount it when the event happens so assistive technology
 * announces it; pass `role` to change how it is announced.
 */
function Alert({
  className,
  variant,
  size = "default",
  icon,
  role,
  children,
  ...props
}: AlertProps) {
  const tone = alertTone(variant);
  const page = size === "page";
  return (
    <div
      data-slot="alert"
      data-variant={tone}
      data-size={page ? "page" : "default"}
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={cn(alertVariants({ variant: tone, size: page ? "page" : "default" }), className)}
      {...props}
    >
      {!page && icon != null && icon !== false && (
        <span
          data-slot="alert-icon"
          aria-hidden="true"
          className="flex h-5 items-center text-[color:var(--fux-alert-accent)] [&>svg]:pointer-events-none [&>svg]:shrink-0 [&>svg:not([class*='size-'])]:size-4"
        >
          {icon}
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * What happened, in a few words. `asChild` renders the one child element instead, so the title
 * can be a real heading: `<AlertTitle asChild><h1>This link expired</h1></AlertTitle>`.
 */
function AlertTitle({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & AsChildProps) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      data-slot="alert-title"
      className={cn(
        "col-start-2 min-h-5 font-heading text-sm font-medium tracking-tight text-card-foreground group-data-[size=page]/alert:min-h-0 group-data-[size=page]/alert:text-2xl group-data-[size=page]/alert:font-semibold",
        className,
      )}
      {...props}
    />
  );
}

/** Why it matters, or what the reader can do about it. */
function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm/relaxed text-muted-foreground group-data-[size=page]/alert:text-base/relaxed [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-card-foreground [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

/** The next step: a link or a button (or a few). */
function AlertActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-actions"
      className={cn(
        "col-start-2 mt-2 flex flex-wrap items-center gap-2 group-data-[size=page]/alert:mt-4",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertActions, alertVariants };
