import { describe, expect, test } from "bun:test";
import { LEVELS } from "../../content/levels";
import { createInitialGameState } from "../state";
import {
  getCurrentLevel,
  getLevelByIndex,
  isFinalLevelIndex,
  isGoalReached,
  syncLevelProgress,
} from "./progression";

const goalPosition = (index: number) => ({
  x: LEVELS[index].goal.x,
  y: LEVELS[index].goal.y,
});

describe("level lookup", () => {
  test("clamps out-of-range indices instead of returning undefined", () => {
    expect(getLevelByIndex(-4).id).toBe(LEVELS[0].id);
    expect(getLevelByIndex(LEVELS.length + 3).id).toBe(
      LEVELS[LEVELS.length - 1].id,
    );
  });

  test("only the last level is final", () => {
    expect(isFinalLevelIndex(0)).toBe(false);
    expect(isFinalLevelIndex(LEVELS.length - 1)).toBe(true);
  });
});

describe("isGoalReached", () => {
  test("is true inside the goal radius and false outside it", () => {
    const level = LEVELS[0];
    expect(isGoalReached(level, { x: level.goal.x, y: level.goal.y })).toBe(
      true,
    );
    expect(
      isGoalReached(level, {
        x: level.goal.x + level.goal.radius - 1,
        y: level.goal.y,
      }),
    ).toBe(true);
    expect(
      isGoalReached(level, {
        x: level.goal.x + level.goal.radius + 1,
        y: level.goal.y,
      }),
    ).toBe(false);
  });
});

describe("syncLevelProgress", () => {
  test("stays put until the hero touches the goal", () => {
    const state = createInitialGameState(LEVELS[0]);

    expect(syncLevelProgress(state, LEVELS[0].playerSpawn).kind).toBe("none");
    expect(state.progression.levelIndex).toBe(0);
    expect(getCurrentLevel(state).id).toBe(LEVELS[0].id);
  });

  test("advances one level and records the visit", () => {
    const state = createInitialGameState(LEVELS[0]);

    const transition = syncLevelProgress(state, goalPosition(0));

    expect(transition.kind).toBe("advanced");
    expect(state.progression.levelIndex).toBe(1);
    expect(state.progression.visitedLevelIds).toEqual([
      LEVELS[0].id,
      LEVELS[1].id,
    ]);
    expect(state.player.message).toContain(LEVELS[1].name);
  });

  test("never skips levels: a later level's goal does nothing early", () => {
    const state = createInitialGameState(LEVELS[0]);

    expect(syncLevelProgress(state, goalPosition(LEVELS.length - 1)).kind).toBe(
      "none",
    );
    expect(state.progression.levelIndex).toBe(0);
    expect(state.progression.visitedLevelIds).toEqual([LEVELS[0].id]);
  });

  test("reports the win only after the final level is cleared", () => {
    const state = createInitialGameState(LEVELS[0]);

    for (let index = 0; index < LEVELS.length - 1; index += 1) {
      const transition = syncLevelProgress(state, goalPosition(index));
      expect(transition.kind).toBe("advanced");
      expect(state.progression.levelIndex).toBe(index + 1);
    }

    const finalIndex = LEVELS.length - 1;
    const win = syncLevelProgress(state, goalPosition(finalIndex));

    expect(win.kind).toBe("won");
    expect(state.progression.levelIndex).toBe(finalIndex);
    expect(state.progression.visitedLevelIds).toEqual(
      LEVELS.map((level) => level.id),
    );
  });

  test("does not advance past the final level", () => {
    const state = createInitialGameState(LEVELS[0]);
    state.progression.levelIndex = LEVELS.length - 1;

    syncLevelProgress(state, goalPosition(LEVELS.length - 1));

    expect(state.progression.levelIndex).toBe(LEVELS.length - 1);
  });
});
