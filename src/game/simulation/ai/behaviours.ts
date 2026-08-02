import { clamp, normalize, subtract } from "../physics/vector";
import { predictPosition, velocityToward } from "./aim";
import { engageSpeed, leashed, type Motion, seek, still } from "./motion";
import type { AiTuning } from "./tuning";
import type { AiMemory, AiPerception } from "./types";

/** Standing this close horizontally is close enough; chasing further only twitches. */
const CHASE_DEADZONE = 24;

/** How far the wind-up has run, 0 → 1. Presentation turns this into a tell. */
const telegraphAmount = (memory: AiMemory, tuning: AiTuning): number =>
  tuning.windupTime <= 0 ? 1 : 1 - memory.windup / tuning.windupTime;

const beginWindup = (memory: AiMemory, tuning: AiTuning): Motion => {
  memory.windup = tuning.windupTime;
  return still();
};

/** Melee: close the gap, plant, telegraph, then throw itself at the player. */
export const engageMelee = (
  memory: AiMemory,
  perception: AiPerception,
  tuning: AiTuning,
  visible: boolean,
  windupFinished: boolean,
): Motion => {
  if (windupFinished) {
    memory.strike = tuning.strikeTime;
    memory.strikeDirection = { x: memory.facing, y: 0 };
    memory.cooldown = tuning.strikeCooldown + tuning.strikeTime;
    return {
      // Leashed even mid-lunge, so a roof patroller never throws itself off its roof.
      velocityX: leashed(
        perception,
        tuning,
        memory.facing * tuning.strikeSpeed,
      ),
      velocityY: -tuning.lift,
      telegraph: 0,
      attack: { kind: "lunge" },
    };
  }

  if (memory.strike > 0) {
    return {
      velocityX: leashed(
        perception,
        tuning,
        memory.strikeDirection.x * tuning.strikeSpeed,
      ),
      velocityY: null,
      telegraph: 0,
      attack: null,
    };
  }

  if (memory.windup > 0) {
    return { ...still(), telegraph: telegraphAmount(memory, tuning) };
  }

  // Planted while it recovers its balance: the player's window to hit back or leave.
  if (memory.cooldown > tuning.strikeCooldown - tuning.recoilTime) {
    return still();
  }

  const toPlayer = subtract(perception.player.position, perception.position);
  const inReach =
    Math.abs(toPlayer.x) <= tuning.strikeRange &&
    Math.abs(toPlayer.y) <= tuning.strikeHeight;
  if (visible && inReach && memory.cooldown <= 0) {
    return beginWindup(memory, tuning);
  }

  // Directly over or under the hero: hold the ground rather than twitch left and right.
  if (Math.abs(toPlayer.x) < CHASE_DEADZONE) {
    return still();
  }

  return {
    ...still(),
    velocityX: leashed(
      perception,
      tuning,
      Math.sign(toPlayer.x) * engageSpeed(perception, tuning),
    ),
  };
};

/** Holds a stand-off distance, strafes, then fires a short led burst. */
export const engageRanged = (
  memory: AiMemory,
  perception: AiPerception,
  tuning: AiTuning,
  visible: boolean,
  windupFinished: boolean,
  gap: number,
): Motion => {
  if (windupFinished) {
    memory.shotsLeft = tuning.burstSize;
    memory.shotDelay = 0;
  }

  if (memory.shotsLeft > 0) {
    return fireBurst(memory, perception, tuning, visible);
  }

  if (memory.windup > 0) {
    return { ...still(), telegraph: telegraphAmount(memory, tuning) };
  }

  if (visible && gap <= tuning.strikeRange && memory.cooldown <= 0) {
    return beginWindup(memory, tuning);
  }

  return { ...still(), velocityX: reposition(memory, perception, tuning, gap) };
};

const fireBurst = (
  memory: AiMemory,
  perception: AiPerception,
  tuning: AiTuning,
  visible: boolean,
): Motion => {
  if (memory.shotDelay > 0) {
    return still();
  }

  memory.shotsLeft -= 1;
  memory.shotDelay = tuning.burstInterval;
  if (memory.shotsLeft <= 0) {
    memory.cooldown = tuning.strikeCooldown;
  }

  // A burst that loses its line mid-way is spent, not held: no wall shooting.
  if (!visible) {
    return still();
  }

  const aim = predictPosition(
    perception.position,
    perception.player.position,
    perception.player.velocity,
    tuning.bulletSpeed,
    tuning.leadFactor,
    tuning.maxLeadTime,
  );
  return {
    ...still(),
    attack: {
      kind: "shot",
      origin: { ...perception.position },
      velocity: velocityToward(perception.position, aim, tuning.bulletSpeed),
    },
  };
};

const reposition = (
  memory: AiMemory,
  perception: AiPerception,
  tuning: AiTuning,
  gap: number,
): number => {
  const speed = engageSpeed(perception, tuning);
  const toPlayerX = perception.player.position.x - perception.position.x;
  const towards = toPlayerX === 0 ? memory.facing : Math.sign(toPlayerX);

  if (gap < tuning.retreatRange) {
    return leashed(perception, tuning, -towards * speed);
  }
  if (gap > tuning.standoffRange) {
    return leashed(perception, tuning, towards * speed);
  }
  return leashed(
    perception,
    tuning,
    Math.sin(memory.phase * tuning.strafeRate) * speed * 0.7,
  );
};

/** Circles above the player, rears up, then dives through them. */
export const engageDiver = (
  memory: AiMemory,
  perception: AiPerception,
  tuning: AiTuning,
  visible: boolean,
  windupFinished: boolean,
  gap: number,
): Motion => {
  if (windupFinished) {
    const target = predictPosition(
      perception.position,
      perception.player.position,
      perception.player.velocity,
      tuning.strikeSpeed,
      tuning.leadFactor,
      tuning.maxLeadTime,
    );
    memory.strike = tuning.strikeTime;
    memory.strikeDirection = normalize(subtract(target, perception.position));
    memory.cooldown = tuning.strikeCooldown + tuning.strikeTime;
    return diveMotion(memory, tuning, { kind: "dive" });
  }

  if (memory.strike > 0) {
    return diveMotion(memory, tuning, null);
  }

  if (memory.windup > 0) {
    return rearUp(tuning, telegraphAmount(memory, tuning));
  }

  if (visible && gap <= tuning.strikeRange && memory.cooldown <= 0) {
    memory.windup = tuning.windupTime;
    return rearUp(tuning, 0);
  }

  return orbit(memory, perception, tuning);
};

/** Climbing as it coils for a dive — the tell that reads at a glance. */
const rearUp = (tuning: AiTuning, telegraph: number): Motion => ({
  velocityX: 0,
  velocityY: -tuning.lift,
  telegraph,
  attack: null,
});

const diveMotion = (
  memory: AiMemory,
  tuning: AiTuning,
  attack: Motion["attack"],
): Motion => ({
  velocityX: memory.strikeDirection.x * tuning.strikeSpeed,
  velocityY: memory.strikeDirection.y * tuning.strikeSpeed,
  telegraph: 0,
  attack,
});

const orbit = (
  memory: AiMemory,
  perception: AiPerception,
  tuning: AiTuning,
): Motion => {
  const speed = engageSpeed(perception, tuning);
  const targetX = clamp(
    perception.player.position.x +
      Math.cos(memory.phase * tuning.strafeRate) * tuning.orbitRadius,
    perception.patrol.minX - tuning.leash,
    perception.patrol.maxX + tuning.leash,
  );
  const targetY = clamp(
    perception.player.position.y -
      tuning.orbitHeight +
      Math.sin(memory.phase * tuning.bobRate) * tuning.bobAmplitude,
    perception.homeY - tuning.verticalLeash,
    perception.homeY + tuning.verticalLeash,
  );

  return {
    velocityX: seek(targetX - perception.position.x, speed),
    velocityY: seek(targetY - perception.position.y, speed),
    telegraph: 0,
    attack: null,
  };
};
