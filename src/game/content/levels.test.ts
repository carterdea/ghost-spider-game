import { describe, expect, test } from "bun:test";
import { BODY_BOXES } from "../../phaser/actors/placement";
import { motionPeriod, platformOffsetAt } from "../../phaser/world/movers";
import {
  chooseAttachment,
  DEFAULT_ATTACHMENT_TUNING,
} from "../simulation/physics/attachment";
import { DEFAULT_SWING_TUNING } from "../simulation/physics/swing";
import {
  type Rect,
  rectBottom,
  rectLeft,
  rectRight,
  rectTop,
} from "../simulation/physics/vector";
import {
  type AnchorPoint,
  anchorsInReach,
  type Building,
  cablePointAt,
  cableSegments,
  generateBuildingAnchors,
  generateCableAnchors,
  LEVELS,
  type LevelDefinition,
  MIN_ANCHOR_CLEARANCE,
  type Platform,
  ROOF_ANCHOR_SPACING,
  roofYAt,
  SWING_REACH,
} from "./levels";

/**
 * Playability budget, all in world pixels.
 *
 * SWING_REACH and MIN_ANCHOR_CLEARANCE are re-exported from the attachment
 * solver the running game uses, so every probe below asks "could the hero
 * actually catch something from here?" against the real catch rules rather than
 * against numbers copied into the level tooling.
 */
const GAP_SAG = 180; // how far below the lower roof the hero drifts mid-gap
const CRUISE_HEIGHT = 260; // swing altitude above the pavement
const SAMPLE_STEP = 200; // x sampling interval for dead-zone detection
const MAX_ANCHOR_SPACING = 300; // no x may be further than this from an anchor
const MIN_BUILDING_GAP = 140;
/**
 * Horizontal room between the player spawn and the nearest patrol band. A
 * spawn inside a band puts the hero in a robot's face before the level has
 * started — the park roof did exactly that and tackled a test bot seven times
 * in a row.
 */
const SPAWN_PATROL_CLEARANCE = 200;
/**
 * Every character frame is 192x192 with a centred origin (see `placement.ts`),
 * so the hero's body centre — the point `PlayerController` throws a web from —
 * sits this far above the standing position level data declares. Probing at the
 * feet would hand the spawn 96px of clearance the running game never has.
 */
const HERO_CENTRE_LIFT =
  BODY_BOXES.hero.offsetY + BODY_BOXES.hero.height - 192 / 2;
/** The tuning `PlayerController` hands `chooseAttachment`, assembled the same way. */
const CATCH_TUNING = {
  ...DEFAULT_ATTACHMENT_TUNING,
  minRopeLength: DEFAULT_SWING_TUNING.minRopeLength,
  maxRopeLength: DEFAULT_SWING_TUNING.maxRopeLength,
};
const ALLOWED_BACKDROPS = new Set([
  "environment-midtown",
  "environment-park",
  "environment-waterfront",
]);

const sortedBuildings = (level: LevelDefinition): Building[] =>
  [...level.buildings].sort((a, b) => rectLeft(a.bounds) - rectLeft(b.bounds));

const overlaps = (a: Rect, b: Rect): boolean =>
  rectLeft(a) < rectRight(b) &&
  rectRight(a) > rectLeft(b) &&
  rectTop(a) < rectBottom(b) &&
  rectBottom(a) > rectTop(b);

const isInsideSolid = (anchor: AnchorPoint, bounds: Rect): boolean =>
  anchor.x > rectLeft(bounds) &&
  anchor.x < rectRight(bounds) &&
  anchor.y > rectTop(bounds) &&
  anchor.y < rectBottom(bounds);

const sampleXs = (level: LevelDefinition): number[] => {
  const samples: number[] = [];
  for (let x = 0; x <= level.width; x += SAMPLE_STEP) {
    samples.push(x);
  }
  return samples;
};

/** Where a hero standing on the spawn actually throws a web from. */
const spawnThrowPoint = (level: LevelDefinition): { x: number; y: number } => ({
  x: level.playerSpawn.x,
  y: level.playerSpawn.y - HERO_CENTRE_LIFT,
});

const describeLevel = (level: LevelDefinition): string =>
  `${level.id} (${LEVELS.indexOf(level) + 1}/${LEVELS.length})`;

/**
 * Rest a mover must hold at each end of its run. Boarding is a decision the
 * player makes on approach, so the deck has to still be there when they land.
 */
const MIN_MOVER_HOLD_MS = 800;
/** How long a failing ledge flashes while it is still solid. */
const MIN_LEDGE_WARNING_MS = 600;
/** Milliseconds between samples when walking a mover through its whole run. */
const MOTION_SAMPLE_MS = 40;

/** The deck rectangle at a point in the platform's run. */
const platformRectAt = (platform: Platform, elapsedMs: number): Rect => {
  if (!platform.motion) {
    return platform.bounds;
  }
  const offset = platformOffsetAt(platform.motion, elapsedMs);
  return {
    ...platform.bounds,
    x: platform.bounds.x + offset.x,
    y: platform.bounds.y + offset.y,
  };
};

/** Every distinct pose a platform holds, start to finish. */
const platformPoses = (platform: Platform): Rect[] => {
  if (!platform.motion) {
    return [platform.bounds];
  }
  const period = motionPeriod(platform.motion);
  const poses: Rect[] = [];
  for (let elapsed = 0; elapsed <= period; elapsed += MOTION_SAMPLE_MS) {
    poses.push(platformRectAt(platform, elapsed));
  }
  return poses;
};

describe("level table", () => {
  test("is non-empty and every level has a unique, non-empty id", () => {
    expect(LEVELS.length).toBeGreaterThan(0);

    const ids = LEVELS.map((level) => level.id);
    for (const id of ids) {
      expect(id.length).toBeGreaterThan(0);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("keeps the original three level identities in play order", () => {
    const ids = LEVELS.map((level) => level.id);
    expect(ids[0]).toBe("midtown-after-dark");
    expect(ids[1]).toBe("park-side-pursuit");
    expect(ids[ids.length - 1]).toBe("bridge-line-finale");
  });

  test("reuses only backdrops that already ship as art", () => {
    for (const level of LEVELS) {
      expect(ALLOWED_BACKDROPS.has(level.backdropKey)).toBe(true);
    }
  });

  test("escalates: more enemies and more total threat every level", () => {
    const counts = LEVELS.map((level) => level.enemies.length);
    const threat = LEVELS.map((level) =>
      level.enemies.reduce((total, enemy) => total + enemy.health, 0),
    );

    for (let index = 1; index < LEVELS.length; index += 1) {
      expect(counts[index]).toBeGreaterThan(counts[index - 1]);
      expect(threat[index]).toBeGreaterThan(threat[index - 1]);
    }
  });

  test("the machinery districts sit mid-run, ahead of the late three", () => {
    const ids = LEVELS.map((level) => level.id);
    expect(ids).toEqual([
      "midtown-after-dark",
      "park-side-pursuit",
      "switchyard-skywire",
      "drydock-hoists",
      "glasshouse-terraces",
      "spire-ascent",
      "harbor-crane-run",
      "bridge-line-finale",
    ]);
  });

  /**
   * A mechanic is only worth building if the run keeps asking for it. Cables,
   * movers and failing ledges each have to appear before the districts that
   * escalate the combat on top of them.
   */
  test("every new mechanic is introduced before the late districts", () => {
    const firstWith = (has: (level: LevelDefinition) => boolean): number =>
      LEVELS.findIndex(has);
    const spire = LEVELS.findIndex((level) => level.id === "spire-ascent");

    const cables = firstWith((level) => level.cables.length > 0);
    const movers = firstWith((level) =>
      level.platforms.some((platform) => platform.motion !== undefined),
    );
    const ledges = firstWith((level) =>
      level.platforms.some((platform) => platform.cycle !== undefined),
    );

    for (const [name, index] of [
      ["cables", cables],
      ["movers", movers],
      ["ledges", ledges],
    ] as const) {
      expect({ name, taught: index >= 0 && index < spire }).toEqual({
        name,
        taught: true,
      });
    }
  });

  test("enemy ids are unique across the whole game", () => {
    const ids = LEVELS.flatMap((level) =>
      level.enemies.map((enemy) => enemy.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(
  LEVELS.map((level) => [describeLevel(level), level] as const),
)("%s", (_label, level) => {
  test("spawn and goal sit inside the level and far apart", () => {
    for (const point of [level.playerSpawn, level.goal]) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(level.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThan(level.streetY);
    }

    const travel = Math.hypot(
      level.goal.x - level.playerSpawn.x,
      level.goal.y - level.playerSpawn.y,
    );
    expect(travel).toBeGreaterThan(level.width * 0.6);
    expect(level.goal.radius).toBeGreaterThan(0);
  });

  test("spawn and goal stand on a roof, not in empty air", () => {
    for (const point of [level.playerSpawn, level.goal]) {
      const roofY = roofYAt(level.buildings, point.x);
      expect(roofY).not.toBeNull();
      const heightAboveRoof = (roofY ?? 0) - point.y;
      expect(heightAboveRoof).toBeGreaterThan(0);
      expect(heightAboveRoof).toBeLessThanOrEqual(160);
    }
  });

  /**
   * The game is web-swinging, so the very first press of the web key has to
   * catch. Four of five districts once opened with a forced run or fall because
   * nothing was in reach of the spawn, and the route-wide probes above never
   * looked at it. `chooseAttachment` is the real catch rule — stricter than
   * `anchorsInReach`, which knows nothing about ground clearance.
   */
  test("a web catches from the spawn, on an arc that leads to the goal", () => {
    const from = spawnThrowPoint(level);
    const heading = Math.sign(level.goal.x - level.playerSpawn.x);
    const attachment = chooseAttachment(
      level.anchors,
      from,
      heading,
      level.streetY,
      CATCH_TUNING,
    );

    expect({
      spawn: level.playerSpawn,
      caught: attachment !== undefined,
    }).toEqual({ spawn: level.playerSpawn, caught: true });
    if (!attachment) {
      return;
    }

    // Ahead of the hero, high enough for a real pendulum rather than a stubby
    // hop, and bottoming out clear of the pavement.
    expect((attachment.anchor.x - from.x) * heading).toBeGreaterThan(
      CATCH_TUNING.forwardBias,
    );
    expect(from.y - attachment.anchor.y).toBeGreaterThanOrEqual(
      CATCH_TUNING.minSwingHeight,
    );
    expect(attachment.anchor.y + attachment.targetLength).toBeLessThanOrEqual(
      level.streetY - CATCH_TUNING.groundClearance,
    );
  });

  test("the spawn catch does not depend on which way the hero faces", () => {
    const from = spawnThrowPoint(level);

    for (const facing of [1, -1]) {
      const attachment = chooseAttachment(
        level.anchors,
        from,
        facing,
        level.streetY,
        CATCH_TUNING,
      );
      expect({ facing, caught: attachment !== undefined }).toEqual({
        facing,
        caught: true,
      });
    }
  });

  test("buildings never overlap and always meet the street", () => {
    for (const [index, building] of level.buildings.entries()) {
      expect(rectBottom(building.bounds)).toBe(level.streetY);
      expect(rectTop(building.bounds)).toBeGreaterThan(0);
      expect(rectLeft(building.bounds)).toBeGreaterThanOrEqual(0);
      expect(rectRight(building.bounds)).toBeLessThanOrEqual(level.width);

      for (const other of level.buildings.slice(index + 1)) {
        expect(overlaps(building.bounds, other.bounds)).toBe(false);
      }
    }
  });

  test("the skyline spans the full level, with real gaps between blocks", () => {
    const ordered = sortedBuildings(level);
    expect(rectLeft(ordered[0].bounds)).toBe(0);
    expect(rectRight(ordered[ordered.length - 1].bounds)).toBe(level.width);

    for (let index = 1; index < ordered.length; index += 1) {
      const gap =
        rectLeft(ordered[index].bounds) - rectRight(ordered[index - 1].bounds);
      expect(gap).toBeGreaterThanOrEqual(MIN_BUILDING_GAP);
    }
  });

  test("every gap is spannable: an anchor is in reach above the crossing", () => {
    const ordered = sortedBuildings(level);

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1].bounds;
      const next = ordered[index].bounds;
      // Mid-gap the hero has fallen a little below the lower of the two
      // roofs; that sagging point is the hardest place to find a web target.
      const probe = {
        x: (rectRight(previous) + rectLeft(next)) / 2,
        y: Math.max(rectTop(previous), rectTop(next)) + GAP_SAG,
      };

      const reachable = anchorsInReach(level.anchors, probe, SWING_REACH);
      expect({ gapCenterX: probe.x, spannable: reachable.length > 0 }).toEqual({
        gapCenterX: probe.x,
        spannable: true,
      });
    }
  });

  test("no dead zones: every sampled x can web something overhead", () => {
    for (const x of sampleXs(level)) {
      const probe = { x, y: level.streetY - CRUISE_HEIGHT };
      expect({
        x,
        reachable: anchorsInReach(level.anchors, probe, SWING_REACH).length > 0,
      }).toEqual({ x, reachable: true });
    }
  });

  test("anchors are horizontally dense across the whole level", () => {
    for (const x of sampleXs(level)) {
      const nearest = Math.min(
        ...level.anchors.map((anchor) => Math.abs(anchor.x - x)),
      );
      expect({ x, nearest: nearest <= MAX_ANCHOR_SPACING }).toEqual({
        x,
        nearest: true,
      });
    }
  });

  test("anchors are above the street, inside bounds, and never buried", () => {
    expect(level.anchors.length).toBeGreaterThan(0);

    for (const anchor of level.anchors) {
      expect(anchor.x).toBeGreaterThanOrEqual(0);
      expect(anchor.x).toBeLessThanOrEqual(level.width);
      expect(anchor.y).toBeGreaterThanOrEqual(0);
      expect(anchor.y).toBeLessThanOrEqual(
        level.streetY - MIN_ANCHOR_CLEARANCE,
      );

      for (const building of level.buildings) {
        expect({
          anchor,
          buried: isInsideSolid(anchor, building.bounds),
        }).toEqual({ anchor, buried: false });
      }
    }
  });

  test("enemies spawn in bounds with a usable patrol range", () => {
    for (const enemy of level.enemies) {
      expect(enemy.patrolMaxX).toBeGreaterThan(enemy.patrolMinX);
      expect(enemy.patrolMinX).toBeGreaterThanOrEqual(0);
      expect(enemy.patrolMaxX).toBeLessThanOrEqual(level.width);
      expect(enemy.position.x).toBeGreaterThanOrEqual(enemy.patrolMinX);
      expect(enemy.position.x).toBeLessThanOrEqual(enemy.patrolMaxX);
      expect(enemy.position.y).toBeGreaterThan(0);
      expect(enemy.position.y).toBeLessThan(level.streetY);
      expect(enemy.health).toBeGreaterThan(0);
      expect(enemy.damage).toBeGreaterThan(0);
      expect(enemy.speed).toBeGreaterThan(0);
    }
  });

  test("no patrol band reaches the spawn: the hero gets a beat first", () => {
    for (const enemy of level.enemies) {
      const distanceToBand = Math.max(
        enemy.patrolMinX - level.playerSpawn.x,
        level.playerSpawn.x - enemy.patrolMaxX,
        0,
      );
      expect({
        id: enemy.id,
        clearOfSpawn: distanceToBand >= SPAWN_PATROL_CLEARANCE,
      }).toEqual({ id: enemy.id, clearOfSpawn: true });
    }
  });

  test("roof patrols stand on a building that contains their whole route", () => {
    for (const enemy of level.enemies.filter(
      (candidate) => candidate.lane === "roof",
    )) {
      const host = level.buildings.find(
        (building) =>
          enemy.patrolMinX >= rectLeft(building.bounds) &&
          enemy.patrolMaxX <= rectRight(building.bounds),
      );

      expect({ id: enemy.id, hosted: host !== undefined }).toEqual({
        id: enemy.id,
        hosted: true,
      });
      if (!host) {
        continue;
      }

      const roofY = rectTop(host.bounds);
      expect(enemy.position.y).toBeLessThanOrEqual(roofY);
      expect(enemy.position.y).toBeGreaterThanOrEqual(roofY - 90);
    }
  });

  /**
   * The invariant the whole anchor design rests on: a web only ever catches
   * something the renderer drew. Cables earn their anchors by being real
   * strung geometry; platforms move or vanish, so they never get any.
   */
  test("anchors come only from buildings and cables, nothing else", () => {
    const derived = [
      ...generateBuildingAnchors(level.buildings, level.streetY),
      ...generateCableAnchors(level.cables),
    ];
    expect(level.anchors).toHaveLength(derived.length);
    for (const anchor of level.anchors) {
      expect(anchor.source === "building" || anchor.source === "cable").toBe(
        true,
      );
    }
  });

  test("every cable anchor sits on the cable's own drawn curve", () => {
    for (const cable of level.cables) {
      const clamps = cableSegments(cable);
      for (let index = 0; index <= clamps; index += 1) {
        const point = cablePointAt(cable, index / clamps);
        expect(
          level.anchors.some(
            (anchor) =>
              Math.abs(anchor.x - point.x) < 1e-6 &&
              Math.abs(anchor.y - point.y) < 1e-6,
          ),
        ).toBe(true);
      }
    }
  });

  /** A cable hangs off masts, and a mast has to stand on something. */
  test("every cable ends on a mast standing clear above a real roof", () => {
    for (const cable of level.cables) {
      for (const tip of [cable.from, cable.to]) {
        const roofY = roofYAt(level.buildings, tip.x);
        expect({ tip, grounded: roofY !== null }).toEqual({
          tip,
          grounded: true,
        });
        expect(tip.y).toBeLessThan(roofY ?? 0);
        expect(tip.y).toBeGreaterThan(0);
      }
    }
  });

  test("platforms stay in the level and clear of every building they pass", () => {
    for (const platform of level.platforms) {
      for (const pose of platformPoses(platform)) {
        expect(rectLeft(pose)).toBeGreaterThanOrEqual(0);
        expect(rectRight(pose)).toBeLessThanOrEqual(level.width);
        expect(rectTop(pose)).toBeGreaterThan(0);
        expect(rectBottom(pose)).toBeLessThan(level.streetY);

        for (const building of level.buildings) {
          expect({
            kind: platform.kind,
            pose,
            clear: !overlaps(pose, building.bounds),
          }).toEqual({ kind: platform.kind, pose, clear: true });
        }
      }
    }
  });

  test("platforms never run through one another", () => {
    for (const [index, platform] of level.platforms.entries()) {
      for (const other of level.platforms.slice(index + 1)) {
        for (const pose of platformPoses(platform)) {
          for (const otherPose of platformPoses(other)) {
            expect(overlaps(pose, otherPose)).toBe(false);
          }
        }
      }
    }
  });

  test("movers rest at both ends, so boarding is never frame-perfect", () => {
    for (const platform of level.platforms) {
      if (!platform.motion) {
        continue;
      }
      const { motion } = platform;
      expect(motion.holdMs).toBeGreaterThanOrEqual(MIN_MOVER_HOLD_MS);
      expect(motion.travelMs).toBeGreaterThan(0);
      expect(Math.hypot(motion.dx, motion.dy)).toBeGreaterThan(0);
    }
  });

  /**
   * A ledge that dropped without notice would be a trap rather than a puzzle.
   * It has to flash first, spend more of its cycle solid than gone, and always
   * come back.
   */
  test("failing ledges telegraph, and always come back", () => {
    for (const platform of level.platforms) {
      if (!platform.cycle) {
        continue;
      }
      const { cycle } = platform;
      expect(cycle.warnMs).toBeGreaterThanOrEqual(MIN_LEDGE_WARNING_MS);
      expect(cycle.goneMs).toBeGreaterThan(0);
      expect(cycle.solidMs).toBeGreaterThan(cycle.goneMs);
      expect(cycle.offsetMs).toBeGreaterThanOrEqual(0);
    }
  });

  test("air patrols fly clear of every building they pass over", () => {
    for (const enemy of level.enemies.filter(
      (candidate) => candidate.lane === "air",
    )) {
      for (const building of level.buildings) {
        const passesOver =
          enemy.patrolMaxX >= rectLeft(building.bounds) &&
          enemy.patrolMinX <= rectRight(building.bounds);
        if (!passesOver) {
          continue;
        }

        expect({
          id: enemy.id,
          clear: enemy.position.y < rectTop(building.bounds),
        }).toEqual({ id: enemy.id, clear: true });
      }
    }
  });
});

describe("generateBuildingAnchors", () => {
  const streetY = 1000;
  const buildings: Building[] = [
    { bounds: { x: 0, y: 400, width: 500, height: 600 }, kind: "block" },
    { bounds: { x: 800, y: 700, width: 200, height: 300 }, kind: "lowrise" },
  ];
  const anchors = generateBuildingAnchors(buildings, streetY);

  test("covers both roofs corner to corner", () => {
    for (const { bounds } of buildings) {
      const roofRow = anchors.filter((anchor) => anchor.y < rectTop(bounds));
      const xs = roofRow
        .filter(
          (anchor) =>
            anchor.x >= rectLeft(bounds) && anchor.x <= rectRight(bounds),
        )
        .map((anchor) => anchor.x)
        .sort((a, b) => a - b);

      expect(xs[0]).toBe(rectLeft(bounds));
      expect(xs[xs.length - 1]).toBe(rectRight(bounds));
      for (let index = 1; index < xs.length; index += 1) {
        expect(xs[index] - xs[index - 1]).toBeLessThanOrEqual(
          ROOF_ANCHOR_SPACING,
        );
      }
    }
  });

  test("hangs facade anchors down the corners of tall buildings", () => {
    const tallEdges = anchors.filter(
      (anchor) => anchor.y > 400 && (anchor.x === 0 || anchor.x === 500),
    );
    expect(tallEdges.length).toBeGreaterThan(0);
    for (const anchor of tallEdges) {
      expect(anchor.y).toBeLessThanOrEqual(streetY - 140);
    }
  });

  test("marks generated anchors as building-derived and never buries them", () => {
    for (const anchor of anchors) {
      expect(anchor.source).toBe("building");
      for (const { bounds } of buildings) {
        expect(isInsideSolid(anchor, bounds)).toBe(false);
      }
    }
  });

  test("returns nothing for an empty skyline", () => {
    expect(generateBuildingAnchors([], streetY)).toEqual([]);
  });
});

describe("generateCableAnchors", () => {
  const cable = { from: { x: 0, y: 400 }, to: { x: 900, y: 400 } };
  const anchors = generateCableAnchors([cable]);

  test("clamps both ends and never leaves a gap wider than the spacing", () => {
    expect(anchors[0]).toEqual({ x: 0, y: 400, source: "cable" });
    expect(anchors[anchors.length - 1].x).toBe(900);

    for (let index = 1; index < anchors.length; index += 1) {
      expect(anchors[index].x - anchors[index - 1].x).toBeLessThanOrEqual(170);
    }
  });

  /** The sag is the whole point: a taut straight line would read as a bug. */
  test("dips at mid-span and returns to the mast tips at the ends", () => {
    expect(cablePointAt(cable, 0)).toEqual({ x: 0, y: 400 });
    expect(cablePointAt(cable, 1)).toEqual({ x: 900, y: 400 });
    expect(cablePointAt(cable, 0.5).y).toBeGreaterThan(400);
  });

  test("a sloped cable still ends exactly on both tips", () => {
    const sloped = { from: { x: 100, y: 300 }, to: { x: 700, y: 620 } };
    const points = generateCableAnchors([sloped]);
    expect(points[0]).toEqual({ x: 100, y: 300, source: "cable" });
    expect(points[points.length - 1]).toEqual({
      x: 700,
      y: 620,
      source: "cable",
    });
  });

  test("returns nothing when nothing is strung", () => {
    expect(generateCableAnchors([])).toEqual([]);
  });
});
