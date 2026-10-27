"use client";

import {
  Button as AriaButton,
  TextField,
  Input,
  Label,
  Text,
  FieldError,
  Checkbox as AriaCheckbox,
  Link as AriaLink,
  ModalOverlay,
  Modal,
  Dialog as AriaDialog,
  Heading,
} from "react-aria-components";
import type {
  ButtonProps as AriaButtonProps,
  TextFieldProps,
  CheckboxProps as AriaCheckboxProps,
  LinkProps as AriaLinkProps,
} from "react-aria-components";
import { Pagination as ArkPagination } from "@ark-ui/react/pagination";
import type { ReactNode, Ref, HTMLAttributes } from "react";

export type ControlVariant = "primary" | "secondary" | "quiet" | "danger";
export type ControlSize = "regular" | "compact";
export interface ButtonProps extends Omit<AriaButtonProps, "className" | "style"> {
  variant?: ControlVariant;
  size?: ControlSize;
  fullWidth?: boolean;
  ref?: Ref<HTMLButtonElement>;
}
/** React Aria owns presses, keyboard activation and focus. */
export function Button({
  variant = "secondary",
  size = "regular",
  fullWidth = false,
  ...props
}: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className="fux-control"
      data-variant={variant}
      data-size={size}
      data-full={fullWidth || undefined}
    />
  );
}
export interface IconButtonProps extends Omit<ButtonProps, "aria-label" | "children"> {
  label: string;
  children: ReactNode;
}
/** Children must be decorative, non-interactive icon content. */
export function IconButton({ label, children, ...props }: IconButtonProps) {
  return (
    <Button {...props} aria-label={label}>
      <span aria-hidden="true">{children}</span>
    </Button>
  );
}
export interface FieldProps extends Omit<TextFieldProps, "children" | "className" | "style"> {
  label: string;
  hint?: string;
  error?: string;
  placeholder?: string;
}
export function Field({ label, hint, error, placeholder, ...props }: FieldProps) {
  return (
    <TextField {...props} className="fux-field" isInvalid={Boolean(error) || props.isInvalid}>
      <Label className="fux-label">{label}</Label>
      <Input className="fux-input" placeholder={placeholder} />
      {hint && (
        <Text slot="description" className="fux-hint">
          {hint}
        </Text>
      )}
      <FieldError className="fux-error">{error}</FieldError>
    </TextField>
  );
}
export interface CheckboxProps extends Omit<AriaCheckboxProps, "children" | "className" | "style"> {
  label: string;
}
export function Checkbox({ label, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox {...props} className="fux-checkbox">
      {({ isSelected, isIndeterminate }) => (
        <>
          <span className="fux-checkbox__mark" aria-hidden="true">
            {isIndeterminate ? "−" : isSelected ? "✓" : ""}
          </span>
          <span>{label}</span>
        </>
      )}
    </AriaCheckbox>
  );
}
export interface PaginationProps {
  label: string;
  count: number;
  pageSize?: number;
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  /** Supply translated labels rather than replacing interactive elements. */
  previousLabel?: string;
  nextLabel?: string;
}
/** Ark owns every pagination element; it shares tokens/geometry, not event managers. */
export function Pagination({
  label,
  count,
  pageSize = 10,
  page,
  defaultPage = 1,
  onPageChange,
  previousLabel = "Previous",
  nextLabel = "Next",
}: PaginationProps) {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1
  ) {
    throw new Error(
      "Pagination requires a non-negative integer count and positive integer pageSize.",
    );
  }
  if (
    (page !== undefined && (!Number.isSafeInteger(page) || page < 1)) ||
    !Number.isSafeInteger(defaultPage) ||
    defaultPage < 1
  ) {
    throw new Error("Pagination page and defaultPage must be positive integers.");
  }
  return (
    <ArkPagination.Root
      aria-label={label}
      className="fux-pagination"
      count={count}
      pageSize={pageSize}
      page={page}
      defaultPage={defaultPage}
      onPageChange={(details) => onPageChange?.(details.page)}
    >
      <ArkPagination.PrevTrigger
        className="fux-control"
        data-variant="secondary"
        aria-label={previousLabel}
      >
        {previousLabel}
      </ArkPagination.PrevTrigger>
      <ArkPagination.Context>
        {(api) =>
          api.pages.map((item, index) =>
            item.type === "page" ? (
              <ArkPagination.Item
                key={item.value}
                {...item}
                className="fux-control"
                data-variant="quiet"
              >
                {item.value}
              </ArkPagination.Item>
            ) : (
              <ArkPagination.Ellipsis
                key={`ellipsis-${index}`}
                index={index}
                className="fux-pagination__ellipsis"
              >
                …
              </ArkPagination.Ellipsis>
            ),
          )
        }
      </ArkPagination.Context>
      <ArkPagination.NextTrigger
        className="fux-control"
        data-variant="secondary"
        aria-label={nextLabel}
      >
        {nextLabel}
      </ArkPagination.NextTrigger>
    </ArkPagination.Root>
  );
}

export interface LinkProps extends Omit<AriaLinkProps, "className" | "style"> {
  variant?: "inline" | "block";
  ref?: Ref<HTMLAnchorElement>;
}
export function Link({ variant = "inline", ...props }: LinkProps) {
  return <AriaLink {...props} className="fux-link" data-variant={variant} />;
}
export interface ModalDialogProps {
  title: string;
  children: ReactNode;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  closeLabel?: string;
  footer?: ReactNode;
}
/** React Aria alone owns the modal portal, focus containment, Escape and dismissal. */
export function ModalDialog({
  title,
  children,
  isOpen,
  onOpenChange,
  closeLabel = "Close",
  footer,
}: ModalDialogProps) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className="fux-overlay">
      <Modal className="fux-modal">
        <AriaDialog className="fux-dialog">
          {({ close }) => (
            <>
              <header className="fux-dialog__header">
                <Heading slot="title">{title}</Heading>
                <Button variant="quiet" onPress={close}>
                  {closeLabel}
                </Button>
              </header>
              <div className="fux-dialog__body">{children}</div>
              {footer && <footer className="fux-dialog__footer">{footer}</footer>}
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
export type Space = "none" | "xs" | "sm" | "md" | "lg" | "xl";
interface LayoutProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  gap?: Space;
}
export function Stack({ gap = "md", className = "", ...props }: LayoutProps) {
  return <div {...props} className={`fux-stack ${className}`} data-gap={gap} />;
}
export interface RowProps extends LayoutProps {
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
}
export function Row({
  gap = "md",
  justify = "start",
  wrap = false,
  className = "",
  ...props
}: RowProps) {
  return (
    <div
      {...props}
      className={`fux-row ${className}`}
      data-gap={gap}
      data-justify={justify}
      data-wrap={wrap || undefined}
    />
  );
}
export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  padding?: Space;
}
export function Panel({ padding = "lg", className = "", ...props }: PanelProps) {
  return <div {...props} className={`fux-panel ${className}`} data-padding={padding} />;
}
