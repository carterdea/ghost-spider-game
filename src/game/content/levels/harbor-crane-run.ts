import { type LevelBlueprint, STREET_Y, WORLD_HEIGHT } from "./authoring";

/**
 * Level 4 — the long haul. Gaps stretch to 400px and every crossing swaps roof
 * height, so momentum has to be rebuilt on each landing. Six patrols. The hero
 * starts on the low dock roof, with the gantry opposite already in web reach.
 */
export const harborCraneRun = {
  id: "harbor-crane-run",
  name: "Harbor Crane Run",
  subtitle: "Cross the cargo gantries before the tide turns.",
  accent: "#ffb45c",
  backdropKey: "environment-waterfront",
  width: 4800,
  height: WORLD_HEIGHT,
  streetY: STREET_Y,
  spawnX: 420,
  goalX: 4590,
  threatScale: 1.4,
  buildingRows: [
    { x: 0, width: 520, roofY: 1060, kind: "block" },
    { x: 880, width: 460, roofY: 760, kind: "block" },
    { x: 1720, width: 560, roofY: 700, kind: "tower" },
    { x: 2660, width: 420, roofY: 1020, kind: "lowrise" },
    { x: 3480, width: 500, roofY: 640, kind: "tower" },
    { x: 4380, width: 420, roofY: 900, kind: "block" },
  ],
  enemyRows: [
    {
      id: "harbor-gunner-dock",
      kind: "gunner",
      lane: "roof",
      patrolMinX: 900,
      patrolMaxX: 1080,
    },
    {
      id: "harbor-drone-inlet",
      kind: "drone",
      lane: "air",
      y: 780,
      patrolMinX: 640,
      patrolMaxX: 860,
    },
    {
      id: "harbor-robot-low",
      kind: "robot",
      lane: "roof",
      patrolMinX: 1140,
      patrolMaxX: 1320,
    },
    {
      id: "harbor-gunner-crane",
      kind: "gunner",
      lane: "roof",
      patrolMinX: 1780,
      patrolMaxX: 2220,
    },
    {
      id: "harbor-drone-channel",
      kind: "drone",
      lane: "air",
      y: 620,
      patrolMinX: 2340,
      patrolMaxX: 2600,
    },
    {
      id: "harbor-robot-street",
      kind: "robot",
      lane: "street",
      patrolMinX: 3100,
      patrolMaxX: 3460,
    },
  ],
} as const satisfies LevelBlueprint;
