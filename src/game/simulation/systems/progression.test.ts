import { describe, expect, test } from "bun:test";
import { LEVELS } from "../../content/levels";
import { createInitialGameState } from "../state";
import {
  getCurrentLevel,
  getLevelByIndex,
  isFinalLevelIndex,
  isGoalReached,
  syncLevelProgress,
  tickRunClock,
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

  test("catches a step that jumps clean over the goal circle", () => {
    const level = LEVELS[0];
    const before = { x: level.goal.x - level.goal.radius * 3, y: level.goal.y };
    const after = { x: level.goal.x + level.goal.radius * 3, y: level.goal.y };

    expect(isGoalReached(level, after)).toBe(false);
    expect(isGoalReached(level, after, before)).toBe(true);
  });

  test("ignores a step that passes wide of the goal", () => {
    const level = LEVELS[0];
    const offset = level.goal.radius * 2;
    const before = { x: level.goal.x - 400, y: level.goal.y + offset };
    const after = { x: level.goal.x + 400, y: level.goal.y + offset };

    expect(isGoalReached(level, after, before)).toBe(false);
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

  test("reports the win once and then leaves the finished run alone", () => {
    const state = createInitialGameState(LEVELS[0]);
    state.progression.levelIndex = LEVELS.length - 1;
    const goal = goalPosition(LEVELS.length - 1);

    expect(syncLevelProgress(state, goal).kind).toBe("won");
    expect(state.progression.status).toBe("cleared");
    expect(syncLevelProgress(state, goal).kind).toBe("none");
    expect(syncLevelProgress(state, goal).kind).toBe("none");
  });

  test("a knocked-out run makes no further progress", () => {
    const state = createInitialGameState(LEVELS[0]);
    state.progression.status = "knockedOut";

    expect(syncLevelProgress(state, goalPosition(0)).kind).toBe("none");
    expect(state.progression.levelIndex).toBe(0);
  });

  test("a swing that overshoots the goal between frames still counts", () => {
    const state = createInitialGameState(LEVELS[0]);
    const goal = goalPosition(0);
    const radius = LEVELS[0].goal.radius;

    const transition = syncLevelProgress(
      state,
      { x: goal.x + radius * 3, y: goal.y },
      { x: goal.x - radius * 3, y: goal.y },
    );

    expect(transition.kind).toBe("advanced");
    expect(state.progression.levelIndex).toBe(1);
  });

  test("counts every district cleared, the last one included", () => {
    const state = createInitialGameState(LEVELS[0]);

    expect(state.progression.districtsCleared).toBe(0);
    syncLevelProgress(state, goalPosition(0));
    expect(state.progression.districtsCleared).toBe(1);

    for (let index = 1; index < LEVELS.length; index += 1) {
      syncLevelProgress(state, goalPosition(index));
    }

    expect(state.progression.status).toBe("cleared");
    expect(state.progression.districtsCleared).toBe(LEVELS.length);
    // A cleared run touching the goal again must not keep counting.
    syncLevelProgress(state, goalPosition(LEVELS.length - 1));
    expect(state.progression.districtsCleared).toBe(LEVELS.length);
  });

  test("does not advance past the final level", () => {
    const state = createInitialGameState(LEVELS[0]);
    state.progression.levelIndex = LEVELS.length - 1;

    syncLevelProgress(state, goalPosition(LEVELS.length - 1));

    expect(state.progression.levelIndex).toBe(LEVELS.length - 1);
  });
});

describe("the run clock", () => {
  test("banks only the time the hero is actually playing", () => {
    const state = createInitialGameState(LEVELS[0], "title");

    // The title screen is not the player's time to lose.
    tickRunClock(state, 500);
    expect(state.progression.elapsedMs).toBe(0);

    state.progression.status = "playing";
    tickRunClock(state, 16);
    tickRunClock(state, 16);
    expect(state.progression.elapsedMs).toBe(32);

    state.progression.status = "paused";
    tickRunClock(state, 5000);
    expect(state.progression.elapsedMs).toBe(32);

    state.progression.status = "playing";
    tickRunClock(state, 8);
    expect(state.progression.elapsedMs).toBe(40);

    state.progression.status = "cleared";
    tickRunClock(state, 1000);
    expect(state.progression.elapsedMs).toBe(40);
  });

  test("a poisoned frame cannot run the clock backwards", () => {
    const state = createInitialGameState(LEVELS[0]);

    tickRunClock(state, 100);
    tickRunClock(state, -400);
    tickRunClock(state, Number.NaN);

    expect(state.progression.elapsedMs).toBe(100);
  });
});
