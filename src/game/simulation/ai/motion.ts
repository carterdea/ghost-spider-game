import { clamp } from "../physics/vector";
import type { AiTuning } from "./tuning";
import type { AiPerception, EnemyAttack } from "./types";

/** The movement half of an intent, before facing and state are stamped on. */
export interface Motion {
  velocityX: number;
  velocityY: number | null;
  telegraph: number;
  attack: EnemyAttack | null;
}

export const still = (velocityY: number | null = null): Motion => ({
  velocityX: 0,
  velocityY,
  telegraph: 0,
  attack: null,
});

/** Keeps an enemy inside its patrol band plus the leash it is allowed to chase into. */
export const leashed = (
  perception: AiPerception,
  tuning: AiTuning,
  velocityX: number,
): number => {
  if (
    velocityX > 0 &&
    perception.position.x >= perception.patrol.maxX + tuning.leash
  ) {
    return 0;
  }
  if (
    velocityX < 0 &&
    perception.position.x <= perception.patrol.minX - tuning.leash
  ) {
    return 0;
  }
  return velocityX;
};

/** Proportional seek: fast while far, easing off on arrival. */
export const seek = (delta: number, speed: number): number =>
  clamp(delta * 2.4, -speed, speed);

export const engageSpeed = (
  perception: AiPerception,
  tuning: AiTuning,
): number => perception.speed * tuning.engageSpeedFactor;
