import { type LevelBlueprint, STREET_Y, WORLD_HEIGHT } from "./authoring";

/**
 * Level 2 — a lower, greener skyline, and the first district with anyone in it.
 *
 * Gaps widen to 320px over the park, and one roof patroller stands squarely on
 * the route: the whole level is the lesson that a patrol can be swung over,
 * dropped on, or webbed from range. One is deliberate — the run does not start
 * asking the hero to fight and travel at once.
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
  spawnX: 340,
  goalX: 3800,
  threatScale: 1.1,
  buildingRows: [
    { x: 0, width: 520, roofY: 1100, kind: "lowrise" },
    { x: 800, width: 440, roofY: 800, kind: "block" },
    { x: 1560, width: 480, roofY: 1060, kind: "lowrise" },
    { x: 2360, width: 520, roofY: 760, kind: "tower" },
    { x: 3200, width: 800, roofY: 980, kind: "block" },
  ],
  enemyRows: [
    {
      id: "park-robot-roof",
      kind: "robot",
      lane: "roof",
      patrolMinX: 880,
      patrolMaxX: 1140,
    },
  ],
} as const satisfies LevelBlueprint;
