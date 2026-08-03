import type { PlatformCycle, PlatformMotion } from "../../game/content/levels";
import { clamp, type Vec2 } from "../../game/simulation/physics/vector";

/**
 * The clock every moving and phasing platform reads.
 *
 * All of it is pure: a schedule in, a position or a state out. The Phaser side
 * only has to feed it elapsed milliseconds, which is what lets the fairness
 * rules — the pause at each end of a run, the warning before a ledge gives way
 * — be tested without booting the engine.
 */

/** One full out-and-back run, both rests included. */
export const motionPeriod = (motion: PlatformMotion): number =>
  2 * (motion.travelMs + motion.holdMs);

const wrap = (value: number, period: number): number =>
  ((value % period) + period) % period;

/**
 * Eased 0..1 progress along a run. Each leg rests first and then travels, so
 * the deck is stationary at both ends of its route and the hero always gets a
 * still target to step onto.
 */
export const motionProgressAt = (
  motion: PlatformMotion,
  elapsedMs: number,
): number => {
  const leg = motion.travelMs + motion.holdMs;
  const phase = wrap(elapsedMs, leg * 2);
  const outbound = phase < leg;
  const travelled = clamp(
    (phase - (outbound ? 0 : leg) - motion.holdMs) / motion.travelMs,
    0,
    1,
  );
  // Cosine ease: zero speed at both ends, so boarding is never a snap.
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * travelled);
  return outbound ? eased : 1 - eased;
};

/** Displacement from the platform's authored home position. */
export const platformOffsetAt = (
  motion: PlatformMotion,
  elapsedMs: number,
): Vec2 => {
  const progress = motionProgressAt(motion, elapsedMs);
  return { x: motion.dx * progress, y: motion.dy * progress };
};

export type LedgeState = "solid" | "warn" | "gone";

export interface LedgePhase {
  state: LedgeState;
  /** How far through the current state, 0..1. */
  progress: number;
}

export const cyclePeriod = (cycle: PlatformCycle): number =>
  cycle.solidMs + cycle.warnMs + cycle.goneMs;

export const ledgePhaseAt = (
  cycle: PlatformCycle,
  elapsedMs: number,
): LedgePhase => {
  const phase = wrap(elapsedMs + cycle.offsetMs, cyclePeriod(cycle));

  if (phase < cycle.solidMs) {
    return { state: "solid", progress: phase / cycle.solidMs };
  }
  if (phase < cycle.solidMs + cycle.warnMs) {
    return {
      state: "warn",
      progress: (phase - cycle.solidMs) / cycle.warnMs,
    };
  }
  return {
    state: "gone",
    progress: (phase - cycle.solidMs - cycle.warnMs) / cycle.goneMs,
  };
};

/** Ledges stay solid through the warning; only "gone" removes the floor. */
export const isLedgeSolid = (state: LedgeState): boolean => state !== "gone";

/**
 * How hard a failing ledge flashes. Solid is opaque, gone is a faint ghost so
 * the player can see where the panel will come back, and the warning strobes
 * ever faster as the drop approaches.
 */
export const ledgeAlphaAt = (phase: LedgePhase): number => {
  if (phase.state === "solid") {
    return 1;
  }
  if (phase.state === "gone") {
    return 0.14;
  }
  const strobe = Math.abs(Math.cos(Math.PI * phase.progress ** 2 * 6));
  return 0.4 + 0.6 * strobe;
};

/** The top face of a deck, in world pixels. */
export interface DeckSpan {
  left: number;
  right: number;
  top: number;
}

export interface RiderBounds {
  left: number;
  right: number;
  bottom: number;
}

/** Something a moving deck can carry: its footprint, and a way to shift it. */
export interface Rider {
  bounds: RiderBounds;
  moveBy(dx: number): void;
}

/** How far off the deck a body's feet may be and still be counted as riding. */
export const RIDER_GRIP = 16;

export const isRiding = (rider: RiderBounds, deck: DeckSpan): boolean =>
  rider.right > deck.left &&
  rider.left < deck.right &&
  rider.bottom >= deck.top - RIDER_GRIP &&
  rider.bottom <= deck.top + RIDER_GRIP;

/**
 * Hands a deck's horizontal travel to whatever is standing on it. Arcade
 * separation already carries a rider vertically — a static body rising into a
 * body pushes it up — but nothing moves a rider sideways, so a trolley would
 * otherwise slide out from under the hero's feet.
 *
 * Returns how many riders were carried, which is what the tests assert on.
 */
export const carryRiders = (
  riders: Iterable<Rider>,
  deck: DeckSpan,
  dx: number,
): number => {
  if (dx === 0) {
    return 0;
  }

  let carried = 0;
  for (const rider of riders) {
    if (!isRiding(rider.bounds, deck)) {
      continue;
    }
    rider.moveBy(dx);
    carried += 1;
  }
  return carried;
};
