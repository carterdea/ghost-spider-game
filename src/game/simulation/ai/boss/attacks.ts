import { normalize, subtract, type Vec2 } from "../../physics/vector";
import { predictPosition } from "../aim";
import type { BossPhaseTuning, BossTuning } from "./tuning";
import type { BossPerception, BossShot } from "./types";

const ray = (origin: Vec2, angle: number, speed: number): BossShot => ({
  origin: { ...origin },
  velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
});

/** Where the boss is aiming: the player, under-led so a mid-swing turn beats it. */
const aimAngle = (
  perception: BossPerception,
  tuning: BossTuning,
  travelSpeed: number,
): number => {
  const aim = predictPosition(
    perception.position,
    perception.player.position,
    perception.player.velocity,
    travelSpeed,
    tuning.leadFactor,
    tuning.maxLeadTime,
  );
  return Math.atan2(
    aim.y - perception.position.y,
    aim.x - perception.position.x,
  );
};

/** A fan centred on the player: cut across it, or leave the cone entirely. */
export const volley = (
  perception: BossPerception,
  tuning: BossTuning,
  phase: BossPhaseTuning,
): BossShot[] => {
  const centre = aimAngle(perception, tuning, tuning.bulletSpeed);
  const count = Math.max(1, phase.volleyShots);
  const step = count > 1 ? phase.volleySpread / (count - 1) : 0;
  const first = centre - (step * (count - 1)) / 2;

  return Array.from({ length: count }, (_, index) =>
    ray(perception.position, first + index * step, tuning.bulletSpeed),
  );
};

/**
 * Every direction at once, with one lane aimed straight at the player. Slow
 * enough to weave through, but only if you are already moving.
 */
export const nova = (
  perception: BossPerception,
  tuning: BossTuning,
): BossShot[] => {
  const centre = aimAngle(perception, tuning, tuning.novaBulletSpeed);
  const count = Math.max(1, tuning.novaShots);
  const step = (Math.PI * 2) / count;

  return Array.from({ length: count }, (_, index) =>
    ray(perception.position, centre + index * step, tuning.novaBulletSpeed),
  );
};

/** The lane a slam will travel down, locked in on the frame it commits. */
export const slamDirection = (
  perception: BossPerception,
  tuning: BossTuning,
  phase: BossPhaseTuning,
): Vec2 => {
  const aim = predictPosition(
    perception.position,
    perception.player.position,
    perception.player.velocity,
    phase.slamSpeed,
    tuning.leadFactor,
    tuning.maxLeadTime,
  );
  const direction = normalize(subtract(aim, perception.position));
  return direction.x === 0 && direction.y === 0 ? { x: 1, y: 0 } : direction;
};
