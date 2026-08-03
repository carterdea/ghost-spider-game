import { describe, expect, test } from "bun:test";
import { LEVELS } from "../../content/levels";
import { createInitialGameState, type GameState } from "../state";
import {
  breakCombo,
  comboMultiplier,
  createCombo,
  damageEnemy,
  damagePlayer,
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

    expect(damageEnemy(state, state.enemies[0], 10)).toBe(false);
    expect(state.enemies[0].health).toBe(20);
    expect(state.player.score).toBe(0);
    expect(state.player.message).toBe("Robot armor cracked.");
  });

  test("a takedown without a chain pays the flat value", () => {
    const state = stateWith(["gunner"]);

    expect(damageEnemy(state, state.enemies[0], 60)).toBe(true);
    expect(state.player.score).toBe(250);
    expect(state.player.message).toBe("Gunner disarmed.");
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
