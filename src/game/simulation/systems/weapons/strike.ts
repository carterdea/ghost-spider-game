import { hasLineOfSight } from "../../ai/vision";
import {
  distance,
  normalize,
  type Rect,
  subtract,
  type Vec2,
} from "../../physics/vector";

/**
 * The two single-target weapons, as the vectors they produce.
 *
 * Both are answers to the same rhythm: enemies telegraph, then commit, then
 * recover. The impact web is the panic button — it interrupts a wind-up and
 * throws the target away from the hero. The web line is the opposite read: it
 * drags a distant enemy off its perch and into fist range while it is still
 * deciding what to do.
 */

export const IMPACT_WEB = {
  /** Muzzle speed, in px/s. Flat and fast, so it can be fired on instinct. */
  speed: 780,
  damage: 18,
  /** How long the slug stays alive before it dissolves. */
  lifetimeMs: 620,
  /** How long the target is held after it lands. Long enough to cancel a swing. */
  staggerMs: 550,
  /** Knockback along the shot, in px/s. */
  knockbackX: 520,
  /** Upward component, so the target is lifted rather than scraped along. */
  knockbackY: -240,
  /** How long the knockback overrides the target's own motion. */
  holdMs: 300,
} as const;

export const WEB_LINE = {
  /** Longest tether, in pixels. Reaches across a street. */
  reach: 560,
  /** Half-angle off the facing direction a target may sit within, in radians. */
  spread: Math.PI / 3,
  /** How fast the target is dragged in. */
  pullSpeed: 620,
  /** Extra lift, so a yanked patrol comes clear of the roof it stood on. */
  lift: -200,
  /** How long the yank overrides the target's own motion. */
  holdMs: 420,
  /** How long the target stays tangled after it arrives. */
  tangleMs: 900,
  /** How long the drawn tether stays on screen. */
  traceMs: 220,
} as const;

/** Anything a single-target weapon could pick, reduced to what the rule needs. */
export interface AimTarget {
  readonly id: string;
  readonly position: Vec2;
}

/** Where the impact web throws a target struck by a shot travelling `facing`. */
export const knockbackVelocity = (facing: -1 | 1): Vec2 => ({
  x: facing * IMPACT_WEB.knockbackX,
  y: IMPACT_WEB.knockbackY,
});

/**
 * The velocity that drags `target` back to `hero`. The lift is added rather
 * than blended in, so a target yanked across level ground still leaves it.
 */
export const yankVelocity = (target: Vec2, hero: Vec2): Vec2 => {
  const heading = normalize(subtract(hero, target));
  return {
    x: heading.x * WEB_LINE.pullSpeed,
    y: heading.y * WEB_LINE.pullSpeed + WEB_LINE.lift,
  };
};

/**
 * The nearest target the hero could tether: within reach, within the cone they
 * are facing, and not behind cover. Returns `null` when the line would find
 * nothing.
 *
 * A cone rather than a ray, because the hero is usually mid-arc and pointing
 * somewhere other than at the thing they meant to hit. `cover` is required
 * rather than optional because forgetting it is the whole failure: a tether
 * that ignores buildings drags enemies through the façade they were standing
 * behind, while every other directed weapon stops at it.
 */
export const pickYankTarget = (
  hero: Vec2,
  facing: -1 | 1,
  targets: readonly AimTarget[],
  cover: readonly Rect[],
): AimTarget | null => {
  let best: AimTarget | null = null;
  let bestGap = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    const gap = distance(hero, target.position);
    if (gap > WEB_LINE.reach || gap === 0 || gap >= bestGap) {
      continue;
    }
    const offset = subtract(target.position, hero);
    if (Math.abs(Math.atan2(offset.y, offset.x * facing)) > WEB_LINE.spread) {
      continue;
    }
    // The same test the enemies use to see, so cover reads the same way in
    // both directions: what can hide from you, you cannot tether.
    if (!hasLineOfSight(hero, target.position, cover)) {
      continue;
    }
    best = target;
    bestGap = gap;
  }

  return best;
};
