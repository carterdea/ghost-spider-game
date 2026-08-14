import { clamp, distance, type Vec2 } from "../../physics/vector";

/**
 * The web bomb: a charge that is thrown, sticks where it lands, telegraphs, and
 * then bursts into a mesh that catches everything within reach.
 *
 * The shape suits a hero who is nearly always airborne and moving fast. Nothing
 * about it rewards standing still and lining up a shot: it arcs, it sticks to
 * whatever it meets first, and the mesh is wide enough that a throw made from
 * the top of a swing still lands on the rooftop below.
 */
export const WEB_BOMB = {
  /** Throw speed along the facing direction, in px/s. */
  throwSpeed: 430,
  /** Upward kick on the throw, so it arcs rather than skims. */
  throwLift: -250,
  /** Share of the hero's own velocity the charge inherits. */
  inheritance: 0.35,
  /** A charge that meets nothing sticks in mid-air after this long. */
  flightMs: 1000,
  /** How long the stuck charge telegraphs before it goes off. */
  fuseMs: 750,
  /** How far the mesh reaches, in pixels. */
  radius: 200,
  /** Damage at the core of the burst. */
  coreDamage: 28,
  /** Share of core damage that still lands at the rim. */
  rimShare: 0.45,
  /** How long the mesh holds what it caught, in milliseconds. */
  holdMs: 1500,
  /** How long the spent mesh lingers on screen. */
  meshFadeMs: 620,
} as const;

/** Anything the burst could catch, reduced to what the rule needs. */
export interface BurstTarget {
  readonly id: string;
  readonly position: Vec2;
}

export interface BurstHit {
  readonly id: string;
  readonly damage: number;
  /** How far from the core it was caught, in pixels. */
  readonly distance: number;
}

/** When a charge stuck at `now` goes off. */
export const fuseEndsAt = (now: number): number => now + WEB_BOMB.fuseMs;

/**
 * How far through its fuse a charge is, 0 to 1. Drives the telegraph, so the
 * player always has a beat to dive clear or push an enemy into the blast.
 */
export const fuseProgress = (burstAt: number, now: number): number =>
  clamp(1 - (burstAt - now) / WEB_BOMB.fuseMs, 0, 1);

/**
 * Damage at a given range from the core. Full in the middle, `rimShare` at the
 * edge, nothing beyond it — so a bomb dropped onto a cluster pays far better
 * than one thrown at a single patrol.
 */
export const burstDamage = (gap: number): number => {
  if (gap > WEB_BOMB.radius) {
    return 0;
  }
  const falloff = 1 - (1 - WEB_BOMB.rimShare) * (gap / WEB_BOMB.radius);
  return Math.round(WEB_BOMB.coreDamage * falloff);
};

/**
 * Everything the mesh catches, nearest first. The burst is a spray of silk
 * rather than a shockwave, so it does not care about cover — but it does fall
 * off hard, and it catches each target exactly once.
 */
export const catchInBurst = (
  centre: Vec2,
  targets: readonly BurstTarget[],
): readonly BurstHit[] => {
  const hits: BurstHit[] = [];

  for (const target of targets) {
    const gap = distance(centre, target.position);
    if (gap > WEB_BOMB.radius) {
      continue;
    }
    hits.push({ id: target.id, damage: burstDamage(gap), distance: gap });
  }

  return hits.sort((a, b) => a.distance - b.distance);
};

/** The charge's launch velocity, carrying part of the hero's own momentum. */
export const throwVelocity = (facing: -1 | 1, hero: Vec2): Vec2 => ({
  x: facing * WEB_BOMB.throwSpeed + hero.x * WEB_BOMB.inheritance,
  y: WEB_BOMB.throwLift + hero.y * WEB_BOMB.inheritance,
});
