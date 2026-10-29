"use client";
import * as A from "react-aria-components";
import type { ReactNode, Ref } from "react";
import * as P from "./primitives.js";

export interface ChoiceOption {
  id: string;
  label: ReactNode;
  description?: string;
  isDisabled?: boolean;
}
interface FieldDetails {
  label: ReactNode;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLDivElement>;
}
function Details({ hint, error }: Pick<FieldDetails, "hint" | "error">) {
  return (
    <>
      {hint && <P.Text slot="description">{hint}</P.Text>}
      <P.FieldError>{error}</P.FieldError>
    </>
  );
}
export interface TextAreaProps
  extends Omit<A.TextFieldProps, "children" | "className">, FieldDetails {
  placeholder?: string;
  rows?: number;
}
export function TextArea({ label, hint, error, rows = 4, placeholder, ...props }: TextAreaProps) {
  return (
    <P.TextField {...props} isInvalid={Boolean(error) || props.isInvalid}>
      <P.Label>{label}</P.Label>
      <P.TextArea rows={rows} placeholder={placeholder} />
      <Details hint={hint} error={error} />
    </P.TextField>
  );
}
export interface SearchFieldProps
  extends Omit<A.SearchFieldProps, "children" | "className">, FieldDetails {
  placeholder?: string;
  clearLabel?: string;
}
export function SearchField({
  label,
  hint,
  error,
  placeholder,
  clearLabel = "Clear search",
  ...props
}: SearchFieldProps) {
  return (
    <P.SearchField {...props} isInvalid={Boolean(error) || props.isInvalid}>
      <P.Label>{label}</P.Label>
      <P.Group>
        <P.Input placeholder={placeholder} />
        <P.Button aria-label={clearLabel}>×</P.Button>
      </P.Group>
      <Details hint={hint} error={error} />
    </P.SearchField>
  );
}
export interface NumberFieldProps
  extends Omit<A.NumberFieldProps, "children" | "className">, FieldDetails {
  decreaseLabel?: string;
  increaseLabel?: string;
}
export function NumberField({
  label,
  hint,
  error,
  decreaseLabel = "Decrease",
  increaseLabel = "Increase",
  ...props
}: NumberFieldProps) {
  return (
    <P.NumberField {...props} isInvalid={Boolean(error) || props.isInvalid}>
      <P.Label>{label}</P.Label>
      <P.Group>
        <P.Button slot="decrement" aria-label={decreaseLabel}>
          −
        </P.Button>
        <P.Input />
        <P.Button slot="increment" aria-label={increaseLabel}>
          +
        </P.Button>
      </P.Group>
      <Details hint={hint} error={error} />
    </P.NumberField>
  );
}
export interface SwitchProps extends Omit<A.SwitchProps, "children" | "className"> {
  label: ReactNode;
  ref?: Ref<HTMLLabelElement>;
}
export function Switch({ label, ...props }: SwitchProps) {
  return (
    <P.Switch {...props}>
      <span className="fux-switch__track" aria-hidden="true">
        <span className="fux-switch__thumb" />
      </span>
      <span>{label}</span>
    </P.Switch>
  );
}
export interface RadioGroupProps
  extends Omit<A.RadioGroupProps, "children" | "className">, FieldDetails {
  options: readonly ChoiceOption[];
}
export function RadioGroup({ label, hint, error, options, ...props }: RadioGroupProps) {
  return (
    <P.RadioGroup {...props} isInvalid={Boolean(error) || props.isInvalid}>
      <P.Label>{label}</P.Label>
      <div className="fux-choices">
        {options.map((option) => (
          <P.Radio key={option.id} value={option.id} isDisabled={option.isDisabled}>
            <span className="fux-radio__mark" aria-hidden="true" />
            <span>
              {option.label}
              {option.description && (
                <span className="fux-choice__description">{option.description}</span>
              )}
            </span>
          </P.Radio>
        ))}
      </div>
      <Details hint={hint} error={error} />
    </P.RadioGroup>
  );
}
export interface CheckboxGroupProps
  extends Omit<A.CheckboxGroupProps, "children" | "className">, FieldDetails {
  options: readonly ChoiceOption[];
}
export function CheckboxGroup({ label, hint, error, options, ...props }: CheckboxGroupProps) {
  return (
    <P.CheckboxGroup {...props} isInvalid={Boolean(error) || props.isInvalid}>
      <P.Label>{label}</P.Label>
      <div className="fux-choices">
        {options.map((option) => (
          <P.Checkbox key={option.id} value={option.id} isDisabled={option.isDisabled}>
            {({ isSelected, isIndeterminate }) => (
              <>
                <span className="fux-checkbox__mark" aria-hidden="true">
                  {isIndeterminate ? "−" : isSelected ? "✓" : ""}
                </span>
                <span>
                  {option.label}
                  {option.description && (
                    <span className="fux-choice__description">{option.description}</span>
                  )}
                </span>
              </>
            )}
          </P.Checkbox>
        ))}
      </div>
      <Details hint={hint} error={error} />
    </P.CheckboxGroup>
  );
}
export interface SliderProps<T extends number | number[] = number> extends Omit<
  A.SliderProps<T>,
  "children" | "className"
> {
  label: ReactNode;
  thumbLabels?: readonly string[];
  showOutput?: boolean;
  ref?: Ref<HTMLDivElement>;
}
export function Slider<T extends number | number[] = number>({
  label,
  thumbLabels,
  showOutput = true,
  ...props
}: SliderProps<T>) {
  return (
    <P.Slider {...props}>
      <div className="fux-field__heading">
        <P.Label>{label}</P.Label>
        {showOutput && <P.SliderOutput />}
      </div>
      <P.SliderTrack>
        {({ state }) => (
          <>
            <P.SliderFill />
            {state.values.map((_, index) => (
              <P.SliderThumb key={index} index={index} aria-label={thumbLabels?.[index]} />
            ))}
          </>
        )}
      </P.SliderTrack>
    </P.Slider>
  );
}
export const ToggleButton: typeof A.ToggleButton = P.ToggleButton;
export type ToggleButtonProps = A.ToggleButtonProps;
export const ToggleButtonGroup: typeof A.ToggleButtonGroup = P.ToggleButtonGroup;
export const Toolbar: typeof A.Toolbar = P.Toolbar;
export const Form: typeof A.Form = P.Form;
export const Separator: typeof A.Separator = P.Separator;
