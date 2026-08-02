import {
  type Rect,
  rectBottom,
  rectLeft,
  rectRight,
  rectTop,
  type Vec2,
} from "../physics/vector";

const contains = (rect: Rect, point: Vec2): boolean =>
  point.x >= rectLeft(rect) &&
  point.x <= rectRight(rect) &&
  point.y >= rectTop(rect) &&
  point.y <= rectBottom(rect);

interface Span {
  enter: number;
  exit: number;
}

/** Narrows the surviving portion of the segment to one axis' slab, or kills it. */
const clipSlab = (
  span: Span,
  delta: number,
  near: number,
  far: number,
): Span | null => {
  if (delta === 0) {
    return near > 0 || far < 0 ? null : span;
  }
  const first = near / delta;
  const second = far / delta;
  const enter = Math.max(span.enter, Math.min(first, second));
  const exit = Math.min(span.exit, Math.max(first, second));
  return enter > exit ? null : { enter, exit };
};

/** Slab test: does the segment `a`→`b` cross the box at all? */
export const segmentHitsRect = (a: Vec2, b: Vec2, rect: Rect): boolean => {
  const horizontal = clipSlab(
    { enter: 0, exit: 1 },
    b.x - a.x,
    rectLeft(rect) - a.x,
    rectRight(rect) - a.x,
  );
  if (!horizontal) {
    return false;
  }
  return (
    clipSlab(
      horizontal,
      b.y - a.y,
      rectTop(rect) - a.y,
      rectBottom(rect) - a.y,
    ) !== null
  );
};

/**
 * Sight is broken by any solid the segment crosses. Solids already containing an
 * endpoint are ignored: street patrollers stand inside their own building volume
 * and would otherwise be permanently blind.
 */
export const hasLineOfSight = (
  from: Vec2,
  to: Vec2,
  blockers: readonly Rect[],
): boolean =>
  !blockers.some(
    (rect) =>
      !contains(rect, from) &&
      !contains(rect, to) &&
      segmentHitsRect(from, to, rect),
  );

/** True when `target` falls inside the forward cone of something facing ±x. */
export const withinCone = (
  from: Vec2,
  facing: -1 | 1,
  target: Vec2,
  halfAngle: number,
): boolean => {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const span = Math.hypot(dx, dy);
  if (span === 0) {
    return true;
  }
  return (dx * facing) / span >= Math.cos(halfAngle);
};
