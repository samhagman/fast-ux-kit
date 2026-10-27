import { validTextRange, type TextHoverRequest, type TextRange } from "./text-intelligence.js";

/** Provider content is supplied by the host, never parsed as HTML or executable source. */
export interface TextHoverOffer<T> {
  readonly range: TextRange;
  readonly content: T;
}
export interface TextHoverProvider<T> {
  readonly id: string;
  readonly hover: (
    request: TextHoverRequest,
  ) => TextHoverOffer<T> | null | Promise<TextHoverOffer<T> | null>;
}
/** A caret may sit at the end boundary of a token; a point offer is valid only at that point. */
export function validTextHoverOffer<T>(
  value: unknown,
  text: string,
  offset: number,
): value is TextHoverOffer<T> {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const content = Object.getOwnPropertyDescriptor(value, "content");
    const rangeField = Object.getOwnPropertyDescriptor(value, "range");
    if (
      !content ||
      !("value" in content) ||
      content.value === undefined ||
      !rangeField ||
      !("value" in rangeField)
    )
      return false;
    const range: unknown = rangeField.value;
    if (!range || typeof range !== "object" || Array.isArray(range)) return false;
    const start = Object.getOwnPropertyDescriptor(range, "start"),
      end = Object.getOwnPropertyDescriptor(range, "end");
    if (!start || !("value" in start) || !end || !("value" in end)) return false;
    const coordinates = { start: start.value as number, end: end.value as number };
    return (
      validTextRange(coordinates, text) &&
      Number.isInteger(offset) &&
      offset >= 0 &&
      offset <= text.length &&
      coordinates.start <= offset &&
      offset <= coordinates.end
    );
  } catch {
    return false;
  }
}
