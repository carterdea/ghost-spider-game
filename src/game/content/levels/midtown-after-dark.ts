import { type LevelBlueprint, STREET_Y, WORLD_HEIGHT } from "./authoring";

/**
 * Level 1 — the teaching level. Short 240px gaps and a single roof patroller so
 * the first web-line always lands. The hero starts on a low block with the
 * taller block opposite already inside web reach, so the run opens on a swing
 * rather than a sprint to the first ledge.
 */
export const midtownAfterDark = {
  id: "midtown-after-dark",
  name: "Midtown After Dark",
  subtitle: "Warm up across the water-tower rooftops.",
  accent: "#55e8f0",
  backdropKey: "environment-midtown",
  width: 3600,
  height: WORLD_HEIGHT,
  streetY: STREET_Y,
  spawnX: 340,
  goalX: 3330,
  threatScale: 1,
  buildingRows: [
    { x: 0, width: 560, roofY: 1080, kind: "block" },
    { x: 800, width: 520, roofY: 780, kind: "block" },
    { x: 1560, width: 460, roofY: 1020, kind: "lowrise" },
    { x: 2260, width: 560, roofY: 720, kind: "tower" },
    { x: 3060, width: 540, roofY: 900, kind: "block" },
  ],
  enemyRows: [
    {
      id: "midtown-robot-roof",
      kind: "robot",
      lane: "roof",
      patrolMinX: 860,
      patrolMaxX: 1260,
    },
    {
      id: "midtown-gunner-street",
      kind: "gunner",
      lane: "street",
      patrolMinX: 1600,
      patrolMaxX: 1980,
    },
    {
      id: "midtown-drone-gap",
      kind: "drone",
      lane: "air",
      y: 640,
      patrolMinX: 2040,
      patrolMaxX: 2240,
    },
  ],
} as const satisfies LevelBlueprint;
