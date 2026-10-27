"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptTextCompletion,
  filterCompletions,
  sameTextContext,
  validTextRange,
  type TextCompletion,
  type TextCompletionOffer,
  type TextCompletionProvider,
  type TextRequestContext,
} from "../core/index.js";

export interface CompletionSession {
  readonly context: TextRequestContext;
  readonly offer: TextCompletionOffer;
  readonly items: readonly TextCompletion[];
  readonly active: number;
}
export interface TextCompletionController {
  readonly session: CompletionSession | null;
  readonly status: "idle" | "loading" | "ready" | "empty" | "error";
  readonly error: unknown;
  readonly request: (context: TextRequestContext, reason?: "explicit" | "input") => void;
  readonly dismiss: () => void;
  readonly move: (delta: number) => void;
  readonly choose: (index?: number) => boolean;
}
type CompletionState = Pick<TextCompletionController, "session" | "status" | "error">;
const idle: CompletionState = { session: null, status: "idle", error: null };
const copyContext = (context: TextRequestContext): TextRequestContext => ({
  surfaceId: context.surfaceId,
  rowId: context.rowId,
  text: context.text,
  revision: context.revision,
  selection: { ...context.selection },
});
/** Request identity, full text context and provider identity all remain valid through acceptance. */
export function useTextCompletion({
  providers,
  getContext,
  onAccept,
  disabled = false,
}: {
  readonly providers: readonly TextCompletionProvider[];
  readonly getContext: () => TextRequestContext | null;
  readonly onAccept: (
    context: TextRequestContext,
    result: { readonly text: string; readonly caret: number },
  ) => void;
  readonly disabled?: boolean;
}): TextCompletionController {
  const [state, setState] = useState<CompletionState>(idle);
  const currentState = useRef(state),
    config = useRef({ providers, getContext, onAccept, disabled });
  config.current = { providers, getContext, onAccept, disabled };
  const generation = useRef(0),
    mounted = useRef(true);
  const active = useRef<{
    serial: number;
    abort: AbortController;
    context: TextRequestContext;
    providers: readonly TextCompletionProvider[];
  } | null>(null);
  const publish = (next: CompletionState) => {
    currentState.current = next;
    if (mounted.current) setState(next);
  };
  const dismiss = useCallback(() => {
    generation.current++;
    active.current?.abort.abort();
    active.current = null;
    currentState.current = idle;
    if (mounted.current) setState(idle);
  }, []);
  const getFreshContext = (): TextRequestContext | null => {
    try {
      return config.current.getContext();
    } catch {
      return null;
    }
  };
  const validProviders = (requested: readonly TextCompletionProvider[]) =>
    requested.every((provider) =>
      config.current.providers.some(
        (current) =>
          current.id === provider.id &&
          current.complete === provider.complete &&
          current.shouldTrigger === provider.shouldTrigger,
      ),
    );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      active.current?.abort.abort();
      active.current = null;
    };
  }, []);
  useEffect(() => {
    const request = active.current;
    if (!request) return;
    const current = getFreshContext();
    if (
      disabled ||
      !current ||
      !sameTextContext(request.context, current) ||
      !validProviders(request.providers)
    )
      dismiss();
  });
  const request = useCallback(
    (input: TextRequestContext, reason: "explicit" | "input" = "explicit") => {
      dismiss();
      if (
        !mounted.current ||
        config.current.disabled ||
        !input ||
        typeof input.text !== "string" ||
        typeof input.surfaceId !== "string" ||
        typeof input.rowId !== "string" ||
        !Number.isInteger(input.revision) ||
        !validTextRange(input.selection, input.text) ||
        input.selection.start !== input.selection.end
      )
        return;
      const context = copyContext(input),
        current = getFreshContext();
      if (!current || !sameTextContext(context, current)) return;
      let available: readonly TextCompletionProvider[];
      try {
        available = config.current.providers.filter(
          (provider) =>
            provider &&
            typeof provider.id === "string" &&
            typeof provider.complete === "function" &&
            (reason === "explicit" || provider.shouldTrigger?.(copyContext(context))),
        );
      } catch (error) {
        publish({ session: null, status: "error", error });
        return;
      }
      if (!available.length) return;
      const serial = generation.current,
        abort = new AbortController();
      active.current = { serial, abort, context, providers: available };
      publish({ session: null, status: "loading", error: null });
      const fresh = () => {
        if (
          !mounted.current ||
          serial !== generation.current ||
          abort.signal.aborted ||
          config.current.disabled
        )
          return false;
        const latest = getFreshContext();
        if (!latest || !sameTextContext(context, latest) || !validProviders(available)) {
          dismiss();
          return false;
        }
        return true;
      };
      Promise.allSettled(
        available.map((provider) =>
          Promise.resolve().then(() =>
            provider.complete({ ...copyContext(context), reason, signal: abort.signal }),
          ),
        ),
      )
        .then((results) => {
          if (!fresh()) return;
          const offers = results.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : [],
          );
          const usable = offers.filter(
            (offer): offer is TextCompletionOffer =>
              offer !== null &&
              typeof offer === "object" &&
              Array.isArray(offer.items) &&
              validTextRange(offer.range, context.text) &&
              offer.range.start <= context.selection.start &&
              offer.range.end >= context.selection.end,
          );
          const first = usable[0];
          if (!first) {
            const failure = results.find((result) => result.status === "rejected");
            publish({
              session: null,
              status: failure ? "error" : "empty",
              error: failure?.reason ?? null,
            });
            return;
          }
          // Different replacement ranges cannot silently become one completion edit.
          const offered = usable
            .filter(
              (offer) =>
                offer.range.start === first.range.start && offer.range.end === first.range.end,
            )
            .flatMap((offer) => [...offer.items]);
          const items = filterCompletions(
            offered,
            context.text.slice(first.range.start, context.selection.start),
            context.text.slice(first.range.start, first.range.end),
          ).map((item) => ({ ...item }));
          if (!items.length) {
            publish({ session: null, status: "empty", error: null });
            return;
          }
          publish({
            session: { context, offer: { range: { ...first.range }, items }, items, active: 0 },
            status: "ready",
            error: null,
          });
        })
        .catch((error: unknown) => {
          if (fresh()) publish({ session: null, status: "error", error });
        });
    },
    [dismiss],
  );
  const move = useCallback((delta: number) => {
    const session = currentState.current.session;
    if (!session?.items.length || !Number.isFinite(delta)) return;
    const length = session.items.length,
      activeIndex = (((session.active + Math.trunc(delta)) % length) + length) % length;
    publish({ ...currentState.current, session: { ...session, active: activeIndex } });
  }, []);
  const choose = useCallback(
    (index?: number) => {
      const session = currentState.current.session,
        context = getFreshContext(),
        pending = active.current;
      if (
        !session ||
        !context ||
        !pending ||
        config.current.disabled ||
        !sameTextContext(session.context, context) ||
        !validProviders(pending.providers)
      ) {
        dismiss();
        return false;
      }
      const item = session.items[index ?? session.active],
        result = item && acceptTextCompletion(context.text, session.offer, item);
      dismiss();
      if (!result) return false;
      config.current.onAccept(copyContext(context), result);
      return true;
    },
    [dismiss],
  );
  return { ...state, request, dismiss, move, choose };
}
