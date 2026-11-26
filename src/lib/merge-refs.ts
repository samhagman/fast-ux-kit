import type * as React from "react";

/** One ref callback that writes to every given ref. */
export function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.RefObject<T | null>).current = node;
    }
  };
}
