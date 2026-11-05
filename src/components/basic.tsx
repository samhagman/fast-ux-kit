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
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Textarea } from "./ui/textarea.js";
import { Checkbox as CheckboxControl } from "./ui/checkbox.js";
import { Switch as SwitchControl } from "./ui/switch.js";
import { cn } from "../lib/utils.js";

export { Button, Input, Textarea };
function componentClasses<State>(
  base: string,
  className: string | ((state: State) => string | undefined) | undefined,
) {
  return typeof className === "function"
    ? (state: State) => cn(base, className(state))
    : cn(base, className);
}

export function Form<FormValues extends Record<string, unknown> = Record<string, unknown>>(
  props: FormPrimitive.Props<FormValues> & { ref?: React.Ref<HTMLFormElement> },
) {
  return <FormPrimitive {...props} className={componentClasses("fux-field", props.className)} />;
}
function ToolbarRoot(props: React.ComponentProps<typeof ToolbarPrimitive.Root>) {
  return (
    <ToolbarPrimitive.Root {...props} className={componentClasses("fux-row", props.className)} />
  );
}
function ToolbarButton(props: React.ComponentProps<typeof ToolbarPrimitive.Button>) {
  return (
    <ToolbarPrimitive.Button
      {...props}
      className={componentClasses("fux-control", props.className)}
    />
  );
}
function ToolbarGroup(props: React.ComponentProps<typeof ToolbarPrimitive.Group>) {
  return (
    <ToolbarPrimitive.Group {...props} className={componentClasses("fux-row", props.className)} />
  );
}
function ToolbarInput(props: React.ComponentProps<typeof ToolbarPrimitive.Input>) {
  return (
    <ToolbarPrimitive.Input {...props} className={componentClasses("fux-input", props.className)} />
  );
}
function ToolbarLink(props: React.ComponentProps<typeof ToolbarPrimitive.Link>) {
  return (
    <ToolbarPrimitive.Link {...props} className={componentClasses("fux-link", props.className)} />
  );
}
function ToolbarSeparator(props: React.ComponentProps<typeof ToolbarPrimitive.Separator>) {
  return (
    <ToolbarPrimitive.Separator
      {...props}
      className={componentClasses("fux-separator", props.className)}
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

export interface IconButtonProps extends React.ComponentProps<typeof Button> {
  label: string;
}

export function IconButton({ label, children, ...props }: IconButtonProps) {
  return (
    <Button variant="ghost" size="icon" {...props} aria-label={label}>
      <span aria-hidden="true">{children}</span>
    </Button>
  );
}

export function Link({ className, ...props }: React.ComponentProps<"a">) {
  return <a {...props} className={cn("fux-link", className)} />;
}

export interface FieldProps extends Omit<React.ComponentProps<typeof Input>, "onChange"> {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  onValueChange?: (value: string) => void;
}

export function Field({ label, hint, error, onValueChange, className, ...props }: FieldProps) {
  return (
    <FieldPrimitive.Root
      className={componentClasses("fux-field", className)}
      invalid={Boolean(error)}
      name={props.name}
      disabled={props.disabled}
    >
      <FieldPrimitive.Label className="fux-label">{label}</FieldPrimitive.Label>
      <FieldPrimitive.Control
        render={<Input />}
        {...props}
        onChange={(event) => onValueChange?.(event.target.value)}
      />
      {hint && <FieldPrimitive.Description className="fux-hint">{hint}</FieldPrimitive.Description>}
      {error && (
        <FieldPrimitive.Error match className="fux-error">
          {error}
        </FieldPrimitive.Error>
      )}
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
  const describedBy =
    [props["aria-describedby"], hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <FieldPrimitive.Root
      className={componentClasses("fux-field", className)}
      invalid={Boolean(error)}
      name={props.name}
      disabled={props.disabled}
    >
      <FieldPrimitive.Label className="fux-label" htmlFor={id}>
        {label}
      </FieldPrimitive.Label>
      <FieldPrimitive.Control
        render={<Textarea {...props} />}
        id={id}
        onChange={(event) => onValueChange?.(event.target.value)}
        aria-invalid={Boolean(error) || props["aria-invalid"]}
        aria-describedby={describedBy}
      />
      {hint && (
        <FieldPrimitive.Description id={`${id}-hint`} className="fux-hint">
          {hint}
        </FieldPrimitive.Description>
      )}
      {error && (
        <FieldPrimitive.Error id={`${id}-error`} match className="fux-error">
          {error}
        </FieldPrimitive.Error>
      )}
    </FieldPrimitive.Root>
  );
}

export function SearchField(props: FieldProps) {
  return <Field {...props} type="search" />;
}

export interface NumberFieldProps extends React.ComponentProps<typeof NumberPrimitive.Root> {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}

export function NumberField({ label, hint, error, className, ...props }: NumberFieldProps) {
  return (
    <FieldPrimitive.Root
      className="fux-field"
      invalid={Boolean(error)}
      name={props.name}
      disabled={props.disabled}
    >
      <NumberPrimitive.Root {...props} className={componentClasses("fux-field", className)}>
        <FieldPrimitive.Label className="fux-label">{label}</FieldPrimitive.Label>
        <NumberPrimitive.Group className="fux-input-group">
          <NumberPrimitive.Decrement className="fux-control" aria-label="Decrease">
            −
          </NumberPrimitive.Decrement>
          <NumberPrimitive.Input className="fux-input" />
          <NumberPrimitive.Increment className="fux-control" aria-label="Increase">
            +
          </NumberPrimitive.Increment>
        </NumberPrimitive.Group>
      </NumberPrimitive.Root>
      {hint && <FieldPrimitive.Description className="fux-hint">{hint}</FieldPrimitive.Description>}
      {error && (
        <FieldPrimitive.Error match className="fux-error">
          {error}
        </FieldPrimitive.Error>
      )}
    </FieldPrimitive.Root>
  );
}

export interface CheckboxProps extends React.ComponentProps<typeof CheckboxControl> {
  label: React.ReactNode;
}

export function Checkbox({ label, ...props }: CheckboxProps) {
  return (
    <label className="fux-choice">
      <CheckboxControl {...props} />
      <span>{label}</span>
    </label>
  );
}

export interface ChoiceOption {
  id: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface CheckboxGroupProps extends Omit<
  React.ComponentProps<typeof CheckboxGroupPrimitive>,
  "children"
> {
  label: React.ReactNode;
  options: readonly ChoiceOption[];
  name?: string;
}

export function CheckboxGroup({ label, options, name, ...props }: CheckboxGroupProps) {
  return (
    <FieldsetPrimitive.Root className="fux-field">
      <FieldsetPrimitive.Legend className="fux-label">{label}</FieldsetPrimitive.Legend>
      <CheckboxGroupPrimitive {...props} className={componentClasses("fux-field", props.className)}>
        {options.map((option) => (
          <Checkbox
            key={option.id}
            name={name}
            value={option.id}
            label={option.label}
            disabled={option.disabled}
          />
        ))}
      </CheckboxGroupPrimitive>
    </FieldsetPrimitive.Root>
  );
}

export interface RadioGroupProps extends Omit<
  React.ComponentProps<typeof RadioGroupPrimitive>,
  "children"
> {
  label: React.ReactNode;
  options: readonly ChoiceOption[];
}

export function RadioGroup({ label, options, ...props }: RadioGroupProps) {
  return (
    <FieldsetPrimitive.Root className="fux-field">
      <FieldsetPrimitive.Legend className="fux-label">{label}</FieldsetPrimitive.Legend>
      <RadioGroupPrimitive {...props} className={componentClasses("fux-field", props.className)}>
        {options.map((option) => (
          <label className="fux-choice" key={option.id}>
            <RadioPrimitive.Root className="fux-radio" value={option.id} disabled={option.disabled}>
              <RadioPrimitive.Indicator className="fux-radio-indicator" />
            </RadioPrimitive.Root>
            <span>{option.label}</span>
          </label>
        ))}
      </RadioGroupPrimitive>
    </FieldsetPrimitive.Root>
  );
}

export interface SwitchProps extends React.ComponentProps<typeof SwitchControl> {
  label: React.ReactNode;
}

export function Switch({ label, ...props }: SwitchProps) {
  return (
    <label className="fux-choice">
      <SwitchControl {...props} />
      <span>{label}</span>
    </label>
  );
}

export interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  label: React.ReactNode;
  thumbLabels?: readonly string[];
}

export function Slider({ label, thumbLabels, className, ...props }: SliderProps) {
  const values = props.value ?? props.defaultValue ?? 0;
  const count = Array.isArray(values) ? values.length : 1;
  return (
    <SliderPrimitive.Root {...props} className={componentClasses("fux-field", className)}>
      <SliderPrimitive.Label className="fux-label">{label}</SliderPrimitive.Label>
      <SliderPrimitive.Control className="fux-slider-control">
        <SliderPrimitive.Track className="fux-slider-track">
          <SliderPrimitive.Indicator className="fux-slider-fill" />
          {Array.from({ length: count }, (_, index) => (
            <SliderPrimitive.Thumb
              key={index}
              index={index}
              aria-label={thumbLabels?.[index]}
              className="fux-slider-thumb"
            />
          ))}
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
      <SliderPrimitive.Value className="fux-hint" />
    </SliderPrimitive.Root>
  );
}

export interface FieldsetProps extends React.ComponentProps<typeof FieldsetPrimitive.Root> {
  legend: React.ReactNode;
}

export function Fieldset({ legend, children, ...props }: FieldsetProps) {
  return (
    <FieldsetPrimitive.Root {...props} className={cn("fux-field", props.className)}>
      <FieldsetPrimitive.Legend className="fux-label">{legend}</FieldsetPrimitive.Legend>
      {children}
    </FieldsetPrimitive.Root>
  );
}

export interface ProgressBarProps extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  label: React.ReactNode;
}

export function ProgressBar({ label, ...props }: ProgressBarProps) {
  return (
    <ProgressPrimitive.Root {...props} className={componentClasses("fux-field", props.className)}>
      <ProgressPrimitive.Label className="fux-label">{label}</ProgressPrimitive.Label>
      <ProgressPrimitive.Track className="fux-meter-track">
        <ProgressPrimitive.Indicator className="fux-meter-fill" />
      </ProgressPrimitive.Track>
      <ProgressPrimitive.Value className="fux-hint" />
    </ProgressPrimitive.Root>
  );
}

export interface MeterProps extends React.ComponentProps<typeof MeterPrimitive.Root> {
  label: React.ReactNode;
}

export function Meter({ label, ...props }: MeterProps) {
  return (
    <MeterPrimitive.Root {...props} className={componentClasses("fux-field", props.className)}>
      <MeterPrimitive.Label className="fux-label">{label}</MeterPrimitive.Label>
      <MeterPrimitive.Track className="fux-meter-track">
        <MeterPrimitive.Indicator className="fux-meter-fill" />
      </MeterPrimitive.Track>
      <MeterPrimitive.Value className="fux-hint" />
    </MeterPrimitive.Root>
  );
}

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

export function Row({ className, ...props }: LayoutProps) {
  return <Stack {...props} className={cn("fux-row", className)} />;
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("fux-panel", className)} />;
}

export interface PasswordInputProps extends Omit<FieldProps, "type"> {
  visibilityLabel?: string;
}

export function PasswordInput({ visibilityLabel = "Show password", ...props }: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="fux-password">
      <Field {...props} type={visible ? "text" : "password"} />
      <Button
        type="button"
        variant="ghost"
        disabled={props.disabled}
        aria-label={visibilityLabel}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? "Hide" : "Show"}
      </Button>
    </div>
  );
}

export interface PinInputProps extends Omit<React.ComponentProps<typeof OTPField.Root>, "length"> {
  label: React.ReactNode;
  length?: number;
}

export function PinInput({ label, length = 6, ...props }: PinInputProps) {
  const id = React.useId();
  return (
    <div className="fux-field">
      <span className="fux-label" id={id}>
        {label}
      </span>
      <OTPField.Root
        {...props}
        aria-labelledby={id}
        length={length}
        className={componentClasses("fux-row", props.className)}
      >
        {Array.from({ length }, (_, index) => (
          <OTPField.Input key={index} className="fux-pin" />
        ))}
      </OTPField.Root>
    </div>
  );
}

export interface EditableProps {
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}

export function Editable({
  label,
  value,
  defaultValue = "",
  onValueChange,
  disabled,
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
        value={draft}
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
      onClick={() => {
        active.current = true;
        setDraft(current);
        setEditing(true);
      }}
    >
      {current || label}
    </Button>
  );
}
