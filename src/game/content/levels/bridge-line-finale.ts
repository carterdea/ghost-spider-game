import { type LevelBlueprint, STREET_Y, WORLD_HEIGHT } from "./authoring";

/**
 * Level 5 — the finale. Longest route, tallest spires, 440px chasms, and seven
 * patrols at the highest threat scale in the game.
 */
export const bridgeLineFinale = {
  id: "bridge-line-finale",
  name: "Bridge-Line Finale",
  subtitle: "Clear the waterfront route before sunrise.",
  accent: "#f68bd7",
  backdropKey: "environment-waterfront",
  width: 5600,
  height: WORLD_HEIGHT,
  streetY: STREET_Y,
  spawnX: 80,
  goalX: 5420,
  threatScale: 1.6,
  buildingRows: [
    { x: 0, width: 520, roofY: 880, kind: "block" },
    { x: 900, width: 480, roofY: 600, kind: "tower" },
    { x: 1800, width: 440, roofY: 1040, kind: "lowrise" },
    { x: 2660, width: 560, roofY: 460, kind: "tower" },
    { x: 3660, width: 460, roofY: 980, kind: "block" },
    { x: 4560, width: 480, roofY: 520, kind: "tower" },
    { x: 5320, width: 280, roofY: 820, kind: "block" },
  ],
  enemyRows: [
    {
      id: "finale-robot-approach",
      kind: "robot",
      lane: "roof",
      patrolMinX: 320,
      patrolMaxX: 500,
    },
    {
      id: "finale-drone-span",
      kind: "drone",
      lane: "air",
      y: 560,
      patrolMinX: 560,
      patrolMaxX: 860,
    },
    {
      id: "finale-gunner-tower",
      kind: "gunner",
      lane: "roof",
      patrolMinX: 960,
      patrolMaxX: 1320,
    },
    {
      id: "finale-robot-lowrise",
      kind: "robot",
      lane: "roof",
      patrolMinX: 1860,
      patrolMaxX: 2180,
    },
    {
      id: "finale-drone-chasm",
      kind: "drone",
      lane: "air",
      y: 420,
      patrolMinX: 2300,
      patrolMaxX: 2600,
    },
    {
      id: "finale-gunner-street",
      kind: "gunner",
      lane: "street",
      patrolMinX: 3300,
      patrolMaxX: 3620,
    },
    {
      id: "finale-gunner-spire",
      kind: "gunner",
      lane: "roof",
      patrolMinX: 4620,
      patrolMaxX: 4980,
    },
  ],
} as const satisfies LevelBlueprint;
