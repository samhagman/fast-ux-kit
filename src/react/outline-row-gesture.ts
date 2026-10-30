import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

interface RowGesture {
  readonly id: string;
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly started: number;
  readonly editEligible: boolean;
  canceled: boolean;
  released: number | null;
}

/** Only the reader's own title/blank row surface participates. Host content stays native. */
export function isOutlineRowSurface(target: EventTarget, row: HTMLElement): boolean {
  if (!(target instanceof row.ownerDocument.defaultView!.Element)) return false;
  if (target.closest(".fast-ux-outliner__row") !== row) return false;
  if (
    target.closest(
      "[data-outline-independent], .fast-ux-outliner__body, .fast-ux-outliner__summary",
    )
  )
    return false;
  const control = target.closest(
    'a, button, input, select, textarea, summary, audio, video, [contenteditable]:not([contenteditable="false"]), [tabindex], [role="button"], [role="link"], [role="checkbox"], [draggable="true"]',
  );
  return (
    !control || control.hasAttribute("data-outline-row-action") || control === row.parentElement
  );
}

/**
 * Recognize a held-and-released row press, never a timer that replaces DOM under
 * a held finger. Native selection, context menus, scrolling and drag win. This
 * owns no focus manager and never cancels pointerdown, pointerup or contextmenu.
 */
export function useOutlineRowGesture(
  activate: (id: string, recursive: boolean) => void,
  edit: (id: string) => void,
  canEdit: (id: string) => boolean,
  resetIdentity: unknown,
) {
  const session = useRef<RowGesture | null>(null);
  const detach = useRef<(() => void) | null>(null);
  const callbacks = useRef({ activate, edit, canEdit });
  callbacks.current = { activate, edit, canEdit };
  const clear = () => {
    detach.current?.();
    detach.current = null;
    session.current = null;
  };
  useEffect(
    () => () => {
      // Retain the canceled sequence until release so a late native click cannot
      // activate a same-ID row from a newer host document or scope.
      if (session.current) session.current.canceled = true;
    },
    [resetIdentity],
  );
  useEffect(() => clear, []);

  function onPointerDown(event: PointerEvent<HTMLDivElement>, id: string) {
    const existing = session.current;
    if (existing && existing.released === null && existing.pointerId !== event.pointerId) {
      existing.canceled = true;
      return;
    }
    clear();
    if (!isOutlineRowSurface(event.target, event.currentTarget)) return;
    const row = event.currentTarget;
    const owner = row.ownerDocument;
    const selected = owner.getSelection();
    const current: RowGesture = {
      id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      started: Date.now(),
      released: null,
      editEligible: !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey,
      canceled:
        event.defaultPrevented ||
        event.button !== 0 ||
        event.isPrimary === false ||
        (!!selected && !selected.isCollapsed),
    };
    if (!Number.isFinite(current.started)) current.canceled = true;
    session.current = current;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      current.canceled = true;
    };
    const move = (next: globalThis.PointerEvent) => {
      if (
        next.pointerId === current.pointerId &&
        Math.hypot(next.clientX - current.x, next.clientY - current.y) > 8
      )
        cancel();
    };
    const another = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== current.pointerId) cancel();
    };
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== current.pointerId) return;
      if (
        next.button !== 0 ||
        next.isPrimary === false ||
        Math.hypot(next.clientX - current.x, next.clientY - current.y) > 8
      )
        cancel();
      current.released = Date.now();
      if (!Number.isFinite(current.released) || current.released < current.started) cancel();
      if (expiry !== undefined) clearTimeout(expiry);
      expiry = setTimeout(clear, 500);
    };
    const terminate = () => {
      cancel();
      current.released = Date.now();
      if (expiry !== undefined) clearTimeout(expiry);
      expiry = setTimeout(clear, 500);
    };
    const selection = () => {
      if (!owner.getSelection()?.isCollapsed) cancel();
    };
    owner.addEventListener("pointermove", move, true);
    owner.addEventListener("pointerdown", another, true);
    owner.addEventListener("pointerup", up, true);
    owner.addEventListener("pointercancel", terminate, true);
    owner.addEventListener("contextmenu", cancel, true);
    owner.addEventListener("dragstart", cancel, true);
    owner.addEventListener("scroll", cancel, true);
    owner.addEventListener("selectionchange", selection);
    owner.defaultView?.addEventListener("blur", terminate);
    detach.current = () => {
      if (expiry !== undefined) clearTimeout(expiry);
      owner.removeEventListener("pointermove", move, true);
      owner.removeEventListener("pointerdown", another, true);
      owner.removeEventListener("pointerup", up, true);
      owner.removeEventListener("pointercancel", terminate, true);
      owner.removeEventListener("contextmenu", cancel, true);
      owner.removeEventListener("dragstart", cancel, true);
      owner.removeEventListener("scroll", cancel, true);
      owner.removeEventListener("selectionchange", selection);
      owner.defaultView?.removeEventListener("blur", terminate);
    };
  }
  function onClick(event: MouseEvent<HTMLDivElement>, id: string) {
    if (event.defaultPrevented || !isOutlineRowSurface(event.target, event.currentTarget)) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) {
      clear();
      return;
    }
    const current = session.current;
    const selection = event.currentTarget.ownerDocument.getSelection();
    const pointerClick = event.detail > 0;
    const canceled = pointerClick && current?.id === id && current.canceled;
    const held =
      pointerClick &&
      current?.id === id &&
      !current.canceled &&
      current.released !== null &&
      current.released - current.started >= 550;
    clear();
    if (canceled || (selection && !selection.isCollapsed)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (held) {
      event.preventDefault();
      event.stopPropagation();
      if (current.editEligible && callbacks.current.canEdit(id)) callbacks.current.edit(id);
      return;
    }
    callbacks.current.activate(id, event.altKey);
  }
  return { onPointerDown, onClick };
}
