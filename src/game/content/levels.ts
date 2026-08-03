import { compileLevel } from "./levels/authoring";
import { bridgeLineFinale } from "./levels/bridge-line-finale";
import { drydockHoists } from "./levels/drydock-hoists";
import { glasshouseTerraces } from "./levels/glasshouse-terraces";
import { harborCraneRun } from "./levels/harbor-crane-run";
import { midtownAfterDark } from "./levels/midtown-after-dark";
import { parkSidePursuit } from "./levels/park-side-pursuit";
import { spireAscent } from "./levels/spire-ascent";
import { switchyardSkywire } from "./levels/switchyard-skywire";
import type { LevelDefinition } from "./levels/types";

export {
  anchorsInReach,
  CABLE_ANCHOR_SPACING,
  cablePointAt,
  cablePoints,
  cableSegments,
  FACADE_ANCHOR_SPACING,
  generateBuildingAnchors,
  generateCableAnchors,
  MIN_ANCHOR_CLEARANCE,
  ROOF_ANCHOR_SPACING,
  ROOF_LEDGE_LIFT,
  SWING_REACH,
} from "./levels/anchors";
export {
  type BuildingRow,
  type CableRow,
  compileLevel,
  type EnemyRow,
  type LevelBlueprint,
  PLATFORM_DECK_HEIGHT,
  type PlatformRow,
  roofYAt,
  STREET_Y,
  WORLD_HEIGHT,
} from "./levels/authoring";
export type {
  AnchorPoint,
  AnchorSource,
  Building,
  BuildingKind,
  Cable,
  EnemyLane,
  EnemySpawn,
  LevelDefinition,
  LevelGoal,
  Platform,
  PlatformCycle,
  PlatformKind,
  PlatformMotion,
} from "./levels/types";

/**
 * Play order. Each entry is a discrete world with its own spawn, goal, and
 * bounds. The three machinery districts sit in the middle of the run: they
 * introduce cables, hoists and failing glass while the patrol pressure is still
 * light, and the three original late districts then escalate the combat on top
 * of a hero who already knows how to read them.
 */
export const LEVELS: readonly LevelDefinition[] = [
  midtownAfterDark,
  parkSidePursuit,
  switchyardSkywire,
  drydockHoists,
  glasshouseTerraces,
  spireAscent,
  harborCraneRun,
  bridgeLineFinale,
].map(compileLevel);

export const getLevelById = (id: string): LevelDefinition | undefined =>
  LEVELS.find((level) => level.id === id);
