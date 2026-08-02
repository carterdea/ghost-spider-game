import { describe, expect, test } from "bun:test";
import { createInitialGameState } from "../state";
import { syncLevelProgress } from "./progression";

describe("syncLevelProgress", () => {
  test("advances once when the player enters a new level", () => {
    const state = createInitialGameState();

    expect(syncLevelProgress(state, 2200)).toBe(true);
    expect(state.progression.levelIndex).toBe(1);
    expect(state.progression.visitedLevelIds).toEqual([
      "midtown-after-dark",
      "park-side-pursuit",
    ]);
    expect(syncLevelProgress(state, 2400)).toBe(false);
  });

  test("moves to the final level at the world boundary", () => {
    const state = createInitialGameState();

    expect(syncLevelProgress(state, state.world.width)).toBe(true);
    expect(state.progression.levelIndex).toBe(2);
  });
});
