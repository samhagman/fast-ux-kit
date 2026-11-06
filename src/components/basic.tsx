"use client";

import * as React from "react";
import { Field as FieldPrimitive } from "@base-ui/react/field";
import { Fieldset as FieldsetPrimitive } from "@base-ui/react/fieldset";
import { Form as FormPrimitive } from "@base-ui/react/form";
import { NumberField as NumberPrimitive } from "@base-ui/react/number-field";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { CheckboxGroup as CheckboxGroupPrimitive } from "@base-ui/react/checkbox-group";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { Meter as MeterPrimitive } from "@base-ui/react/meter";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { OTPField } from "@base-ui/react/otp-field";
import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar";
import {
  CircleAlertIcon,
  EyeIcon,
  EyeOffIcon,
  ExternalLinkIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Button } from "./ui/button.js";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group.js";
import { Input } from "./ui/input.js";
import { Textarea } from "./ui/textarea.js";
import { Checkbox as CheckboxControl } from "./ui/checkbox.js";
import { Switch as SwitchControl } from "./ui/switch.js";
import { cn } from "../lib/utils.js";

export { Button, Input, Textarea };

// ---------------------------------------------------------------------------------------------
// Shared anatomy. Every field-shaped family uses the same label, hint and error treatment so a
// form reads as one system. Heights come from the shared 44px target (`fux-target-block`).
// ---------------------------------------------------------------------------------------------

const labelClass =
  "flex w-fit items-center gap-1 text-ui leading-5 font-medium text-foreground group-data-disabled/field:opacity-60";
const hintClass = "text-xs leading-4 text-pretty text-muted-foreground";
const errorClass = "flex items-start gap-1.5 text-xs leading-4 text-pretty text-destructive";
const fieldsetClass = "m-0 flex min-w-0 flex-col border-0 p-0";
const legendClass = "mb-1.5 flex w-fit items-center gap-1 p-0 text-ui leading-5 font-medium";
const inputExtras = "read-only:bg-muted/50 read-only:text-muted-foreground";
const shellClass =
  "fux-target-block h-auto items-center [&_[data-slot=input-group-control]]:h-auto [&_[data-slot=input-group-control]]:self-stretch has-[input:read-only]:bg-muted/50 has-[input:read-only]:text-muted-foreground [&_[data-slot=input-group-addon]]:text-[length:var(--fux-input-font-size,1rem)] [&_[data-slot=input-group-addon]:has(>button)]:me-0";

function componentClasses<State>(
  base: string,
  className: string | ((state: State) => string | undefined) | undefined,
) {
  return typeof className === "function"
    ? (state: State) => cn(base, className(state))
    : cn(base, className);
}

function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  );
}

function ErrorMessage({
  children,
  ...props
}: Omit<React.ComponentProps<typeof FieldPrimitive.Error>, "match">) {
  return (
    <FieldPrimitive.Error match {...props} className={errorClass}>
      <CircleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </FieldPrimitive.Error>
  );
}

/** A small icon button that lives inside an input shell; its hit area still reaches 44px. */
function AddonButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      data-slot="field-addon-button"
      className={cn(
        "relative text-muted-foreground after:absolute after:inset-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.RefObject<T | null>).current = node;
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

export interface IconButtonProps extends React.ComponentProps<typeof Button> {
  label: string;
}

export function IconButton({ label, children, ...props }: IconButtonProps) {
  return (
    <Button variant="ghost" size="icon" {...props} aria-label={label}>
      <span aria-hidden="true" className="inline-flex items-center justify-center">
        {children}
      </span>
    </Button>
  );
}

export interface LinkProps extends React.ComponentProps<"a"> {
  /** Flows with surrounding text instead of keeping the 44px target of a standalone link. */
  inline?: boolean;
  /** Opens in a new tab with an icon and a hidden announcement. */
  external?: boolean;
}

export function Link({ className, inline, external, children, ...props }: LinkProps) {
  return (
    <a
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...props}
      className={cn("fux-link", inline && "fux-link-inline", className)}
    >
      {children}
      {external && (
        <>
          <ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      )}
    </a>
  );
}

function ToolbarRoot(props: React.ComponentProps<typeof ToolbarPrimitive.Root>) {
  return (
    <ToolbarPrimitive.Root
      {...props}
      className={componentClasses("fux-row fux-toolbar", props.className)}
    />
  );
}
function ToolbarButton(props: React.ComponentProps<typeof ToolbarPrimitive.Button>) {
  return (
    <ToolbarPrimitive.Button
      {...props}
      className={componentClasses("fux-control fux-toolbar-button", props.className)}
    />
  );
}
function ToolbarGroup(props: React.ComponentProps<typeof ToolbarPrimitive.Group>) {
  return (
    <ToolbarPrimitive.Group
      {...props}
      className={componentClasses("fux-row fux-toolbar-group", props.className)}
    />
  );
}
function ToolbarInput(props: React.ComponentProps<typeof ToolbarPrimitive.Input>) {
  return (
    <ToolbarPrimitive.Input
      render={<Input />}
      {...props}
      className={componentClasses("h-auto w-44 max-w-full", props.className)}
    />
  );
}
function ToolbarLink(props: React.ComponentProps<typeof ToolbarPrimitive.Link>) {
  return (
    <ToolbarPrimitive.Link
      {...props}
      className={componentClasses("fux-link fux-toolbar-link", props.className)}
    />
  );
}
function ToolbarSeparator(props: React.ComponentProps<typeof ToolbarPrimitive.Separator>) {
  return (
    <ToolbarPrimitive.Separator
      {...props}
      className={componentClasses(
        "fux-separator mx-1 my-2 w-px shrink-0 self-stretch bg-border data-[orientation=horizontal]:mx-2 data-[orientation=horizontal]:my-1 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-auto",
        props.className,
      )}
    />
  );
}
export const Toolbar = {
  Root: ToolbarRoot,
  Button: ToolbarButton,
  Group: ToolbarGroup,
  Input: ToolbarInput,
  Link: ToolbarLink,
  Separator: ToolbarSeparator,
};

// ---------------------------------------------------------------------------------------------
// Text entry
// ---------------------------------------------------------------------------------------------

export function Form<FormValues extends Record<string, unknown> = Record<string, unknown>>(
  props: FormPrimitive.Props<FormValues> & { ref?: React.Ref<HTMLFormElement> },
) {
  return (
    <FormPrimitive {...props} className={componentClasses("fux-field fux-form", props.className)} />
  );
}

export interface FieldProps extends Omit<React.ComponentProps<typeof Input>, "onChange"> {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  onValueChange?: (value: string) => void;
  /** Content inside the start edge of the input: an icon, a currency sign, a scheme. */
  startAddon?: React.ReactNode;
  /** Content inside the end edge of the input: a unit, a shortcut, an action button. */
  endAddon?: React.ReactNode;
}

export function Field({
  label,
  hint,
  error,
  onValueChange,
  className,
  startAddon,
  endAddon,
  ...props
}: FieldProps) {
  const grouped = startAddon != null || endAddon != null;
  const control = (
    <FieldPrimitive.Control
      render={grouped ? <InputGroupInput /> : <Input className={inputExtras} />}
      {...props}
      onChange={(event) => onValueChange?.(event.target.value)}
    />
  );
  return (
    <FieldPrimitive.Root
      className={componentClasses("fux-field group/field", className)}
      invalid={Boolean(error)}
      name={props.name}
      disabled={props.disabled}
    >
      <FieldPrimitive.Label className={labelClass}>
        {label}
        {props.required && <RequiredMark />}
      </FieldPrimitive.Label>
      {grouped ? (
        <InputGroup className={shellClass}>
          {startAddon != null && <InputGroupAddon>{startAddon}</InputGroupAddon>}
          {control}
          {endAddon != null && <InputGroupAddon align="inline-end">{endAddon}</InputGroupAddon>}
        </InputGroup>
      ) : (
        control
      )}
      {hint && (
        <FieldPrimitive.Description className={hintClass}>{hint}</FieldPrimitive.Description>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </FieldPrimitive.Root>
  );
}

export interface TextAreaProps extends Omit<React.ComponentProps<typeof Textarea>, "onChange"> {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  onValueChange?: (value: string) => void;
}

export function TextArea({
  label,
  hint,
  error,
  className,
  onValueChange,
  ...props
}: TextAreaProps) {
  const generatedId = React.useId();
  const id = props.id ?? generatedId;
  const [typed, setTyped] = React.useState(String(props.value ?? props.defaultValue ?? "").length);
  const length = props.value !== undefined ? String(props.value).length : typed;
  const describedBy =
    [props["aria-describedby"], hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <FieldPrimitive.Root
      className={componentClasses("fux-field group/field", className)}
      invalid={Boolean(error)}
      name={props.name}
      disabled={props.disabled}
    >
      <FieldPrimitive.Label className={labelClass} htmlFor={id}>
        {label}
        {props.required && <RequiredMark />}
      </FieldPrimitive.Label>
      <FieldPrimitive.Control
        render={<Textarea {...props} className={inputExtras} />}
        id={id}
        onChange={(event) => {
          setTyped(event.target.value.length);
          onValueChange?.(event.target.value);
        }}
        aria-invalid={Boolean(error) || props["aria-invalid"]}
        aria-describedby={describedBy}
      />
      {(hint || props.maxLength) && (
        <div className="flex items-start justify-between gap-3">
          {hint ? (
            <FieldPrimitive.Description id={`${id}-hint`} className={hintClass}>
              {hint}
            </FieldPrimitive.Description>
          ) : (
            <span />
          )}
          {props.maxLength ? (
            <span
              aria-hidden="true"
              className={cn(
                hintClass,
                "shrink-0 tabular-nums",
                length >= props.maxLength && "text-destructive",
              )}
            >
              {length} / {props.maxLength}
            </span>
          ) : null}
        </div>
      )}
      {error && <ErrorMessage id={`${id}-error`}>{error}</ErrorMessage>}
    </FieldPrimitive.Root>
  );
}

export interface SearchFieldProps extends FieldProps {
  /** Accessible name for the clear button. */
  clearLabel?: string;
}

export function SearchField({
  clearLabel = "Clear search",
  startAddon,
  endAddon,
  value,
  defaultValue,
  onValueChange,
  onKeyDown,
  ref,
  ...props
}: SearchFieldProps) {
  const [own, setOwn] = React.useState(String(defaultValue ?? ""));
  const current = value !== undefined ? String(value) : own;
  const input = React.useRef<HTMLInputElement>(null);
  const update = (next: string) => {
    setOwn(next);
    onValueChange?.(next);
  };
  return (
    <Field
      {...props}
      ref={mergeRefs(input, ref)}
      type="search"
      value={current}
      onValueChange={update}
      className={cn(
        "[&_input::-webkit-search-cancel-button]:appearance-none [&_input::-webkit-search-decoration]:appearance-none",
        props.className,
      )}
      startAddon={startAddon ?? <SearchIcon aria-hidden="true" />}
      endAddon={
        current && !props.disabled && !props.readOnly ? (
          <AddonButton
            aria-label={clearLabel}
            onClick={() => {
              update("");
              input.current?.focus();
            }}
          >
            <XIcon aria-hidden="true" />
          </AddonButton>
        ) : (
          endAddon
        )
      }
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Escape" && current && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          update("");
        }
      }}
    />
  );
}

export interface PasswordInputProps extends Omit<FieldProps, "type"> {
  /** Accessible name of the toggle while the password is hidden. */
  visibilityLabel?: string;
  /** Accessible name of the toggle while the password is visible. */
  hideLabel?: string;
}

export function PasswordInput({
  visibilityLabel = "Show password",
  hideLabel = "Hide password",
  endAddon,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);
  return (
    <Field
      autoComplete="current-password"
      {...props}
      type={visible ? "text" : "password"}
      endAddon={
        <>
          {endAddon}
          <AddonButton
            disabled={props.disabled}
            aria-label={visible ? hideLabel : visibilityLabel}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
          </AddonButton>
        </>
      }
    />
  );
}

export interface NumberFieldProps extends React.ComponentProps<typeof NumberPrimitive.Root> {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** A short unit shown after the value, such as "pt" or "copies". */
  unit?: React.ReactNode;
}

const stepperClass =
  "grid min-w-11 shrink-0 place-items-center text-muted-foreground outline-none transition-colors select-none hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground active:bg-muted/70 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4";

export function NumberField({ label, hint, error, unit, className, ...props }: NumberFieldProps) {
  return (
    <FieldPrimitive.Root
      className="fux-field group/field"
      invalid={Boolean(error)}
      name={props.name}
      disabled={props.disabled}
    >
      <NumberPrimitive.Root {...props} className={componentClasses("fux-field", className)}>
        <FieldPrimitive.Label className={labelClass}>
          {label}
          {props.required && <RequiredMark />}
        </FieldPrimitive.Label>
        <NumberPrimitive.Group className="fux-target-block flex overflow-hidden rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[input:disabled]:bg-input/50 has-[input:disabled]:opacity-50 has-[input:read-only]:bg-muted/50 has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20 dark:bg-input/30">
          <NumberPrimitive.Decrement
            className={cn(stepperClass, "border-e border-input")}
            aria-label="Decrease"
          >
            <MinusIcon aria-hidden="true" />
          </NumberPrimitive.Decrement>
          <NumberPrimitive.Input className="min-w-0 flex-1 bg-transparent px-2 text-center tabular-nums outline-none placeholder:text-muted-foreground" />
          {unit != null && (
            <span
              aria-hidden="true"
              className="flex items-center pe-2.5 text-xs text-muted-foreground select-none"
            >
              {unit}
            </span>
          )}
          <NumberPrimitive.Increment
            className={cn(stepperClass, "border-s border-input")}
            aria-label="Increase"
          >
            <PlusIcon aria-hidden="true" />
          </NumberPrimitive.Increment>
        </NumberPrimitive.Group>
      </NumberPrimitive.Root>
      {hint && (
        <FieldPrimitive.Description className={hintClass}>{hint}</FieldPrimitive.Description>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </FieldPrimitive.Root>
  );
}

export interface EditableProps {
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  /** Muted text shown while the value is empty. Defaults to the label. */
  placeholder?: string;
}

export function Editable({
  label,
  value,
  defaultValue = "",
  onValueChange,
  disabled,
  placeholder,
}: EditableProps) {
  const [own, setOwn] = React.useState(defaultValue);
  const current = value ?? own;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(current);
  const active = React.useRef(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const frame = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  React.useEffect(() => {
    if (disabled) {
      active.current = false;
      setEditing(false);
    }
  }, [disabled]);
  function finish(commit: boolean) {
    if (!active.current) return;
    active.current = false;
    if (commit && draft !== current) {
      if (value === undefined) setOwn(draft);
      onValueChange?.(draft);
    }
    setEditing(false);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      trigger.current?.focus();
    });
  }
  if (editing)
    return (
      <Input
        autoFocus
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        className="font-medium"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            finish(event.key === "Enter");
          }
        }}
      />
    );
  return (
    <Button
      ref={trigger}
      variant="ghost"
      disabled={disabled}
      aria-label={`Edit ${label}`}
      className="h-auto max-w-full justify-start px-2.5 py-1.5 text-start font-medium"
      onClick={() => {
        active.current = true;
        setDraft(current);
        setEditing(true);
      }}
    >
      <span className={cn("truncate", !current && "font-normal text-muted-foreground")}>
        {current || placeholder || label}
      </span>
      <PencilIcon
        aria-hidden="true"
        className="text-muted-foreground opacity-40 transition-opacity group-hover/button:opacity-100 group-focus-visible/button:opacity-100"
      />
    </Button>
  );
}

// ---------------------------------------------------------------------------------------------
// Selection controls
// ---------------------------------------------------------------------------------------------

/** One row of a choice list: control, label and an optional description tied to the control. */
function Choice({
  control,
  label,
  description,
  inset,
  justified,
}: {
  control: (describedBy: string | undefined) => React.ReactNode;
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Width of the control plus its gap, so the description lines up with the label. */
  inset: number;
  justified?: boolean;
}) {
  const id = React.useId();
  return (
    <div className={cn("group/choice flex max-w-full flex-col", justified ? "w-full" : "w-fit")}>
      <label
        className={cn(
          "flex cursor-pointer items-start gap-2.5 text-ui leading-5 text-foreground has-data-disabled:cursor-not-allowed has-data-disabled:text-muted-foreground",
          description ? "pt-3" : "min-h-11 py-3",
          justified && "flex-row-reverse justify-between",
        )}
      >
        {control(description ? id : undefined)}
        <span className="min-w-0 text-pretty">{label}</span>
      </label>
      {description && (
        <span
          id={id}
          className={cn(hintClass, "pb-3")}
          style={justified ? undefined : { paddingInlineStart: inset }}
        >
          {description}
        </span>
      )}
    </div>
  );
}

export interface CheckboxProps extends Omit<
  React.ComponentProps<typeof CheckboxControl>,
  "children"
> {
  label: React.ReactNode;
  /** Supporting text under the label. */
  description?: React.ReactNode;
}

export function Checkbox({ label, description, className, ...props }: CheckboxProps) {
  return (
    <Choice
      label={label}
      description={description}
      inset={26}
      control={(describedBy) => (
        <CheckboxControl
          aria-describedby={describedBy}
          {...props}
          className={cn("mt-0.5", className)}
        />
      )}
    />
  );
}

export interface ChoiceOption {
  id: string;
  label: React.ReactNode;
  disabled?: boolean;
  /** Supporting text under the label. */
  description?: React.ReactNode;
}

interface ChoiceGroupExtras {
  label: React.ReactNode;
  options: readonly ChoiceOption[];
  hint?: React.ReactNode;
  error?: React.ReactNode;
  orientation?: "vertical" | "horizontal";
}

function GroupMessages({
  id,
  hint,
  error,
}: {
  id: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className={cn(hintClass, "m-0")}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={cn(errorClass, "m-0")}>
          <CircleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </>
  );
}

function groupDescription(id: string, hint: unknown, error: unknown) {
  return (
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined
  );
}

export interface CheckboxGroupProps
  extends Omit<React.ComponentProps<typeof CheckboxGroupPrimitive>, "children">, ChoiceGroupExtras {
  name?: string;
}

export function CheckboxGroup({
  label,
  options,
  name,
  hint,
  error,
  orientation = "vertical",
  ...props
}: CheckboxGroupProps) {
  const id = React.useId();
  return (
    <FieldsetPrimitive.Root
      className={cn("fux-field", fieldsetClass)}
      aria-describedby={groupDescription(id, hint, error)}
    >
      <FieldsetPrimitive.Legend className={legendClass}>{label}</FieldsetPrimitive.Legend>
      <CheckboxGroupPrimitive
        {...props}
        className={componentClasses(
          cn("flex", orientation === "horizontal" ? "flex-row flex-wrap gap-x-6" : "flex-col"),
          props.className,
        )}
      >
        {options.map((option) => (
          <Checkbox
            key={option.id}
            name={name}
            value={option.id}
            label={option.label}
            description={option.description}
            disabled={option.disabled}
            aria-invalid={error ? true : undefined}
          />
        ))}
      </CheckboxGroupPrimitive>
      <GroupMessages id={id} hint={hint} error={error} />
    </FieldsetPrimitive.Root>
  );
}

export interface RadioGroupProps
  extends Omit<React.ComponentProps<typeof RadioGroupPrimitive>, "children">, ChoiceGroupExtras {}

export function RadioGroup({
  label,
  options,
  hint,
  error,
  orientation = "vertical",
  ...props
}: RadioGroupProps) {
  const id = React.useId();
  return (
    <FieldsetPrimitive.Root
      className={cn("fux-field", fieldsetClass)}
      aria-describedby={groupDescription(id, hint, error)}
    >
      <FieldsetPrimitive.Legend className={legendClass}>{label}</FieldsetPrimitive.Legend>
      <RadioGroupPrimitive
        {...props}
        className={componentClasses(
          cn("flex", orientation === "horizontal" ? "flex-row flex-wrap gap-x-6" : "flex-col"),
          props.className,
        )}
      >
        {options.map((option) => (
          <Choice
            key={option.id}
            label={option.label}
            description={option.description}
            inset={26}
            control={(describedBy) => (
              <RadioPrimitive.Root
                value={option.id}
                disabled={option.disabled}
                aria-describedby={describedBy}
                aria-invalid={error ? true : undefined}
                className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input transition-colors outline-none after:absolute after:inset-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-checked:border-primary data-checked:bg-primary data-disabled:opacity-50 dark:bg-input/30 dark:data-checked:bg-primary"
              >
                <RadioPrimitive.Indicator className="fux-radio-indicator block size-1.5 rounded-full bg-primary-foreground motion-safe:transition motion-safe:duration-150 motion-safe:starting:scale-50 motion-safe:starting:opacity-0" />
              </RadioPrimitive.Root>
            )}
          />
        ))}
      </RadioGroupPrimitive>
      <GroupMessages id={id} hint={hint} error={error} />
    </FieldsetPrimitive.Root>
  );
}

export interface SwitchProps extends Omit<React.ComponentProps<typeof SwitchControl>, "children"> {
  label: React.ReactNode;
  /** Supporting text under the label. */
  description?: React.ReactNode;
  /** Pushes the switch to the far edge, the way a settings row reads. */
  justified?: boolean;
}

export function Switch({ label, description, justified, className, ...props }: SwitchProps) {
  return (
    <Choice
      label={label}
      description={description}
      justified={justified}
      inset={42}
      control={(describedBy) => (
        <SwitchControl
          aria-describedby={describedBy}
          {...props}
          className={cn("mt-px", className)}
        />
      )}
    />
  );
}

export interface FieldsetProps extends React.ComponentProps<typeof FieldsetPrimitive.Root> {
  legend: React.ReactNode;
  /** Supporting text under the legend. */
  description?: React.ReactNode;
}

export function Fieldset({ legend, description, children, ...props }: FieldsetProps) {
  const id = React.useId();
  return (
    <FieldsetPrimitive.Root
      aria-describedby={description ? id : undefined}
      {...props}
      className={componentClasses(cn("fux-field", fieldsetClass), props.className)}
    >
      <FieldsetPrimitive.Legend className={cn(legendClass, description && "mb-0")}>
        {legend}
      </FieldsetPrimitive.Legend>
      {description && (
        <p id={id} className={cn(hintClass, "m-0 mb-1.5")}>
          {description}
        </p>
      )}
      {children}
    </FieldsetPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------------------------
// Value controls and feedback
// ---------------------------------------------------------------------------------------------

const valueClass = "ms-auto text-xs leading-5 text-muted-foreground tabular-nums";
const trackClass = "relative h-1.5 w-full overflow-hidden rounded-full bg-muted";

export interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  label: React.ReactNode;
  thumbLabels?: readonly string[];
}

export function Slider({ label, thumbLabels, className, ...props }: SliderProps) {
  const values = props.value ?? props.defaultValue ?? 0;
  const count = Array.isArray(values) ? values.length : 1;
  return (
    <SliderPrimitive.Root
      {...props}
      className={componentClasses("fux-field group/field", className)}
    >
      <div className="flex items-baseline gap-3">
        <SliderPrimitive.Label className={labelClass}>{label}</SliderPrimitive.Label>
        <SliderPrimitive.Value className={valueClass} />
      </div>
      <SliderPrimitive.Control className="flex min-h-11 w-full touch-none items-center select-none data-disabled:opacity-50">
        <SliderPrimitive.Track className={trackClass.replace("overflow-hidden ", "")}>
          <SliderPrimitive.Indicator className="fux-slider-indicator rounded-full bg-primary" />
          {Array.from({ length: count }, (_, index) => (
            <SliderPrimitive.Thumb
              key={index}
              index={index}
              aria-label={thumbLabels?.[index]}
              className="relative size-4 rounded-full border border-primary bg-background shadow-sm ring-ring/50 transition-[box-shadow,scale] outline-none after:absolute after:-inset-3.5 after:content-[''] hover:ring-4 has-focus-visible:ring-4 data-dragging:scale-110 data-dragging:ring-4 data-disabled:cursor-not-allowed motion-reduce:transition-none"
            />
          ))}
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export interface ProgressBarProps extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  label: React.ReactNode;
  /** Supporting text under the bar, such as "2 of 3 files". */
  hint?: React.ReactNode;
}

export function ProgressBar({ label, hint, ...props }: ProgressBarProps) {
  return (
    <ProgressPrimitive.Root
      {...props}
      className={componentClasses("fux-field group/field", props.className)}
    >
      <div className="flex items-baseline gap-3">
        <ProgressPrimitive.Label className={labelClass}>{label}</ProgressPrimitive.Label>
        <ProgressPrimitive.Value className={valueClass} />
      </div>
      <ProgressPrimitive.Track className={trackClass}>
        <ProgressPrimitive.Indicator className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out data-complete:bg-success fux-progress-indicator motion-reduce:transition-none" />
      </ProgressPrimitive.Track>
      {hint && <p className={cn(hintClass, "m-0")}>{hint}</p>}
    </ProgressPrimitive.Root>
  );
}

export interface MeterProps extends React.ComponentProps<typeof MeterPrimitive.Root> {
  label: React.ReactNode;
  /** Values below this are in the low range. Follows the HTML meter element. */
  low?: number;
  /** Values above this are in the high range. */
  high?: number;
  /** The best value. Whichever range holds it is the good one. */
  optimum?: number;
  /** Supporting text under the bar. */
  hint?: React.ReactNode;
}

/** `optimum` when the value sits in the best range, `suboptimal` next to it, `danger` opposite. */
function meterTone(
  value: number,
  min: number,
  max: number,
  low: number | undefined,
  high: number | undefined,
  optimum: number | undefined,
) {
  if (low === undefined && high === undefined) return undefined;
  const lo = low ?? min;
  const hi = high ?? max;
  const range = (x: number) => (x < lo ? 0 : x > hi ? 2 : 1);
  const distance = Math.abs(range(value) - range(optimum ?? (min + max) / 2));
  return distance === 0 ? "optimum" : distance === 1 ? "suboptimal" : "danger";
}

export function Meter({ label, hint, low, high, optimum, ...props }: MeterProps) {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const tone = meterTone(props.value, min, max, low, high, optimum);
  const place = (x: number) => `${Math.min(100, Math.max(0, ((x - min) / (max - min)) * 100))}%`;
  return (
    <MeterPrimitive.Root
      {...props}
      data-tone={tone}
      className={componentClasses("fux-field group/field", props.className)}
    >
      <div className="flex items-baseline gap-3">
        <MeterPrimitive.Label className={labelClass}>{label}</MeterPrimitive.Label>
        <MeterPrimitive.Value className={valueClass} />
      </div>
      <MeterPrimitive.Track className={trackClass}>
        <MeterPrimitive.Indicator
          className={cn(
            "fux-meter-indicator h-full rounded-full bg-primary transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none",
            tone === "optimum" && "bg-success",
            tone === "suboptimal" && "bg-warning",
            tone === "danger" && "bg-destructive",
          )}
        />
        {[low, high].map(
          (threshold, index) =>
            threshold !== undefined && (
              <span
                key={index}
                aria-hidden="true"
                className="absolute inset-y-0 w-px bg-background/80"
                style={{ insetInlineStart: place(threshold) }}
              />
            ),
        )}
      </MeterPrimitive.Track>
      {hint && <p className={cn(hintClass, "m-0")}>{hint}</p>}
    </MeterPrimitive.Root>
  );
}

export interface PinInputProps extends Omit<React.ComponentProps<typeof OTPField.Root>, "length"> {
  label: React.ReactNode;
  length?: number;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Adds a small gap after every this many cells, e.g. 3 for a 3-3 code. */
  groupSize?: number;
}

export function PinInput({
  label,
  length = 6,
  hint,
  error,
  groupSize,
  className,
  ...props
}: PinInputProps) {
  const id = React.useId();
  const describedBy =
    [props["aria-describedby"], hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <FieldPrimitive.Root
      className="fux-field group/field"
      invalid={Boolean(error)}
      disabled={props.disabled}
    >
      <span className={labelClass} id={id}>
        {label}
        {props.required && <RequiredMark />}
      </span>
      <OTPField.Root
        {...props}
        aria-labelledby={id}
        aria-describedby={describedBy}
        length={length}
        className={componentClasses("flex items-center gap-2", className)}
      >
        {Array.from({ length }, (_, index) => (
          <React.Fragment key={index}>
            <OTPField.Input
              aria-invalid={error ? true : undefined}
              className="fux-target-block h-12 w-11 min-w-0 shrink rounded-lg border border-input bg-transparent text-center text-lg font-medium tabular-nums transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-filled:border-foreground/30 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 read-only:bg-muted/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-filled:border-foreground/40"
            />
            {groupSize && (index + 1) % groupSize === 0 && index + 1 < length && (
              <span aria-hidden="true" className="h-px w-2 shrink-0 bg-muted-foreground/40" />
            )}
          </React.Fragment>
        ))}
      </OTPField.Root>
      {hint && (
        <p id={`${id}-hint`} className={cn(hintClass, "m-0")}>
          {hint}
        </p>
      )}
      {error && <GroupMessages id={id} error={error} />}
    </FieldPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------

export interface LayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  gap?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
}

export function Stack({
  gap = "md",
  align = "stretch",
  justify = "start",
  wrap,
  className,
  ...props
}: LayoutProps) {
  return (
    <div
      {...props}
      className={cn("fux-stack", className)}
      data-gap={gap}
      data-align={align}
      data-justify={justify}
      data-wrap={wrap || undefined}
    />
  );
}

export function Row({ className, align = "center", ...props }: LayoutProps) {
  return <Stack {...props} align={align} className={cn("fux-row", className)} />;
}

function PanelRoot({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("fux-panel fux-surface", className)} />;
}
function PanelHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("fux-panel-header", className)} />;
}
function PanelTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 {...props} className={cn("fux-panel-title", className)} />;
}
function PanelDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={cn("fux-panel-description", className)} />;
}
function PanelFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("fux-panel-footer", className)} />;
}

/**
 * A raised surface that groups related content. `Panel.Header`, `Panel.Title`,
 * `Panel.Description` and `Panel.Footer` are optional parts for settings-style panels.
 */
export const Panel = /* @__PURE__ */ Object.assign(PanelRoot, {
  Header: PanelHeader,
  Title: PanelTitle,
  Description: PanelDescription,
  Footer: PanelFooter,
});
