import { describe, expect, test } from "bun:test";
import { LEVELS } from "../content/levels";
import {
  createInitialGameState,
  runSummary,
  startRun,
  togglePause,
} from "./state";

const world = (status?: Parameters<typeof createInitialGameState>[1]) =>
  createInitialGameState(LEVELS[0], status);

describe("a fresh run", () => {
  test("plays by default and boots to the title when asked", () => {
    expect(world().progression.status).toBe("playing");
    expect(world("title").progression.status).toBe("title");
  });

  test("has nothing to report yet", () => {
    expect(runSummary(world("title"))).toEqual({
      score: 0,
      districtsCleared: 0,
      bestChain: 0,
      elapsedMs: 0,
    });
  });
});

describe("startRun", () => {
  test("lifts the title exactly once", () => {
    const state = world("title");

    expect(startRun(state)).toBe(true);
    expect(state.progression.status).toBe("playing");
    // The key is still down on the next frame; it must not restart anything.
    expect(startRun(state)).toBe(false);
    expect(state.progression.status).toBe("playing");
  });

  test("cannot restart a finished run", () => {
    const state = world();
    state.progression.status = "cleared";

    expect(startRun(state)).toBe(false);
    expect(state.progression.status).toBe("cleared");
  });
});

describe("togglePause", () => {
  test("holds a run in play and lets it go again", () => {
    const state = world();

    expect(togglePause(state)).toBe("paused");
    expect(togglePause(state)).toBe("playing");
    expect(togglePause(state)).toBe("paused");
  });

  test("leaves a status with no world to hold alone", () => {
    for (const status of ["title", "cleared", "knockedOut"] as const) {
      const state = world(status);

      expect(togglePause(state)).toBe(status);
      expect(state.progression.status).toBe(status);
    }
  });
});

describe("runSummary", () => {
  test("reads back what the run amounted to", () => {
    const state = world();
    state.player.score = 4820;
    state.progression.districtsCleared = 5;
    state.progression.bestChain = 4;
    state.progression.elapsedMs = 191_400;

    expect(runSummary(state)).toEqual({
      score: 4820,
      districtsCleared: 5,
      bestChain: 4,
      elapsedMs: 191_400,
    });
  });
});
