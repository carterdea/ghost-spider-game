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
  cablePointAt,
  cablePoints,
  cableSegments,
  generateBuildingAnchors,
  generateCableAnchors,
  MIN_ANCHOR_CLEARANCE,
  ROOF_ANCHOR_SPACING,
  SWING_REACH,
} from "./levels/anchors";
export { roofYAt } from "./levels/authoring";
export type {
  AnchorPoint,
  Building,
  Cable,
  EnemyLane,
  EnemySpawn,
  LevelDefinition,
  Platform,
  PlatformCycle,
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
