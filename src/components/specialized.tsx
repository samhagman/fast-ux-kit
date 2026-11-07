"use client";

import * as React from "react";
import { encode } from "uqr";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CloudUpload,
  Copy,
  Download,
  Ellipsis,
  File as FileGlyph,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Star,
  Upload,
  X,
} from "lucide-react";
import { Fieldset as FieldsetPrimitive } from "@base-ui/react/fieldset";
import { NavigationMenu as NavigationPrimitive } from "@base-ui/react/navigation-menu";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { Button, type RadioGroupProps } from "./basic.js";
import { Tree, safeNavigationHref, type TreeNode } from "./collections.js";
import { Progress } from "./ui/progress.js";
import { buttonVariants } from "./ui/button.js";
import { cn } from "../lib/utils.js";

type ButtonVariant = NonNullable<React.ComponentProps<typeof Button>["variant"]>;
type ButtonSize = NonNullable<React.ComponentProps<typeof Button>["size"]>;

/* -------------------------------------------------------------------------- */
/* Pagination                                                                  */
/* -------------------------------------------------------------------------- */

export interface PaginationProps {
  label: string;
  count: number;
  pageSize?: number;
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  previousLabel?: string;
  nextLabel?: string;
  /** Replaces the numbered pages with icon-only previous and next buttons and a "Page 2 of 5" readout. */
  compact?: boolean;
}

/** Up to this many pages show every number; more pages pin the ends and slide a strip between them. */
const ALL_PAGES = 7;
/** Pages kept mounted on each side of the strip's window, so a one-step move slides instead of popping. */
const STRIP_BUFFER = 3;

/**
 * The numbered pages when there are many: the first and last are pinned, and between them a
 * three-slot window looks onto a strip of every other page. Moving a page at a time slides the
 * strip under the window while the selection keeps its slot; at the ends the window stops and the
 * selection moves instead. Pages outside the window stay mounted (inert) just long enough to
 * slide in or out.
 *
 *   ‹  [1]  …  ┃ 17  [18]  19 ┃  …  [40]  ›
 */
function PageStrip({
  current,
  pages,
  select,
}: {
  current: number;
  pages: number;
  select: (page: number) => void;
}) {
  const start = Math.min(Math.max(current - 1, 2), pages - 3);
  // Slots fit the widest page number; tabular digits keep every number the same width.
  const slot = `max(2rem, calc(${String(pages).length}ch + 1.25rem))`;
  const step = `calc(${slot} + 0.25rem)`;
  const pageButton = (
    value: number,
    className?: string,
    style?: React.CSSProperties,
    hidden = false,
  ) => (
    <Button
      key={value}
      variant="ghost"
      aria-current={value === current ? "page" : undefined}
      aria-label={`Page ${value}`}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      inert={hidden || undefined}
      onClick={() => select(value)}
      style={{ inlineSize: slot, ...style }}
      className={cn(
        "px-0 tabular-nums",
        value === current
          ? "font-semibold text-foreground hover:bg-transparent"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {value}
    </Button>
  );
  const pinned = (value: number) => (
    <span className="relative grid" style={{ inlineSize: slot }}>
      {value === current && <PageMarker style={{ insetInline: 0 }} />}
      {pageButton(value, "relative")}
    </span>
  );
  const gap = (shown: boolean) => (
    <span
      aria-hidden
      className={cn(
        "grid size-8 place-items-center text-muted-foreground transition-opacity duration-200 motion-reduce:transition-none max-sm:hidden",
        shown ? "opacity-100" : "opacity-0",
      )}
    >
      <Ellipsis className="size-4" />
    </span>
  );
  const strip: number[] = [];
  for (let value = start - STRIP_BUFFER; value <= start + 2 + STRIP_BUFFER; value++)
    if (value > 1 && value < pages) strip.push(value);
  const inWindow = current >= start && current <= start + 2;
  return (
    <>
      {pinned(1)}
      {gap(start > 2)}
      <span
        className="relative h-8 shrink-0 overflow-hidden"
        style={{ inlineSize: `calc(3 * ${slot} + 0.5rem)` }}
      >
        {inWindow && (
          <PageMarker
            style={{ insetInlineStart: `calc(${current - start} * ${step})`, inlineSize: slot }}
          />
        )}
        {strip.map((value) =>
          pageButton(
            value,
            "absolute inset-y-0 transition-[inset-inline-start] duration-250 ease-(--ease-standard) motion-reduce:transition-none",
            { insetInlineStart: `calc(${value - start} * ${step})` },
            value < start || value > start + 2,
          ),
        )}
      </span>
      {gap(start + 2 < pages - 1)}
      {pinned(pages)}
    </>
  );
}

/** The selected page's box, drawn over the numbers: in the strip it holds its slot while they slide under it. */
function PageMarker({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      style={style}
      className="pointer-events-none absolute inset-y-0 z-10 rounded-lg border border-ring/60 shadow-xs transition-[inset-inline-start] duration-250 ease-(--ease-standard) motion-reduce:transition-none"
    />
  );
}

export function Pagination({
  label,
  count,
  pageSize = 10,
  page,
  defaultPage = 1,
  onPageChange,
  previousLabel = "Previous",
  nextLabel = "Next",
  compact = false,
}: PaginationProps) {
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new Error("Pagination requires a non-negative count and a positive page size.");
  if (![page ?? 1, defaultPage].every((value) => Number.isSafeInteger(value) && value >= 1))
    throw new Error("Page numbers must be positive integers.");
  const [own, setOwn] = React.useState(defaultPage);
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(page ?? own, pages);
  function select(next: number) {
    const value = Math.max(1, Math.min(next, pages));
    if (value === current) return;
    if (page === undefined) setOwn(value);
    onPageChange?.(value);
  }
  const previous = (
    <Button
      variant="outline"
      size={compact ? "icon" : "default"}
      disabled={current === 1}
      aria-label={compact ? previousLabel : undefined}
      onClick={() => select(current - 1)}
      className="shadow-xs"
    >
      <ChevronLeft data-icon="inline-start" className="rtl:rotate-180" aria-hidden />
      {!compact && <span className="max-sm:sr-only">{previousLabel}</span>}
    </Button>
  );
  const next = (
    <Button
      variant="outline"
      size={compact ? "icon" : "default"}
      disabled={current === pages}
      aria-label={compact ? nextLabel : undefined}
      onClick={() => select(current + 1)}
      className="shadow-xs"
    >
      {!compact && <span className="max-sm:sr-only">{nextLabel}</span>}
      <ChevronRight data-icon="inline-end" className="rtl:rotate-180" aria-hidden />
    </Button>
  );
  if (compact)
    return (
      <nav
        aria-label={label}
        data-slot="pagination"
        className="flex items-center gap-2"
        style={{ flexWrap: "wrap" }}
      >
        {previous}
        <span
          aria-live="polite"
          className="min-w-24 text-center text-sm text-muted-foreground tabular-nums"
        >
          Page <span className="font-medium text-foreground">{current}</span> of {pages}
        </span>
        {next}
      </nav>
    );
  return (
    <nav
      aria-label={label}
      data-slot="pagination"
      className="flex items-center gap-1 max-sm:gap-0.5"
      style={{ flexWrap: "wrap" }}
    >
      {previous}
      {pages > ALL_PAGES ? (
        <PageStrip current={current} pages={pages} select={select} />
      ) : (
        Array.from({ length: pages }, (_, index) => index + 1).map((value) => (
          <Button
            key={value}
            variant={value === current ? "outline" : "ghost"}
            aria-current={value === current ? "page" : undefined}
            aria-label={`Page ${value}`}
            onClick={() => select(value)}
            className={cn(
              "min-w-8 px-2 tabular-nums",
              value === current
                ? "border-ring/60 bg-background font-semibold shadow-xs dark:bg-input/40"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value}
          </Button>
        ))
      )}
      {next}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Clipboard and download                                                      */
/* -------------------------------------------------------------------------- */

export interface ClipboardProps {
  value: string;
  label?: string;
  onError?: (error: Error) => void;
  /** Text announced and shown next to the button after a successful copy. */
  copiedLabel?: string;
  /** Shows only the icon; `label` still names the button. */
  iconOnly?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** How long the confirmation stays, in milliseconds. */
  resetDelay?: number;
}
export function Clipboard({
  value,
  label = "Copy",
  onError,
  copiedLabel = "Copied",
  iconOnly = false,
  variant = "outline",
  size,
  resetDelay = 2000,
}: ClipboardProps) {
  const [status, setStatus] = React.useState<"" | "copied" | "failed">("");
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch (error) {
      setStatus("failed");
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
    timer.current = setTimeout(() => setStatus(""), resetDelay);
  }
  const copied = status === "copied";
  return (
    <span data-slot="clipboard" className="inline-flex items-center gap-2">
      <Button
        variant={variant}
        size={size ?? (iconOnly ? "icon" : "default")}
        aria-label={iconOnly ? label : undefined}
        data-copied={copied || undefined}
        onClick={copy}
        className={cn("shadow-xs", copied && "border-success/50 text-success")}
      >
        <span
          aria-hidden
          data-icon={iconOnly ? undefined : "inline-start"}
          className="relative grid size-4 place-items-center"
        >
          <Copy
            className={cn(
              "absolute size-4 motion-safe:transition-[opacity,transform] motion-safe:duration-150",
              copied ? "scale-50 opacity-0" : "scale-100 opacity-100",
            )}
          />
          <Check
            className={cn(
              "absolute size-4 motion-safe:transition-[opacity,transform] motion-safe:duration-150",
              copied ? "scale-100 opacity-100" : "scale-50 opacity-0",
            )}
          />
        </span>
        {!iconOnly && label}
      </Button>
      <span
        role="status"
        className={cn(
          "text-xs motion-safe:transition-opacity",
          status === "failed" ? "text-destructive" : "text-success",
          iconOnly && "sr-only",
        )}
      >
        {status === "copied" ? copiedLabel : status === "failed" ? "Copy failed" : ""}
      </span>
    </span>
  );
}

export interface DownloadTriggerProps extends Omit<React.ComponentProps<"a">, "href" | "download"> {
  href: string;
  filename?: string;
  /** Shows a spinner and holds the link inert while the file is being prepared. */
  pending?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}
export function DownloadTrigger({
  href,
  filename = "download",
  children = "Download",
  pending = false,
  variant = "outline",
  size = "default",
  className,
  onClick,
  ...props
}: DownloadTriggerProps) {
  if (!/^(https?:|blob:|\/|\.\.?\/)/i.test(href))
    return (
      <span role="alert" className="text-sm text-destructive">
        Download URL is unavailable.
      </span>
    );
  return (
    <a
      {...props}
      data-slot="button"
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      className={cn(
        buttonVariants({ variant, size }),
        "shadow-xs no-underline",
        pending && "opacity-70",
        className,
      )}
      href={href}
      download={filename}
      onClick={(event) => {
        if (pending) event.preventDefault();
        else onClick?.(event);
      }}
    >
      {pending ? (
        <LoaderCircle
          data-icon="inline-start"
          aria-hidden
          className="animate-spin motion-reduce:animate-none"
        />
      ) : (
        <Download data-icon="inline-start" aria-hidden />
      )}
      {children}
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* Files: trigger, drop zone and upload list                                    */
/* -------------------------------------------------------------------------- */

export interface FileSelectionProps {
  label: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  maxFiles?: number;
  maxSize?: number;
  onFilesChange?: (files: readonly File[]) => void;
  onError?: (messages: readonly string[]) => void;
}
function validateFiles(
  files: readonly File[],
  { accept, maxFiles, maxSize, multiple }: FileSelectionProps,
) {
  const accepted: File[] = [];
  const errors: string[] = [];
  if (maxFiles !== undefined && (!Number.isSafeInteger(maxFiles) || maxFiles < 0))
    throw new Error("maxFiles must be a non-negative integer.");
  if (maxSize !== undefined && (!Number.isFinite(maxSize) || maxSize < 0))
    throw new Error("maxSize must be a non-negative byte count.");
  const patterns =
    accept
      ?.split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean) ?? [];
  for (const file of files) {
    if (maxSize !== undefined && file.size > maxSize)
      errors.push(`${file.name} exceeds the file size limit.`);
    else if (
      patterns.length &&
      !patterns.some((pattern) =>
        pattern.startsWith(".")
          ? file.name.toLowerCase().endsWith(pattern)
          : pattern.endsWith("/*")
            ? file.type.startsWith(pattern.slice(0, -1))
            : file.type === pattern,
      )
    )
      errors.push(`${file.name} has an unsupported file type.`);
    else if (accepted.length >= (maxFiles ?? Infinity) || (!multiple && accepted.length >= 1))
      errors.push(`${file.name} exceeds the file count limit.`);
    else accepted.push(file);
  }
  return { accepted, errors };
}

const sizeFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
/** "1.4 MB": binary steps, one decimal under ten. Stable across locales so SSR matches. */
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : sizeFormat.format(value)} ${units[unit]}`;
}
function describeAccept(accept: string | undefined) {
  const names = (accept ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) =>
      entry === "image/*"
        ? "Images"
        : entry === "audio/*"
          ? "Audio"
          : entry === "video/*"
            ? "Video"
            : entry.startsWith(".")
              ? entry.slice(1).toUpperCase()
              : (entry.split("/")[1] ?? entry).toUpperCase(),
    );
  return names.length ? names.join(", ") : "";
}
function describeLimits({ accept, maxSize, maxFiles, multiple }: FileSelectionProps) {
  const parts: string[] = [];
  const types = describeAccept(accept);
  if (types) parts.push(types);
  if (maxSize !== undefined) parts.push(`${types ? "up to" : "Up to"} ${formatBytes(maxSize)}`);
  const head = parts.join(", ");
  const tail =
    maxFiles !== undefined ? `${maxFiles} ${maxFiles === 1 ? "file" : "files"} at most` : "";
  return [head, tail].filter(Boolean).join(" · ");
}

export interface FileTriggerProps extends FileSelectionProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}
export function FileTrigger({ variant = "outline", size, ...props }: FileTriggerProps) {
  const input = React.useRef<HTMLInputElement>(null);
  function change(files: readonly File[]) {
    const result = validateFiles(files, props);
    props.onFilesChange?.(result.accepted);
    props.onError?.(result.errors);
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        disabled={props.disabled}
        hidden
        onChange={(event) => {
          change(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <Button
        variant={variant}
        size={size}
        disabled={props.disabled}
        onClick={() => input.current?.click()}
        className="shadow-xs"
      >
        <Upload data-icon="inline-start" aria-hidden />
        {props.label}
      </Button>
    </>
  );
}

export interface DropZoneProps extends FileSelectionProps {
  children?: React.ReactNode;
  /** The line under the title. Defaults to the accepted types and size limit. */
  hint?: React.ReactNode;
  /** Marks the zone as holding a rejected selection. */
  invalid?: boolean;
  /** A single-row layout for tight spaces. */
  compact?: boolean;
}
export function DropZone({ children, hint, invalid, compact, ...props }: DropZoneProps) {
  const [over, setOver] = React.useState(false);
  const hintId = React.useId();
  const hintContent = hint ?? describeLimits(props);
  return (
    <div
      role="group"
      aria-label={props.label}
      aria-disabled={props.disabled}
      aria-describedby={hintContent ? hintId : undefined}
      data-slot="dropzone"
      data-dragging={over || undefined}
      data-invalid={invalid || undefined}
      data-compact={compact || undefined}
      className={cn(
        "group/dropzone relative flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center transition-[border-color,background-color,box-shadow] duration-150 motion-reduce:transition-none dark:border-input",
        "hover:border-ring/50 data-[dragging]:border-solid data-[dragging]:border-ring data-[dragging]:bg-signal-muted data-[dragging]:ring-2 data-[dragging]:ring-ring/30",
        "data-[invalid]:border-destructive/60 data-[invalid]:bg-destructive/5",
        "aria-disabled:pointer-events-none aria-disabled:opacity-60",
        "data-[compact]:flex-row data-[compact]:gap-3 data-[compact]:p-3 data-[compact]:text-start",
      )}
      onDragOver={(event) => {
        if (props.disabled) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (props.disabled) return;
        const files = Array.from(event.dataTransfer.files);
        const result = validateFiles(files, props);
        props.onFilesChange?.(result.accepted);
        props.onError?.(result.errors);
      }}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-foreground/5 motion-safe:transition-[transform,background-color,color] motion-safe:duration-200",
          "group-data-[dragging]/dropzone:bg-signal group-data-[dragging]/dropzone:text-signal-foreground motion-safe:group-data-[dragging]/dropzone:-translate-y-1 motion-safe:group-data-[dragging]/dropzone:scale-110",
          "group-data-[invalid]/dropzone:bg-destructive/10 group-data-[invalid]/dropzone:text-destructive",
          "group-data-[compact]/dropzone:size-9",
        )}
      >
        <CloudUpload className="size-5 group-data-[compact]/dropzone:size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-1 group-data-[compact]/dropzone:flex-1">
        <p className="text-sm font-medium text-balance">
          {children ?? (over ? "Release to add files" : "Drop files here or browse")}
        </p>
        {hintContent && (
          <p id={hintId} className="text-xs text-pretty text-muted-foreground">
            {hintContent}
          </p>
        )}
      </div>
      <FileTrigger {...props} />
    </div>
  );
}

export interface FileUploadStatus {
  /** 0 to 100. Shows a progress bar under the name. */
  progress?: number;
  /** Shows the row as failed with this message. */
  error?: string;
  /** Marks the upload finished with a check. */
  done?: boolean;
}
export interface FileUploadProps extends FileSelectionProps {
  files?: readonly File[];
  defaultFiles?: readonly File[];
  /** Looks up the upload progress or error of each listed file. */
  status?: (file: File) => FileUploadStatus | undefined;
  hint?: React.ReactNode;
  compact?: boolean;
}
function fileGlyph(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type;
  if (type.startsWith("image/")) return FileImage;
  if (type.startsWith("audio/")) return FileAudio;
  if (type.startsWith("video/")) return FileVideo;
  if (/\.(zip|tar|gz|tgz|7z|rar)$/.test(name)) return FileArchive;
  if (/\.(csv|tsv|xlsx?|numbers)$/.test(name)) return FileSpreadsheet;
  if (/\.(json|jsx?|tsx?|html?|css|md|xml|ya?ml|sh)$/.test(name)) return FileCode;
  if (type.startsWith("text/") || /\.(txt|pdf|docx?|rtf)$/.test(name)) return FileText;
  return FileGlyph;
}
export function FileUpload({
  files,
  defaultFiles = [],
  status,
  hint,
  compact,
  ...props
}: FileUploadProps) {
  validateFiles([], props);
  const [own, setOwn] = React.useState<readonly File[]>(defaultFiles);
  const [errors, setErrors] = React.useState<readonly string[]>([]);
  const current = files ?? own;
  function update(next: readonly File[]) {
    if (files === undefined) setOwn(next);
    props.onFilesChange?.(next);
  }
  function append(selected: readonly File[]) {
    if (!selected.length) return;
    const next = props.multiple ? [...current, ...selected] : selected;
    update(next);
  }
  const total = current.reduce((sum, file) => sum + file.size, 0);
  return (
    <div data-slot="file-upload" className="flex w-full flex-col gap-3">
      <DropZone
        {...props}
        hint={hint}
        compact={compact}
        invalid={errors.length > 0}
        maxFiles={
          props.maxFiles === undefined
            ? undefined
            : Math.max(0, props.maxFiles - (props.multiple ? current.length : 0))
        }
        onFilesChange={append}
        onError={(next) => {
          setErrors(next);
          props.onError?.(next);
        }}
      />
      {current.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
            <span>
              {current.length} {current.length === 1 ? "file" : "files"}
            </span>
            <span>{formatBytes(total)}</span>
          </p>
          <ul aria-label={`${props.label} files`} className="m-0 flex list-none flex-col gap-2 p-0">
            {current.map((file, index) => {
              const state = status?.(file);
              const Glyph = fileGlyph(file);
              const failed = state?.error !== undefined;
              const uploading =
                !failed && !state?.done && state?.progress !== undefined && state.progress < 100;
              return (
                <li
                  key={`${file.name}-${file.lastModified}-${index}`}
                  data-state={
                    failed ? "error" : state?.done ? "done" : uploading ? "uploading" : "ready"
                  }
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 text-card-foreground shadow-xs transition-colors data-[state=error]:border-destructive/40 data-[state=error]:bg-destructive/5 dark:border-input"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground",
                      failed && "bg-destructive/10 text-destructive",
                    )}
                  >
                    <Glyph className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-medium">{file.name}</span>
                    <p
                      className={cn(
                        "truncate text-xs text-muted-foreground tabular-nums",
                        failed && "text-destructive",
                      )}
                    >
                      {formatBytes(file.size)}
                      {failed
                        ? ` · ${state.error}`
                        : uploading
                          ? ` · ${Math.round(state.progress ?? 0)}%`
                          : state?.done
                            ? " · Uploaded"
                            : ""}
                    </p>
                    {uploading && (
                      <Progress
                        value={state.progress ?? null}
                        aria-label={`Uploading ${file.name}`}
                        className="gap-0"
                      />
                    )}
                  </div>
                  {state?.done && (
                    <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />
                  )}
                  {failed && (
                    <CircleAlert aria-hidden className="size-4 shrink-0 text-destructive" />
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={props.disabled}
                    aria-label={`Remove ${file.name}`}
                    onClick={() => update(current.filter((_, item) => item !== index))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {errors.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive"
        >
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span className="text-pretty">{errors.join(" ")}</span>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* AngleSlider                                                                 */
/* -------------------------------------------------------------------------- */

export interface AngleSliderProps {
  label: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  disabled?: boolean;
  step?: number;
}
/** Tick marks around the dial: every 10 degrees, a longer one every 30 and 90. Rounded so SSR matches. */
const dialTicks = Array.from({ length: 36 }, (_, index) => {
  const degrees = index * 10;
  const radians = (degrees * Math.PI) / 180;
  const inner = degrees % 90 === 0 ? 38 : degrees % 30 === 0 ? 40.5 : 43;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  return {
    degrees,
    major: degrees % 90 === 0,
    x1: +(50 + sin * inner).toFixed(2),
    y1: +(50 - cos * inner).toFixed(2),
    x2: +(50 + sin * 46.5).toFixed(2),
    y2: +(50 - cos * 46.5).toFixed(2),
  };
});
export function AngleSlider({
  label,
  value,
  defaultValue = 0,
  onValueChange,
  disabled,
  step = 1,
}: AngleSliderProps) {
  if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(value ?? defaultValue))
    throw new Error("AngleSlider requires a finite value and a positive step.");
  const [own, setOwn] = React.useState(defaultValue);
  const [dragging, setDragging] = React.useState(false);
  const current = value ?? own;
  function change(next: number) {
    const normalized = Math.max(0, Math.min(360, Math.round(next / step) * step));
    if (value === undefined) setOwn(normalized);
    onValueChange?.(normalized);
  }
  function point(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    change(
      ((Math.atan2(
        event.clientY - bounds.top - bounds.height / 2,
        event.clientX - bounds.left - bounds.width / 2,
      ) *
        180) /
        Math.PI +
        90 +
        360) %
        360,
    );
  }
  return (
    <div data-slot="angle-slider" className="flex w-fit flex-col gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={current}
        aria-valuetext={`${current} degrees`}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        data-dragging={dragging || undefined}
        style={{ "--angle": `${current}deg` } as React.CSSProperties}
        className={cn(
          "relative grid size-36 cursor-grab touch-none place-items-center rounded-full border border-border shadow-xs outline-none select-none dark:border-input",
          "bg-[conic-gradient(from_0deg,var(--signal-muted)_var(--angle),var(--card)_0)]",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 data-[dragging]:cursor-grabbing",
          "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
        )}
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          point(event);
        }}
        onPointerMove={(event) => {
          if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) point(event);
        }}
        onPointerUp={(event) => {
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(event) => {
          if (disabled) return;
          const delta = event.shiftKey ? step * 10 : step;
          const next = (
            {
              ArrowRight: current + delta,
              ArrowUp: current + delta,
              ArrowLeft: current - delta,
              ArrowDown: current - delta,
              PageUp: current + step * 10,
              PageDown: current - step * 10,
              Home: 0,
              End: 360,
            } as Record<string, number>
          )[event.key];
          if (next !== undefined) {
            event.preventDefault();
            change(next);
          }
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="pointer-events-none absolute inset-0 size-full"
        >
          {dialTicks.map((tick) => (
            <line
              key={tick.degrees}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              strokeLinecap="round"
              strokeWidth={tick.major ? 1.2 : 0.7}
              className={tick.major ? "stroke-foreground/60" : "stroke-muted-foreground/45"}
            />
          ))}
        </svg>
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-(--ease-standard)",
            dragging && "motion-safe:transition-none",
          )}
          style={{ transform: `rotate(${current}deg)` }}
        >
          <span className="absolute inset-x-0 top-[17%] mx-auto h-[13%] w-0.5 rounded-full bg-foreground/70" />
          <span className="absolute inset-x-0 top-[12%] mx-auto size-3.5 rounded-full border-2 border-signal bg-background shadow-sm" />
        </span>
        <span className="pointer-events-none relative text-lg font-semibold tabular-nums">
          {current}°
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* RatingGroup                                                                 */
/* -------------------------------------------------------------------------- */

export interface RatingGroupProps extends Omit<RadioGroupProps, "options"> {
  max?: number;
  /** Lets people pick half stars; ids become "0.5", "1", "1.5" and so on. */
  allowHalf?: boolean;
}
function ratingLabel(amount: number) {
  return `${amount} ${amount === 1 ? "star" : "stars"}`;
}
export function RatingGroup({
  max = 5,
  allowHalf = false,
  label,
  value,
  defaultValue,
  onValueChange,
  className,
  ...props
}: RatingGroupProps) {
  const [own, setOwn] = React.useState(defaultValue === undefined ? "" : String(defaultValue));
  const [hover, setHover] = React.useState<number | null>(null);
  const selected = value === undefined ? own : String(value);
  const rating = selected === "" ? 0 : Number(selected);
  const shown = hover ?? rating;
  const step = allowHalf ? 0.5 : 1;
  const choices = Array.from({ length: max / step }, (_, index) => (index + 1) * step);
  const interactive = !props.disabled && !props.readOnly;
  return (
    <FieldsetPrimitive.Root data-slot="rating-group" className="flex flex-col gap-1.5">
      <FieldsetPrimitive.Legend className="text-sm font-medium">{label}</FieldsetPrimitive.Legend>
      <div className="flex items-center gap-3">
        <RadioGroupPrimitive
          {...props}
          value={selected}
          onValueChange={(next, details) => {
            if (value === undefined) setOwn(String(next));
            onValueChange?.(next, details);
          }}
          className={cn(
            "inline-flex items-center",
            props.disabled && "opacity-60",
            className as string | undefined,
          )}
          onPointerLeave={() => setHover(null)}
        >
          {Array.from({ length: max }, (_, index) => {
            const fill = Math.max(0, Math.min(1, shown - index));
            return (
              <span
                key={index}
                data-slot="rating-star"
                className="relative grid size-8 place-items-center"
              >
                <Star
                  aria-hidden
                  className="size-6 text-muted-foreground/40 motion-safe:transition-transform motion-safe:duration-150"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 start-0 flex items-center overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                >
                  <span className="grid size-8 shrink-0 place-items-center">
                    <Star
                      className={cn(
                        "size-6 fill-current stroke-current",
                        hover === null ? "text-warning" : "text-warning/80",
                      )}
                    />
                  </span>
                </span>
                {choices
                  .filter((choice) => choice > index && choice <= index + 1)
                  .map((choice) => (
                    <RadioPrimitive.Root
                      key={choice}
                      value={String(choice)}
                      aria-label={ratingLabel(choice)}
                      onPointerEnter={() => interactive && setHover(choice)}
                      className={cn(
                        "absolute inset-y-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/20",
                        allowHalf ? (choice % 1 ? "start-0 w-1/2" : "end-0 w-1/2") : "inset-x-0",
                        interactive ? "cursor-pointer" : "cursor-default",
                      )}
                    />
                  ))}
              </span>
            );
          })}
        </RadioGroupPrimitive>
        <span aria-hidden className="min-w-12 text-xs text-muted-foreground tabular-nums">
          {rating ? `${rating} / ${max}` : "Not rated"}
        </span>
      </div>
    </FieldsetPrimitive.Root>
  );
}

/* -------------------------------------------------------------------------- */
/* SegmentGroup                                                                */
/* -------------------------------------------------------------------------- */

export interface SegmentGroupProps {
  label: string;
  items: readonly {
    id: string;
    label: React.ReactNode;
    disabled?: boolean;
    /** An icon shown before the label. */
    icon?: React.ReactNode;
  }[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  size?: "sm" | "default" | "lg";
  /** Stretches the segments to fill the available width. */
  fullWidth?: boolean;
}
export function SegmentGroup({
  label,
  items,
  value,
  defaultValue,
  onValueChange,
  size = "default",
  fullWidth = false,
}: SegmentGroupProps) {
  const [own, setOwn] = React.useState(defaultValue);
  const current = value ?? own;
  const group = React.useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = React.useState<{ left: number; width: number } | null>(null);
  React.useLayoutEffect(() => {
    const root = group.current;
    if (!root) return;
    const measure = () => {
      const active = root.querySelector<HTMLElement>("[data-pressed]");
      // offsetLeft is physical and the indicator is positioned from the physical left edge,
      // so the measured box lines up in both writing directions.
      setIndicator((previous) => {
        if (!active) return previous === null ? previous : null;
        const next = { left: active.offsetLeft, width: active.offsetWidth };
        return previous?.left === next.left && previous.width === next.width ? previous : next;
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [current, items, size, fullWidth]);
  const heights = { sm: "h-6 text-xs", default: "h-7 text-sm", lg: "h-8 text-sm" } as const;
  return (
    <ToggleGroup
      ref={group}
      aria-label={label}
      data-slot="segment-group"
      data-ready={indicator ? "" : undefined}
      className={cn(
        "group/seg relative isolate items-center gap-0 rounded-lg bg-muted p-[3px] text-muted-foreground",
        fullWidth ? "flex w-full" : "inline-flex w-fit",
      )}
      value={current === undefined ? [] : [current]}
      onValueChange={(next) => {
        const selected = next[0];
        if (!selected) return;
        if (value === undefined) setOwn(selected);
        onValueChange?.(selected);
      }}
    >
      <span
        aria-hidden
        data-slot="segment-indicator"
        className={cn(
          "pointer-events-none absolute start-0 top-[3px] bottom-[3px] -z-10 rounded-md bg-background shadow-sm ring-1 ring-foreground/5 motion-safe:transition-[transform,width] motion-safe:duration-200 motion-safe:ease-(--ease-standard) dark:bg-input/60",
          !indicator && "hidden",
        )}
        style={
          indicator
            ? { width: indicator.width, transform: `translateX(${indicator.left - 3}px)` }
            : undefined
        }
      />
      {items.map((item) => (
        <Toggle
          key={item.id}
          value={item.id}
          disabled={item.disabled}
          className={cn(
            "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 font-medium whitespace-nowrap outline-none select-none",
            heights[size],
            fullWidth && "flex-1",
            "transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 data-[pressed]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0",
            "group-[:not([data-ready])]/seg:data-[pressed]:bg-background",
          )}
        >
          {item.icon}
          {item.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

/* -------------------------------------------------------------------------- */
/* Steps and Toc                                                               */
/* -------------------------------------------------------------------------- */

export interface StepsProps {
  label: string;
  items: readonly { id: string; title: string; description?: string; error?: boolean }[];
  value?: number;
  onValueChange?: (step: number) => void;
  orientation?: "vertical" | "horizontal";
}
export function Steps({
  label,
  items,
  value = 0,
  onValueChange,
  orientation = "vertical",
}: StepsProps) {
  const horizontal = orientation === "horizontal";
  return (
    <nav aria-label={label} data-slot="steps" data-orientation={orientation}>
      <ol
        className={cn(
          "m-0 flex list-none p-0",
          horizontal ? "flex-row items-start gap-1" : "flex-col",
        )}
      >
        {items.map((item, index) => {
          const complete = index < value;
          const current = index === value;
          const state = item.error
            ? "error"
            : complete
              ? "complete"
              : current
                ? "current"
                : "upcoming";
          const last = index === items.length - 1;
          const body = (
            <>
              <span
                aria-hidden
                data-state={state}
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums motion-safe:transition-colors",
                  "data-[state=upcoming]:border-border data-[state=upcoming]:bg-background data-[state=upcoming]:text-muted-foreground",
                  "data-[state=current]:border-signal data-[state=current]:bg-signal-muted data-[state=current]:text-signal data-[state=current]:ring-3 data-[state=current]:ring-signal/20",
                  "data-[state=complete]:border-primary data-[state=complete]:bg-primary data-[state=complete]:text-primary-foreground",
                  "data-[state=error]:border-destructive data-[state=error]:bg-destructive/10 data-[state=error]:text-destructive",
                )}
              >
                {item.error ? (
                  <CircleAlert className="size-3.5" />
                ) : complete ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  "flex min-w-0 flex-col gap-0.5 text-start",
                  horizontal && !current && "max-sm:sr-only",
                )}
              >
                <span
                  className={cn(
                    "text-sm leading-6 font-medium",
                    state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {item.title}
                  <span className="sr-only">
                    {" "}
                    (
                    {state === "complete" ? "completed" : state === "upcoming" ? "upcoming" : state}
                    )
                  </span>
                </span>
                {item.description && (
                  <small className="text-xs font-normal text-pretty text-muted-foreground">
                    {item.description}
                  </small>
                )}
              </span>
            </>
          );
          return (
            <li
              key={item.id}
              aria-current={current ? "step" : undefined}
              data-complete={complete || undefined}
              data-state={state}
              className={cn(
                "relative",
                horizontal
                  ? cn("flex min-w-0 items-center gap-1", last ? "flex-none" : "flex-1")
                  : cn(
                      "flex flex-col",
                      !last &&
                        "after:absolute after:start-[calc(0.375rem+0.75rem-0.5px)] after:top-[2.25rem] after:-bottom-1 after:w-px after:bg-border after:content-[''] data-[complete]:after:bg-primary",
                    ),
              )}
            >
              {onValueChange ? (
                <Button
                  variant="ghost"
                  onClick={() => onValueChange(index)}
                  className={cn(
                    "h-auto items-start gap-3 px-1.5 py-2 text-start whitespace-normal",
                    horizontal ? "shrink-0" : "w-full justify-start",
                  )}
                >
                  {body}
                </Button>
              ) : (
                <span
                  className={cn(
                    "flex items-start gap-3 px-1.5 py-2",
                    horizontal ? "shrink-0" : "w-full",
                  )}
                >
                  {body}
                </span>
              )}
              {horizontal && !last && (
                <span
                  aria-hidden
                  className={cn(
                    "h-px min-w-3 flex-1 bg-border motion-safe:transition-colors",
                    complete && "bg-primary",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
export function Toc({
  items,
  label = "On this page",
  activeId,
  heading = true,
}: {
  items: readonly { id: string; label: string; level?: number }[];
  label?: string;
  activeId?: string;
  /** Shows `label` as a visible heading above the list. */
  heading?: boolean;
}) {
  return (
    <nav aria-label={label} data-slot="toc" className="flex flex-col gap-2">
      {heading && (
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      )}
      <ol className="m-0 flex list-none flex-col border-s border-border p-0">
        {items.map((item) => {
          const level = Math.max(1, item.level ?? 1);
          const active = item.id === activeId;
          return (
            <li key={item.id} style={{ "--toc-level": level } as React.CSSProperties}>
              <a
                href={`#${encodeURIComponent(item.id)}`}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "relative -ms-px flex min-h-8 items-center border-s-2 border-transparent pe-2 text-[13px] leading-snug text-muted-foreground outline-none",
                  "ps-[calc(0.75rem+(var(--toc-level)-1)*0.75rem)]",
                  "motion-safe:transition-colors motion-safe:duration-150 hover:text-foreground focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring/20",
                  "aria-[current]:border-signal aria-[current]:font-medium aria-[current]:text-foreground",
                  level > 2 && "text-xs",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* NavigationMenu                                                              */
/* -------------------------------------------------------------------------- */

export interface NavigationMenuLink {
  id: string;
  label: string;
  description?: string;
  href?: string;
  icon?: React.ReactNode;
}
export interface NavigationMenuItem {
  id: string;
  label: string;
  href?: string;
  children?: React.ReactNode;
  /** Titled links for the dropdown panel, shown when `children` is not given. */
  links?: readonly NavigationMenuLink[];
  /** Marks a plain link as the current page. */
  current?: boolean;
}
const navItemClasses =
  "inline-flex h-8 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-foreground outline-none transition-colors select-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/20 data-[popup-open]:bg-muted aria-[current]:bg-muted";
export function NavigationMenu({
  label,
  items,
}: {
  label: string;
  items: readonly NavigationMenuItem[];
}) {
  return (
    <NavigationPrimitive.Root aria-label={label} data-slot="navigation-menu" className="w-fit">
      <NavigationPrimitive.List className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
        {items.map((item) => (
          <NavigationPrimitive.Item key={item.id}>
            {item.children || item.links?.length ? (
              <>
                <NavigationPrimitive.Trigger className={cn(navItemClasses, "group/nav")}>
                  {item.label}
                  <NavigationPrimitive.Icon className="grid text-muted-foreground transition-transform duration-150 group-data-[popup-open]/nav:rotate-180 motion-reduce:transition-none">
                    <ChevronDown aria-hidden className="size-3.5" />
                  </NavigationPrimitive.Icon>
                </NavigationPrimitive.Trigger>
                <NavigationPrimitive.Content className="p-1.5 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none">
                  {item.children != null ? (
                    // Custom panel content gets a panel of its own: room, a readable measure and
                    // the same type as the link panels.
                    <div className="w-[min(20rem,calc(100vw-3rem))] p-2 text-sm text-pretty text-popover-foreground">
                      {item.children}
                    </div>
                  ) : (
                    <ul className="m-0 grid w-[min(26rem,calc(100vw-3rem))] list-none gap-0.5 p-0 sm:grid-cols-2">
                      {item.links?.map((link) => (
                        <li key={link.id}>
                          <NavigationPrimitive.Link
                            closeOnClick
                            href={safeNavigationHref(link.href)}
                            className="flex items-start gap-3 rounded-lg p-2.5 no-underline outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/20"
                          >
                            {link.icon && (
                              <span
                                aria-hidden
                                className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-background text-muted-foreground [&_svg]:size-4"
                              >
                                {link.icon}
                              </span>
                            )}
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="text-sm font-medium text-foreground">
                                {link.label}
                              </span>
                              {link.description && (
                                <span className="text-xs text-pretty text-muted-foreground">
                                  {link.description}
                                </span>
                              )}
                            </span>
                          </NavigationPrimitive.Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </NavigationPrimitive.Content>
              </>
            ) : (
              <NavigationPrimitive.Link
                className={cn(navItemClasses, "no-underline")}
                href={safeNavigationHref(item.href)}
                aria-current={item.current ? "page" : undefined}
              >
                {item.label}
              </NavigationPrimitive.Link>
            )}
          </NavigationPrimitive.Item>
        ))}
      </NavigationPrimitive.List>
      <NavigationPrimitive.Portal>
        <NavigationPrimitive.Positioner className="z-50" sideOffset={8} collisionPadding={8}>
          <NavigationPrimitive.Popup className="h-(--popup-height) max-w-[calc(100vw-1rem)] origin-(--transform-origin) rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none transition-[opacity,transform,width,height] duration-200 ease-(--ease-standard) data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 w-(--popup-width) motion-reduce:transition-none">
            <NavigationPrimitive.Viewport className="relative size-full overflow-hidden" />
          </NavigationPrimitive.Popup>
        </NavigationPrimitive.Positioner>
      </NavigationPrimitive.Portal>
    </NavigationPrimitive.Root>
  );
}

/* -------------------------------------------------------------------------- */
/* JsonTreeView                                                                */
/* -------------------------------------------------------------------------- */

type JsonKind =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "bigint"
  | "function"
  | "symbol"
  | "object"
  | "array"
  | "note";
interface JsonMeta {
  key: string;
  kind: JsonKind;
  /** The rendered value of a leaf, or a note such as "[Circular]". */
  text: string;
  /** Entry count of an object or array. */
  size?: number;
  index?: boolean;
}
function JsonLabel({ meta, fallback }: { meta: JsonMeta | undefined; fallback: string }) {
  if (!meta) return <>{fallback}</>;
  const container = meta.kind === "object" || meta.kind === "array";
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 font-mono text-[13px] leading-5">
      <span data-json-part="key" data-index={meta.index || undefined}>
        {meta.key}
      </span>
      {container ? (
        <span
          data-json-part="count"
          className="rounded-sm bg-muted px-1.5 text-2xs leading-4 tabular-nums"
        >
          {meta.kind === "array"
            ? `${meta.size} ${meta.size === 1 ? "item" : "items"}`
            : `${meta.size} ${meta.size === 1 ? "key" : "keys"}`}
        </span>
      ) : (
        <>
          <span aria-hidden data-json-part="colon">
            :
          </span>
          <span data-json-kind={meta.kind} className="truncate" title={meta.text}>
            {meta.text}
          </span>
        </>
      )}
    </span>
  );
}
export function JsonTreeView({
  value,
  label = "JSON",
  renderLabel,
  ...props
}: Omit<React.ComponentProps<typeof Tree>, "items" | "label" | "value"> & {
  value: unknown;
  label?: string;
}) {
  const seen = new WeakSet<object>();
  const meta = new Map<string, JsonMeta>();
  function nodes(value: unknown, path: string, name: string, depth = 0, index = false): TreeNode {
    if (depth > 64) {
      meta.set(path, { key: name, kind: "note", text: "maximum depth", index });
      return { id: path, label: `${name}: maximum depth` };
    }
    if (value === null || typeof value !== "object") {
      const text =
        typeof value === "string"
          ? JSON.stringify(value)
          : typeof value === "bigint"
            ? `${value}n`
            : String(value);
      meta.set(path, {
        key: name,
        kind: value === null ? "null" : (typeof value as JsonKind),
        text,
        index,
      });
      return { id: path, label: `${name}: ${text}` };
    }
    if (seen.has(value)) {
      meta.set(path, { key: name, kind: "note", text: "[Circular]", index });
      return { id: path, label: `${name}: [Circular]` };
    }
    seen.add(value);
    const entries = Object.entries(value);
    const array = Array.isArray(value);
    meta.set(path, {
      key: name,
      kind: array ? "array" : "object",
      text: "",
      size: entries.length,
      index,
    });
    const result = {
      id: path,
      label: `${name} ${array ? `[${entries.length}]` : `{${entries.length}}`}`,
      children: entries.map(([key, entry]) =>
        nodes(
          entry,
          `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
          key,
          depth + 1,
          array,
        ),
      ),
    };
    seen.delete(value);
    return result;
  }
  const root = nodes(value, "$", label);
  return (
    <div data-slot="json-tree-view" className="fux-json">
      <Tree
        {...props}
        label={label}
        items={[root]}
        renderLabel={
          renderLabel ?? ((node) => <JsonLabel meta={meta.get(node.id)} fallback={node.label} />)
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* QrCode                                                                      */
/* -------------------------------------------------------------------------- */

export interface QrCodeProps {
  value: string;
  label?: string;
  size?: number;
  correction?: "L" | "M" | "Q" | "H";
  /** A line under the code, such as the address it opens. */
  caption?: React.ReactNode;
}
export function QrCode({
  value,
  label = "QR code",
  size = 160,
  correction = "M",
  caption,
}: QrCodeProps) {
  const encoded = React.useMemo(() => {
    try {
      return encode(value, { ecc: correction, border: 4 });
    } catch {
      return null;
    }
  }, [value, correction]);
  if (!encoded)
    return (
      <span
        role="alert"
        className="flex items-center gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        <CircleAlert aria-hidden className="size-4 shrink-0" />
        This value is too large for a QR code.
      </span>
    );
  const path = encoded.data
    .flatMap((row, y) => row.flatMap((filled, x) => (filled ? [`M${x} ${y}h1v1h-1z`] : [])))
    .join("");
  return (
    <figure
      data-slot="qr-code"
      className="m-0 flex w-fit flex-col items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-xs dark:border-input"
    >
      {/* A QR code needs dark modules on a light quiet zone in every theme, so these stay fixed. */}
      <svg
        role="img"
        aria-label={label}
        width={size}
        height={size}
        viewBox={`0 0 ${encoded.size} ${encoded.size}`}
        shapeRendering="crispEdges"
        className="block max-w-full rounded-lg ring-1 ring-foreground/10"
      >
        <rect width="100%" height="100%" fill="white" />
        <path d={path} fill="black" />
      </svg>
      {caption && (
        <figcaption className="max-w-full px-1 pb-1 text-center text-xs break-words text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Timer                                                                       */
/* -------------------------------------------------------------------------- */

export interface TimerProps {
  label: string;
  seconds: number;
  onComplete?: () => void;
}
export function Timer({ label, seconds, onComplete }: TimerProps) {
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new Error("Timer seconds must be finite and non-negative.");
  const [remaining, setRemaining] = React.useState(seconds);
  const [running, setRunning] = React.useState(false);
  const runningRef = React.useRef(false);
  const remainingRef = React.useRef(seconds);
  const deadline = React.useRef(0);
  const callback = React.useRef(onComplete);
  callback.current = onComplete;
  function reset() {
    runningRef.current = false;
    remainingRef.current = seconds;
    setRunning(false);
    setRemaining(seconds);
  }
  React.useEffect(reset, [seconds]);
  React.useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (!runningRef.current) return;
      const next = Math.max(0, (deadline.current - Date.now()) / 1000);
      remainingRef.current = next;
      setRemaining(next);
      if (!next) {
        runningRef.current = false;
        setRunning(false);
        callback.current?.();
      }
    };
    const interval = setInterval(tick, 50);
    return () => clearInterval(interval);
  }, [running]);
  function toggle() {
    if (runningRef.current) {
      remainingRef.current = Math.max(0, (deadline.current - Date.now()) / 1000);
      setRemaining(remainingRef.current);
    } else deadline.current = Date.now() + remainingRef.current * 1000;
    runningRef.current = !runningRef.current;
    setRunning(runningRef.current);
  }
  const whole = Math.ceil(remaining);
  const finished = remaining === 0 && seconds > 0;
  const state = finished ? "finished" : running ? "running" : "idle";
  const elapsed = seconds > 0 ? Math.min(1, Math.max(0, 1 - remaining / seconds)) : 1;
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="timer"
      data-state={state}
      className="group/timer flex w-full max-w-xs flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs dark:border-input"
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <output
        aria-label="Time remaining"
        aria-live="off"
        className={cn(
          "font-mono text-4xl leading-none font-semibold tracking-tight tabular-nums motion-safe:transition-colors",
          "group-data-[state=idle]/timer:text-muted-foreground group-data-[state=finished]/timer:text-destructive",
        )}
      >
        {Math.floor(whole / 60)}:{String(whole % 60).padStart(2, "0")}
      </output>
      <div aria-hidden className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full origin-left rounded-full bg-primary group-data-[state=finished]/timer:bg-destructive rtl:origin-right"
          style={{ transform: `scaleX(${1 - elapsed})` }}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button disabled={!remaining} onClick={toggle} className="min-w-24">
          {running ? (
            <Pause data-icon="inline-start" aria-hidden />
          ) : (
            <Play data-icon="inline-start" aria-hidden />
          )}
          {running ? "Pause" : "Start"}
        </Button>
        <Button variant="outline" onClick={reset} className="shadow-xs">
          <RotateCcw data-icon="inline-start" aria-hidden />
          Reset
        </Button>
        <span role="status" className="sr-only">
          {finished ? "Time is up" : ""}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Marquee and Carousel                                                        */
/* -------------------------------------------------------------------------- */

export function Marquee({
  children,
  label,
  duration = 20,
}: {
  children: React.ReactNode;
  label: string;
  duration?: number;
}) {
  const [paused, setPaused] = React.useState(false);
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="marquee"
      data-paused={paused || undefined}
      className="flex w-full items-center gap-2"
    >
      <div className="fux-marquee-viewport min-w-0 flex-1">
        <div
          className="fux-marquee-track"
          style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}
        >
          <div className="fux-marquee-copy">{children}</div>
          <div className="fux-marquee-copy" aria-hidden inert>
            {children}
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
        className="text-muted-foreground"
      >
        {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
        <span className="sr-only">{paused ? "Resume motion" : "Pause motion"}</span>
      </Button>
    </div>
  );
}

export function Carousel({ label, children }: { label: string; children: React.ReactNode }) {
  const viewport = React.useRef<HTMLDivElement>(null);
  const slides = React.Children.toArray(children);
  const [ownActive, setActive] = React.useState(0);
  const active = Math.max(0, Math.min(ownActive, slides.length - 1));
  function go(index: number) {
    const next = Math.max(0, Math.min(slides.length - 1, index));
    const child = viewport.current?.children[next] as HTMLElement | undefined;
    child?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "nearest",
      inline: "start",
    });
    setActive(next);
  }
  function readScroll() {
    const el = viewport.current;
    if (!el || !el.clientWidth) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const bounds = el.getBoundingClientRect();
    const edge = rtl ? bounds.right : bounds.left;
    let nearest = 0;
    let distance = Infinity;
    Array.from(el.children).forEach((child, index) => {
      const box = child.getBoundingClientRect();
      const delta = Math.abs((rtl ? box.right : box.left) - edge);
      if (delta < distance) {
        nearest = index;
        distance = delta;
      }
    });
    setActive(nearest);
  }
  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      data-slot="carousel"
      className="flex w-full flex-col gap-3"
    >
      <div
        ref={viewport}
        tabIndex={0}
        aria-label={`${label} slides`}
        className="fux-carousel-viewport flex snap-x snap-mandatory overflow-x-auto rounded-xl border border-border bg-card shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 dark:border-input"
        onScroll={readScroll}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            go(active + (event.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1));
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            go(event.key === "Home" ? 0 : slides.length - 1);
          }
        }}
      >
        {slides.map((slide, index) => (
          <div
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
            className="min-w-0 shrink-0 basis-full snap-start p-4"
            key={index}
          >
            {slide}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous"
          disabled={!slides.length || active === 0}
          onClick={() => go(active - 1)}
          className="shadow-xs"
        >
          <ChevronLeft aria-hidden className="rtl:rotate-180" />
        </Button>
        <div role="group" aria-label="Choose slide" className="flex min-w-0 flex-1 justify-center">
          {slides.map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === active ? "true" : undefined}
              onClick={() => go(index)}
              className="group/dot grid size-6 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full bg-border motion-safe:transition-[width,background-color] motion-safe:duration-200 group-hover/dot:bg-muted-foreground group-aria-[current]/dot:w-5 group-aria-[current]/dot:bg-primary"
              />
            </button>
          ))}
        </div>
        <output
          aria-live="polite"
          className="min-w-12 text-center text-xs text-muted-foreground tabular-nums"
        >
          {slides.length ? active + 1 : 0} / {slides.length}
        </output>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next"
          disabled={!slides.length || active >= slides.length - 1}
          onClick={() => go(active + 1)}
          className="shadow-xs"
        >
          <ChevronRight aria-hidden className="rtl:rotate-180" />
        </Button>
      </div>
    </section>
  );
}
