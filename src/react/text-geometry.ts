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

/** Never return a caret between a UTF-16 surrogate pair. */
function codePointBoundary(text: string, offset: number): number {
  const bounded = Math.max(0, Math.min(text.length, offset));
  return bounded > 0 &&
    /[\uDC00-\uDFFF]/.test(text[bounded] ?? "") &&
    /[\uD800-\uDBFF]/.test(text[bounded - 1] ?? "")
    ? bounded - 1
    : bounded;
}

function explicitVerticalTarget(
  source: HTMLTextAreaElement,
  target: HTMLTextAreaElement,
  direction: "up" | "down",
): number {
  const before = source.value.slice(0, source.selectionStart);
  const column = before.length - before.lastIndexOf("\n") - 1;
  const start = direction === "up" ? target.value.lastIndexOf("\n") + 1 : 0;
  const newline = target.value.indexOf("\n", start);
  const end = newline < 0 ? target.value.length : newline;
  return codePointBoundary(target.value, start + Math.min(column, end - start));
}

/**
 * One immutable text-only mirror per textarea, not one mirror/string rebuild per
 * candidate offset. Range reads are still layout work; callers must budget text.
 */
function verticalCaretGeometry(textarea: HTMLTextAreaElement) {
  const doc = textarea.ownerDocument;
  const win = doc.defaultView;
  const outer = textarea.getBoundingClientRect();
  if (!win || !doc.body || outer.width <= 0) return null;
  const computed = win.getComputedStyle(textarea);
  const mirror = doc.createElement("div");
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
    width: `${outer.width}px`,
    left: "0",
    top: "0",
    borderStyle: "solid",
  });
  // A final marker gives empty text and a trailing explicit newline a line box.
  const text = doc.createTextNode(`${textarea.value}\u200b`);
  const range = doc.createRange();
  mirror.append(text);
  doc.body.append(mirror);
  return {
    remove: () => mirror.remove(),
    at(offset: number): DOMRect | null {
      const position = codePointBoundary(textarea.value, offset);
      range.setStart(text, position);
      range.collapse(true);
      if (typeof range.getBoundingClientRect !== "function") return null;
      const caret = range.getBoundingClientRect();
      // Collapsed ranges can prefer the preceding line at a soft-wrap boundary.
      // The next character chooses the same line as the textarea's forward caret.
      const following = text.data.codePointAt(position)!;
      range.setEnd(text, position + (following > 0xffff ? 2 : 1));
      const character = range.getBoundingClientRect();
      if (!(character.height > 0) || !Number.isFinite(character.left + character.top)) return null;
      const sameLine =
        caret.height > 0 && Math.abs(caret.top - character.top) < character.height / 2;
      const x = sameLine
        ? caret.left
        : computed.direction === "rtl"
          ? character.right
          : character.left;
      if (!Number.isFinite(x)) return null;
      return new DOMRect(
        outer.left + x - textarea.scrollLeft,
        outer.top + character.top - textarea.scrollTop,
        0,
        character.height,
      );
    },
  };
}

/**
 * Approximate native vertical movement between adjacent textareas: retain physical
 * viewport x and choose the nearest caret on the target's first (down) or last (up)
 * visual line. Returned offsets use UTF-16 and never split a surrogate pair.
 *
 * Each textarea gets one text-only mirror. At most 20,001 target boundaries are
 * considered; no per-character full-mirror rebuild occurs. Missing/zero geometry,
 * separate documents, or either text over 20,000 units use explicit-newline column
 * fallback, which deliberately makes no soft-wrap claim. Bidi affinity and complex
 * grapheme navigation remain browser approximations, not native IME certification.
 */
export function textareaVerticalTarget(
  source: HTMLTextAreaElement,
  target: HTMLTextAreaElement,
  direction: "up" | "down",
): number {
  const fallback = () => explicitVerticalTarget(source, target, direction);
  if (
    source.ownerDocument !== target.ownerDocument ||
    source.value.length > 20_000 ||
    target.value.length > 20_000 ||
    !source.getBoundingClientRect().width ||
    !target.getBoundingClientRect().width
  )
    return fallback();
  let sourceGeometry: ReturnType<typeof verticalCaretGeometry> = null;
  let targetGeometry: ReturnType<typeof verticalCaretGeometry> = null;
  try {
    sourceGeometry = verticalCaretGeometry(source);
    targetGeometry = verticalCaretGeometry(target);
    const sourceCaret = sourceGeometry?.at(source.selectionStart);
    if (!sourceCaret || !targetGeometry) return fallback();
    let offset = direction === "down" ? 0 : target.value.length;
    const edge = targetGeometry.at(offset);
    if (!edge) return fallback();
    let nearest = offset;
    let distance = Infinity;
    while (offset >= 0 && offset <= target.value.length) {
      const rect = targetGeometry.at(offset);
      if (!rect) return fallback();
      if (Math.abs(rect.top - edge.top) >= Math.max(2, edge.height / 2)) break;
      const nextDistance = Math.abs(rect.left - sourceCaret.left);
      if (nextDistance < distance) {
        distance = nextDistance;
        nearest = offset;
      }
      if (direction === "down") offset += (target.value.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1;
      else offset = offset === 0 ? -1 : codePointBoundary(target.value, offset - 1);
    }
    return nearest;
  } catch {
    // DOM adapters without usable Range geometry keep deterministic logical behavior.
    return fallback();
  } finally {
    sourceGeometry?.remove();
    targetGeometry?.remove();
  }
}
