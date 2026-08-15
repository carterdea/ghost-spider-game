import { distance } from "../../physics/vector";
import { hasLineOfSight } from "../vision";
import { nova, slamDirection, volley } from "./attacks";
import {
  type BossMotion,
  contain,
  hover,
  rise,
  sag,
  stalk,
  strike,
  windup,
} from "./behaviours";
import {
  BOSS_ATTACK_SHAPE,
  type BossPhaseTuning,
  type BossTuning,
  phaseFor,
} from "./tuning";
import type {
  BossAiState,
  BossAttack,
  BossAttackKind,
  BossEvent,
  BossIntent,
  BossMemory,
  BossPerception,
} from "./types";

export interface BossStep {
  memory: BossMemory;
  intent: BossIntent;
}

/** Facing only flips once the player is clearly to one side, so it cannot jitter. */
const FACING_DEADZONE = 24;

/** States where the boss is planted and takes hits without answering. */
const OPEN_STATES: readonly BossAiState[] = ["recover", "shift", "stagger"];

/** What the boss can work out about the player this frame. */
interface Sense {
  visible: boolean;
  gap: number;
}

/** The outcome of one turn of the state machine. */
interface Advance {
  event: BossEvent | null;
  attack: BossAttack | null;
}

const NOTHING: Advance = { event: null, attack: null };

const countdown = (value: number, dt: number): number =>
  Math.max(0, value - dt);

const copy = (memory: BossMemory): BossMemory => ({
  ...memory,
  strikeDirection: { ...memory.strikeDirection },
});

const tickTimers = (memory: BossMemory, dt: number): void => {
  memory.timer = countdown(memory.timer, dt);
  memory.cooldown = countdown(memory.cooldown, dt);
  memory.snareLock = countdown(memory.snareLock, dt);
  memory.clock += dt;
};

const toStalk = (memory: BossMemory, cooldown: number): void => {
  memory.state = "stalk";
  memory.timer = 0;
  memory.attack = null;
  memory.cooldown = Math.max(memory.cooldown, cooldown);
};

/**
 * The next attack in the rotation, or `null` when it cannot be thrown yet.
 * Shots need a clear line; a slam does not, which is what the boss reaches for
 * once the player has spent too long behind cover.
 */
const chooseAttack = (
  memory: BossMemory,
  phase: BossPhaseTuning,
  visible: boolean,
  hunting: boolean,
): BossAttackKind | null => {
  if (hunting && phase.rotation.includes("slam")) {
    return "slam";
  }
  const queued = phase.rotation[memory.rotation % phase.rotation.length];
  if (queued === "slam") {
    return queued;
  }
  return visible ? queued : null;
};

const beginWindup = (
  memory: BossMemory,
  phase: BossPhaseTuning,
  kind: BossAttackKind,
): void => {
  const queued = phase.rotation[memory.rotation % phase.rotation.length];
  if (queued === kind) {
    memory.rotation += 1;
  }
  memory.state = "windup";
  memory.attack = kind;
  memory.timer = phase.windupTime;
};

const commit = (
  memory: BossMemory,
  perception: BossPerception,
  tuning: BossTuning,
  phase: BossPhaseTuning,
): Advance => {
  const kind = memory.attack;
  if (!kind) {
    toStalk(memory, 0.2);
    return NOTHING;
  }

  memory.state = "strike";
  memory.timer = BOSS_ATTACK_SHAPE[kind].strike;

  if (kind === "slam") {
    memory.strikeDirection = slamDirection(perception, tuning, phase);
    return {
      event: "slam",
      attack: { kind: "slam", direction: { ...memory.strikeDirection } },
    };
  }
  if (kind === "nova") {
    return {
      event: "nova",
      attack: { kind: "nova", shots: nova(perception, tuning) },
    };
  }
  return {
    event: "volley",
    attack: { kind: "volley", shots: volley(perception, tuning, phase) },
  };
};

/** The punish window: planted, harmless, and sized by the attack just thrown. */
const beginRecover = (memory: BossMemory, phase: BossPhaseTuning): void => {
  const shape = memory.attack ? BOSS_ATTACK_SHAPE[memory.attack] : null;
  memory.state = "recover";
  memory.timer = (shape?.recover ?? 0.4) * phase.recoverFactor;
  memory.cooldown = memory.timer + phase.cooldown;
};

const beginShift = (memory: BossMemory, tuning: BossTuning): void => {
  memory.state = "shift";
  memory.attack = null;
  memory.timer = tuning.shiftTime;
  memory.cooldown = tuning.shiftTime;
};

/** A shift can interrupt anything except the intro and another shift. */
const shiftable = (memory: BossMemory): boolean =>
  memory.state !== "dormant" && memory.state !== "shift";

const beginStagger = (memory: BossMemory, tuning: BossTuning): void => {
  memory.state = "stagger";
  memory.attack = null;
  memory.timer = tuning.staggerTime;
  memory.snareLock = tuning.snareLockTime;
  memory.cooldown = Math.max(memory.cooldown, tuning.staggerTime);
};

const awoken = (perception: BossPerception, tuning: BossTuning, gap: number) =>
  gap <= tuning.wakeRadius || perception.healthFraction < 1;

const advance = (
  memory: BossMemory,
  perception: BossPerception,
  tuning: BossTuning,
  phase: BossPhaseTuning,
  sense: Sense,
): Advance => {
  switch (memory.state) {
    case "dormant":
      if (!awoken(perception, tuning, sense.gap)) {
        return NOTHING;
      }
      memory.state = "wake";
      memory.timer = tuning.wakeTime;
      return { event: "wake", attack: null };

    case "wake":
    case "stagger":
      if (memory.timer <= 0) {
        toStalk(memory, 0.35);
      }
      return NOTHING;

    case "shift":
      if (memory.timer <= 0) {
        const reached = phaseFor(perception.healthFraction, tuning);
        // Only ever climbs: a boss that somehow heals does not get its easy
        // patterns back.
        memory.phase = reached > memory.phase ? reached : memory.phase;
        toStalk(memory, tuning.phases[memory.phase].cooldown * 0.45);
      }
      return NOTHING;

    case "stalk": {
      if (memory.cooldown > 0) {
        return NOTHING;
      }
      const kind = chooseAttack(
        memory,
        phase,
        sense.visible,
        memory.stale > tuning.patience,
      );
      if (kind) {
        beginWindup(memory, phase, kind);
      }
      return NOTHING;
    }

    case "windup":
      return memory.timer <= 0
        ? commit(memory, perception, tuning, phase)
        : NOTHING;

    case "strike":
      if (memory.timer <= 0) {
        beginRecover(memory, phase);
      }
      return NOTHING;

    case "recover":
      if (memory.timer <= 0) {
        toStalk(memory, 0);
      }
      return NOTHING;
  }
};

const resolveMotion = (
  memory: BossMemory,
  perception: BossPerception,
  tuning: BossTuning,
  phase: BossPhaseTuning,
): BossMotion => {
  switch (memory.state) {
    case "dormant":
      return hover(memory, tuning);
    // Both open states sink into reach: a netted boss goes limp, and a
    // recovering one is the punish window the whole fight is built around.
    case "recover":
    case "stagger":
      return sag(perception, tuning);
    case "wake":
    case "shift":
      return rise(tuning);
    case "stalk":
      return stalk(
        memory,
        perception,
        tuning,
        phase,
        memory.stale > tuning.patience,
      );
    case "windup":
      return memory.attack
        ? windup(
            memory.attack,
            memory,
            perception,
            tuning,
            1 - memory.timer / Math.max(phase.windupTime, 1e-6),
          )
        : hover(memory, tuning);
    case "strike":
      return memory.attack
        ? strike(memory.attack, memory, phase)
        : hover(memory, tuning);
  }
};

const updateFacing = (memory: BossMemory, perception: BossPerception): void => {
  if (memory.state === "strike" && memory.attack === "slam") {
    if (Math.abs(memory.strikeDirection.x) > 0.2) {
      memory.facing = memory.strikeDirection.x > 0 ? 1 : -1;
    }
    return;
  }

  const offset = perception.player.position.x - perception.position.x;
  if (offset > FACING_DEADZONE) {
    memory.facing = 1;
  } else if (offset < -FACING_DEADZONE) {
    memory.facing = -1;
  }
};

const present = (
  memory: BossMemory,
  motion: BossMotion,
  outcome: Advance,
): BossStep => ({
  memory,
  intent: {
    velocityX: motion.velocityX,
    velocityY: motion.velocityY,
    facing: memory.facing,
    state: memory.state,
    phase: memory.phase,
    telegraph: motion.telegraph,
    telegraphKind: memory.state === "windup" ? memory.attack : null,
    vulnerable: OPEN_STATES.includes(memory.state),
    attack: outcome.attack,
    event: outcome.event,
  },
});

/**
 * Pure per-frame boss step. Takes what the boss can perceive, returns what it
 * wants to do; the caller applies the intent to a body and hands the memory
 * back. Nothing here touches a rendering engine.
 */
export const stepBossBrain = (
  memory: BossMemory,
  perception: BossPerception,
  tuning: BossTuning,
  dt: number,
): BossStep => {
  const next = copy(memory);
  if (dt > 0) {
    tickTimers(next, dt);
  }

  const sense: Sense = {
    visible: hasLineOfSight(
      perception.position,
      perception.player.position,
      perception.blockers,
    ),
    gap: distance(perception.position, perception.player.position),
  };
  const phase = tuning.phases[next.phase];

  // A net beats any wind-up, once. After that the boss shrugs them off for a
  // while, so the gadget stays a read rather than a lock.
  // The lock gates the whole branch, not just the announcement. It used to gate
  // only whether a stagger began, while every later net still returned the limp
  // `sag` with no attack — so a player with charges could pin the hull and
  // cancel every wind-up indefinitely, which is exactly the chain-lock the
  // immunity exists to rule out.
  //
  // Once past here the stagger is an ordinary state: `advance` runs its timer
  // down and `resolveMotion` keeps it limp until it does.
  if (perception.snared && next.state !== "dormant" && next.snareLock <= 0) {
    beginStagger(next, tuning);
    updateFacing(next, perception);
    return present(next, sag(perception, tuning), {
      event: "stagger",
      attack: null,
    });
  }

  next.stale =
    next.state === "stalk" &&
    !(sense.visible && sense.gap <= phase.standoff * tuning.reachFactor)
      ? next.stale + Math.max(dt, 0)
      : 0;

  let outcome: Advance;
  if (
    phaseFor(perception.healthFraction, tuning) > next.phase &&
    shiftable(next)
  ) {
    beginShift(next, tuning);
    outcome = { event: "phaseShift", attack: null };
  } else {
    outcome = advance(next, perception, tuning, phase, sense);
  }

  updateFacing(next, perception);
  return present(
    next,
    contain(resolveMotion(next, perception, tuning, phase), perception, tuning),
    outcome,
  );
};
