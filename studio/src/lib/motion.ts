import type { Transition, Variants } from "motion/react";

/**
 * One motion vocabulary for every component: short, decelerating, never bouncy.
 * MotionConfig reducedMotion="user" at the app root collapses these to instant changes.
 */
export const ease = [0.2, 0, 0, 1] as const;

export const motionTokens = {
  instant: { duration: 0.08, ease } satisfies Transition,
  quick: { duration: 0.14, ease } satisfies Transition,
  base: { duration: 0.2, ease } satisfies Transition,
  slow: { duration: 0.28, ease } satisfies Transition,
  /** Layout shifts (reorder, indent) — critically damped, no overshoot. */
  layout: { type: "spring", stiffness: 640, damping: 52, mass: 0.7 } satisfies Transition,
} as const;

/** Height-collapsing presence for rows and disclosure bodies. */
export const collapse: Variants = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto", transition: { ...motionTokens.base, opacity: motionTokens.quick } },
  exit: { opacity: 0, height: 0, transition: { ...motionTokens.quick } },
};

/** Floating chrome (toolbars, bulk bars) rising into place. */
export const rise: Variants = {
  initial: { opacity: 0, y: 6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: motionTokens.base },
  exit: { opacity: 0, y: 4, scale: 0.98, transition: motionTokens.quick },
};

export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: motionTokens.quick },
  exit: { opacity: 0, transition: motionTokens.instant },
};
