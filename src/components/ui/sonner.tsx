"use client";

import * as React from "react";
import { Toast } from "@base-ui/react/toast";
import { CheckCircleIcon, InfoIcon, TriangleAlertIcon, XCircleIcon, XIcon } from "lucide-react";
import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";

interface ToastAction {
  label: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}
interface ToastClassnames {
  toast?: string;
  title?: string;
  description?: string;
  icon?: string;
  actionButton?: string;
  cancelButton?: string;
  closeButton?: string;
}
type ToastPosition =
  "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
interface ToastOptions {
  id?: string | number;
  description?: React.ReactNode;
  duration?: number;
  action?: ToastAction;
  cancel?: ToastAction;
  icon?: React.ReactNode;
  onDismiss?: () => void;
  position?: ToastPosition;
  toasterId?: string;
  closeButton?: boolean;
  classNames?: ToastClassnames;
}
interface ToastData extends Pick<
  ToastOptions,
  "action" | "cancel" | "icon" | "position" | "closeButton" | "classNames"
> {
  content?: React.ReactNode;
}

const managers = new Map<string, ReturnType<typeof Toast.createToastManager<ToastData>>>();
const records = new Map<string, { id: string; toasterId: string; managerKey: string }>();
const defaultPositions = new Map<string, ToastPosition>();
const positions: ToastPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];
let nextId = 0;

function managerFor(id = "default") {
  let manager = managers.get(id);
  if (!manager) {
    manager = Toast.createToastManager<ToastData>();
    managers.set(id, manager);
  }
  return manager;
}

function showToast(
  title: React.ReactNode,
  options: ToastOptions = {},
  type = "default",
  content?: React.ReactNode,
) {
  const id = String(options.id ?? `notice-${++nextId}`);
  const toasterId = options.toasterId ?? "default";
  const position = options.position ?? defaultPositions.get(toasterId) ?? "bottom-right";
  const managerKey = JSON.stringify([toasterId, position]);
  const previous = records.get(id);
  if (previous && previous.managerKey !== managerKey) managerFor(previous.managerKey).close(id);
  const record = { id, toasterId, managerKey };
  records.set(id, record);
  managerFor(managerKey).add({
    id,
    title,
    type,
    description: options.description,
    timeout: options.duration === Infinity ? 0 : options.duration,
    data: {
      action: options.action,
      cancel: options.cancel,
      icon: options.icon,
      content,
      position: options.position,
      closeButton: options.closeButton,
      classNames: options.classNames,
    },
    onClose: () => {
      if (records.get(id) === record) records.delete(id);
      options.onDismiss?.();
    },
  });
  return id;
}

const toast = Object.assign(showToast, {
  success: (title: React.ReactNode, options?: ToastOptions) => showToast(title, options, "success"),
  error: (title: React.ReactNode, options?: ToastOptions) => showToast(title, options, "error"),
  warning: (title: React.ReactNode, options?: ToastOptions) => showToast(title, options, "warning"),
  info: (title: React.ReactNode, options?: ToastOptions) => showToast(title, options, "info"),
  custom: (render: (id: string) => React.ReactNode, options: ToastOptions = {}) => {
    const id = String(options.id ?? `notice-${++nextId}`);
    return showToast(null, { ...options, id }, "custom", render(id));
  },
  dismiss: (id?: string | number) => {
    if (id === undefined) {
      for (const manager of managers.values()) manager.close();
      records.clear();
      return;
    }
    const key = String(id);
    const record = records.get(key);
    if (record) managerFor(record.managerKey).close(key);
    records.delete(key);
  },
  getToasts: () => [...records.values()],
});

type ToastOffset =
  | number
  | string
  | {
      top?: number | string;
      bottom?: number | string;
      left?: number | string;
      right?: number | string;
    };
interface ToasterProps extends React.ComponentProps<"div"> {
  id?: string;
  position?: ToastPosition;
  duration?: number;
  visibleToasts?: number;
  offset?: ToastOffset;
  mobileOffset?: ToastOffset;
  hotkey?: string[];
  customAriaLabel?: string;
}

const icons = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  warning: TriangleAlertIcon,
  info: InfoIcon,
};

function Notice({ notice, front }: { notice: Toast.Root.ToastObject<ToastData>; front: boolean }) {
  const { close } = Toast.useToastManager<ToastData>();
  const data = notice.data;
  const Icon = icons[notice.type as keyof typeof icons];
  const icon = data?.icon ?? (Icon && <Icon className="size-4" />);
  return (
    <Toast.Root
      toast={notice}
      data-sonner-toast=""
      data-front={front}
      className="pointer-events-auto rounded-lg outline-none data-limited:hidden data-ending-style:opacity-0 motion-safe:transition-opacity"
    >
      {data?.content ? (
        <Toast.Content>{data.content}</Toast.Content>
      ) : (
        <Toast.Content
          className={cn(
            "relative flex items-start gap-2 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg",
            data?.classNames?.toast,
          )}
        >
          {icon && <span className={data?.classNames?.icon}>{icon}</span>}
          <div className="min-w-0 flex-1">
            <Toast.Title className={cn("font-medium", data?.classNames?.title)} />
            <Toast.Description
              className={cn("text-muted-foreground", data?.classNames?.description)}
            />
            {(data?.action || data?.cancel) && (
              <div className="mt-2 flex gap-2">
                {[data.action, data.cancel].map(
                  (action, index) =>
                    action && (
                      <Button
                        key={index}
                        size="sm"
                        variant={index ? "ghost" : "outline"}
                        className={
                          index ? data.classNames?.cancelButton : data.classNames?.actionButton
                        }
                        onClick={(event) => {
                          action.onClick(event);
                          if (!event.defaultPrevented) close(notice.id);
                        }}
                      >
                        {action.label}
                      </Button>
                    ),
                )}
              </div>
            )}
          </div>
          {data?.closeButton && (
            <Toast.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Dismiss notification"
                  className={cn("absolute top-2 end-2", data.classNames?.closeButton)}
                />
              }
            >
              <XIcon />
            </Toast.Close>
          )}
        </Toast.Content>
      )}
    </Toast.Root>
  );
}

function Notices({
  position,
  active,
  offset,
  mobileOffset,
  hotkey = ["altKey", "KeyT"],
  className,
  style,
  ...props
}: Omit<ToasterProps, "duration" | "visibleToasts" | "position"> & {
  position: ToastPosition;
  active: boolean;
}) {
  const { toasts } = Toast.useToastManager<ToastData>();
  const viewport = React.useRef<HTMLDivElement | null>(null);
  const [mobile, setMobile] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const keys = hotkey.join(" ");
  React.useEffect(() => {
    if (!keys) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !viewport.current?.querySelector("[data-sonner-toast]")) return;
      const matches = keys
        .split(" ")
        .every((key) =>
          key.endsWith("Key")
            ? Boolean(event[key as "altKey" | "ctrlKey" | "metaKey" | "shiftKey"])
            : event.code === key || event.key === key,
        );
      if (!matches) return;
      event.preventDefault();
      viewport.current.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [keys]);

  if (!active && !toasts.length) return null;
  const top = position.startsWith("top");
  const center = position.endsWith("center");
  const start = position.endsWith("left");
  const selectedOffset = mobile ? (mobileOffset ?? offset) : offset;
  const inset =
    typeof selectedOffset === "object"
      ? selectedOffset
      : { [top ? "top" : "bottom"]: selectedOffset ?? 16 };
  return (
    <Toast.Viewport
      role="presentation"
      ref={viewport}
      data-slot="toaster"
      data-sonner-toaster=""
      data-y-position={top ? "top" : "bottom"}
      aria-label={undefined}
      className={cn(
        "pointer-events-none fixed z-[100] flex w-[356px] max-w-[calc(100vw-2rem)] gap-2 outline-none",
        top ? "top-4 flex-col" : "bottom-4 flex-col-reverse",
        center ? "left-1/2 -translate-x-1/2" : start ? "start-4" : "end-4",
        className,
      )}
      style={{ ...inset, ...style }}
      {...props}
    >
      {toasts.map((notice, index) => (
        <Notice key={notice.id} notice={notice} front={index === 0} />
      ))}
    </Toast.Viewport>
  );
}

function Toaster({
  id = "default",
  position = "bottom-right",
  duration,
  visibleToasts = 3,
  customAriaLabel = "Notifications",
  ...props
}: ToasterProps) {
  React.useLayoutEffect(() => {
    defaultPositions.set(id, position);
  }, [id, position]);
  return (
    <Toast.Portal>
      <section aria-label={customAriaLabel}>
        {positions.map((placement) => (
          <Toast.Provider
            key={placement}
            toastManager={managerFor(JSON.stringify([id, placement]))}
            timeout={duration}
            limit={visibleToasts}
          >
            <Notices active={placement === position} position={placement} {...props} />
          </Toast.Provider>
        ))}
      </section>
    </Toast.Portal>
  );
}

export { Toaster, toast };
export type { ToastOptions, ToasterProps, ToastClassnames };
