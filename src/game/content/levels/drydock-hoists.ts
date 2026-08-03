import { type LevelBlueprint, STREET_Y, WORLD_HEIGHT } from "./authoring";

/**
 * Level 4 — the machinery district. Everything here moves on a timer.
 *
 * A freight hoist rides the opening shaft, and the drydock itself is a 720px
 * void with no roof in it at all: the trolley crawls across on its gantry rail
 * and the hero can either ride it — it carries whatever stands on it — or web
 * the gantry cable strung overhead and skip the wait. Both runs rest at each
 * end of their travel, so boarding is a decision rather than a reflex.
 */
export const drydockHoists = {
  id: "drydock-hoists",
  name: "Drydock Hoists",
  subtitle: "Time the freight rigs across the dry dock.",
  accent: "#6ea8ff",
  backdropKey: "environment-waterfront",
  width: 4400,
  height: WORLD_HEIGHT,
  streetY: STREET_Y,
  spawnX: 400,
  goalX: 4200,
  threatScale: 1.18,
  buildingRows: [
    { x: 0, width: 480, roofY: 1000, kind: "lowrise" },
    { x: 820, width: 380, roofY: 620, kind: "tower" },
    { x: 1620, width: 420, roofY: 1080, kind: "lowrise" },
    { x: 2760, width: 380, roofY: 760, kind: "tower" },
    { x: 3560, width: 840, roofY: 860, kind: "block" },
  ],
  cableRows: [{ fromX: 2000, fromY: 900, toX: 2800, toY: 480 }],
  platformRows: [
    {
      x: 560,
      y: 980,
      width: 200,
      kind: "lift",
      motion: { dx: 0, dy: -330, travelMs: 2200, holdMs: 900 },
    },
    {
      x: 2080,
      y: 1000,
      width: 240,
      kind: "trolley",
      motion: { dx: 440, dy: -160, travelMs: 3400, holdMs: 1100 },
    },
    {
      x: 3220,
      y: 1040,
      width: 180,
      kind: "lift",
      motion: { dx: 0, dy: -260, travelMs: 2000, holdMs: 900 },
    },
  ],
  enemyRows: [
    {
      id: "drydock-gunner-gantry",
      kind: "gunner",
      lane: "roof",
      patrolMinX: 860,
      patrolMaxX: 1160,
    },
    {
      id: "drydock-robot-street",
      kind: "robot",
      lane: "street",
      patrolMinX: 1300,
      patrolMaxX: 1600,
    },
    {
      id: "drydock-drone-basin",
      kind: "drone",
      lane: "air",
      y: 700,
      patrolMinX: 2200,
      patrolMaxX: 2600,
    },
  ],
} as const satisfies LevelBlueprint;
