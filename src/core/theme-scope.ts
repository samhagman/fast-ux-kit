/**
 * The inputs a theme scope takes, and the custom properties it writes them to. Portable: no
 * React, no DOM. The stylesheet maps each input onto the kit's full token set.
 *
 * Inputs are written under their own private names (`--fux-scope-*`) on an outer element, and
 * mapped onto the kit's tokens on an inner one. A value may itself be a `var()`, including one
 * that names the kit token it feeds (`fg: "var(--foreground)"`): it resolves on the outer
 * element, where that token still holds the surrounding theme's value, so it can never refer to
 * itself.
 */
export interface ThemeScopeTokens {
  /** Text. */
  readonly fg?: string;
  /** The ground: page, cards, popovers and fields. */
  readonly bg?: string;
  /** Secondary text. Defaults to `fg` mixed into `bg`. */
  readonly muted?: string;
  /** The brand mark: links, highlights, the focus ring. */
  readonly accent?: string;
  /** The primary action's fill. */
  readonly primary?: string;
  /** Text on `primary`. Defaults to `bg`. */
  readonly onPrimary?: string;
  /** Field and control borders. Defaults to `fg` mixed into `bg`. */
  readonly field?: string;
  /** The one corner radius; smaller and larger steps scale from it. */
  readonly radius?: string;
  /** The body face. */
  readonly fontBody?: string;
  /** The heading face. Defaults to the body face. */
  readonly fontHead?: string;
  /** Selected choices: checked radios and checkboxes, switches that are on, pressed toggles. */
  readonly selection?: string;
  /** The mark drawn on `selection` (a radio's dot, a checkbox's tick). Defaults to `bg`. */
  readonly onSelection?: string;
}

export type ThemeScopeInput = keyof ThemeScopeTokens;

/** Every input in a fixed order, with the private custom property it is written to. */
export const themeScopeInputs: readonly (readonly [ThemeScopeInput, string])[] = [
  ["fg", "--fux-scope-fg"],
  ["bg", "--fux-scope-bg"],
  ["muted", "--fux-scope-muted"],
  ["accent", "--fux-scope-accent"],
  ["primary", "--fux-scope-primary"],
  ["onPrimary", "--fux-scope-on-primary"],
  ["field", "--fux-scope-field"],
  ["radius", "--fux-scope-radius"],
  ["fontBody", "--fux-scope-font-body"],
  ["fontHead", "--fux-scope-font-head"],
  ["selection", "--fux-scope-selection"],
  ["onSelection", "--fux-scope-on-selection"],
];

export interface ThemeScopeProperties {
  /** The private custom properties to set, input value verbatim. */
  readonly properties: Readonly<Record<string, string>>;
  /** The inputs that were given, in the fixed order, as the stylesheet's attribute names. */
  readonly given: readonly string[];
}

/**
 * A value that could end its declaration or its rule. Server-rendered style attributes are not
 * parsed, so `red; background: url(…)` would add a declaration of its own; such a value is not
 * one CSS value and is ignored.
 */
const notOneValue = /[;{}<>\\]|[\u0000-\u001f\u007f]/;

/**
 * The custom properties for a set of inputs. Inputs that are missing, empty, not a string or not
 * a single CSS value are left out, so the surrounding theme's value for every token they feed
 * shows through.
 */
export function themeScopeProperties(tokens: ThemeScopeTokens): ThemeScopeProperties {
  const properties: Record<string, string> = {};
  const given: string[] = [];
  for (const [input, property] of themeScopeInputs) {
    const value = tokens[input];
    if (typeof value !== "string" || value.trim() === "" || notOneValue.test(value)) continue;
    properties[property] = value.trim();
    given.push(property.slice("--fux-scope-".length));
  }
  return { properties, given };
}
