import { describe, expect, test } from "bun:test";
import { LEVELS } from "../../game/content/levels";
import { BOSS_BASE_SPEED, type BossEvent } from "../../game/simulation/ai";
import { bossSound, bossSpawnFor } from "./bossBinding";

const FINALE = LEVELS[LEVELS.length - 1];

/** Every beat the boss brain can report. Kept in step with `BossEvent`. */
const EVENTS: readonly BossEvent[] = [
  "wake",
  "phaseShift",
  "volley",
  "slam",
  "nova",
  "stagger",
  "defeated",
];

describe("the boss spawn", () => {
  test("hangs above the beacon it is guarding", () => {
    const spawn = bossSpawnFor(FINALE);

    expect(spawn.position.x).toBe(FINALE.goal.x);
    expect(spawn.position.y).toBeLessThan(FINALE.goal.y);
    expect(spawn.speed).toBe(BOSS_BASE_SPEED);
    expect(spawn.health).toBeGreaterThan(0);
  });

  test("its arena stays inside the level, whichever level it guards", () => {
    // The finale's beacon sits near the east edge, so an unclamped arena would
    // hang off the end of the world and pin the fight against the bound.
    for (const level of LEVELS) {
      const { arena } = bossSpawnFor(level);

      expect(arena.x).toBeGreaterThanOrEqual(0);
      expect(arena.x + arena.width).toBeLessThanOrEqual(level.width);
      expect(arena.y).toBeGreaterThan(0);
      expect(arena.y + arena.height).toBeLessThanOrEqual(level.streetY);
      expect(arena.width).toBeGreaterThan(0);
      expect(arena.height).toBeGreaterThan(0);
    }
  });

  test("the arena contains the beacon and the boss's own start", () => {
    const spawn = bossSpawnFor(FINALE);
    const { arena, position } = spawn;

    expect(FINALE.goal.x).toBeGreaterThanOrEqual(arena.x);
    expect(FINALE.goal.x).toBeLessThanOrEqual(arena.x + arena.width);
    expect(position.y).toBeGreaterThanOrEqual(arena.y);
    expect(position.y).toBeLessThanOrEqual(arena.y + arena.height);
  });
});

describe("the boss sounds", () => {
  test("every beat of the fight has one", () => {
    for (const event of EVENTS) {
      const named: string = bossSound(event);

      expect(named).toBe(`boss${event[0].toUpperCase()}${event.slice(1)}`);
    }
  });

  test("no two beats share a sound", () => {
    const sounds = EVENTS.map(bossSound);

    expect(new Set(sounds).size).toBe(EVENTS.length);
  });
});
