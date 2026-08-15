import { distance } from "../physics/vector";
import type { EnemyKind } from "../state";
import { engageDiver, engageMelee, engageRanged } from "./behaviours";
import { leashed, type Motion, seek, still } from "./motion";
import type { AiTuning } from "./tuning";
import type { AiIntent, AiMemory, AiPerception } from "./types";
import { hasLineOfSight, watchingBelow, withinCone } from "./vision";

export interface AiStep {
  memory: AiMemory;
  intent: AiIntent;
}

/** Facing only flips once the player is clearly to one side, so it cannot jitter. */
const FACING_DEADZONE = 14;

const countdown = (value: number, dt: number): number =>
  Math.max(0, value - dt);

const copy = (memory: AiMemory): AiMemory => ({
  ...memory,
  strikeDirection: { ...memory.strikeDirection },
  lastSeen: memory.lastSeen ? { ...memory.lastSeen } : null,
});

const tickTimers = (memory: AiMemory, dt: number): void => {
  memory.reaction = countdown(memory.reaction, dt);
  memory.windup = countdown(memory.windup, dt);
  memory.strike = countdown(memory.strike, dt);
  memory.cooldown = countdown(memory.cooldown, dt);
  memory.recovery = countdown(memory.recovery, dt);
  memory.shotDelay = countdown(memory.shotDelay, dt);
  memory.phase += dt;
};

/**
 * Sight needs range, a forward cone (or a close-quarters radius that ignores it)
 * and an unblocked line. Enemies already tracking keep a wider range so the
 * player cannot toggle them on and off by hovering at the boundary.
 */
const canSee = (
  memory: AiMemory,
  perception: AiPerception,
  tuning: AiTuning,
  gap: number,
  overLedge: boolean,
): boolean => {
  const tracking = memory.state === "alert" || memory.state === "engage";
  // The downward look carries its own reach, so covering the street costs the
  // lane nothing sideways.
  const range = Math.max(
    tracking ? tuning.visionRange * tuning.keepRangeFactor : tuning.visionRange,
    overLedge ? tuning.ledgeRange : 0,
  );
  if (gap > range) {
    return false;
  }

  const noticed =
    tracking ||
    overLedge ||
    gap <= tuning.awarenessRadius ||
    withinCone(
      perception.position,
      memory.facing,
      perception.player.position,
      tuning.visionHalfAngle,
    );

  return (
    noticed &&
    hasLineOfSight(
      perception.position,
      perception.player.position,
      perception.blockers,
    )
  );
};

const clearAttack = (memory: AiMemory): void => {
  memory.windup = 0;
  memory.strike = 0;
  memory.shotsLeft = 0;
};

const beginAlert = (
  memory: AiMemory,
  tuning: AiTuning,
  reacquiring: boolean,
): void => {
  memory.state = "alert";
  memory.reaction =
    tuning.reactionTime * (reacquiring ? tuning.reacquireFactor : 1);
  clearAttack(memory);
};

const beginRecover = (memory: AiMemory, tuning: AiTuning): void => {
  memory.state = "recover";
  memory.recovery = tuning.recoverTime;
  memory.blind = 0;
  clearAttack(memory);
};

/** Returns true on the frame the enemy goes from unaware to alert. */
const advanceState = (
  memory: AiMemory,
  tuning: AiTuning,
  visible: boolean,
): boolean => {
  switch (memory.state) {
    case "patrol":
      if (!visible) {
        return false;
      }
      beginAlert(memory, tuning, false);
      return true;

    case "alert":
      if (memory.blind > tuning.memoryTime) {
        beginRecover(memory, tuning);
      } else if (visible && memory.reaction <= 0) {
        memory.state = "engage";
      }
      return false;

    case "engage":
      if (
        memory.blind > tuning.memoryTime &&
        memory.strike <= 0 &&
        memory.shotsLeft <= 0
      ) {
        beginRecover(memory, tuning);
      }
      return false;

    case "recover":
      if (visible) {
        beginAlert(memory, tuning, true);
        return true;
      }
      if (memory.recovery <= 0) {
        memory.state = "patrol";
      }
      return false;
  }
};

const bobVelocity = (
  perception: AiPerception,
  tuning: AiTuning,
  memory: AiMemory,
): number => {
  const target =
    perception.homeY +
    Math.sin(memory.phase * tuning.bobRate + perception.position.x * 0.01) *
      tuning.bobAmplitude;
  // Capped: a drone knocked far off its line flies home, it does not teleport.
  return seek(target - perception.position.y, perception.speed * 2);
};

const hoverOrFall = (
  perception: AiPerception,
  tuning: AiTuning,
  memory: AiMemory,
): number | null =>
  perception.airborne ? bobVelocity(perception, tuning, memory) : null;

const patrolMotion = (
  memory: AiMemory,
  perception: AiPerception,
  tuning: AiTuning,
): Motion => {
  if (perception.position.x <= perception.patrol.minX) {
    memory.patrolDirection = 1;
  } else if (perception.position.x >= perception.patrol.maxX) {
    memory.patrolDirection = -1;
  }

  return {
    velocityX:
      memory.patrolDirection * perception.speed * tuning.patrolSpeedFactor,
    velocityY: hoverOrFall(perception, tuning, memory),
    telegraph: 0,
    attack: null,
  };
};

/** Alert is the beat that makes the AI readable: it stops and stares first. */
const alertMotion = (
  memory: AiMemory,
  perception: AiPerception,
  tuning: AiTuning,
): Motion => still(hoverOrFall(perception, tuning, memory));

/** Walks back into the patrol band, then hands over to `patrol`. */
const recoverMotion = (perception: AiPerception, tuning: AiTuning): Motion => {
  const { position, patrol } = perception;
  const speed = perception.speed * tuning.patrolSpeedFactor;
  const drift =
    position.x < patrol.minX ? speed : position.x > patrol.maxX ? -speed : 0;

  return {
    velocityX: leashed(perception, tuning, drift),
    velocityY: perception.airborne
      ? seek(perception.homeY - position.y, speed * 2)
      : null,
    telegraph: 0,
    attack: null,
  };
};

interface MotionContext {
  kind: EnemyKind;
  perception: AiPerception;
  tuning: AiTuning;
  visible: boolean;
  windupFinished: boolean;
  gap: number;
  /** How far this frame's shot may reach. The ledge look lengthens it. */
  reach: number;
  /** True when the hero is down off the lane rather than along it. */
  overLedge: boolean;
}

const engageMotion = (memory: AiMemory, context: MotionContext): Motion => {
  const { perception, tuning, visible, windupFinished, gap, reach, overLedge } =
    context;
  switch (context.kind) {
    case "robot":
      return engageMelee(memory, perception, tuning, visible, windupFinished);
    case "gunner":
      return engageRanged(
        memory,
        perception,
        tuning,
        visible,
        windupFinished,
        gap,
        reach,
        overLedge,
      );
    case "drone":
      return engageDiver(
        memory,
        perception,
        tuning,
        visible,
        windupFinished,
        gap,
      );
  }
};

const resolveMotion = (memory: AiMemory, context: MotionContext): Motion => {
  const { perception, tuning } = context;
  switch (memory.state) {
    case "patrol":
      return patrolMotion(memory, perception, tuning);
    case "alert":
      return alertMotion(memory, perception, tuning);
    case "engage":
      return engageMotion(memory, context);
    case "recover":
      return recoverMotion(perception, tuning);
  }
};

const updateFacing = (memory: AiMemory, perception: AiPerception): void => {
  if (memory.state === "patrol") {
    memory.facing = memory.patrolDirection;
    return;
  }

  const anchor = memory.lastSeen ?? perception.player.position;
  const offset = anchor.x - perception.position.x;
  if (offset > FACING_DEADZONE) {
    memory.facing = 1;
  } else if (offset < -FACING_DEADZONE) {
    memory.facing = -1;
  }
};

const snaredStep = (memory: AiMemory): AiStep => {
  clearAttack(memory);
  return {
    memory,
    intent: {
      velocityX: 0,
      velocityY: 0,
      facing: memory.facing,
      state: memory.state,
      telegraph: 0,
      attack: null,
      alerted: false,
    },
  };
};

/**
 * Pure per-frame AI step. Takes what the enemy can perceive, returns what it
 * wants to do; the caller applies the intent to a body and hands the memory back.
 */
export const stepEnemyBrain = (
  kind: EnemyKind,
  memory: AiMemory,
  perception: AiPerception,
  tuning: AiTuning,
  dt: number,
): AiStep => {
  const next = copy(memory);
  if (dt > 0) {
    tickTimers(next, dt);
  }
  if (perception.snared) {
    return snaredStep(next);
  }

  const windupFinished = memory.windup > 0 && next.windup <= 0;
  const gap = distance(perception.position, perception.player.position);
  const overLedge = watchingBelow(
    perception.position,
    perception.player.position,
    tuning.ledgeDrop,
    tuning.ledgeSpread,
  );
  const visible = canSee(next, perception, tuning, gap, overLedge);

  if (visible) {
    next.blind = 0;
    next.lastSeen = { ...perception.player.position };
  } else {
    next.blind += Math.max(dt, 0);
  }

  const alerted = advanceState(next, tuning, visible);
  updateFacing(next, perception);

  const motion = resolveMotion(next, {
    kind,
    perception,
    tuning,
    visible,
    windupFinished,
    gap,
    // Shooting at what it can see: a gunner leaning over a parapet fires at the
    // street it just spotted the hero on, not only inside its rooftop reach.
    reach: overLedge
      ? Math.max(tuning.strikeRange, tuning.ledgeRange)
      : tuning.strikeRange,
    overLedge,
  });

  return {
    memory: next,
    intent: {
      velocityX: motion.velocityX,
      velocityY: motion.velocityY,
      facing: next.facing,
      state: next.state,
      telegraph: motion.telegraph,
      attack: motion.attack,
      alerted,
    },
  };
};
