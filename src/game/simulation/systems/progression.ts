import { LEVELS, type LevelDefinition } from "../../content/levels";
import { clamp, distance, type Vec2 } from "../physics/vector";
import type { GameState } from "../state";

/** What a progress check produced. `won` fires once the final goal is touched. */
export type LevelTransition =
  | { kind: "none" }
  | { kind: "advanced"; level: LevelDefinition }
  | { kind: "won"; level: LevelDefinition };

export const getLevelByIndex = (index: number): LevelDefinition =>
  LEVELS[clamp(Math.trunc(index), 0, LEVELS.length - 1)];

export const getCurrentLevel = (state: GameState): LevelDefinition =>
  getLevelByIndex(state.progression.levelIndex);

export const isFinalLevelIndex = (index: number): boolean =>
  index >= LEVELS.length - 1;

export const isGoalReached = (
  level: LevelDefinition,
  position: Vec2,
): boolean => distance(position, level.goal) <= level.goal.radius;

const markVisited = (state: GameState, levelId: string): void => {
  if (!state.progression.visitedLevelIds.includes(levelId)) {
    state.progression.visitedLevelIds.push(levelId);
  }
};

/**
 * Advances one level when the hero touches the current level's goal. Levels are
 * discrete, so progress never skips ahead: only the active goal counts.
 * Returns `won` while the hero stands on the final goal; the caller is expected
 * to stop the run at that point.
 */
export const syncLevelProgress = (
  state: GameState,
  position: Vec2,
): LevelTransition => {
  const level = getCurrentLevel(state);
  markVisited(state, level.id);

  if (!isGoalReached(level, position)) {
    return { kind: "none" };
  }

  if (isFinalLevelIndex(state.progression.levelIndex)) {
    state.player.message = `${level.name} cleared. The skyline is yours.`;
    return { kind: "won", level };
  }

  const nextLevel = getLevelByIndex(state.progression.levelIndex + 1);
  state.progression.levelIndex += 1;
  markVisited(state, nextLevel.id);
  state.player.message = `${nextLevel.name}: ${nextLevel.subtitle}`;
  return { kind: "advanced", level: nextLevel };
};
