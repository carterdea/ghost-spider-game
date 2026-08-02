import { type LevelBlueprint, STREET_Y, WORLD_HEIGHT } from "./authoring";

/**
 * Level 4 — the long haul. Gaps stretch to 400px and every crossing swaps roof
 * height, so momentum has to be rebuilt on each landing. Six patrols.
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
  spawnX: 260,
  goalX: 4590,
  threatScale: 1.4,
  buildingRows: [
    { x: 0, width: 520, roofY: 920, kind: "block" },
    { x: 880, width: 460, roofY: 1080, kind: "lowrise" },
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
      patrolMinX: 60,
      patrolMaxX: 460,
    },
    {
      id: "harbor-drone-inlet",
      kind: "drone",
      lane: "air",
      y: 780,
      patrolMinX: 560,
      patrolMaxX: 840,
    },
    {
      id: "harbor-robot-low",
      kind: "robot",
      lane: "roof",
      patrolMinX: 940,
      patrolMaxX: 1280,
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
