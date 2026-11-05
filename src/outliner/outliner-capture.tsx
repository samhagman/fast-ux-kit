import * as React from "react";
import { motion } from "motion/react";
import { CornerDownLeft, Inbox, Plus } from "lucide-react";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { Button } from "../components/ui/button.js";
import { Kbd } from "../components/ui/kbd.js";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog.js";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "../components/ui/drawer.js";
import type { resolveLabels } from "./labels.js";
import { isComposingKey } from "./keymap.js";

type Labels = ReturnType<typeof resolveLabels>;

/**
 * Quick capture: one field that files a new item into the inbox from anywhere (⌘⇧Space, the
 * toolbar's inbox button, or the floating button on a phone). Enter files it and closes;
 * ⌘Enter files it and stays open for the next thought. The workspace does the filing and shows
 * "Captured to Inbox · Undo · Open".
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ⤓ Inbox   Call Marco about the pilot #partner │
 *   │                              ↵ capture  ⌘↵ +1 │
 *   └──────────────────────────────────────────────┘
 */
export function QuickCapture({
  open,
  onOpenChange,
  inboxTitle,
  onCapture,
  labels: L,
  phone,
  modKey,
  onCloseAutoFocus,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Where focus goes when it closes (the host's focus return); the dialog's default otherwise. */
  readonly onCloseAutoFocus?: (event: Event) => void;
  /** Where it goes ("Inbox"); null when an inbox will be made on the first capture. */
  readonly inboxTitle: string | null;
  /** File it; false when nothing was filed. */
  readonly onCapture: (text: string) => boolean;
  readonly labels: Labels;
  readonly phone: boolean;
  readonly modKey: string;
}) {
  const [text, setText] = React.useState("");
  const [count, setCount] = React.useState(0);
  const input = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (open) setCount(0);
  }, [open]);
  /** The field takes focus as the sheet / dialog opens (not its first button). */
  const focusField = (event: Event) => {
    event.preventDefault();
    input.current?.focus({ preventScroll: true });
  };
  const submit = (stay: boolean) => {
    if (!text.trim()) return;
    if (!onCapture(text)) return;
    setText("");
    setCount((n) => n + 1);
    if (!stay) onOpenChange(false);
    else input.current?.focus();
  };
  const field = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase">
        <Inbox className="size-3.5 text-signal" />
        <span>{L.captureTo(inboxTitle ?? L.inbox)}</span>
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionTokens.quick}
            className="ms-auto normal-case tracking-normal text-signal"
          >
            {L.capturedCount(count)}
          </motion.span>
        )}
      </div>
      <textarea
        ref={input}
        value={text}
        rows={phone ? 3 : 2}
        aria-label={L.captureField}
        placeholder={L.capturePlaceholder}
        dir="auto"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (isComposingKey(event)) return;
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit(event.metaKey || event.ctrlKey);
          }
        }}
        className="min-h-14 w-full resize-none rounded-md border bg-background px-2.5 py-2 text-[14px] leading-snug outline-none placeholder:text-muted-foreground/70 focus:border-signal/60 focus:ring-3 focus:ring-signal/15 coarse:text-[16px]"
      />
      <div className="flex items-center gap-2">
        {!phone && (
          <span className="font-mono text-[10.5px] text-muted-foreground">
            <Kbd dir="ltr">↵</Kbd> {L.capture} <span className="mx-1 opacity-50">·</span>{" "}
            <Kbd dir="ltr">{modKey}↵</Kbd> {L.captureAnother}
          </span>
        )}
        <Button
          size="sm"
          className="ms-auto gap-1.5 coarse:h-11 coarse:px-4"
          disabled={!text.trim()}
          onClick={() => submit(false)}
        >
          {L.capture} <CornerDownLeft className="size-3.5 opacity-70 rtl:-scale-x-100" />
        </Button>
      </div>
    </div>
  );
  if (phone)
    return (
      <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        <DrawerContent
          data-capture-sheet=""
          onOpenAutoFocus={focusField}
          onCloseAutoFocus={onCloseAutoFocus}
          className="px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <DrawerTitle className="sr-only">{L.quickCapture}</DrawerTitle>
          <DrawerDescription className="sr-only">
            {L.captureTo(inboxTitle ?? L.inbox)}
          </DrawerDescription>
          <div className="pt-2">{field}</div>
        </DrawerContent>
      </Drawer>
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-capture-dialog=""
        onOpenAutoFocus={focusField}
        onCloseAutoFocus={onCloseAutoFocus}
        showCloseButton={false}
        className="top-[18%] translate-y-0 gap-0 p-3 sm:max-w-md"
      >
        <DialogTitle className="sr-only">{L.quickCapture}</DialogTitle>
        <DialogDescription className="sr-only">
          {L.captureTo(inboxTitle ?? L.inbox)}
        </DialogDescription>
        {field}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The phone's floating capture button (it steps aside while editing or selecting). Quiet on
 * purpose: a 44 px tonal disc with a hairline, the signal colour only on its glyph, so it reads
 * as a tool rather than the page's loudest object.
 */
export function CaptureFab({
  onClick,
  labels: L,
  className,
}: {
  readonly onClick: () => void;
  readonly labels: Labels;
  readonly className?: string;
}) {
  return (
    <motion.button
      type="button"
      data-capture-fab=""
      aria-label={L.quickCapture}
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={motionTokens.base}
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className={cn(
        "absolute end-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 grid size-11 place-items-center rounded-full border border-border bg-surface/90 text-signal shadow-[0_1px_2px_rgb(0_0_0/0.06),0_6px_16px_-8px_rgb(0_0_0/0.22)] backdrop-blur-md transition-[opacity,background-color] outline-none focus-visible:ring-3 focus-visible:ring-signal/30 active:bg-muted dark:shadow-[0_1px_2px_rgb(0_0_0/0.4),0_6px_16px_-8px_rgb(0_0_0/0.6)]",
        className,
      )}
    >
      <Plus className="size-5" strokeWidth={2.25} />
    </motion.button>
  );
}
