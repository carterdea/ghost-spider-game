import { type LevelBlueprint, STREET_Y, WORLD_HEIGHT } from "./authoring";

/**
 * Level 3 — vertical whiplash. Narrow spires alternate with low blocks, so the
 * route is a saw-tooth of 500px climbs and drops instead of a flat run.
 */
export const spireAscent = {
  id: "spire-ascent",
  name: "Spire Ascent",
  subtitle: "Ride the saw-tooth skyline up to the antenna line.",
  accent: "#c9a6ff",
  backdropKey: "environment-midtown",
  width: 4400,
  height: WORLD_HEIGHT,
  streetY: STREET_Y,
  spawnX: 230,
  goalX: 4180,
  threatScale: 1.25,
  buildingRows: [
    { x: 0, width: 460, roofY: 1080, kind: "lowrise" },
    { x: 700, width: 360, roofY: 560, kind: "tower" },
    { x: 1300, width: 420, roofY: 1000, kind: "block" },
    { x: 1980, width: 380, roofY: 480, kind: "tower" },
    { x: 2600, width: 440, roofY: 940, kind: "block" },
    { x: 3300, width: 400, roofY: 520, kind: "tower" },
    { x: 3960, width: 440, roofY: 860, kind: "block" },
  ],
  enemyRows: [
    {
      id: "spire-drone-low",
      kind: "drone",
      lane: "air",
      y: 700,
      patrolMinX: 1090,
      patrolMaxX: 1270,
    },
    {
      id: "spire-robot-block",
      kind: "robot",
      lane: "roof",
      patrolMinX: 1360,
      patrolMaxX: 1660,
    },
    {
      id: "spire-drone-high",
      kind: "drone",
      lane: "air",
      y: 560,
      patrolMinX: 2400,
      patrolMaxX: 2580,
    },
    {
      id: "spire-gunner-roof",
      kind: "gunner",
      lane: "roof",
      patrolMinX: 2660,
      patrolMaxX: 2980,
    },
    {
      id: "spire-gunner-street",
      kind: "gunner",
      lane: "street",
      patrolMinX: 3740,
      patrolMaxX: 3940,
    },
  ],
} as const satisfies LevelBlueprint;
