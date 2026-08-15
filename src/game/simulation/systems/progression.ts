import { LEVELS, type LevelDefinition } from "../../content/levels";
import {
  add,
  clamp,
  distance,
  dot,
  scale,
  subtract,
  type Vec2,
} from "../physics/vector";
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

/** Shortest distance from `point` to the segment `from`→`to`. */
const distanceToSegment = (point: Vec2, from: Vec2, to: Vec2): number => {
  const span = subtract(to, from);
  const spanLengthSquared = dot(span, span);
  if (spanLengthSquared === 0) {
    return distance(point, from);
  }

  const along = clamp(
    dot(subtract(point, from), span) / spanLengthSquared,
    0,
    1,
  );
  return distance(point, add(from, scale(span, along)));
};

/**
 * True when the hero touched the goal circle. The whole `previous`→`position`
 * segment counts: a reeled-in swing covers well over a goal diameter between
 * frames, and point-sampling the current position alone let it tunnel clean
 * through. Omitting `previous` degrades to the old point test.
 */
export const isGoalReached = (
  level: LevelDefinition,
  position: Vec2,
  previous: Vec2 = position,
): boolean =>
  distanceToSegment(level.goal, previous, position) <= level.goal.radius;

/** Flat rate for crossing any district, and what each one further in adds. */
const DISTRICT_CLEAR_BASE = 400;
const DISTRICT_CLEAR_STEP = 100;

/**
 * What reaching the goal of the district at `index` pays.
 *
 * Getting across a district has to be worth something on its own: only
 * takedowns scored, so a run that swung cleanly through seven of the eight and
 * picked no fights finished on a flat zero. A district's patrol is worth
 * roughly a thousand between them, and the step keeps the late districts —
 * longer, and defended harder — worth crossing rather than merely surviving.
 */
export const districtClearScore = (index: number): number =>
  DISTRICT_CLEAR_BASE + DISTRICT_CLEAR_STEP * Math.max(0, index);

/** On top of the last district's own bonus, once, for finishing the run. */
export const RUN_CLEAR_SCORE = 1000;

const markVisited = (state: GameState, levelId: string): void => {
  if (!state.progression.visitedLevelIds.includes(levelId)) {
    state.progression.visitedLevelIds.push(levelId);
  }
};

/**
 * Advances one level when the hero crosses the current level's goal. Levels are
 * discrete, so progress never skips ahead: only the active goal counts.
 * `won` fires exactly once — clearing the last goal ends the run here, and a
 * finished run never progresses again.
 */
export const syncLevelProgress = (
  state: GameState,
  position: Vec2,
  previous: Vec2 = position,
): LevelTransition => {
  if (state.progression.status !== "playing") {
    return { kind: "none" };
  }

  const level = getCurrentLevel(state);
  markVisited(state, level.id);

  if (!isGoalReached(level, position, previous)) {
    return { kind: "none" };
  }

  state.progression.districtsCleared += 1;
  state.player.score += districtClearScore(state.progression.levelIndex);

  if (isFinalLevelIndex(state.progression.levelIndex)) {
    state.player.score += RUN_CLEAR_SCORE;
    state.progression.status = "cleared";
    state.player.message = `${level.name} cleared. The skyline is yours.`;
    return { kind: "won", level };
  }

  const nextLevel = getLevelByIndex(state.progression.levelIndex + 1);
  state.progression.levelIndex += 1;
  markVisited(state, nextLevel.id);
  state.player.message = `${nextLevel.name}: ${nextLevel.subtitle}`;
  return { kind: "advanced", level: nextLevel };
};

/**
 * Banks the frame against the run clock. Real milliseconds rather than the
 * simulation's, so a hit-stop does not slow the timer down, and only while the
 * hero is actually playing — the title, a pause and a finished run are all time
 * the run should not be charged for.
 */
export const tickRunClock = (state: GameState, deltaMs: number): void => {
  if (state.progression.status !== "playing" || !(deltaMs > 0)) {
    return;
  }
  state.progression.elapsedMs += deltaMs;
};
