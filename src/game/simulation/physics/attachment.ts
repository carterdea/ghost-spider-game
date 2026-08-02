import type { Vec2 } from "./vector";

export interface AttachmentTuning {
  /** Longest web-line the hero can throw. */
  reach: number;
  /** An anchor must be at least this far overhead to be catchable at all. */
  minClearance: number;
  /** Below this height overhead the arc is stubby and scrapes along the floor. */
  minSwingHeight: number;
  /** Anchors closer than this to the hero's own column count as "not ahead". */
  forwardBias: number;
  /** The web angle, in radians up from horizontal, that gives the best arc. */
  idealAngle: number;
  /** Keep the bottom of the pendulum arc this far clear of the ground. */
  groundClearance: number;
  minRopeLength: number;
  maxRopeLength: number;
}

export const DEFAULT_ATTACHMENT_TUNING: AttachmentTuning = {
  reach: 560,
  minClearance: 80,
  minSwingHeight: 140,
  forwardBias: 40,
  idealAngle: (55 * Math.PI) / 180,
  groundClearance: 120,
  minRopeLength: 90,
  maxRopeLength: 560,
};

export interface Attachment {
  anchor: Vec2;
  /** Rope length at the moment of the catch: the current distance, so it never jolts. */
  length: number;
  /** Length to reel toward, chosen so the arc clears the ground. */
  targetLength: number;
}

const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Anchors the hero could physically catch from `from`. */
const inReach = (
  anchors: readonly Vec2[],
  from: Vec2,
  tuning: AttachmentTuning,
): Vec2[] =>
  anchors.filter(
    (anchor) =>
      anchor.y <= from.y - tuning.minClearance &&
      distance(from, anchor) <= tuning.reach,
  );

/**
 * Rewards anchors that are both high and out ahead. Ranking purely by height
 * lands on anchors almost straight overhead, which barely move the hero
 * sideways and whip them over the top; ranking purely by proximity lands on the
 * low facade anchors right beside them, whose arcs bottom out underground.
 */
const arcScore = (
  anchor: Vec2,
  from: Vec2,
  heading: number,
  tuning: AttachmentTuning,
): number => {
  const ahead = (anchor.x - from.x) * heading;
  const above = from.y - anchor.y;
  const deviation = Math.abs(Math.atan2(above, ahead) - tuning.idealAngle);
  return -deviation * 2 + Math.hypot(ahead, above) / tuning.maxRopeLength;
};

/**
 * Chooses where a web should catch and how long the line should be.
 *
 * The lowest point of a pendulum is `anchor.y + length`, so a rope longer than
 * the anchor's height above the pavement guarantees the hero drags along the
 * floor. Rather than clamping the rope short at the catch — which yanks them
 * violently onto a shorter radius — the line starts at the natural distance and
 * `targetLength` is what the controller reels toward.
 */
export const chooseAttachment = (
  anchors: readonly Vec2[],
  from: Vec2,
  heading: number,
  groundY: number,
  tuning: AttachmentTuning = DEFAULT_ATTACHMENT_TUNING,
): Attachment | undefined => {
  const candidates = inReach(anchors, from, tuning);
  if (candidates.length === 0) {
    return undefined;
  }

  const forward = candidates.filter(
    (anchor) => (anchor.x - from.x) * heading > tuning.forwardBias,
  );
  const usable = forward.length > 0 ? forward : candidates;
  const high = usable.filter(
    (anchor) => from.y - anchor.y >= tuning.minSwingHeight,
  );
  const pool = high.length > 0 ? high : usable;

  const anchor = pool.reduce((best, candidate) =>
    arcScore(candidate, from, heading, tuning) >
    arcScore(best, from, heading, tuning)
      ? candidate
      : best,
  );

  const length = Math.min(
    Math.max(distance(from, anchor), tuning.minRopeLength),
    tuning.maxRopeLength,
  );
  const targetLength = Math.max(
    tuning.minRopeLength,
    Math.min(length, groundY - tuning.groundClearance - anchor.y),
  );

  return { anchor: { x: anchor.x, y: anchor.y }, length, targetLength };
};
