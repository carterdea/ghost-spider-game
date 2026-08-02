import { type LevelBlueprint, STREET_Y, WORLD_HEIGHT } from "./authoring";

/**
 * Level 2 — a lower, greener skyline. Gaps widen to 320px over the park and a
 * street gunner forces the hero down to pavement level mid-route.
 */
export const parkSidePursuit = {
  id: "park-side-pursuit",
  name: "Park-Side Pursuit",
  subtitle: "Protect the night crowd beneath the trees.",
  accent: "#90f0c8",
  backdropKey: "environment-park",
  width: 4000,
  height: WORLD_HEIGHT,
  streetY: STREET_Y,
  spawnX: 80,
  goalX: 3800,
  threatScale: 1.1,
  buildingRows: [
    { x: 0, width: 520, roofY: 1000, kind: "lowrise" },
    { x: 800, width: 440, roofY: 860, kind: "block" },
    { x: 1560, width: 480, roofY: 1060, kind: "lowrise" },
    { x: 2360, width: 520, roofY: 760, kind: "tower" },
    { x: 3200, width: 800, roofY: 980, kind: "block" },
  ],
  enemyRows: [
    {
      id: "park-robot-roof",
      kind: "robot",
      lane: "roof",
      patrolMinX: 320,
      patrolMaxX: 500,
    },
    {
      id: "park-gunner-street",
      kind: "gunner",
      lane: "street",
      patrolMinX: 1300,
      patrolMaxX: 1720,
    },
    {
      id: "park-drone-gap",
      kind: "drone",
      lane: "air",
      y: 700,
      patrolMinX: 2060,
      patrolMaxX: 2340,
    },
    {
      id: "park-robot-tower",
      kind: "robot",
      lane: "roof",
      patrolMinX: 2420,
      patrolMaxX: 2820,
    },
  ],
} as const satisfies LevelBlueprint;
