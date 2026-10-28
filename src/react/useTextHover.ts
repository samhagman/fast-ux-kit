"use client";

import { isValidElement, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  sameTextContext,
  validTextRange,
  type TextHoverRequest,
  type TextRequestContext,
} from "../core/text-intelligence.js";
import { validTextHoverOffer, type TextHoverOffer, type TextHoverProvider } from "../core/hover.js";

export interface HoverSession {
  readonly context: TextRequestContext;
  readonly offer: TextHoverOffer<ReactNode>;
  readonly offset: number;
  readonly origin: TextHoverRequest["origin"];
}
export interface TextHoverController {
  readonly session: HoverSession | null;
  readonly status: "idle" | "loading" | "ready" | "empty" | "error";
  readonly error: unknown;
  readonly request: (
    context: TextRequestContext,
    offset: number,
    origin: TextHoverRequest["origin"],
  ) => void;
  readonly dismiss: () => void;
}
export interface UseTextHoverOptions {
  readonly providers: readonly TextHoverProvider<ReactNode>[];
  readonly getContext: () => TextRequestContext | null;
  readonly disabled?: boolean;
}
type HoverState = Pick<TextHoverController, "session" | "status" | "error">;
const idle: HoverState = { session: null, status: "idle", error: null };

function snapshot(context: TextRequestContext): TextRequestContext | null {
  if (
    !context ||
    typeof context.surfaceId !== "string" ||
    typeof context.rowId !== "string" ||
    typeof context.text !== "string" ||
    !Number.isInteger(context.revision) ||
    !validTextRange(context.selection, context.text)
  )
    return null;
  return {
    surfaceId: context.surfaceId,
    rowId: context.rowId,
    text: context.text,
    revision: context.revision,
    selection: { start: context.selection.start, end: context.selection.end },
  };
}
/** Arrays, ordinary React elements and scalar nodes are accepted; opaque objects/functions/promises are not. */
function renderable(content: unknown): content is ReactNode {
  const pending: { value: unknown; depth: number }[] = [{ value: content, depth: 0 }];
  let visited = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++visited > 1_000 || depth > 32) return false;
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      typeof value === "bigint" ||
      (typeof value === "number" && Number.isFinite(value)) ||
      isValidElement(value)
    )
      continue;
    if (!Array.isArray(value) || value.length + visited > 1_000) return false;
    for (const item of value) pending.push({ value: item, depth: depth + 1 });
  }
  return true;
}

/**
 * Deterministic first-valid-provider precedence. Every request owns a cancellation signal;
 * no result may reopen a dismissed session or cross a surface/row/text/revision/selection change.
 * React content is trusted host code, not HTML, imported modules or a sandbox boundary.
 */
export function useTextHover({
  providers,
  getContext,
  disabled = false,
}: UseTextHoverOptions): TextHoverController {
  const [state, setState] = useState<HoverState>(idle);
  const options = useRef({ providers, getContext, disabled });
  options.current = { providers, getContext, disabled };
  const active = useRef<{
    id: number;
    context: TextRequestContext;
    abort: AbortController;
    provider?: TextHoverProvider<ReactNode>;
    ready?: boolean;
  } | null>(null);
  const serial = useRef(0);
  const mounted = useRef(true);

  const dismiss = useCallback(() => {
    serial.current += 1;
    active.current?.abort.abort();
    active.current = null;
    if (mounted.current) setState(idle);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      serial.current += 1;
      active.current?.abort.abort();
      active.current = null;
    };
  }, []);
  useEffect(() => {
    if (!active.current) return;
    let context: TextRequestContext | null = null;
    try {
      context = options.current.getContext();
    } catch {
      /* A failing host lookup invalidates pending content. */
    }
    const provider = active.current.provider;
    const providerPresent =
      !provider ||
      options.current.providers.some(
        (candidate) =>
          candidate.id === provider.id &&
          (!active.current?.ready || candidate.hover === provider.hover),
      );
    if (
      options.current.disabled ||
      !context ||
      !sameTextContext(active.current.context, context) ||
      !providerPresent
    )
      dismiss();
  });

  const request = useCallback(
    (input: TextRequestContext, offset: number, origin: TextHoverRequest["origin"]) => {
      dismiss();
      if (
        !mounted.current ||
        options.current.disabled ||
        !Number.isInteger(offset) ||
        (origin !== "pointer" && origin !== "keyboard")
      )
        return;
      const context = snapshot(input);
      if (!context || offset < 0 || offset > context.text.length) return;
      let current: TextRequestContext | null;
      try {
        current = options.current.getContext();
      } catch (error) {
        setState({ session: null, status: "error", error });
        return;
      }
      if (!current || !sameTextContext(context, current)) return;
      const abort = new AbortController(),
        id = serial.current;
      active.current = { id, context, abort };
      setState({ session: null, status: "loading", error: null });
      const configured = [...options.current.providers];
      const fresh = () => {
        if (
          !mounted.current ||
          options.current.disabled ||
          abort.signal.aborted ||
          active.current?.id !== id ||
          serial.current !== id
        )
          return false;
        try {
          const latest = options.current.getContext();
          if (latest && sameTextContext(context, latest)) return true;
        } catch {
          /* Invalid context cannot keep a loading or ready session alive. */
        }
        dismiss();
        return false;
      };
      void (async () => {
        let failure: unknown = null;
        const seen = new Set<string>();
        for (const provider of configured) {
          if (!fresh()) return;
          if (
            !provider ||
            typeof provider.id !== "string" ||
            !provider.id ||
            typeof provider.hover !== "function" ||
            seen.has(provider.id)
          )
            continue;
          seen.add(provider.id);
          if (active.current) active.current.provider = provider;
          try {
            const offered: unknown = await provider.hover({
              ...context,
              selection: { ...context.selection },
              offset,
              origin,
              signal: abort.signal,
            });
            if (!fresh()) return;
            if (
              !options.current.providers.some(
                (current) => current.id === provider.id && current.hover === provider.hover,
              )
            )
              continue;
            if (
              !validTextHoverOffer<ReactNode>(offered, context.text, offset) ||
              !renderable(offered.content)
            )
              continue;
            const offer: TextHoverOffer<ReactNode> = {
              range: { start: offered.range.start, end: offered.range.end },
              content: offered.content,
            };
            if (active.current) active.current.ready = true;
            setState({ status: "ready", error: null, session: { context, offer, offset, origin } });
            return;
          } catch (error) {
            if (!fresh()) return;
            failure ??= error;
          }
        }
        if (fresh())
          setState({ session: null, status: failure === null ? "empty" : "error", error: failure });
      })();
    },
    [dismiss],
  );
  return { ...state, request, dismiss };
}
