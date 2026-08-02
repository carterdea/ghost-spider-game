import { describe, expect, test } from "bun:test";
import type { EnemyKind } from "../state";
import { stepEnemyBrain } from "./brain";
import { AI_TUNING } from "./tuning";
import {
  type AiIntent,
  type AiMemory,
  type AiPerception,
  createAiMemory,
  type EnemyAttack,
} from "./types";

const STEP = 1 / 60;

const perceptionFor = (
  overrides: Partial<AiPerception> = {},
): AiPerception => ({
  position: { x: 1000, y: 900 },
  player: { position: { x: 1200, y: 900 }, velocity: { x: 0, y: 0 } },
  patrol: { minX: 900, maxX: 1100 },
  speed: 70,
  airborne: false,
  homeY: 900,
  blockers: [],
  snared: false,
  ...overrides,
});

interface RunResult {
  memory: AiMemory;
  intent: AiIntent;
  attacks: EnemyAttack[];
  states: string[];
}

/** Steps the brain against a frozen world for `seconds`, collecting what came out. */
const run = (
  kind: EnemyKind,
  perception: AiPerception,
  seconds: number,
  from: AiMemory = createAiMemory(1),
): RunResult => {
  let memory = from;
  let intent = stepEnemyBrain(
    kind,
    memory,
    perception,
    AI_TUNING[kind],
    0,
  ).intent;
  const attacks: EnemyAttack[] = [];
  const states: string[] = [];

  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    const step = stepEnemyBrain(
      kind,
      memory,
      perception,
      AI_TUNING[kind],
      STEP,
    );
    memory = step.memory;
    intent = step.intent;
    if (step.intent.attack) {
      attacks.push(step.intent.attack);
    }
    if (states.at(-1) !== step.intent.state) {
      states.push(step.intent.state);
    }
  }

  return { memory, intent, attacks, states };
};

const far = { position: { x: 4000, y: 900 }, velocity: { x: 0, y: 0 } };

describe("patrol", () => {
  test("walks along the patrol band", () => {
    const { intent } = run("robot", perceptionFor({ player: far }), 0.2);
    expect(intent.state).toBe("patrol");
    expect(intent.velocityX).toBe(70);
  });

  test("turns around at the far edge", () => {
    const perception = perceptionFor({
      position: { x: 1100, y: 900 },
      player: far,
    });
    expect(run("robot", perception, 0.2).intent.velocityX).toBe(-70);
  });

  test("leaves the vertical axis to gravity on the ground", () => {
    expect(
      run("robot", perceptionFor({ player: far }), 0.2).intent.velocityY,
    ).toBeNull();
  });

  test("hovers around its home line in the air lane", () => {
    const perception = perceptionFor({
      airborne: true,
      homeY: 640,
      position: { x: 1000, y: 900 },
      player: far,
    });
    // 260px below the hover line, so it must climb.
    expect(run("drone", perception, 0.05).intent.velocityY).toBeLessThan(0);
  });

  test("flies home at a sane speed after being knocked far off its line", () => {
    const perception = perceptionFor({
      speed: 120,
      airborne: true,
      homeY: 640,
      position: { x: 1000, y: 1400 },
      player: far,
    });
    const climb = run("drone", perception, 0.05).intent.velocityY ?? 0;

    expect(climb).toBeLessThan(0);
    expect(climb).toBeGreaterThanOrEqual(-240);
  });
});

describe("noticing the player", () => {
  test("spots a player standing in front, in range", () => {
    const { intent, states } = run("robot", perceptionFor(), 0.05);
    expect(intent.state).toBe("alert");
    expect(states).toEqual(["alert"]);
  });

  test("reports the moment of noticing exactly once", () => {
    let memory = createAiMemory(1);
    const perception = perceptionFor();
    const alerts: boolean[] = [];
    for (let frame = 0; frame < 6; frame += 1) {
      const step = stepEnemyBrain(
        "robot",
        memory,
        perception,
        AI_TUNING.robot,
        STEP,
      );
      memory = step.memory;
      alerts.push(step.intent.alerted);
    }
    expect(alerts.filter(Boolean)).toHaveLength(1);
    expect(alerts[0]).toBe(true);
  });

  test("misses a player standing behind it at range", () => {
    const perception = perceptionFor({
      player: { position: { x: 700, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    expect(run("robot", perception, 0.5).intent.state).toBe("patrol");
  });

  test("notices a player behind it at close quarters", () => {
    const perception = perceptionFor({
      player: { position: { x: 880, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    expect(run("robot", perception, 0.05).intent.state).toBe("alert");
  });

  test("cannot see through a building", () => {
    const perception = perceptionFor({
      blockers: [{ x: 1080, y: 700, width: 60, height: 400 }],
    });
    expect(run("robot", perception, 0.5).intent.state).toBe("patrol");
  });

  test("misses a player beyond its vision range", () => {
    const perception = perceptionFor({
      player: { position: { x: 1600, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    expect(run("robot", perception, 0.5).intent.state).toBe("patrol");
  });
});

describe("alert", () => {
  test("holds still through the reaction delay", () => {
    const { intent } = run("gunner", perceptionFor({ speed: 55 }), 0.3);
    expect(intent.state).toBe("alert");
    expect(intent.velocityX).toBe(0);
    expect(intent.attack).toBeNull();
  });

  test("turns to face the player before acting", () => {
    const perception = perceptionFor({
      player: { position: { x: 880, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    expect(run("robot", perception, 0.1).intent.facing).toBe(-1);
  });

  test("engages once the reaction delay expires", () => {
    const { states } = run("gunner", perceptionFor({ speed: 55 }), 0.7);
    expect(states.slice(0, 2)).toEqual(["alert", "engage"]);
  });

  test("gives up when the player vanishes during the delay", () => {
    let memory = createAiMemory(1);
    memory = stepEnemyBrain(
      "gunner",
      memory,
      perceptionFor({ speed: 55 }),
      AI_TUNING.gunner,
      STEP,
    ).memory;
    expect(memory.state).toBe("alert");

    const gone = perceptionFor({ speed: 55, player: far });
    expect(run("gunner", gone, 3, memory).intent.state).toBe("recover");
  });
});

describe("losing and regaining the player", () => {
  const engaged = (kind: EnemyKind, perception: AiPerception): AiMemory =>
    run(kind, perception, 1, createAiMemory(1)).memory;

  test("keeps tracking past the raw vision range once engaged", () => {
    const perception = perceptionFor({ speed: 55 });
    const memory = engaged("gunner", perception);
    expect(memory.state).toBe("engage");

    // 700px: past the 640 vision range but inside the 1.35x keep range.
    const drifted = perceptionFor({
      speed: 55,
      player: { position: { x: 1700, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    expect(run("gunner", drifted, 0.5, memory).intent.state).toBe("engage");
  });

  test("recovers after the memory window, then returns to patrol", () => {
    const memory = engaged("gunner", perceptionFor({ speed: 55 }));
    const gone = perceptionFor({ speed: 55, player: far });

    expect(run("gunner", gone, 2.5, memory).intent.state).toBe("recover");
    expect(run("gunner", gone, 5, memory).intent.state).toBe("patrol");
  });

  test("walks back into the patrol band while recovering", () => {
    const memory = engaged("gunner", perceptionFor({ speed: 55 }));
    const gone = perceptionFor({
      speed: 55,
      position: { x: 1180, y: 900 },
      player: far,
    });
    const recovering = run("gunner", gone, 2.5, memory);

    expect(recovering.intent.state).toBe("recover");
    expect(recovering.intent.velocityX).toBeLessThan(0);
  });

  test("reacquires faster than it noticed the first time", () => {
    const gone = perceptionFor({ speed: 55, player: far });
    const recovered = run(
      "gunner",
      gone,
      2.5,
      engaged("gunner", perceptionFor({ speed: 55 })),
    ).memory;
    expect(recovered.state).toBe("recover");

    const back = run("gunner", perceptionFor({ speed: 55 }), 0.05, recovered);
    expect(back.intent.state).toBe("alert");
    expect(back.memory.reaction).toBeLessThan(AI_TUNING.gunner.reactionTime);
  });
});

describe("gunner", () => {
  const gunnerAt = (playerX: number, blockers: AiPerception["blockers"] = []) =>
    perceptionFor({
      speed: 55,
      player: { position: { x: playerX, y: 900 }, velocity: { x: 0, y: 0 } },
      blockers,
    });

  test("telegraphs before the first shot", () => {
    const perception = gunnerAt(1400);
    // Reaction 0.55s then a 0.5s wind-up: mid wind-up nothing has been fired.
    const midWindup = run("gunner", perception, 0.8);
    expect(midWindup.attacks).toHaveLength(0);
    expect(midWindup.intent.telegraph).toBeGreaterThan(0);
    expect(midWindup.intent.telegraph).toBeLessThan(1);
  });

  test("fires a burst, then holds fire through the cooldown", () => {
    const perception = gunnerAt(1400);
    expect(run("gunner", perception, 1.4).attacks).toHaveLength(
      AI_TUNING.gunner.burstSize,
    );
    expect(run("gunner", perception, 2.5).attacks).toHaveLength(
      AI_TUNING.gunner.burstSize,
    );
  });

  test("leads a player who is running", () => {
    const moving = perceptionFor({
      speed: 55,
      player: { position: { x: 1400, y: 900 }, velocity: { x: 400, y: 0 } },
    });
    const [shot] = run("gunner", moving, 1.4).attacks;

    if (shot?.kind !== "shot") {
      throw new Error("expected the gunner to fire");
    }
    expect(shot.velocity.x).toBeGreaterThan(0);
    expect(Math.hypot(shot.velocity.x, shot.velocity.y)).toBeCloseTo(
      AI_TUNING.gunner.bulletSpeed,
      6,
    );
  });

  test("aims level at a stationary player", () => {
    const [shot] = run("gunner", gunnerAt(1400), 1.4).attacks;
    if (shot?.kind !== "shot") {
      throw new Error("expected the gunner to fire");
    }
    expect(shot.velocity.y).toBeCloseTo(0, 6);
    expect(shot.origin).toEqual({ x: 1000, y: 900 });
  });

  test("does not shoot through a wall that closes mid wind-up", () => {
    let memory = createAiMemory(1);
    const open = gunnerAt(1400);
    // Reaction plus most of the wind-up with a clear line.
    for (let elapsed = 0; elapsed < 0.9; elapsed += STEP) {
      memory = stepEnemyBrain(
        "gunner",
        memory,
        open,
        AI_TUNING.gunner,
        STEP,
      ).memory;
    }

    const blocked = gunnerAt(1400, [
      { x: 1180, y: 700, width: 60, height: 400 },
    ]);
    expect(run("gunner", blocked, 1, memory).attacks).toHaveLength(0);
  });

  test("backs away from a player who closes the gap", () => {
    // Player at 120px, well inside the 240px retreat range.
    const close = gunnerAt(1120);
    const afterBurst = run("gunner", close, 2);

    expect(afterBurst.intent.state).toBe("engage");
    expect(afterBurst.memory.cooldown).toBeGreaterThan(0);
    expect(afterBurst.intent.velocityX).toBeLessThan(0);
  });

  test("closes in on a player beyond its stand-off range", () => {
    const distant = gunnerAt(1500);
    const afterBurst = run("gunner", distant, 2);

    expect(afterBurst.memory.cooldown).toBeGreaterThan(0);
    expect(afterBurst.intent.velocityX).toBeGreaterThan(0);
  });

  test("stays inside its leash", () => {
    const distant = perceptionFor({
      speed: 55,
      position: { x: 1210, y: 900 },
      player: { position: { x: 1700, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    // 1210 is exactly patrolMaxX + leash, so it may not advance further.
    expect(run("gunner", distant, 2).intent.velocityX).toBeLessThanOrEqual(0);
  });
});

describe("robot", () => {
  test("charges at a player it cannot reach yet", () => {
    const { intent } = run("robot", perceptionFor(), 0.5);
    expect(intent.state).toBe("engage");
    expect(intent.velocityX).toBeGreaterThan(70);
  });

  test("plants and telegraphs once the player is in reach", () => {
    const close = perceptionFor({
      player: { position: { x: 1120, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    const winding = run("robot", close, 0.5);

    expect(winding.intent.velocityX).toBe(0);
    expect(winding.intent.telegraph).toBeGreaterThan(0);
    expect(winding.attacks).toHaveLength(0);
  });

  test("lunges once the wind-up finishes", () => {
    const close = perceptionFor({
      player: { position: { x: 1120, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    const lunging = run("robot", close, 0.75);

    expect(lunging.attacks[0]?.kind).toBe("lunge");
    expect(lunging.intent.velocityX).toBeGreaterThan(400);
  });

  test("hops as it lunges so it clears low cover", () => {
    const close = perceptionFor({
      player: { position: { x: 1120, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    let memory = createAiMemory(1);
    let liftAtLaunch: number | null = null;

    for (let elapsed = 0; elapsed < 1; elapsed += STEP) {
      const step = stepEnemyBrain(
        "robot",
        memory,
        close,
        AI_TUNING.robot,
        STEP,
      );
      memory = step.memory;
      if (step.intent.attack?.kind === "lunge") {
        liftAtLaunch = step.intent.velocityY;
        break;
      }
    }

    expect(liftAtLaunch).toBe(-AI_TUNING.robot.lift);
  });

  test("stands planted after a lunge before chasing again", () => {
    const close = perceptionFor({
      player: { position: { x: 1120, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    let memory = createAiMemory(1);
    const afterStrike: number[] = [];

    for (let elapsed = 0; elapsed < 1.5; elapsed += STEP) {
      const step = stepEnemyBrain(
        "robot",
        memory,
        close,
        AI_TUNING.robot,
        STEP,
      );
      memory = step.memory;
      if (memory.strike <= 0 && memory.cooldown > 0) {
        afterStrike.push(step.intent.velocityX);
      }
    }

    // Roughly recoilTime of standing still, then it closes again.
    expect(afterStrike.filter((speed) => speed === 0).length).toBeGreaterThan(
      20,
    );
    expect(afterStrike.at(-1)).not.toBe(0);
  });

  test("only lunges once per cooldown", () => {
    const close = perceptionFor({
      player: { position: { x: 1120, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    expect(run("robot", close, 1.5).attacks).toHaveLength(1);
    expect(run("robot", close, 2.5).attacks).toHaveLength(2);
  });

  test("holds its ground instead of twitching under a player overhead", () => {
    const overhead = perceptionFor({
      // Inside the close-quarters radius but above the strike height.
      player: { position: { x: 1008, y: 760 }, velocity: { x: 0, y: 0 } },
    });
    const tracking = run("robot", overhead, 1.5);

    expect(tracking.intent.state).toBe("engage");
    expect(tracking.intent.velocityX).toBe(0);
  });

  test("never lunges past its leash and off a roof", () => {
    // Standing exactly at patrolMaxX + leash, with the player further out still.
    const edge = perceptionFor({
      position: { x: 1170, y: 900 },
      player: { position: { x: 1250, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    let memory = createAiMemory(1);
    let launched = false;
    let fastest = 0;

    for (let elapsed = 0; elapsed < 1.5; elapsed += STEP) {
      const step = stepEnemyBrain("robot", memory, edge, AI_TUNING.robot, STEP);
      memory = step.memory;
      launched ||= step.intent.attack?.kind === "lunge";
      fastest = Math.max(fastest, step.intent.velocityX);
    }

    expect(launched).toBe(true);
    expect(fastest).toBe(0);
  });

  test("ignores a player far above its strike height", () => {
    const overhead = perceptionFor({
      player: { position: { x: 1150, y: 700 }, velocity: { x: 0, y: 0 } },
    });
    const chasing = run("robot", overhead, 1.5);

    expect(chasing.intent.state).toBe("engage");
    expect(chasing.attacks).toHaveLength(0);
  });
});

describe("drone", () => {
  const droneAt = (player: { x: number; y: number }): AiPerception =>
    perceptionFor({
      speed: 120,
      airborne: true,
      homeY: 900,
      player: { position: player, velocity: { x: 0, y: 0 } },
    });

  test("climbs to sit above the player while circling", () => {
    // Beyond the 380px dive range, so it orbits rather than winding up.
    const orbiting = run("drone", droneAt({ x: 1450, y: 1000 }), 0.6);
    expect(orbiting.intent.state).toBe("engage");
    expect(orbiting.intent.velocityY).toBeLessThan(0);
    expect(orbiting.attacks).toHaveLength(0);
  });

  test("rears up while telegraphing a dive", () => {
    const winding = run("drone", droneAt({ x: 1000, y: 1150 }), 0.7);
    expect(winding.intent.telegraph).toBeGreaterThan(0);
    expect(winding.intent.velocityY).toBe(-AI_TUNING.drone.lift);
  });

  test("dives towards the player once the wind-up finishes", () => {
    const diving = run("drone", droneAt({ x: 1000, y: 1150 }), 1);

    expect(diving.attacks[0]?.kind).toBe("dive");
    expect(diving.memory.strikeDirection.y).toBeGreaterThan(0.9);
    expect(diving.intent.velocityY).toBeGreaterThan(0);
  });

  test("dives at where a moving player is heading", () => {
    const moving = perceptionFor({
      speed: 120,
      airborne: true,
      player: { position: { x: 1000, y: 1150 }, velocity: { x: 500, y: 0 } },
    });
    expect(run("drone", moving, 1).memory.strikeDirection.x).toBeGreaterThan(0);
  });

  test("only dives once per cooldown", () => {
    const perception = droneAt({ x: 1000, y: 1150 });
    expect(run("drone", perception, 1.4).attacks).toHaveLength(1);
    expect(run("drone", perception, 3.6).attacks).toHaveLength(2);
  });
});

describe("snare", () => {
  test("pins the enemy on both axes and cancels the strike", () => {
    const close = perceptionFor({
      player: { position: { x: 1120, y: 900 }, velocity: { x: 0, y: 0 } },
    });
    const windingUp = run("robot", close, 0.6);
    expect(windingUp.memory.windup).toBeGreaterThan(0);

    const step = stepEnemyBrain(
      "robot",
      windingUp.memory,
      { ...close, snared: true },
      AI_TUNING.robot,
      STEP,
    );

    expect(step.intent.velocityX).toBe(0);
    expect(step.intent.velocityY).toBe(0);
    expect(step.intent.attack).toBeNull();
    expect(step.memory.windup).toBe(0);
  });

  test("holds an air enemy in place instead of letting it bob away", () => {
    const perception = perceptionFor({ airborne: true, snared: true });
    const step = stepEnemyBrain(
      "drone",
      createAiMemory(1),
      perception,
      AI_TUNING.drone,
      STEP,
    );
    expect(step.intent.velocityY).toBe(0);
  });
});

describe("purity", () => {
  test("never mutates the memory it is handed", () => {
    const memory = createAiMemory(1);
    const snapshot = structuredClone(memory);

    stepEnemyBrain("robot", memory, perceptionFor(), AI_TUNING.robot, STEP);

    expect(memory).toEqual(snapshot);
  });

  test("a zero step leaves every timer where it was", () => {
    const memory = { ...createAiMemory(1), cooldown: 0.4, windup: 0.2 };
    const step = stepEnemyBrain(
      "robot",
      memory,
      perceptionFor({ player: far }),
      AI_TUNING.robot,
      0,
    );

    expect(step.memory.cooldown).toBe(0.4);
    expect(step.memory.windup).toBe(0.2);
    expect(step.memory.phase).toBe(0);
  });
});
