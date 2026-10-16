import type { BeaconBlink } from "../../simulation/systems/beacons";
import { type LevelBlueprint, STREET_Y, WORLD_HEIGHT } from "./authoring";

/** Lit long enough to line up a throw; the flicker is the warning. */
const blinkFrom = (offsetMs: number): BeaconBlink => ({
  litMs: 2200,
  flickerMs: 700,
  darkMs: 1500,
  offsetMs,
});

/**
 * District 6 — vertical whiplash. Narrow spires alternate with low blocks, so
 * the route is a saw-tooth of 500px climbs and drops instead of a flat run. The
 * spawn sits at the far end of the opening block so the first spire's roof —
 * not just its facade — is already inside web reach.
 *
 * Antenna masts stand in the troughs and on the tallest spire. Their warning
 * lamps are the highest web targets in the district, but only while lit: catch
 * one and the swing whips you out of the dip; miss the window and you climb the
 * long way, off the roof edges.
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
  spawnX: 380,
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
  beaconRows: [
    { x: 1510, height: 380, blink: blinkFrom(0) },
    { x: 2170, height: 240, blink: blinkFrom(1450) },
    { x: 2820, height: 380, blink: blinkFrom(2900) },
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
