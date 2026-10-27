/** DOM geometry stays outside the portable editor state. Mirrors contain text only, never HTML. */
export function textareaCaretRect(textarea: HTMLTextAreaElement, offset: number): DOMRect {
  const doc = textarea.ownerDocument,
    win = doc.defaultView;
  if (!win) return textarea.getBoundingClientRect();
  const computed = win.getComputedStyle(textarea),
    mirror = doc.createElement("div"),
    caret = doc.createElement("span");
  for (const property of [
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "letter-spacing",
    "line-height",
    "text-transform",
    "text-indent",
    "tab-size",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "box-sizing",
    "word-spacing",
    "direction",
  ])
    mirror.style.setProperty(property, computed.getPropertyValue(property));
  Object.assign(mirror.style, {
    position: "fixed",
    visibility: "hidden",
    pointerEvents: "none",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    width: `${textarea.getBoundingClientRect().width}px`,
    left: "0",
    top: "0",
    borderStyle: "solid",
  });
  mirror.textContent = textarea.value.slice(0, offset);
  caret.textContent = textarea.value.slice(offset, offset + 1) || "\u200b";
  mirror.append(caret, doc.createTextNode(textarea.value.slice(offset + 1)));
  doc.body.append(mirror);
  const marker = caret.getBoundingClientRect(),
    outer = textarea.getBoundingClientRect();
  const result = new DOMRect(
    outer.left + marker.left - textarea.scrollLeft,
    outer.top + marker.top - textarea.scrollTop,
    marker.width,
    marker.height || parseFloat(computed.lineHeight) || 20,
  );
  mirror.remove();
  return result;
}
export function textareaAtVisualBoundary(
  textarea: HTMLTextAreaElement,
  direction: "up" | "down",
): boolean {
  if (textarea.selectionStart !== textarea.selectionEnd) return false;
  const caret = textareaCaretRect(textarea, textarea.selectionStart);
  const edge = textareaCaretRect(textarea, direction === "up" ? 0 : textarea.value.length);
  // Zero geometry (SSR/test DOM) uses explicit line boundaries rather than claiming wrapping QA.
  if (!caret.width && !edge.width && !textarea.getBoundingClientRect().width)
    return direction === "up"
      ? !textarea.value.slice(0, textarea.selectionStart).includes("\n")
      : !textarea.value.slice(textarea.selectionStart).includes("\n");
  return Math.abs(caret.top - edge.top) < Math.max(2, caret.height / 2);
}

/** Textarea hit testing uses a text-only mirror; it never counts suffixes/popovers. */
export function textareaOffsetAtPoint(textarea: HTMLTextAreaElement, x: number, y: number): number {
  if (!textarea.getBoundingClientRect().width || textarea.value.length > 20_000)
    return textarea.selectionStart;
  // Character rectangles come from the same caret measurement used for keyboard boundaries.
  // First find the closest visual line, then choose its nearest character boundary.
  let low = 0,
    high = textarea.value.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2),
      rect = textareaCaretRect(textarea, middle);
    if (rect.bottom < y) low = middle + 1;
    else high = middle;
  }
  const line = textareaCaretRect(textarea, low),
    candidates: number[] = [low];
  for (let index = low - 1; index >= 0; index--) {
    if (Math.abs(textareaCaretRect(textarea, index).top - line.top) > 2) break;
    candidates.push(index);
  }
  for (let index = low + 1; index <= textarea.value.length; index++) {
    if (Math.abs(textareaCaretRect(textarea, index).top - line.top) > 2) break;
    candidates.push(index);
  }
  let nearest = low,
    distance = Infinity;
  for (const offset of candidates) {
    if (offset > 0 && /[\uDC00-\uDFFF]/.test(textarea.value[offset] ?? "")) continue;
    const rect = textareaCaretRect(textarea, offset),
      next = Math.abs(rect.left - x);
    if (next < distance) {
      distance = next;
      nearest = offset;
    }
  }
  return nearest;
}
