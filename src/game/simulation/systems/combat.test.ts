import { describe, expect, test } from "bun:test";
import { LEVELS } from "../../content/levels";
import { createInitialGameState, type GameState } from "../state";
import {
  breakCombo,
  CONTACT_KNOCKBACK,
  comboMultiplier,
  contactKnockback,
  createCombo,
  damageEnemy,
  damagePlayer,
  healPlayer,
} from "./combat";

const stateWith = (kinds: readonly ("robot" | "gunner" | "drone")[]) => {
  const state: GameState = createInitialGameState(LEVELS[0]);
  const template = state.enemies[0];
  state.enemies = kinds.map((kind, index) => ({
    ...template,
    id: `enemy-${index}`,
    kind,
    health: 30,
  }));
  state.player.score = 0;
  return state;
};

describe("damagePlayer", () => {
  test("never drops below zero and takes over the message at zero", () => {
    const state = stateWith([]);

    damagePlayer(state, 40, "Clipped by a drone.");
    expect(state.player.health).toBe(60);
    expect(state.player.message).toBe("Clipped by a drone.");

    damagePlayer(state, 999, "Clipped by a drone.");
    expect(state.player.health).toBe(0);
    expect(state.player.message).toContain("knocked out");
  });
});

describe("damageEnemy", () => {
  test("a blow that does not kill scores nothing and reports a stagger", () => {
    const state = stateWith(["robot"]);

    expect(damageEnemy(state, state.enemies[0], 10)).toBe("staggered");
    expect(state.enemies[0].health).toBe(20);
    expect(state.player.score).toBe(0);
    expect(state.player.message).toBe("Robot armor cracked.");
  });

  test("a takedown without a chain pays the flat value", () => {
    const state = stateWith(["gunner"]);

    expect(damageEnemy(state, state.enemies[0], 60)).toBe("defeated");
    expect(state.player.score).toBe(250);
    expect(state.player.message).toBe("Gunner disarmed.");
  });

  test("a blow lands nothing while the target is closed", () => {
    const state = stateWith(["robot"]);
    const target = state.enemies[0];
    target.invulnerable = true;

    // The Weaver is the only thing that ever sets this, and its health is sized
    // as a count of punish windows — a hit landing outside one makes that
    // number a fiction.
    expect(damageEnemy(state, target, 60)).toBe("deflected");
    expect(target.health).toBe(30);
    expect(state.player.score).toBe(0);
  });

  test("the same blow lands once the window opens", () => {
    const state = stateWith(["robot"]);
    const target = state.enemies[0];

    target.invulnerable = true;
    damageEnemy(state, target, 60);
    target.invulnerable = false;

    expect(damageEnemy(state, target, 60)).toBe("defeated");
  });

  test("a closed target cannot be chained through", () => {
    const state = stateWith(["robot", "robot"]);
    const combo = { count: 0, best: 0 };

    state.enemies[0].invulnerable = true;
    damageEnemy(state, state.enemies[0], 60, combo);
    damageEnemy(state, state.enemies[1], 60, combo);

    // The deflected blow must not count as a link, or a chain could be built
    // out of hits that never landed.
    expect(combo.count).toBe(1);
  });
});

describe("takedowns return health", () => {
  test("a lone takedown pays less than a single contact hit costs", () => {
    const state = stateWith(["robot"]);
    state.player.health = 50;

    damageEnemy(state, state.enemies[0], 60);

    expect(state.player.health).toBe(54);
  });

  test("a chain pays health on the same curve as score", () => {
    const state = stateWith(["robot", "robot", "robot"]);
    const combo = createCombo();
    state.player.health = 40;

    for (const enemy of state.enemies) {
      damageEnemy(state, enemy, 60, combo);
    }

    // 4 + 6 + 8: the third link of a chain is worth double the first.
    expect(state.player.health).toBe(58);
  });

  test("a blow that does not kill returns nothing", () => {
    const state = stateWith(["gunner"]);
    state.player.health = 50;

    damageEnemy(state, state.enemies[0], 10);

    expect(state.player.health).toBe(50);
  });

  test("a takedown cannot lift the hero back off zero", () => {
    const state = stateWith(["robot"]);

    damagePlayer(state, 999, "Hit by a skyline shot.");
    damageEnemy(state, state.enemies[0], 60);

    // Both can land in one physics step, and the knockout is not read until
    // the run's own update afterwards: healing here would carry the run on
    // past a hero who is already down.
    expect(state.player.health).toBe(0);
  });

  test("healing never passes full", () => {
    const state = stateWith(["robot"]);
    state.player.health = state.player.maxHealth - 1;

    healPlayer(state, 40);

    expect(state.player.health).toBe(state.player.maxHealth);
  });
});

describe("combo chains", () => {
  test("pays half a multiplier per link and caps out", () => {
    expect(comboMultiplier(1)).toBe(1);
    expect(comboMultiplier(2)).toBe(1.5);
    expect(comboMultiplier(3)).toBe(2);
    expect(comboMultiplier(7)).toBe(4);
    // Capped, not runaway.
    expect(comboMultiplier(40)).toBe(4);
    // A caller that has not started a chain yet still pays flat.
    expect(comboMultiplier(0)).toBe(1);
  });

  test("chained takedowns are worth more than the same kills apart", () => {
    const chained = stateWith(["robot", "robot", "robot"]);
    const combo = createCombo();
    for (const enemy of chained.enemies) {
      damageEnemy(chained, enemy, 60, combo);
    }

    const apart = stateWith(["robot", "robot", "robot"]);
    const broken = createCombo();
    for (const enemy of apart.enemies) {
      damageEnemy(apart, enemy, 60, broken);
      breakCombo(broken);
    }

    // 150 + 225 + 300 against 150 * 3.
    expect(chained.player.score).toBe(675);
    expect(apart.player.score).toBe(450);
    expect(combo.count).toBe(3);
  });

  test("breaking a chain resets the count but keeps the best", () => {
    const state = stateWith(["robot", "robot", "robot"]);
    const combo = createCombo();

    damageEnemy(state, state.enemies[0], 60, combo);
    damageEnemy(state, state.enemies[1], 60, combo);
    breakCombo(combo);
    damageEnemy(state, state.enemies[2], 60, combo);

    expect(combo.count).toBe(1);
    expect(combo.best).toBe(2);
  });

  test("the run keeps the longest chain it managed, chains apart included", () => {
    const state = stateWith(["robot", "robot", "robot", "robot"]);
    const combo = createCombo();

    damageEnemy(state, state.enemies[0], 60, combo);
    damageEnemy(state, state.enemies[1], 60, combo);
    damageEnemy(state, state.enemies[2], 60, combo);
    expect(state.progression.bestChain).toBe(3);

    breakCombo(combo);
    damageEnemy(state, state.enemies[3], 60, combo);

    // The chain running is 1; the run's best is still the three it landed.
    expect(combo.count).toBe(1);
    expect(state.progression.bestChain).toBe(3);
  });

  test("a takedown scored without a chain still counts as one link", () => {
    const state = stateWith(["robot"]);

    damageEnemy(state, state.enemies[0], 60);

    expect(state.progression.bestChain).toBe(1);
  });

  test("a stagger neither extends nor breaks the chain", () => {
    const state = stateWith(["robot", "gunner"]);
    const combo = createCombo();

    damageEnemy(state, state.enemies[0], 60, combo);
    damageEnemy(state, state.enemies[1], 5, combo);

    expect(combo.count).toBe(1);
    expect(state.enemies[1].health).toBe(25);
  });

  test("the message names the chain once there is one to name", () => {
    const state = stateWith(["robot", "drone"]);
    const combo = createCombo();

    damageEnemy(state, state.enemies[0], 60, combo);
    expect(state.player.message).toBe("Robot dismantled.");

    damageEnemy(state, state.enemies[1], 60, combo);
    expect(state.player.message).toBe("Drone clipped. 2 chain!");
  });
});

describe("contact knockback", () => {
  test("throws the hero away from what touched them", () => {
    const fromLeft = contactKnockback({ x: 200, y: 100 }, { x: 160, y: 100 });
    expect(fromLeft.x).toBe(CONTACT_KNOCKBACK.speed);

    const fromRight = contactKnockback({ x: 200, y: 100 }, { x: 240, y: 100 });
    expect(fromRight.x).toBe(-CONTACT_KNOCKBACK.speed);
  });

  test("always lifts, so the hero leaves the surface they were pinned on", () => {
    for (const source of [
      { x: 160, y: 100 },
      { x: 240, y: 40 },
    ]) {
      expect(contactKnockback({ x: 200, y: 100 }, source).y).toBeLessThan(0);
    }
  });

  test("lifts straight up when there is no side to be thrown towards", () => {
    const overhead = contactKnockback({ x: 200, y: 100 }, { x: 200, y: 40 });
    expect(overhead.x).toBe(0);
    expect(overhead.y).toBe(CONTACT_KNOCKBACK.lift);
  });

  test("carries the hero clear of the reach that hit them", () => {
    // The escape only works if one throw outruns the invulnerability window:
    // 700ms of travel has to exceed a melee enemy's strike range, or the next
    // tick lands on a hero who never left.
    const travel = (CONTACT_KNOCKBACK.speed * 700) / 1000;
    expect(travel).toBeGreaterThan(96);
  });
});
