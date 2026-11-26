/**
 * Where a scroll position sits along ordered stops, as a fractional stop index: 1.5 is halfway
 * between the second and third stop. Positions before the first stop or past the last clamp to
 * the ends. A position within `tolerance` of a stop counts as at it, so sub-pixel layout settles
 * on a whole number.
 */
export function scrollProgress(stops: readonly number[], position: number, tolerance = 1): number {
  if (stops.length < 2) return 0;
  for (let index = 0; index < stops.length; index++)
    if (Math.abs(position - stops[index]!) <= tolerance) return index;
  if (position <= stops[0]!) return 0;
  for (let index = 1; index < stops.length; index++) {
    const start = stops[index - 1]!;
    const end = stops[index]!;
    if (position < end) return index - 1 + (end > start ? (position - start) / (end - start) : 0);
  }
  return stops.length - 1;
}
