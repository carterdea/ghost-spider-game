import type { EnemyKind } from "../state";

/**
 * One table per enemy kind. Ranges are pixels, times are seconds, speeds are
 * pixels per second — the same units the physics solvers use.
 */
export interface AiTuning {
  /** Furthest the player can be noticed at all. */
  visionRange: number;
  /** Half-angle of the forward vision cone, in radians. */
  visionHalfAngle: number;
  /** Inside this radius the player is noticed from any direction. */
  awarenessRadius: number;
  /** How far below the lane counts as "over the ledge" rather than level with it. */
  ledgeDrop: number;
  /** Width of the downward look, as a fraction of the drop. Zero disables it. */
  ledgeSpread: number;
  /**
   * Furthest the downward look reaches. Its own number rather than
   * `visionRange`, because the two answer different questions: sideways sight
   * is short on purpose, so enemies are something you swing past, while the
   * pavement is 700px below a rooftop lane and has to be covered from it.
   */
  ledgeRange: number;
  /** An enemy already tracking keeps sight this much further out — no flip-flop at the edge. */
  keepRangeFactor: number;
  /** Seconds between spotting the player and being allowed to act. */
  reactionTime: number;
  /** Re-spotting straight after losing the player is quicker by this factor. */
  reacquireFactor: number;
  /** Seconds out of sight before the enemy gives up and heads home. */
  memoryTime: number;
  /** Seconds spent heading home before patrolling again. */
  recoverTime: number;
  /** Multiplies the authored patrol speed. */
  patrolSpeedFactor: number;
  /** Multiplies the authored patrol speed while engaged. */
  engageSpeedFactor: number;
  /** How far outside the patrol band the enemy will chase. */
  leash: number;
  /** Distance a ranged enemy tries to hold. */
  standoffRange: number;
  /** Closer than this, a ranged enemy backs away. */
  retreatRange: number;
  /** A strike begins once the player is inside this. */
  strikeRange: number;
  /** Vertical slice a melee strike can reach. */
  strikeHeight: number;
  /** Seconds of visible wind-up before the strike commits. */
  windupTime: number;
  /** Seconds the committed strike travels for. */
  strikeTime: number;
  /** Seconds before another strike is allowed. */
  strikeCooldown: number;
  /** Seconds spent planted after a strike. The player's window to hit back or leave. */
  recoilTime: number;
  /** Travel speed of a lunge or dive. */
  strikeSpeed: number;
  /** Upward kick a lunge launches with, or the rise during a dive wind-up. */
  lift: number;
  bulletSpeed: number;
  burstSize: number;
  /** Seconds between shots inside a burst. */
  burstInterval: number;
  /** Fraction of the predicted lead actually used. Under-leading keeps it fair. */
  leadFactor: number;
  /** Cap on how far ahead aim predicts, in seconds. */
  maxLeadTime: number;
  /** Radians per second the strafe / orbit sweep advances. */
  strafeRate: number;
  /** Air lane: how far above the player it tries to sit. */
  orbitHeight: number;
  /** Air lane: how far it swings either side of the player. */
  orbitRadius: number;
  /** Air lane: how far from `homeY` it is allowed to roam. */
  verticalLeash: number;
  bobAmplitude: number;
  bobRate: number;
}

const SHARED = {
  keepRangeFactor: 1.35,
  reacquireFactor: 0.45,
  memoryTime: 2.2,
  recoverTime: 1.6,
  patrolSpeedFactor: 1,
} as const;

const UNARMED = {
  bulletSpeed: 0,
  burstSize: 0,
  burstInterval: 0,
} as const;

const GROUNDED = {
  orbitHeight: 0,
  orbitRadius: 0,
  verticalLeash: 0,
  bobAmplitude: 0,
  bobRate: 0,
} as const;

/**
 * Tuned against a hero who runs at 430px/s and swings far faster. Vision is
 * short relative to that on purpose: enemies are a hazard you swing past, not a
 * gauntlet you must clear.
 */
export const AI_TUNING: Record<EnemyKind, AiTuning> = {
  robot: {
    ...SHARED,
    ...UNARMED,
    ...GROUNDED,
    visionRange: 460,
    visionHalfAngle: 1.13,
    awarenessRadius: 170,
    // A robot cannot follow anyone off a roof, so it has no downward look:
    // noticing the street would only have it walk to the edge and stare.
    ledgeDrop: 0,
    ledgeSpread: 0,
    ledgeRange: 0,
    reactionTime: 0.32,
    engageSpeedFactor: 3,
    leash: 70,
    standoffRange: 0,
    retreatRange: 0,
    strikeRange: 170,
    strikeHeight: 130,
    windupTime: 0.34,
    strikeTime: 0.32,
    strikeCooldown: 1,
    recoilTime: 0.45,
    strikeSpeed: 520,
    lift: 250,
    leadFactor: 0,
    maxLeadTime: 0,
    strafeRate: 0,
  },
  gunner: {
    ...SHARED,
    ...GROUNDED,
    visionRange: 640,
    visionHalfAngle: 1.05,
    awarenessRadius: 210,
    // Leans over the parapet and fires down. A gunner cannot leave its roof,
    // so this is the whole of its answer to a hero on the pavement.
    ledgeDrop: 140,
    ledgeSpread: 0.7,
    ledgeRange: 900,
    reactionTime: 0.55,
    engageSpeedFactor: 2.2,
    leash: 110,
    standoffRange: 420,
    retreatRange: 240,
    strikeRange: 620,
    strikeHeight: 0,
    windupTime: 0.5,
    strikeTime: 0,
    strikeCooldown: 1.7,
    recoilTime: 0,
    strikeSpeed: 0,
    lift: 0,
    bulletSpeed: 380,
    burstSize: 2,
    burstInterval: 0.18,
    leadFactor: 0.7,
    maxLeadTime: 0.8,
    strafeRate: 1.3,
  },
  drone: {
    ...SHARED,
    ...UNARMED,
    visionRange: 560,
    // Wide enough that a hero swinging straight underneath is still seen.
    visionHalfAngle: 1.9,
    awarenessRadius: 240,
    // The one patrol that can actually give chase downwards, and the widest
    // downward look to match.
    ledgeDrop: 120,
    ledgeSpread: 1.2,
    ledgeRange: 950,
    reactionTime: 0.45,
    // The hero runs at 430 and a chase that cannot keep up is not a chase:
    // the drone is the one patrol whose job is to make leaving cost something.
    engageSpeedFactor: 3.4,
    // Long enough to follow a hero off the roof line and down the street,
    // rather than watching them leave from the edge of a 260px band.
    leash: 700,
    standoffRange: 0,
    retreatRange: 0,
    // A plunge, not a jab: committed from far enough out to catch a hero
    // crossing the street below its lane, and travelling far enough to arrive
    // — 820px/s for 0.95s covers 780px. The dive is a straight line locked in
    // 0.45s ahead of time, so the further it is thrown the more warning it
    // gives; distance here buys the player reading time, not surprise.
    strikeRange: 700,
    strikeHeight: 0,
    windupTime: 0.45,
    strikeTime: 0.95,
    strikeCooldown: 1.5,
    recoilTime: 0,
    // Fast enough to close on a hero who is already running: a dive that only
    // matched their speed arrived 150px behind them, every time.
    strikeSpeed: 820,
    lift: 120,
    // The one aim in the game that leads properly. A dive that under-leads
    // lands where the hero was, which is why a hero running in a straight line
    // could cross a whole district untouched; the 0.45s rear-up is the tell
    // that keeps it fair.
    leadFactor: 0.9,
    maxLeadTime: 1,
    strafeRate: 1.1,
    orbitHeight: 170,
    orbitRadius: 90,
    verticalLeash: 900,
    bobAmplitude: 40,
    bobRate: 3.2,
  },
};
