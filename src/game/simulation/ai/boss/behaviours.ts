import { rectBottom, rectLeft, rectRight, rectTop } from "../../physics/vector";
import { seek } from "../motion";
import type { BossPhaseTuning, BossTuning } from "./tuning";
import type { BossAttackKind, BossMemory, BossPerception } from "./types";

/** The movement half of an intent, before facing and state are stamped on. */
export interface BossMotion {
  velocityX: number;
  velocityY: number;
  telegraph: number;
}

/** How far in and out of its stand-off ring the boss breathes, as a fraction. */
const SWEEP = 0.25;

const bob = (memory: BossMemory, tuning: BossTuning): number =>
  Math.sin(memory.clock * tuning.bobRate) * tuning.bobAmplitude;

/** Holding station: used while dormant, staggered, and in the punish window. */
export const hover = (memory: BossMemory, tuning: BossTuning): BossMotion => ({
  velocityX: 0,
  velocityY: bob(memory, tuning),
  telegraph: 0,
});

/**
 * The punish window, as motion: the hull sinks onto the hero rather than
 * hanging where it fired from.
 *
 * A window the player cannot reach is not a window. Stalking holds a stand-off
 * of hundreds of pixels and sits a hundred more overhead, and the hero's reach
 * is a 96px swing — so a boss that only stops still while it recovers is open
 * to nothing, which is exactly how a 900HP fight ended with the boss on 900.
 * Coming down is also the read: the hull dropping to eye level is the clearest
 * possible "hit me now".
 */
export const sag = (
  perception: BossPerception,
  tuning: BossTuning,
): BossMotion => {
  const player = perception.player.position;
  const side = perception.position.x >= player.x ? 1 : -1;

  return {
    velocityX: drop(
      player.x + side * tuning.openReach - perception.position.x,
      tuning.openSpeed,
    ),
    velocityY: drop(
      player.y + tuning.openLift - perception.position.y,
      tuning.openSpeed,
    ),
    telegraph: 0,
  };
};

/**
 * Seek with the easing taken out. `seek` is paced for a stand-off the boss has
 * all fight to settle into; the punish window is under a second long, and a
 * hull still gliding to a stop when it closes was measured arriving 100px short
 * — just outside the hero's swing — every single time.
 */
const drop = (delta: number, speed: number): number =>
  Math.max(-speed, Math.min(speed, delta * 8));

/** Climbing. Reads as "something just changed" for both wake and phase shift. */
export const rise = (tuning: BossTuning): BossMotion => ({
  velocityX: 0,
  velocityY: -tuning.riseSpeed,
  telegraph: 0,
});

/**
 * Sweeps a stand-off ring around the player, well above them so the fight
 * stays in the air. Once the player has been out of reach too long the ring is
 * abandoned and the boss goes straight at them.
 */
export const stalk = (
  memory: BossMemory,
  perception: BossPerception,
  tuning: BossTuning,
  phase: BossPhaseTuning,
  hunting: boolean,
): BossMotion => {
  const speed =
    perception.speed *
    phase.speedFactor *
    (hunting ? tuning.huntSpeedFactor : 1);
  const player = perception.player.position;
  // It sweeps in and out on whichever side it is already on rather than
  // crossing through the player: the hull is huge, and a boss that drifts
  // through the hero turns a duel into a body-check.
  const side = perception.position.x >= player.x ? 1 : -1;
  const reach = hunting
    ? tuning.huntStandoff
    : phase.standoff * (1 + SWEEP * Math.cos(memory.clock * tuning.strafeRate));

  return {
    velocityX: seek(player.x + side * reach - perception.position.x, speed),
    velocityY: seek(
      player.y -
        (hunting ? tuning.huntLift : phase.orbitHeight - bob(memory, tuning)) -
        perception.position.y,
      speed,
    ),
    telegraph: 0,
  };
};

/**
 * The tell. A slam coils backwards and upwards, a nova stops dead, a volley
 * settles into its firing line — three silhouettes the player can tell apart.
 */
export const windup = (
  kind: BossAttackKind,
  memory: BossMemory,
  perception: BossPerception,
  tuning: BossTuning,
  telegraph: number,
): BossMotion => {
  if (kind === "slam") {
    const away = perception.position.x >= perception.player.position.x ? 1 : -1;
    return {
      velocityX: away * tuning.riseSpeed * 0.55,
      velocityY: -tuning.riseSpeed,
      telegraph,
    };
  }

  if (kind === "nova") {
    return { velocityX: 0, velocityY: 0, telegraph };
  }

  return { velocityX: 0, velocityY: bob(memory, tuning) * 0.3, telegraph };
};

/** The committed attack. Only the slam moves the boss. */
export const strike = (
  kind: BossAttackKind,
  memory: BossMemory,
  phase: BossPhaseTuning,
): BossMotion =>
  kind === "slam"
    ? {
        velocityX: memory.strikeDirection.x * phase.slamSpeed,
        velocityY: memory.strikeDirection.y * phase.slamSpeed,
        telegraph: 0,
      }
    : { velocityX: 0, velocityY: 0, telegraph: 0 };

/** Kills any component that would carry the boss out of its arena. */
export const contain = (
  motion: BossMotion,
  perception: BossPerception,
  tuning: BossTuning,
): BossMotion => {
  const { arena, position } = perception;
  const { margin } = tuning;
  const blockedX =
    (motion.velocityX < 0 && position.x <= rectLeft(arena) + margin) ||
    (motion.velocityX > 0 && position.x >= rectRight(arena) - margin);
  const blockedY =
    (motion.velocityY < 0 && position.y <= rectTop(arena) + margin) ||
    (motion.velocityY > 0 && position.y >= rectBottom(arena) - margin);

  return {
    velocityX: blockedX ? 0 : motion.velocityX,
    velocityY: blockedY ? 0 : motion.velocityY,
    telegraph: motion.telegraph,
  };
};
