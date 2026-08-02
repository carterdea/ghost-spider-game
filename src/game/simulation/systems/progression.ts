import { getLevelAtX, LEVELS } from "../../content/levels";
import type { GameState } from "../state";

export const syncLevelProgress = (
  state: GameState,
  playerX: number,
): boolean => {
  const nextLevel = getLevelAtX(playerX);
  if (nextLevel === state.progression.levelIndex) {
    return false;
  }

  state.progression.levelIndex = nextLevel;
  const level = LEVELS[nextLevel];
  if (!state.progression.visitedLevelIds.includes(level.id)) {
    state.progression.visitedLevelIds.push(level.id);
  }
  state.player.message = `${level.name}: ${level.subtitle}`;
  return true;
};
