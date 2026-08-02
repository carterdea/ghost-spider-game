import { compileLevel } from "./levels/authoring";
import { bridgeLineFinale } from "./levels/bridge-line-finale";
import { harborCraneRun } from "./levels/harbor-crane-run";
import { midtownAfterDark } from "./levels/midtown-after-dark";
import { parkSidePursuit } from "./levels/park-side-pursuit";
import { spireAscent } from "./levels/spire-ascent";
import type { LevelDefinition } from "./levels/types";

export {
  anchorsInReach,
  FACADE_ANCHOR_SPACING,
  generateBuildingAnchors,
  MIN_ANCHOR_CLEARANCE,
  ROOF_ANCHOR_SPACING,
  ROOF_LEDGE_LIFT,
  SWING_REACH,
} from "./levels/anchors";
export {
  type BuildingRow,
  compileLevel,
  type EnemyRow,
  type LevelBlueprint,
  roofYAt,
  STREET_Y,
  WORLD_HEIGHT,
} from "./levels/authoring";
export type {
  AnchorPoint,
  AnchorSource,
  Building,
  BuildingKind,
  EnemyLane,
  EnemySpawn,
  LevelDefinition,
  LevelGoal,
} from "./levels/types";

/** Play order. Each entry is a discrete world with its own spawn, goal, and bounds. */
export const LEVELS: readonly LevelDefinition[] = [
  midtownAfterDark,
  parkSidePursuit,
  spireAscent,
  harborCraneRun,
  bridgeLineFinale,
].map(compileLevel);

export const getLevelById = (id: string): LevelDefinition | undefined =>
  LEVELS.find((level) => level.id === id);
