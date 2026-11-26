/**
 * Terminal text: the portable model behind the Terminal transcript. A line is plain text or a list
 * of segments, each with an optional tone from a fixed set. Tones name a role, never a colour, so a
 * theme decides what they look like. ANSI SGR codes in plain text can be read onto the same tones.
 * Nothing here touches the DOM or produces markup: text stays text.
 */

/** The fixed set of tones a terminal segment can take. */
export const TERMINAL_TONES = [
  "dim",
  "bold",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
  "link",
] as const;
export type TerminalTone = (typeof TERMINAL_TONES)[number];

export interface TerminalSegment {
  readonly text: string;
  /** One tone, or a weight plus a colour: `["bold", "success"]`. Unknown tones are ignored. */
  readonly tone?: TerminalTone | readonly TerminalTone[];
  /**
   * Drawn but not part of the text, such as a marker or a bar at the start of a line. Screen
   * readers skip it and a copy leaves it out.
   */
  readonly decorative?: boolean;
}

/** One line of a transcript: plain text, or segments. */
export type TerminalLine = string | readonly TerminalSegment[];

/** A line ready to draw: decorative lead segments, whether it was typed, and its text. */
export interface TerminalRow {
  readonly kind: "in" | "out";
  /** Decorative segments before the prompt, such as a marker. */
  readonly lead: readonly TerminalSegment[];
  readonly segments: readonly TerminalSegment[];
}

export interface TerminalReadOptions {
  /** A line whose text starts with the prompt and a space is something the reader types. */
  readonly prompt?: string;
  /** Read ANSI SGR codes in plain-text lines onto tones. Other escape sequences are dropped. */
  readonly ansi?: boolean;
}

const toneSet: ReadonlySet<string> = new Set(TERMINAL_TONES);

/** The known tones of a segment, in order and without repeats. */
export function terminalTones(tone: TerminalSegment["tone"]): readonly TerminalTone[] {
  if (tone === undefined) return [];
  const list: readonly unknown[] =
    typeof tone === "string" ? [tone] : Array.isArray(tone) ? tone : [];
  const result: TerminalTone[] = [];
  for (const item of list)
    if (typeof item === "string" && toneSet.has(item) && !result.includes(item as TerminalTone))
      result.push(item as TerminalTone);
  return result;
}

// The eight base ANSI colours, by index: black, red, green, yellow, blue, magenta, cyan, white.
// Black would vanish on a dark ground, so it reads as dim; white is the ground's own ink.
const ANSI_COLOURS: readonly (TerminalTone | undefined)[] = [
  "dim",
  "danger",
  "success",
  "warning",
  "info",
  "accent",
  "link",
  undefined,
];

interface Style {
  bold: boolean;
  dim: boolean;
  colour: TerminalTone | undefined;
}

function styleTone(style: Style): TerminalSegment["tone"] {
  const tones: TerminalTone[] = [];
  if (style.bold) tones.push("bold");
  if (style.dim || style.colour === "dim") tones.push("dim");
  if (style.colour && style.colour !== "dim") tones.push(style.colour);
  if (!tones.length) return undefined;
  return tones.length === 1 ? tones[0] : tones;
}

function applySgr(style: Style, params: string) {
  const codes = params === "" ? ["0"] : params.split(";");
  for (let index = 0; index < codes.length; index++) {
    const raw = codes[index]!;
    // Colon sub-parameters (38:2::r:g:b, 4:3) carry no tone; an extended colour this way is unknown.
    if (raw.includes(":")) {
      if (raw.startsWith("38:")) style.colour = undefined;
      continue;
    }
    const code = raw === "" ? 0 : Number(raw);
    if (code === 0) {
      style.bold = false;
      style.dim = false;
      style.colour = undefined;
    } else if (code === 1) style.bold = true;
    else if (code === 2) style.dim = true;
    else if (code === 22) {
      style.bold = false;
      style.dim = false;
    } else if (code >= 30 && code <= 37) style.colour = ANSI_COLOURS[code - 30];
    else if (code >= 90 && code <= 97) style.colour = ANSI_COLOURS[code - 90];
    else if (code === 39) style.colour = undefined;
    else if (code === 38 || code === 48 || code === 58) {
      // Extended colours: 5;n picks from 256, 2;r;g;b is direct. Only 38;5;0-15 maps onto a tone.
      const mode = codes[index + 1];
      if (mode === "5") {
        const n = Number(codes[index + 2]);
        if (code === 38)
          style.colour = Number.isInteger(n) && n >= 0 && n < 16 ? ANSI_COLOURS[n % 8] : undefined;
        index += 2;
      } else if (mode === "2") {
        if (code === 38) style.colour = undefined;
        index += 4;
      }
    }
    // Everything else (italic, underline, inverse, backgrounds) carries no tone here.
  }
}

/**
 * Read text with ANSI escape sequences into lines of toned segments. SGR codes for bold, dim, reset
 * and the 16 foreground colours map onto tones; style carries across lines as it does in a real
 * terminal. Every other escape sequence and control character is dropped, so no code reaches the
 * page, and a malformed sequence is dropped up to the character that broke it.
 */
export function parseAnsi(source: string): TerminalSegment[][] {
  const lines: TerminalSegment[][] = [[]];
  const style: Style = { bold: false, dim: false, colour: undefined };
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    const tone = styleTone(style);
    const line = lines.at(-1)!;
    const last = line.at(-1);
    if (last && toneKey(last.tone) === toneKey(tone))
      line[line.length - 1] = { ...last, text: last.text + buffer };
    else line.push(tone === undefined ? { text: buffer } : { text: buffer, tone });
    buffer = "";
  };
  const length = source.length;
  let i = 0;
  while (i < length) {
    const char = source[i]!;
    if (char === "\n") {
      flush();
      lines.push([]);
      i++;
      continue;
    }
    if (char === "\u001b") {
      const next = source[i + 1];
      if (next === "[") {
        // CSI: parameter bytes, intermediate bytes, then one final byte.
        let j = i + 2;
        while (j < length && source.charCodeAt(j) >= 0x30 && source.charCodeAt(j) <= 0x3f) j++;
        const paramsEnd = j;
        while (j < length && source.charCodeAt(j) >= 0x20 && source.charCodeAt(j) <= 0x2f) j++;
        const final = j < length ? source.charCodeAt(j) : -1;
        if (final >= 0x40 && final <= 0x7e) {
          const params = source.slice(i + 2, paramsEnd);
          if (final === 0x6d && j === paramsEnd && /^[\d;:]*$/.test(params)) {
            flush();
            applySgr(style, params);
          }
          i = j + 1;
        } else i = j;
        continue;
      }
      if (next === "]" || next === "P" || next === "X" || next === "^" || next === "_") {
        // A string sequence (OSC, DCS, SOS, PM, APC) ends at BEL or ESC \. A line end or the end of
        // the text also ends it, so an unterminated one cannot swallow the rest of the transcript.
        let j = i + 2;
        while (j < length) {
          const c = source[j]!;
          if (c === "\u0007") {
            j++;
            break;
          }
          if (c === "\u001b" && source[j + 1] === "\\") {
            j += 2;
            break;
          }
          if (c === "\n") break;
          j++;
        }
        i = j;
        continue;
      }
      if (next !== undefined) {
        const code = next.charCodeAt(0);
        // nF escapes (ESC, intermediates, final) and two-byte escapes (ESC 7, ESC M, ESC c).
        if (code >= 0x20 && code <= 0x2f) {
          let j = i + 1;
          while (j < length && source.charCodeAt(j) >= 0x20 && source.charCodeAt(j) <= 0x2f) j++;
          const final = j < length ? source.charCodeAt(j) : -1;
          i = final >= 0x30 && final <= 0x7e ? j + 1 : j;
          continue;
        }
        if (code >= 0x30 && code <= 0x7e) {
          i += 2;
          continue;
        }
      }
      i++;
      continue;
    }
    const code = char.charCodeAt(0);
    if ((code < 0x20 && char !== "\t") || code === 0x7f) {
      i++;
      continue;
    }
    buffer += char;
    i++;
  }
  flush();
  return lines;
}

function toneKey(tone: TerminalSegment["tone"]): string {
  return terminalTones(tone).join(" ");
}

function segmentsOf(line: TerminalLine, ansi: boolean): readonly TerminalSegment[] {
  if (typeof line === "string") {
    if (!ansi) return [{ text: line }];
    return parseAnsi(line).flatMap((part, index) => (index ? [{ text: "\n" }, ...part] : part));
  }
  if (!Array.isArray(line)) return [];
  return line.filter(
    (segment): segment is TerminalSegment =>
      typeof segment === "object" && segment !== null && typeof segment.text === "string",
  );
}

function rowOf(
  segments: readonly TerminalSegment[],
  prompt: string,
  keepEmpty: boolean,
): TerminalRow {
  let start = 0;
  while (start < segments.length && segments[start]!.decorative) start++;
  const lead = segments.slice(0, start);
  const rest = segments.slice(start);
  const marker = `${prompt} `;
  const typed = rest
    .map((segment) => segment.text)
    .join("")
    .startsWith(marker);
  if (!typed) return { kind: "out", lead, segments: rest };
  // Drop the prompt and its space from the front of the text, across segment edges.
  let left = marker.length;
  const kept: TerminalSegment[] = [];
  for (const segment of rest) {
    if (left >= segment.text.length) {
      left -= segment.text.length;
      continue;
    }
    kept.push(left ? { ...segment, text: segment.text.slice(left) } : segment);
    left = 0;
  }
  if (keepEmpty && !kept.length) kept.push({ text: "" });
  return { kind: "in", lead, segments: kept };
}

/**
 * The rows a Terminal draws. A string transcript is trimmed of blank edges and split into lines;
 * an array is one line per item. With `ansi`, plain text is read for SGR codes.
 */
export function terminalRows(
  source: string | readonly TerminalLine[],
  options: TerminalReadOptions = {},
): readonly TerminalRow[] {
  const prompt = options.prompt ?? "$";
  const ansi = options.ansi === true;
  if (typeof source === "string") {
    const text = source.replace(/^\n+|\n+$/g, "");
    const lines: readonly (readonly TerminalSegment[])[] = ansi
      ? parseAnsi(text)
      : text.split("\n").map((line) => [{ text: line }]);
    return lines.map((segments) => rowOf(segments, prompt, !ansi));
  }
  if (!Array.isArray(source)) return [];
  return source.map((line) =>
    rowOf(segmentsOf(line, ansi), prompt, typeof line === "string" && !ansi),
  );
}

/**
 * The text a reader gets when they copy the transcript: no escape codes, no prompts and no
 * decorative segments, one line per row.
 */
export function terminalCopyText(
  source: string | readonly TerminalLine[],
  options: TerminalReadOptions = {},
): string {
  return terminalRows(source, options)
    .map((row) =>
      row.segments
        .filter((segment) => !segment.decorative)
        .map((segment) => segment.text)
        .join(""),
    )
    .join("\n");
}
