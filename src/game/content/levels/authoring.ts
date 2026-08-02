import { rectLeft, rectRight, rectTop } from "../../simulation/physics/vector";
import type { EnemyKind } from "../../simulation/state";
import { generateBuildingAnchors } from "./anchors";
import type {
  AnchorPoint,
  Building,
  BuildingKind,
  EnemySpawn,
  LevelDefinition,
} from "./types";

/** Shared vertical framing: every level uses the same sky height and street line. */
export const WORLD_HEIGHT = 1600;
export const STREET_Y = 1450;

/** The hero stands this far above a roof when a level starts. */
const SPAWN_LIFT = 60;
/** The goal marker floats this far above the roof it caps. */
const GOAL_LIFT = 64;
const GOAL_RADIUS = 96;
/** Roof patrollers stand with their sprite centre this far above the slab. */
const ROOF_ENEMY_LIFT = 40;
/** Street patrollers walk this far above the pavement line. */
const STREET_ENEMY_LIFT = 120;

const BASE_STATS: Record<
  EnemyKind,
  { health: number; damage: number; speed: number }
> = {
  robot: { health: 48, damage: 10, speed: 70 },
  gunner: { health: 58, damage: 14, speed: 55 },
  drone: { health: 28, damage: 8, speed: 120 },
};

/** A building authored as a footprint plus a roof height; it always meets the street. */
export interface BuildingRow {
  x: number;
  width: number;
  roofY: number;
  kind: BuildingKind;
}

interface EnemyRowBase {
  id: string;
  kind: EnemyKind;
  patrolMinX: number;
  patrolMaxX: number;
}

export type EnemyRow =
  | (EnemyRowBase & { lane: "roof" | "street" })
  | (EnemyRowBase & { lane: "air"; y: number });

/** Hand-authored level source. `compileLevel` turns it into a `LevelDefinition`. */
export interface LevelBlueprint {
  id: string;
  name: string;
  subtitle: string;
  accent: string;
  backdropKey: string;
  width: number;
  height: number;
  streetY: number;
  spawnX: number;
  goalX: number;
  /** Scales enemy health, damage, and speed so later levels escalate. */
  threatScale: number;
  buildingRows: readonly BuildingRow[];
  enemyRows: readonly EnemyRow[];
  authoredAnchors?: readonly { x: number; y: number }[];
}

const toBuilding = (row: BuildingRow, streetY: number): Building => ({
  bounds: {
    x: row.x,
    y: row.roofY,
    width: row.width,
    height: streetY - row.roofY,
  },
  kind: row.kind,
});

/** Roof height at `x`, or null when nothing stands there. Lowest roof line wins. */
export const roofYAt = (
  buildings: readonly Building[],
  x: number,
): number | null => {
  let roofY: number | null = null;

  for (const { bounds } of buildings) {
    if (x < rectLeft(bounds) || x > rectRight(bounds)) {
      continue;
    }
    const top = rectTop(bounds);
    roofY = roofY === null ? top : Math.min(roofY, top);
  }

  return roofY;
};

const standingY = (
  buildings: readonly Building[],
  x: number,
  lift: number,
  streetY: number,
): number => (roofYAt(buildings, x) ?? streetY) - lift;

const toEnemySpawn = (
  row: EnemyRow,
  buildings: readonly Building[],
  streetY: number,
  threatScale: number,
): EnemySpawn => {
  const base = BASE_STATS[row.kind];
  const centerX = (row.patrolMinX + row.patrolMaxX) / 2;
  const y =
    row.lane === "air"
      ? row.y
      : row.lane === "street"
        ? streetY - STREET_ENEMY_LIFT
        : standingY(buildings, centerX, ROOF_ENEMY_LIFT, streetY);

  return {
    id: row.id,
    kind: row.kind,
    position: { x: centerX, y },
    patrolMinX: row.patrolMinX,
    patrolMaxX: row.patrolMaxX,
    lane: row.lane,
    health: Math.round(base.health * threatScale),
    damage: Math.round(base.damage * threatScale),
    speed: Math.round(base.speed * threatScale),
  };
};

/**
 * Expands authored rows into a playable level: buildings meet the street,
 * spawn and goal stand on real roofs, and anchors are derived from geometry.
 */
export const compileLevel = (blueprint: LevelBlueprint): LevelDefinition => {
  const buildings = blueprint.buildingRows.map((row) =>
    toBuilding(row, blueprint.streetY),
  );
  const authored: AnchorPoint[] = (blueprint.authoredAnchors ?? []).map(
    (point) => ({ x: point.x, y: point.y, source: "authored" }),
  );

  return {
    id: blueprint.id,
    name: blueprint.name,
    subtitle: blueprint.subtitle,
    accent: blueprint.accent,
    backdropKey: blueprint.backdropKey,
    width: blueprint.width,
    height: blueprint.height,
    streetY: blueprint.streetY,
    playerSpawn: {
      x: blueprint.spawnX,
      y: standingY(buildings, blueprint.spawnX, SPAWN_LIFT, blueprint.streetY),
    },
    goal: {
      x: blueprint.goalX,
      y: standingY(buildings, blueprint.goalX, GOAL_LIFT, blueprint.streetY),
      radius: GOAL_RADIUS,
    },
    buildings,
    anchors: [
      ...generateBuildingAnchors(buildings, blueprint.streetY),
      ...authored,
    ],
    enemies: blueprint.enemyRows.map((row) =>
      toEnemySpawn(row, buildings, blueprint.streetY, blueprint.threatScale),
    ),
  };
};
