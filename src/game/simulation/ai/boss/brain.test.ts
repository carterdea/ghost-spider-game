import { describe, expect, test } from "bun:test";
import type { Rect } from "../../physics/vector";
import { stepBossBrain } from "./brain";
import { BOSS_ATTACK_SHAPE, BOSS_TUNING, phaseFor } from "./tuning";
import {
  type BossAiState,
  type BossAttack,
  type BossAttackKind,
  type BossEvent,
  type BossIntent,
  type BossMemory,
  type BossPerception,
  createBossMemory,
} from "./types";

const STEP = 1 / 60;

const ARENA: Rect = { x: 0, y: 0, width: 4000, height: 1600 };

const perceptionFor = (
  overrides: Partial<BossPerception> = {},
): BossPerception => ({
  position: { x: 2000, y: 700 },
  player: { position: { x: 2300, y: 800 }, velocity: { x: 0, y: 0 } },
  arena: ARENA,
  speed: 260,
  healthFraction: 1,
  blockers: [],
  snared: false,
  ...overrides,
});

interface RunResult {
  memory: BossMemory;
  intent: BossIntent;
  attacks: BossAttack[];
  events: BossEvent[];
  states: BossAiState[];
  telegraphs: number[];
}

/** Steps the brain against a frozen world for `seconds`, collecting what came out. */
const run = (
  perception: BossPerception,
  seconds: number,
  from: BossMemory = createBossMemory(),
): RunResult => {
  let memory = from;
  let intent = stepBossBrain(memory, perception, BOSS_TUNING, 0).intent;
  const attacks: BossAttack[] = [];
  const events: BossEvent[] = [];
  const states: BossAiState[] = [];
  const telegraphs: number[] = [];

  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    const step = stepBossBrain(memory, perception, BOSS_TUNING, STEP);
    memory = step.memory;
    intent = step.intent;
    if (step.intent.attack) {
      attacks.push(step.intent.attack);
    }
    if (step.intent.event) {
      events.push(step.intent.event);
    }
    if (states.at(-1) !== step.intent.state) {
      states.push(step.intent.state);
    }
    if (step.intent.state === "windup") {
      telegraphs.push(step.intent.telegraph);
    }
  }

  return { memory, intent, attacks, events, states, telegraphs };
};

/** A memory already awake and stalking in `phase`, as if the fight is underway. */
const engaged = (phase: 1 | 2 | 3, cooldown = 0): BossMemory => ({
  ...createBossMemory(),
  state: "stalk",
  phase,
  cooldown,
});

/** The leading, still-rising slice of a telegraph trace. */
const firstRamp = (values: readonly number[]): readonly number[] => {
  const drop = values.findIndex(
    (value, index) => index > 0 && value < values[index - 1],
  );
  return drop === -1 ? values : values.slice(0, drop);
};

const healthFor = (phase: 1 | 2 | 3): number =>
  phase === 1 ? 1 : phase === 2 ? 0.5 : 0.2;

const far = { position: { x: 9000, y: 700 }, velocity: { x: 0, y: 0 } };

const speedOf = (shot: { velocity: { x: number; y: number } }): number =>
  Math.hypot(shot.velocity.x, shot.velocity.y);

describe("waking", () => {
  test("sleeps until the player comes near", () => {
    const { intent, events } = run(perceptionFor({ player: far }), 3);
    expect(intent.state).toBe("dormant");
    expect(events).toEqual([]);
  });

  test("a dormant boss neither attacks nor telegraphs", () => {
    const { attacks, intent } = run(perceptionFor({ player: far }), 3);
    expect(attacks).toEqual([]);
    expect(intent.telegraph).toBe(0);
    expect(intent.vulnerable).toBe(false);
  });

  test("wakes when the player closes in, and says so once", () => {
    const { events, states } = run(perceptionFor(), 1.4);
    expect(events.filter((event) => event === "wake")).toHaveLength(1);
    expect(states.slice(0, 2)).toEqual(["wake", "stalk"]);
  });

  test("wakes when shot from outside its wake radius", () => {
    const perception = perceptionFor({ player: far, healthFraction: 0.99 });
    expect(run(perception, 0.2).events).toContain("wake");
  });

  test("rises as it wakes, so the beat is visible", () => {
    const { intent } = run(perceptionFor(), 0.4);
    expect(intent.state).toBe("wake");
    expect(intent.velocityY).toBeLessThan(0);
  });
});

describe("phase ladder", () => {
  test("maps health onto the three phases", () => {
    expect(phaseFor(1, BOSS_TUNING)).toBe(1);
    expect(phaseFor(0.67, BOSS_TUNING)).toBe(1);
    expect(phaseFor(0.66, BOSS_TUNING)).toBe(2);
    expect(phaseFor(0.34, BOSS_TUNING)).toBe(2);
    expect(phaseFor(0.33, BOSS_TUNING)).toBe(3);
    expect(phaseFor(0, BOSS_TUNING)).toBe(3);
  });

  test("crossing a threshold interrupts everything with a legible shift", () => {
    const { memory, events, states } = run(
      perceptionFor({ healthFraction: 0.5 }),
      BOSS_TUNING.shiftTime + 0.4,
      engaged(1),
    );
    expect(events[0]).toBe("phaseShift");
    expect(states).toContain("shift");
    expect(memory.phase).toBe(2);
  });

  test("the shift is a free window: planted, open, and unarmed", () => {
    const { intent } = run(
      perceptionFor({ healthFraction: 0.5 }),
      0.4,
      engaged(1),
    );
    expect(intent.state).toBe("shift");
    expect(intent.vulnerable).toBe(true);
    expect(intent.attack).toBeNull();
    expect(intent.velocityX).toBe(0);
  });

  test("a wind-up in progress is abandoned for the shift", () => {
    const windingUp: BossMemory = {
      ...engaged(1),
      state: "windup",
      attack: "volley",
      timer: 0.3,
    };
    const { attacks, states } = run(
      perceptionFor({ healthFraction: 0.5 }),
      0.5,
      windingUp,
    );
    expect(states[0]).toBe("shift");
    expect(attacks).toEqual([]);
  });

  test("one shift is enough to skip two thresholds at once", () => {
    const { memory, events } = run(
      perceptionFor({ healthFraction: 0.1 }),
      BOSS_TUNING.shiftTime + 0.3,
      engaged(1),
    );
    expect(memory.phase).toBe(3);
    expect(events.filter((event) => event === "phaseShift")).toHaveLength(1);
  });

  test("never rewinds to an easier phase", () => {
    const { memory, events } = run(perceptionFor(), 3, engaged(3));
    expect(memory.phase).toBe(3);
    expect(events).not.toContain("phaseShift");
  });
});

describe("attack rhythm", () => {
  const cycleFor = (phase: 1 | 2 | 3): RunResult =>
    run(
      perceptionFor({ healthFraction: healthFor(phase) }),
      BOSS_TUNING.phases[phase].windupTime + 2.9,
      engaged(phase, 0.3),
    );

  test("every phase telegraphs before it commits", () => {
    for (const phase of [1, 2, 3] as const) {
      const { states } = cycleFor(phase);
      expect(states.slice(0, 4)).toEqual([
        "stalk",
        "windup",
        "strike",
        "recover",
      ]);
    }
  });

  test("the wind-up ramps from nothing to full", () => {
    const ramp = firstRamp(cycleFor(1).telegraphs);
    expect(ramp[0]).toBeLessThan(0.1);
    expect(ramp.at(-1)).toBeGreaterThan(0.9);
    for (let index = 1; index < ramp.length; index += 1) {
      expect(ramp[index]).toBeGreaterThan(ramp[index - 1]);
    }
  });

  test("later phases shorten the wind-up", () => {
    expect(BOSS_TUNING.phases[2].windupTime).toBeLessThan(
      BOSS_TUNING.phases[1].windupTime,
    );
    expect(BOSS_TUNING.phases[3].windupTime).toBeLessThan(
      BOSS_TUNING.phases[2].windupTime,
    );
  });

  test("an attack commits on exactly one frame", () => {
    expect(cycleFor(1).attacks).toHaveLength(1);
  });

  test("the recovery window is open and sinks onto the hero", () => {
    const { intent } = run(
      perceptionFor(),
      BOSS_TUNING.phases[1].windupTime + BOSS_ATTACK_SHAPE.volley.strike + 0.1,
      engaged(1),
    );
    expect(intent.state).toBe("recover");
    expect(intent.vulnerable).toBe(true);
    // The player stands right of and below the boss, so an open hull comes
    // down and across rather than hanging where it fired from.
    expect(intent.velocityX).toBeGreaterThan(0);
    expect(intent.velocityY).toBeGreaterThan(0);
  });

  test("an open boss already in reach holds where it is", () => {
    const settled = perceptionFor({
      position: {
        x: 2300 - BOSS_TUNING.openReach,
        y: 800 + BOSS_TUNING.openLift,
      },
    });
    const { intent } = run(
      settled,
      BOSS_TUNING.phases[1].windupTime + BOSS_ATTACK_SHAPE.volley.strike + 0.1,
      engaged(1),
    );
    expect(intent.state).toBe("recover");
    expect(Math.abs(intent.velocityX)).toBeLessThan(1);
    expect(Math.abs(intent.velocityY)).toBeLessThan(1);
  });

  /**
   * The hero's close strike reaches 96px from a point 56px in front of them.
   * A punish window that settles further out than that pays nothing, which is
   * how a 900HP boss survived every measured attempt untouched.
   */
  test("the punish window settles inside the hero's own swing", () => {
    expect(BOSS_TUNING.openReach).toBeLessThanOrEqual(96);
  });

  test("the boss is never open while it is threatening", () => {
    for (const phase of [1, 2, 3] as const) {
      const perception = perceptionFor({ healthFraction: healthFor(phase) });
      let memory = engaged(phase);
      for (let frame = 0; frame < 600; frame += 1) {
        const step = stepBossBrain(memory, perception, BOSS_TUNING, STEP);
        memory = step.memory;
        if (step.intent.vulnerable) {
          expect(step.intent.telegraph).toBe(0);
          expect(step.intent.attack).toBeNull();
        }
      }
    }
  });

  test("later phases give back less recovery", () => {
    expect(BOSS_TUNING.phases[3].recoverFactor).toBeLessThan(
      BOSS_TUNING.phases[2].recoverFactor,
    );
    expect(BOSS_TUNING.phases[2].recoverFactor).toBeLessThan(
      BOSS_TUNING.phases[1].recoverFactor,
    );
  });

  test("attacks land in the phase's rotation order", () => {
    const kinds = (phase: 1 | 2 | 3): BossAttackKind[] =>
      run(
        perceptionFor({ healthFraction: healthFor(phase) }),
        14,
        engaged(phase),
      ).attacks.map((attack) => attack.kind);

    expect(new Set(kinds(1))).toEqual(new Set(["volley"]));
    expect(kinds(2).slice(0, 4)).toEqual(["volley", "slam", "volley", "slam"]);
    expect(kinds(3).slice(0, 3)).toEqual(["slam", "volley", "nova"]);
  });

  test("phase 3 attacks land more often than phase 1 attacks", () => {
    const count = (phase: 1 | 2 | 3): number =>
      run(
        perceptionFor({ healthFraction: healthFor(phase) }),
        12,
        engaged(phase),
      ).attacks.length;

    expect(count(3)).toBeGreaterThan(count(1));
  });
});

describe("volley", () => {
  const volleyFor = (phase: 1 | 2 | 3): BossAttack => {
    const attack = run(
      perceptionFor({ healthFraction: healthFor(phase) }),
      14,
      engaged(phase),
    ).attacks.find((entry) => entry.kind === "volley");
    if (!attack) {
      throw new Error(`Phase ${phase} never fired a volley.`);
    }
    return attack;
  };

  test("fires the phase's shot count", () => {
    for (const phase of [1, 2, 3] as const) {
      const attack = volleyFor(phase);
      expect(attack.kind === "volley" && attack.shots).toHaveLength(
        BOSS_TUNING.phases[phase].volleyShots,
      );
    }
  });

  test("every shot leaves at the tuned speed", () => {
    const attack = volleyFor(1);
    if (attack.kind !== "volley") {
      throw new Error("Expected a volley.");
    }
    for (const shot of attack.shots) {
      expect(speedOf(shot)).toBeCloseTo(BOSS_TUNING.bulletSpeed, 5);
    }
  });

  test("the fan is centred on the player and spans the tuned spread", () => {
    const attack = volleyFor(1);
    if (attack.kind !== "volley") {
      throw new Error("Expected a volley.");
    }
    const angles = attack.shots.map((shot) =>
      Math.atan2(shot.velocity.y, shot.velocity.x),
    );
    const span = Math.max(...angles) - Math.min(...angles);
    expect(span).toBeCloseTo(BOSS_TUNING.phases[1].volleySpread, 5);
  });

  test("holds fire when a building is in the way", () => {
    const wall: Rect = { x: 2100, y: 400, width: 120, height: 900 };
    const { attacks, intent } = run(
      perceptionFor({ blockers: [wall] }),
      6,
      engaged(1),
    );
    expect(attacks).toEqual([]);
    expect(intent.state).toBe("stalk");
  });
});

describe("slam", () => {
  const slamFor = (phase: 2 | 3): BossAttack => {
    const attack = run(
      perceptionFor({ healthFraction: healthFor(phase) }),
      14,
      engaged(phase),
    ).attacks.find((entry) => entry.kind === "slam");
    if (!attack) {
      throw new Error(`Phase ${phase} never slammed.`);
    }
    return attack;
  };

  test("phase 1 never slams", () => {
    const kinds = run(perceptionFor(), 14, engaged(1)).attacks.map(
      (attack) => attack.kind,
    );
    expect(kinds).not.toContain("slam");
  });

  test("commits to a unit direction pointed at the player", () => {
    const attack = slamFor(2);
    if (attack.kind !== "slam") {
      throw new Error("Expected a slam.");
    }
    expect(Math.hypot(attack.direction.x, attack.direction.y)).toBeCloseTo(
      1,
      5,
    );
    // The player sits down and to the right of the boss.
    expect(attack.direction.x).toBeGreaterThan(0);
    expect(attack.direction.y).toBeGreaterThan(0);
  });

  test("travels at the phase's slam speed while committed", () => {
    const perception = perceptionFor({ healthFraction: healthFor(2) });
    let memory = engaged(2);
    let travelling: BossIntent | null = null;

    for (let frame = 0; frame < 900; frame += 1) {
      const step = stepBossBrain(memory, perception, BOSS_TUNING, STEP);
      memory = step.memory;
      if (step.intent.state === "strike" && memory.attack === "slam") {
        travelling = step.intent;
        break;
      }
    }

    expect(travelling).not.toBeNull();
    const speed = Math.hypot(
      travelling?.velocityX ?? 0,
      travelling?.velocityY ?? 0,
    );
    expect(speed).toBeCloseTo(BOSS_TUNING.phases[2].slamSpeed, 5);
  });

  test("rears back and up before it launches", () => {
    const winding = run(perceptionFor({ healthFraction: healthFor(2) }), 14, {
      ...engaged(2),
      rotation: 1,
    });
    expect(winding.states).toContain("windup");

    const perception = perceptionFor({ healthFraction: healthFor(2) });
    let memory: BossMemory = {
      ...engaged(2),
      state: "windup",
      attack: "slam",
      timer: BOSS_TUNING.phases[2].windupTime,
    };
    const step = stepBossBrain(memory, perception, BOSS_TUNING, STEP);
    memory = step.memory;
    expect(step.intent.velocityY).toBeLessThan(0);
    // Player is to the right, so the coil pulls left.
    expect(step.intent.velocityX).toBeLessThan(0);
  });

  test("the slam's punish window is the longest of the shooting attacks", () => {
    expect(BOSS_ATTACK_SHAPE.slam.recover).toBeGreaterThan(
      BOSS_ATTACK_SHAPE.volley.recover,
    );
  });
});

describe("nova", () => {
  const novaFor = (): BossAttack => {
    const attack = run(
      perceptionFor({ healthFraction: healthFor(3) }),
      14,
      engaged(3),
    ).attacks.find((entry) => entry.kind === "nova");
    if (!attack) {
      throw new Error("Phase 3 never fired a nova.");
    }
    return attack;
  };

  test("only phase 3 has it", () => {
    for (const phase of [1, 2] as const) {
      const kinds = run(
        perceptionFor({ healthFraction: healthFor(phase) }),
        14,
        engaged(phase),
      ).attacks.map((attack) => attack.kind);
      expect(kinds).not.toContain("nova");
    }
  });

  test("covers every direction evenly", () => {
    const attack = novaFor();
    if (attack.kind !== "nova") {
      throw new Error("Expected a nova.");
    }
    expect(attack.shots).toHaveLength(BOSS_TUNING.novaShots);

    const angles = attack.shots
      .map((shot) => Math.atan2(shot.velocity.y, shot.velocity.x))
      .map((angle) => (angle + Math.PI * 2) % (Math.PI * 2))
      .sort((a, b) => a - b);
    const expected = (Math.PI * 2) / BOSS_TUNING.novaShots;
    for (let index = 1; index < angles.length; index += 1) {
      expect(angles[index] - angles[index - 1]).toBeCloseTo(expected, 4);
    }
  });

  test("puts one lane straight at the player, so standing still loses", () => {
    const attack = novaFor();
    if (attack.kind !== "nova") {
      throw new Error("Expected a nova.");
    }
    const toPlayer = Math.atan2(800 - 700, 2300 - 2000);
    const closest = Math.min(
      ...attack.shots.map((shot) =>
        Math.abs(Math.atan2(shot.velocity.y, shot.velocity.x) - toPlayer),
      ),
    );
    expect(closest).toBeLessThan(1e-6);
  });

  test("nova shells travel slower than aimed ones — they are weaved, not dodged", () => {
    expect(BOSS_TUNING.novaBulletSpeed).toBeLessThan(BOSS_TUNING.bulletSpeed);
  });
});

describe("anti-camp pressure", () => {
  const hiding = (): BossPerception =>
    perceptionFor({
      player: { position: { x: 3600, y: 1300 }, velocity: { x: 0, y: 0 } },
      blockers: [{ x: 2600, y: 300, width: 200, height: 1200 }],
    });

  test("a player who breaks the line runs the boss's patience down", () => {
    const { memory } = run(hiding(), 3, engaged(1));
    expect(memory.stale).toBeGreaterThan(BOSS_TUNING.patience);
  });

  test("out of patience, the boss abandons its ring and comes straight in", () => {
    const perception = hiding();
    const patient = run(perception, 1, engaged(1)).intent;
    const impatient = run(perception, 4, engaged(1)).intent;
    expect(Math.abs(impatient.velocityX)).toBeGreaterThan(
      Math.abs(patient.velocityX),
    );
    // Player is to the right and below.
    expect(impatient.velocityX).toBeGreaterThan(0);
    expect(impatient.velocityY).toBeGreaterThan(0);
  });

  test("phase 2 answers a broken sight line with a slam, not a wasted volley", () => {
    const { attacks } = run(
      { ...hiding(), healthFraction: healthFor(2) },
      8,
      engaged(2),
    );
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((attack) => attack.kind === "slam")).toBe(true);
  });

  test("closing back in resets the pressure", () => {
    const chased = run(hiding(), 4, engaged(1)).memory;
    expect(chased.stale).toBeGreaterThan(0);
    expect(run(perceptionFor(), 0.2, chased).memory.stale).toBe(0);
  });
});

describe("web nets", () => {
  const windingUp = (): BossMemory => ({
    ...engaged(1),
    state: "windup",
    attack: "volley",
    timer: 0.4,
  });

  test("a net cancels the wind-up outright", () => {
    const { intent, attacks, events } = run(
      perceptionFor({ snared: true }),
      0.2,
      windingUp(),
    );
    expect(intent.state).toBe("stagger");
    expect(attacks).toEqual([]);
    expect(events).toContain("stagger");
  });

  test("a staggered boss goes limp and sinks into reach", () => {
    const { intent } = run(perceptionFor({ snared: true }), 0.2, windingUp());
    expect(intent.vulnerable).toBe(true);
    expect(intent.attack).toBeNull();
    // Limp, not planted: a net earns the same opening a punish window does.
    expect(intent.velocityX).toBeGreaterThan(0);
    expect(intent.velocityY).toBeGreaterThan(0);
  });

  test("it shakes the net off and returns to the fight", () => {
    const netted = run(
      perceptionFor({ snared: true }),
      0.2,
      windingUp(),
    ).memory;
    const { intent } = run(perceptionFor(), BOSS_TUNING.staggerTime, netted);
    expect(intent.state).toBe("stalk");
  });

  test("nets cannot chain-lock it", () => {
    const held = perceptionFor({ snared: true });
    const { events, memory } = run(held, BOSS_TUNING.staggerTime + 1.5, {
      ...engaged(1),
    });
    expect(events.filter((event) => event === "stagger")).toHaveLength(1);
    expect(memory.snareLock).toBeGreaterThan(0);
  });

  test("a dormant boss ignores nets entirely", () => {
    const { intent, events } = run(
      perceptionFor({ player: far, snared: true }),
      1,
    );
    expect(intent.state).toBe("dormant");
    expect(events).toEqual([]);
  });
});

describe("stalking", () => {
  /**
   * Walks a boss that only ever stalks, reporting the closest it came to the
   * player. The hull is roughly 130px of half-width, so anything under that is
   * a body-check the player never got to read.
   */
  const closestApproach = (
    phase: 1 | 2 | 3,
    from: { x: number; y: number },
  ): number => {
    const perception = perceptionFor({
      position: from,
      healthFraction: healthFor(phase),
    });
    let memory = engaged(phase, 999);
    let closest = Number.POSITIVE_INFINITY;

    for (let frame = 0; frame < 1200; frame += 1) {
      const step = stepBossBrain(memory, perception, BOSS_TUNING, STEP);
      memory = step.memory;
      // Integrate the intent so the sweep actually moves the boss.
      perception.position.x += step.intent.velocityX * STEP;
      perception.position.y += step.intent.velocityY * STEP;
      closest = Math.min(
        closest,
        Math.abs(perception.position.x - perception.player.position.x),
      );
    }

    return closest;
  };

  test("holds a side rather than drifting through the player", () => {
    for (const phase of [1, 2, 3] as const) {
      const fromRight = closestApproach(phase, { x: 2700, y: 700 });
      const fromLeft = closestApproach(phase, { x: 1900, y: 700 });
      expect(fromRight).toBeGreaterThan(150);
      expect(fromLeft).toBeGreaterThan(150);
    }
  });

  test("still breathes in and out of its ring", () => {
    const perception = perceptionFor({ position: { x: 2700, y: 700 } });
    let memory = engaged(1, 999);
    const gaps: number[] = [];

    for (let frame = 0; frame < 1200; frame += 1) {
      const step = stepBossBrain(memory, perception, BOSS_TUNING, STEP);
      memory = step.memory;
      perception.position.x += step.intent.velocityX * STEP;
      perception.position.y += step.intent.velocityY * STEP;
      gaps.push(perception.position.x - perception.player.position.x);
    }

    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(80);
  });

  test("a hunting boss crowds closer than a stalking one", () => {
    expect(BOSS_TUNING.huntStandoff).toBeLessThan(
      BOSS_TUNING.phases[3].standoff,
    );
  });
});

describe("the arena", () => {
  test("never drives itself through a wall", () => {
    const corner: BossPerception = perceptionFor({
      position: { x: ARENA.x + 10, y: ARENA.y + 10 },
      player: { position: { x: -900, y: -900 }, velocity: { x: 0, y: 0 } },
      healthFraction: healthFor(3),
    });
    let memory = engaged(3);

    for (let frame = 0; frame < 900; frame += 1) {
      const step = stepBossBrain(memory, corner, BOSS_TUNING, STEP);
      memory = step.memory;
      expect(step.intent.velocityX).toBeGreaterThanOrEqual(0);
      expect(step.intent.velocityY).toBeGreaterThanOrEqual(0);
    }
  });

  test("holds a slam back at the far wall too", () => {
    const edge: BossPerception = perceptionFor({
      position: { x: ARENA.width - 10, y: 800 },
      player: {
        position: { x: ARENA.width + 800, y: 800 },
        velocity: { x: 0, y: 0 },
      },
      healthFraction: healthFor(3),
    });
    let memory: BossMemory = {
      ...engaged(3),
      state: "strike",
      attack: "slam",
      strikeDirection: { x: 1, y: 0 },
      timer: BOSS_ATTACK_SHAPE.slam.strike,
    };
    const step = stepBossBrain(memory, edge, BOSS_TUNING, STEP);
    memory = step.memory;
    expect(step.intent.velocityX).toBe(0);
  });

  test("chases the player up and down, not just across", () => {
    const below = perceptionFor({
      position: { x: 2000, y: 400 },
      player: { position: { x: 2000, y: 1400 }, velocity: { x: 0, y: 0 } },
    });
    expect(run(below, 1.4, engaged(1)).intent.velocityY).toBeGreaterThan(0);
  });
});

describe("stepping", () => {
  test("a zero-length frame runs no clock down", () => {
    const before: BossMemory = {
      ...engaged(1),
      state: "windup",
      attack: "volley",
      timer: 0.5,
    };
    const { memory } = stepBossBrain(before, perceptionFor(), BOSS_TUNING, 0);
    expect(memory.clock).toBe(before.clock);
    expect(memory.timer).toBe(0.5);
  });

  test("the memory handed in is never mutated", () => {
    const before = engaged(1);
    const snapshot = JSON.stringify(before);
    run(perceptionFor(), 2, before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test("facing tracks the player", () => {
    expect(run(perceptionFor(), 1.4, engaged(1)).intent.facing).toBe(1);
    const behind = perceptionFor({
      player: { position: { x: 1200, y: 800 }, velocity: { x: 0, y: 0 } },
    });
    expect(run(behind, 1.4, engaged(1)).intent.facing).toBe(-1);
  });

  test("a slam keeps facing the lane it committed to", () => {
    const memory: BossMemory = {
      ...engaged(2),
      state: "strike",
      attack: "slam",
      facing: 1,
      strikeDirection: { x: -1, y: 0 },
      timer: BOSS_ATTACK_SHAPE.slam.strike,
    };
    const step = stepBossBrain(memory, perceptionFor(), BOSS_TUNING, STEP);
    expect(step.intent.facing).toBe(-1);
  });
});
