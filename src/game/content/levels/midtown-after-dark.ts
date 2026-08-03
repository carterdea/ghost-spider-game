import { type LevelBlueprint, STREET_Y, WORLD_HEIGHT } from "./authoring";

/**
 * Level 1 — the teaching level, and the only district with nobody in it.
 *
 * Short 240px gaps and an empty skyline: the first minute of the game is about
 * finding out that the web catches, that a swing carries further than a jump,
 * and that a missed line only costs height. The hero starts on a low block with
 * the taller block opposite already inside web reach, so the run opens on a
 * swing rather than a sprint to the first ledge. Park-Side introduces the first
 * patrol once that much is learned.
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
  enemyRows: [],
} as const satisfies LevelBlueprint;
