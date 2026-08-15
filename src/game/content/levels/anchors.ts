import { DEFAULT_ATTACHMENT_TUNING } from "../../simulation/physics/attachment";
import {
  rectBottom,
  rectLeft,
  rectRight,
  rectTop,
  type Vec2,
} from "../../simulation/physics/vector";
import type { AnchorPoint, Building, Cable } from "./types";

/**
 * Reach and clearance come from the attachment solver the running game uses,
 * not from copies. Level authoring and the playability tests have to agree with
 * the real catch rules — duplicating these would let the tests keep passing
 * against stale numbers while the levels became unplayable.
 */
export const SWING_REACH = DEFAULT_ATTACHMENT_TUNING.reach;
export const MIN_ANCHOR_CLEARANCE = DEFAULT_ATTACHMENT_TUNING.minClearance;

/** Horizontal spacing between roof-edge anchors. Both corners are always included. */
export const ROOF_ANCHOR_SPACING = 180;

/** Roof anchors sit just above the roof slab, on the ledge the roof art draws. */
const ROOF_LEDGE_LIFT = 12;

/** Vertical spacing of facade anchors running down a building's two corners. */
const FACADE_ANCHOR_SPACING = 260;

/** Facade anchors stop this far above the building's base so they stay overhead. */
const FACADE_ANCHOR_FLOOR_MARGIN = 140;

const anchorKey = (anchor: AnchorPoint): string =>
  `${Math.round(anchor.x)}:${Math.round(anchor.y)}`;

/** Evenly spaced points along the roof line, always including both corners. */
const roofAnchors = (building: Building): AnchorPoint[] => {
  const { bounds } = building;
  const y = rectTop(bounds) - ROOF_LEDGE_LIFT;
  const segments = Math.max(1, Math.ceil(bounds.width / ROOF_ANCHOR_SPACING));

  return Array.from({ length: segments + 1 }, (_, index) => ({
    x: rectLeft(bounds) + (bounds.width * index) / segments,
    y,
    source: "building" as const,
  }));
};

/** Corner-ledge points down both faces, so low-flying heroes still have a target. */
const facadeAnchors = (building: Building, streetY: number): AnchorPoint[] => {
  const { bounds } = building;
  const lowest =
    Math.min(rectBottom(bounds), streetY) - FACADE_ANCHOR_FLOOR_MARGIN;
  const anchors: AnchorPoint[] = [];

  for (
    let y = rectTop(bounds) + FACADE_ANCHOR_SPACING;
    y <= lowest;
    y += FACADE_ANCHOR_SPACING
  ) {
    anchors.push(
      { x: rectLeft(bounds), y, source: "building" },
      { x: rectRight(bounds), y, source: "building" },
    );
  }

  return anchors;
};

/**
 * Derives every web target from real building geometry: roof ledges plus the
 * corner ledges down each facade. This is the backbone of a level's anchor set
 * — authored anchors only ever supplement it.
 */
export const generateBuildingAnchors = (
  buildings: readonly Building[],
  streetY: number,
): AnchorPoint[] => {
  const seen = new Set<string>();
  const anchors: AnchorPoint[] = [];

  for (const building of buildings) {
    for (const anchor of [
      ...roofAnchors(building),
      ...facadeAnchors(building, streetY),
    ]) {
      const key = anchorKey(anchor);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      anchors.push(anchor);
    }
  }

  return anchors.sort((a, b) => a.x - b.x || a.y - b.y);
};

/** Horizontal spacing between the clamps a strung cable hangs its anchors from. */
const CABLE_ANCHOR_SPACING = 170;

/** How far a cable dips at mid-span, as a fraction of its own length. */
const CABLE_SAG_RATIO = 0.08;

const cableSpan = (cable: Cable): number =>
  Math.hypot(cable.to.x - cable.from.x, cable.to.y - cable.from.y);

/**
 * A point on the strung line at `t` in 0..1. The renderer draws this same
 * curve at a finer step, which is what keeps a cable anchor on the cable the
 * player can see rather than in the air beside it.
 */
export const cablePointAt = (cable: Cable, t: number): Vec2 => {
  const sag = cableSpan(cable) * CABLE_SAG_RATIO;
  return {
    x: cable.from.x + (cable.to.x - cable.from.x) * t,
    y: cable.from.y + (cable.to.y - cable.from.y) * t + sag * 4 * t * (1 - t),
  };
};

/** Clamps along a cable, both ends included. */
export const cableSegments = (cable: Cable): number =>
  Math.max(1, Math.ceil(cableSpan(cable) / CABLE_ANCHOR_SPACING));

export const cablePoints = (cable: Cable, segments: number): Vec2[] =>
  Array.from({ length: segments + 1 }, (_, index) =>
    cablePointAt(cable, index / segments),
  );

/** Web targets sampled off every strung line, at its clamp points. */
export const generateCableAnchors = (
  cables: readonly Cable[],
): AnchorPoint[] => {
  const seen = new Set<string>();
  const anchors: AnchorPoint[] = [];

  for (const cable of cables) {
    for (const point of cablePoints(cable, cableSegments(cable))) {
      const anchor: AnchorPoint = { x: point.x, y: point.y, source: "cable" };
      const key = anchorKey(anchor);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      anchors.push(anchor);
    }
  }

  return anchors;
};

/** Anchors the hero at `from` could actually catch, nearest first. */
export const anchorsInReach = (
  anchors: readonly AnchorPoint[],
  from: { x: number; y: number },
  reach = SWING_REACH,
): AnchorPoint[] =>
  anchors
    .filter(
      (anchor) =>
        anchor.y <= from.y - MIN_ANCHOR_CLEARANCE &&
        Math.hypot(anchor.x - from.x, anchor.y - from.y) <= reach,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - from.x, a.y - from.y) -
        Math.hypot(b.x - from.x, b.y - from.y),
    );
