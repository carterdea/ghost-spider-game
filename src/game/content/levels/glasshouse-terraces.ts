import { type LevelBlueprint, STREET_Y, WORLD_HEIGHT } from "./authoring";

/**
 * Level 5 — the climb, and the one that punishes standing still.
 *
 * The roof line only ever goes up: every crossing is also a lift of 120 to
 * 180px, so the route is read as a staircase rather than a run. Between the
 * terraces hang glass panels that carry the hero's weight for a beat, flash,
 * and drop out — they always come back, and they always warn first, so the
 * panel is a tempo problem rather than a trap. A conservatory hoist on the last
 * span gives a slower way up for anyone who would rather not gamble.
 */
export const glasshouseTerraces = {
  id: "glasshouse-terraces",
  name: "Glasshouse Terraces",
  subtitle: "Climb the conservatory roofs before the glass gives.",
  accent: "#ff5f6d",
  backdropKey: "environment-park",
  width: 4600,
  height: WORLD_HEIGHT,
  streetY: STREET_Y,
  spawnX: 380,
  goalX: 4380,
  threatScale: 1.22,
  buildingRows: [
    { x: 0, width: 520, roofY: 1160, kind: "lowrise" },
    { x: 900, width: 440, roofY: 1000, kind: "block" },
    { x: 1700, width: 420, roofY: 820, kind: "block" },
    { x: 2500, width: 400, roofY: 640, kind: "tower" },
    { x: 3300, width: 380, roofY: 460, kind: "tower" },
    { x: 4080, width: 520, roofY: 340, kind: "tower" },
  ],
  cableRows: [{ fromX: 140, fromY: 860, toX: 1000, toY: 660 }],
  platformRows: [
    {
      x: 620,
      y: 1080,
      width: 180,
      kind: "ledge",
      cycle: { solidMs: 2600, warnMs: 900, goneMs: 1800, offsetMs: 0 },
    },
    {
      x: 1420,
      y: 900,
      width: 180,
      kind: "ledge",
      cycle: { solidMs: 2600, warnMs: 900, goneMs: 1800, offsetMs: 1400 },
    },
    {
      x: 2200,
      y: 720,
      width: 180,
      kind: "ledge",
      cycle: { solidMs: 2600, warnMs: 900, goneMs: 1800, offsetMs: 2800 },
    },
    {
      x: 2940,
      y: 540,
      width: 180,
      kind: "ledge",
      cycle: { solidMs: 2600, warnMs: 900, goneMs: 1800, offsetMs: 900 },
    },
    {
      x: 3760,
      y: 400,
      width: 200,
      kind: "ledge",
      cycle: { solidMs: 2600, warnMs: 900, goneMs: 1800, offsetMs: 2200 },
    },
    {
      x: 3140,
      y: 760,
      width: 160,
      kind: "lift",
      motion: { dx: 0, dy: -320, travelMs: 2600, holdMs: 1000 },
    },
  ],
  enemyRows: [
    {
      id: "glasshouse-robot-terrace",
      kind: "robot",
      lane: "roof",
      patrolMinX: 960,
      patrolMaxX: 1280,
    },
    {
      id: "glasshouse-drone-vault",
      kind: "drone",
      lane: "air",
      y: 700,
      patrolMinX: 1420,
      patrolMaxX: 1660,
    },
    {
      id: "glasshouse-gunner-canopy",
      kind: "gunner",
      lane: "roof",
      patrolMinX: 2560,
      patrolMaxX: 2840,
    },
    {
      id: "glasshouse-gunner-street",
      kind: "gunner",
      lane: "street",
      patrolMinX: 3400,
      patrolMaxX: 3700,
    },
  ],
} as const satisfies LevelBlueprint;
