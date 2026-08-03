import { type LevelBlueprint, STREET_Y, WORLD_HEIGHT } from "./authoring";

/**
 * Level 3 — the cable district, and where strung lines are taught.
 *
 * The skyline deliberately falls apart here: three 700px chasms, far wider than
 * anything the run has asked for, with nothing but signal masts standing in
 * them. The catenaries slung between those masts carry the only web targets
 * over each void, so the level plays as one long committed line rather than a
 * series of roof-to-roof hops. Miss the wire and the pavement is the next stop.
 */
export const switchyardSkywire = {
  id: "switchyard-skywire",
  name: "Switchyard Skywire",
  subtitle: "Ride the strung lines over the rail cuts.",
  accent: "#ffe066",
  backdropKey: "environment-midtown",
  width: 4200,
  height: WORLD_HEIGHT,
  streetY: STREET_Y,
  spawnX: 380,
  goalX: 3980,
  threatScale: 1.14,
  buildingRows: [
    { x: 0, width: 520, roofY: 1040, kind: "block" },
    { x: 1240, width: 420, roofY: 700, kind: "tower" },
    { x: 2380, width: 400, roofY: 900, kind: "block" },
    { x: 3480, width: 720, roofY: 760, kind: "tower" },
  ],
  // Every end sits over a roof: the builder stands a mast under each one.
  cableRows: [
    { fromX: 500, fromY: 700, toX: 1280, toY: 640 },
    { fromX: 1600, fromY: 620, toX: 2440, toY: 800 },
    { fromX: 2720, fromY: 820, toX: 3540, toY: 660 },
  ],
  enemyRows: [
    {
      id: "switchyard-gunner-mast",
      kind: "gunner",
      lane: "roof",
      patrolMinX: 1300,
      patrolMaxX: 1600,
    },
    {
      id: "switchyard-drone-cut",
      kind: "drone",
      lane: "air",
      y: 560,
      patrolMinX: 1820,
      patrolMaxX: 2200,
    },
  ],
} as const satisfies LevelBlueprint;
