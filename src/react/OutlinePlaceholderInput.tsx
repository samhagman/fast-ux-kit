"use client";
import { useRef, useState } from "react";

export interface OutlinePlaceholderDraft {
  /** Complete user-entered text, including whitespace and pasted line breaks. */
  readonly text: string;
  /** Collapsed insertion caret in UTF-16 code units, matching textarea selectionStart. */
  readonly caret: number;
}

export interface OutlinePlaceholderInputProps {
  readonly label: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly spellCheck?: boolean;
  /**
   * Atomically insert one real node and return true only if that insertion succeeds.
   * On success, transfer focus to the inserted node during the React commit.
   * Return false for policy/plugin rejection; the complete local draft is retained.
   * This is synchronous, not an async persistence acknowledgment.
   */
  readonly onMaterialize: (draft: OutlinePlaceholderDraft) => boolean;
  /** Empty Enter invokes existing defaults; return true only after successful insertion. */
  readonly onActivate?: () => boolean;
}

/**
 * Internal, view-only typing surface. Render beside the existing activation button,
 * never in reader mode. Its initial value is always empty: consumer placeholder
 * text/caret defaults belong to button/empty-Enter activation, not direct typing.
 * No placeholder node is persisted and no edit is emitted during composition.
 *
 * Keep a stable React key for each prompt while editing. A rejected draft survives
 * blur and rerenders; editing it or pressing Enter retries. Successful insertion
 * consumes this focus session, including trailing composition/input events. The
 * same persistent prompt becomes available again on its next focus.
 */
export function OutlinePlaceholderInput({
  label,
  className,
  disabled = false,
  spellCheck,
  onMaterialize,
  onActivate,
}: OutlinePlaceholderInputProps) {
  const [draft, setDraft] = useState("");
  const composing = useRef(false);
  const accepted = useRef(false);
  const lastAttempt = useRef<string | null>(null);

  const materialize = (input: HTMLTextAreaElement, retry = false) => {
    if (disabled || composing.current || accepted.current) return;
    const text = input.value;
    if (!text.length) {
      lastAttempt.current = null;
      return;
    }
    if (!retry && lastAttempt.current === text) return;
    lastAttempt.current = text;
    const caret = Math.max(0, Math.min(input.selectionStart, text.length));
    if (onMaterialize({ text, caret })) {
      accepted.current = true;
      setDraft("");
    }
  };

  return (
    <textarea
      className={className ?? "fast-ux-editor__placeholder-input"}
      aria-label={label}
      placeholder={label}
      rows={1}
      style={{ minBlockSize: 44, minInlineSize: 44 }}
      disabled={disabled}
      spellCheck={spellCheck}
      value={draft}
      onFocus={() => {
        // Only a new focus session may create another item from the same prompt.
        accepted.current = false;
        lastAttempt.current = null;
      }}
      onChange={(event) => {
        if (disabled || accepted.current) return;
        setDraft(event.currentTarget.value);
        if (!(event.nativeEvent as InputEvent).isComposing) materialize(event.currentTarget);
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        if (disabled || accepted.current) return;
        setDraft(event.currentTarget.value);
        materialize(event.currentTarget);
      }}
      onPaste={(event) => {
        // The editor's empty-document paste handler must not split this draft.
        // Leave native insertion alone so selection replacement and line breaks
        // arrive together through the ensuing input event.
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (
          disabled ||
          composing.current ||
          event.nativeEvent.isComposing ||
          event.keyCode === 229 ||
          event.key !== "Enter" ||
          event.shiftKey ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        if (accepted.current) return;
        if (event.currentTarget.value.length) materialize(event.currentTarget, true);
        else if (onActivate?.()) accepted.current = true;
      }}
    />
  );
}
