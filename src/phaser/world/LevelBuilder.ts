import type Phaser from "phaser";
import { artKeys } from "../../game/assets/manifest";
import type {
  Building,
  Cable,
  LevelDefinition,
  Platform,
  PlatformCycle,
  PlatformMotion,
} from "../../game/content/levels";
import { cablePoints, cableSegments, roofYAt } from "../../game/content/levels";
import {
  rectBottom,
  rectCenter,
  rectRight,
  type Vec2,
} from "../../game/simulation/physics/vector";
import { RainCurtain, type RainSurface } from "../fx/RainCurtain";
import { weatherFor } from "../fx/weather";
import { LevelWorld } from "./LevelWorld";
import {
  carryRiders,
  cyclePeriod,
  isLedgeSolid,
  ledgeAlphaAt,
  ledgePhaseAt,
  motionPeriod,
  platformOffsetAt,
  type Rider,
} from "./movers";
import { MAX_VIEW } from "./viewport";

const DEPTH = {
  sky: -12,
  backdrop: -10,
  cloud: -9.7,
  horizon: -9.4,
  facade: -8,
  roofDecor: -7,
  street: -6,
  streetProp: -4,
  goal: -1,
  cable: 1,
  platform: 6,
} as const;

/** Deck tint while a glass panel is failing: the same red as the district accent. */
const LEDGE_WARN_TINT = 0xff5f6d;

/**
 * How much of the camera's travel each backdrop layer takes on. The buildings
 * the hero lands on are the only things at 1: everything painted behind them now
 * lags, which is the whole of the depth cue. Nothing in front of the action
 * moves faster than the action — a foreground layer would fight the gameplay for
 * the eye.
 */
const PARALLAX = {
  cloud: 0.22,
  panorama: 0.55,
  horizon: 0.8,
} as const;

/**
 * Span a parallax layer has to cover for the camera's whole run across a level.
 *
 * A layer that lags the camera is laid out across its own compressed span plus
 * one viewport, or the far end of a district runs off the end of it. The window
 * is variable now, so "one viewport" is the widest frame the camera is ever
 * allowed to show — which `frameZoom` enforces rather than merely assumes.
 */
const layerSpan = (levelWidth: number, parallax: number): number =>
  parallax * Math.max(0, levelWidth - MAX_VIEW.width) + MAX_VIEW.width;

/**
 * Arcade steps at a fixed 60Hz — `main.ts` leaves Phaser's default — and does no
 * swept collision for sprites: it advances a body a whole step and only then
 * looks for an overlap. So the furthest anything can travel between two
 * collision checks is its speed cap divided by this.
 */
export const ARCADE_STEP_HZ = 60;

/**
 * Depth of every collidable slab: the street floor and the roofs alike. It has
 * to stay thicker than one step of travel, or a body can end a step clear on the
 * far side of a platform it started clear in front of. The player is the fastest
 * thing in the world at `MAX_TRANSPORT_SPEED` (2400px/s), which is 40px per
 * step; roofs used to be 20px, thinner than the hero's own swing covers.
 * `PlayerController.test.ts` holds the two apart.
 */
export const PLATFORM_THICKNESS = 64;

const isPositive = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

/**
 * Rejects geometry that would produce degenerate bodies or NaN coordinates.
 * Runs before anything is created so a bad level cannot half-build and leak.
 */
const assertBuildable = (level: LevelDefinition): void => {
  const problems: string[] = [];

  if (!isPositive(level.width)) {
    problems.push(`width must be positive (got ${level.width})`);
  }
  if (!isPositive(level.height)) {
    problems.push(`height must be positive (got ${level.height})`);
  }
  if (!isPositive(level.streetY) || level.streetY >= level.height) {
    problems.push(
      `streetY must sit inside the level (got ${level.streetY} of ${level.height})`,
    );
  }
  if (!isPositive(level.goal.radius)) {
    problems.push(`goal radius must be positive (got ${level.goal.radius})`);
  }

  level.buildings.forEach((building, index) => {
    const { width, height } = building.bounds;
    if (!isPositive(width) || !isPositive(height)) {
      problems.push(`building ${index} is ${width}x${height}`);
    }
  });

  level.platforms.forEach((platform, index) => {
    const { width, height } = platform.bounds;
    if (!isPositive(width) || !isPositive(height)) {
      problems.push(`platform ${index} is ${width}x${height}`);
    }
    if (platform.motion && !isPositive(platform.motion.travelMs)) {
      problems.push(`platform ${index} never finishes its run`);
    }
    if (platform.cycle && !isPositive(cyclePeriod(platform.cycle))) {
      problems.push(`platform ${index} has an empty cycle`);
    }
  });

  if (problems.length > 0) {
    throw new Error(`Cannot build level "${level.id}": ${problems.join("; ")}`);
  }
};

export class LevelBuilder {
  private readonly scene: Phaser.Scene;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public build(level: LevelDefinition): LevelWorld {
    assertBuildable(level);

    this.scene.physics.world.setBounds(0, 0, level.width, level.height);

    const world = new LevelWorld(this.scene);
    this.buildSky(level, world);
    this.buildStreet(level, world);
    this.buildStreetProps(level, world);
    this.buildStreetFloor(level, world);
    for (const building of level.buildings) {
      this.buildBuilding(building, level, world);
    }
    for (const cable of level.cables) {
      this.buildCable(cable, level, world);
    }
    for (const platform of level.platforms) {
      this.buildPlatform(platform, world);
    }
    this.buildAmbience(level, world);
    this.buildGoal(level, world);
    this.buildWeather(level, world);

    return world;
  }

  /**
   * The district's rain. Owned by the level, so it stops and is retired with it,
   * and handed every roof line the hero could be standing on — the splashes it
   * strikes there are what make the rest of it read as weather.
   */
  private buildWeather(level: LevelDefinition, world: LevelWorld): void {
    // Struck a little below the roof line rather than on it: the line itself is
    // the lit edge the player reads a landing off, and a splash drawn over it
    // would be both invisible and in the way.
    const surfaces: RainSurface[] = level.buildings.map(({ bounds }) => ({
      left: bounds.x,
      right: rectRight(bounds),
      y: bounds.y + 16,
    }));
    surfaces.push({ left: 0, right: level.width, y: level.streetY + 8 });

    world.own(new RainCurtain(this.scene, weatherFor(level), surfaces));
  }

  /**
   * Sky, cloud, painted city, and the glow the wet air holds over the horizon —
   * four layers, each scrolling at its own rate. Only the horizontal rate
   * differs: a layer that also lagged vertically would lift off the street line
   * it is drawn to stand on the moment the hero climbed.
   */
  private buildSky(level: LevelDefinition, world: LevelWorld): void {
    world.track(
      this.scene.add
        .rectangle(
          level.width / 2,
          level.height / 2,
          level.width,
          level.height,
          0x10172b,
        )
        .setDepth(DEPTH.sky),
    );

    // The backdrop art is one panorama; repeat it across the span it has to
    // cover, which is shorter than the level now that it lags the camera. Every
    // district draws it at the same width, so no level squeezes the painting.
    const span = layerSpan(level.width, PARALLAX.panorama);
    const panelWidth = 1867;
    const panels = Math.max(1, Math.ceil(span / panelWidth));
    for (let panel = 0; panel < panels; panel += 1) {
      world.track(
        this.scene.add
          .image(
            panelWidth * (panel + 0.5),
            level.streetY - 520,
            level.backdropKey,
          )
          .setDisplaySize(panelWidth + 8, 1040)
          .setDepth(DEPTH.backdrop)
          .setScrollFactor(PARALLAX.panorama, 1)
          .setFlipX(panel % 2 === 1),
      );
    }

    // The panorama ends in a hard line against open sky. Dissolve it, or a
    // district tall enough to fly above the paint shows the join.
    world.track(
      this.scene.add
        .image(span / 2, level.streetY - 1044, "skyFade")
        .setOrigin(0.5, 0)
        .setDisplaySize(span, 190)
        .setTint(0x10172b)
        .setDepth(DEPTH.backdrop + 0.1)
        .setScrollFactor(PARALLAX.panorama, 1),
    );

    this.buildCloud(level, world);
    this.buildHorizonGlow(level, world);
  }

  /**
   * Rain cloud over the dead sky above the panorama, drifting on the wind. Drawn
   * over the top of the painted city rather than behind it: one tile deep, so
   * the band thins away into the skyline instead of ending on a line.
   */
  private buildCloud(level: LevelDefinition, world: LevelWorld): void {
    const bottom = level.streetY - 820;
    if (bottom <= 0) {
      return;
    }

    const span = layerSpan(level.width, PARALLAX.cloud);
    const cloud = world.track(
      this.scene.add
        .tileSprite(span / 2, bottom / 2, span, bottom, "rainHaze")
        .setTileScale(3.2, bottom / 256)
        .setAlpha(0.9)
        .setDepth(DEPTH.cloud)
        .setScrollFactor(PARALLAX.cloud, 1),
    );

    // One tween on the texture offset, rather than anything per frame.
    world.tween({
      targets: cloud,
      tilePositionX: 512,
      duration: 96000,
      repeat: -1,
      ease: "Linear",
    });
  }

  /**
   * The district's own colour, hanging in the air over the skyline. It is added
   * to the panorama rather than laid over it, so the painted city still reads
   * through, and it breathes slowly — the one piece of light in the backdrop
   * that is allowed to move.
   */
  private buildHorizonGlow(level: LevelDefinition, world: LevelWorld): void {
    const span = layerSpan(level.width, PARALLAX.horizon);
    const height = 320;
    const glow = world.track(
      this.scene.add
        .tileSprite(
          span / 2,
          level.streetY - 480 - height / 2,
          span,
          height,
          "horizonGlow",
        )
        .setTileScale(1, height / 256)
        .setTint(accentColor(level.accent))
        // Named rather than `Phaser.BlendModes.ADD`, so this module still needs
        // Phaser for types only and stays testable outside a booted game.
        .setBlendMode("ADD")
        .setAlpha(0.5)
        .setDepth(DEPTH.horizon)
        .setScrollFactor(PARALLAX.horizon, 1),
    );

    world.tween({
      targets: glow,
      alpha: 0.78,
      duration: 5200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  private buildStreet(level: LevelDefinition, world: LevelWorld): void {
    const below = level.height - level.streetY;
    world.track(
      this.scene.add
        .tileSprite(
          level.width / 2,
          level.streetY + below / 2,
          level.width,
          below,
          artKeys.street,
        )
        .setAlpha(0.92)
        .setDepth(DEPTH.street),
    );

    for (let x = 120; x < level.width; x += 420) {
      world.track(
        this.scene.add
          .image(x, level.streetY + 120, "laneDash")
          .setDepth(DEPTH.streetProp),
      );
    }

    for (let x = 690; x < level.width; x += 1480) {
      for (let stripe = 0; stripe < 6; stripe += 1) {
        world.track(
          this.scene.add
            .image(x + stripe * 48, level.streetY + 118, "crosswalkStripe")
            .setDepth(DEPTH.streetProp),
        );
      }
    }
  }

  private buildStreetProps(level: LevelDefinition, world: LevelWorld): void {
    const park = level.backdropKey === "environment-park";
    const curb = level.streetY;

    for (let x = 48; x < level.width; x += 96) {
      world.track(
        this.scene.add
          .image(x, curb, "sidewalkTile")
          .setOrigin(0.5, 0)
          .setDepth(DEPTH.streetProp),
      );
    }

    for (let x = 420; x < level.width; x += 1040) {
      world.track(this.scene.add.image(x, curb - 50, "stoop").setDepth(-3.4));
      world.track(
        this.scene.add.image(x + 260, curb - 60, "newsStand").setDepth(-3.3),
      );
      world.track(
        this.scene.add.image(x + 560, curb - 52, "foodCart").setDepth(-3.2),
      );
      world.track(
        this.scene.add.image(x + 830, curb - 62, "storefront").setDepth(-3.3),
      );
    }

    for (let x = 360; x < level.width; x += 620) {
      world.track(
        this.scene.add.image(x, curb - 32, "streetLight").setDepth(6),
      );
    }

    for (let x = 520; x < level.width; x += 930) {
      world.track(this.scene.add.image(x, curb - 4, "trashCan").setDepth(5));
      world.track(this.scene.add.image(x + 190, curb, "hydrant").setDepth(5));
      world.track(
        this.scene.add
          .image(x + 330, curb - 4, park ? "parkTree" : "planter")
          .setDepth(5),
      );
      if (park) {
        world.track(
          this.scene.add.image(x + 470, curb - 8, "parkBench").setDepth(5),
        );
      }
    }
  }

  /** The street is a solid floor: fall off the roofs and you land on pavement. */
  private buildStreetFloor(level: LevelDefinition, world: LevelWorld): void {
    const floor = world.platforms.create(
      level.width / 2,
      level.streetY + PLATFORM_THICKNESS / 2,
      "roof",
    ) as Phaser.Physics.Arcade.Sprite;
    floor.setVisible(false);
    floor.displayWidth = level.width;
    floor.displayHeight = PLATFORM_THICKNESS;
    floor.refreshBody();
  }

  private buildBuilding(
    building: Building,
    level: LevelDefinition,
    world: LevelWorld,
  ): void {
    const { bounds } = building;
    const center = rectCenter(bounds);

    // A translucent silhouette: solid enough to read as geometry, sheer enough
    // that the painted skyline behind it still carries the scene.
    world.track(
      this.scene.add
        .rectangle(
          center.x,
          center.y,
          bounds.width,
          bounds.height,
          0x0b1020,
          0.62,
        )
        .setDepth(DEPTH.facade),
    );
    world.track(
      this.scene.add
        .tileSprite(
          center.x,
          center.y,
          bounds.width,
          bounds.height,
          "brickFacade",
        )
        .setDepth(DEPTH.facade + 0.1)
        .setAlpha(0.28)
        .setTint(building.kind === "tower" ? 0x9fb0d8 : 0xc3cde6),
    );
    // Bright cap on the roof line so the landable edge is unmistakable.
    world.track(
      this.scene.add
        .rectangle(
          center.x,
          bounds.y + 23,
          bounds.width - 22,
          42,
          0x151c2f,
          0.9,
        )
        .setDepth(DEPTH.roofDecor),
    );
    // The lit edge stays the same colour in every district: it is the tell for
    // "this is landable", and a district whose accent is the same red as a
    // failing ledge would turn that tell into a lie.
    world.track(
      this.scene.add
        .rectangle(center.x, bounds.y + 3, bounds.width - 8, 16, 0x55e8f0, 0.9)
        .setDepth(-7.1),
    );
    // The wet reads on the deck itself: the accent pooling in standing water
    // under the edge light and fading off within a stride. Added rather than
    // laid over, so it lifts the deck instead of tinting it.
    world.track(
      this.scene.add
        .image(center.x, bounds.y + 8, "horizonGlow")
        .setTint(accentColor(level.accent))
        .setOrigin(0.5, 0)
        .setDisplaySize(bounds.width - 30, 38)
        .setFlipY(true)
        .setBlendMode("ADD")
        .setAlpha(0.75)
        .setDepth(-6.95),
    );
    // Roof props stand on the roof line, not hovering above it.
    world.track(
      this.scene.add
        .image(bounds.x + 70, bounds.y, "roofVent")
        .setOrigin(0.5, 1)
        .setDepth(-6.8),
    );
    if (bounds.width > 400) {
      world.track(
        this.scene.add
          .image(rectRight(bounds) - 90, bounds.y, "waterTower")
          .setOrigin(0.5, 1)
          .setDepth(-6.9),
      );
    }
    if (rectBottom(bounds) >= level.streetY - 4) {
      world.track(
        this.scene.add
          .image(center.x, level.streetY - 66, "apartmentDoor")
          .setDepth(-3.1),
      );
    }

    // The slab hangs below the roof line rather than straddling it, so the
    // surface an actor stands on is exactly `bounds.y` — the line the level data
    // declares and the roof props are drawn against.
    const roof = world.platforms.create(
      center.x,
      bounds.y + PLATFORM_THICKNESS / 2,
      "roof",
    ) as Phaser.Physics.Arcade.Sprite;
    roof.setVisible(false);
    roof.displayWidth = bounds.width;
    roof.displayHeight = PLATFORM_THICKNESS;
    roof.refreshBody();
  }

  /**
   * A strung line and the two masts holding it up. The curve drawn here is the
   * same one `cablePointAt` samples anchors from, at four times the resolution,
   * so every catchable clamp sits on wire the player can see.
   */
  private buildCable(
    cable: Cable,
    level: LevelDefinition,
    world: LevelWorld,
  ): void {
    const clamps = cableSegments(cable);
    const line = world.track(this.scene.add.graphics().setDepth(DEPTH.cable));

    for (const tip of [cable.from, cable.to]) {
      const base = roofYAt(level.buildings, tip.x) ?? level.streetY;
      line.fillStyle(0x161f33, 1);
      line.fillRect(tip.x - 6, tip.y, 12, base - tip.y);
      line.fillStyle(0x5c6c94, 1);
      line.fillRect(tip.x - 14, tip.y - 6, 28, 8);
    }

    const curve = cablePoints(cable, clamps * 4);
    line.lineStyle(6, 0x0b1120, 0.85);
    strokeThrough(line, curve);
    line.lineStyle(2, 0xa8bde3, 0.9);
    strokeThrough(line, curve);

    // A bead on every clamp: this is where a web can actually bite.
    line.fillStyle(0xffe066, 0.92);
    for (const point of cablePoints(cable, clamps)) {
      line.fillCircle(point.x, point.y, 5);
    }
  }

  private buildPlatform(platform: Platform, world: LevelWorld): void {
    const { bounds } = platform;
    const home = rectCenter(bounds);

    if (platform.motion) {
      this.buildRail(platform.motion, home, world);
    }

    const deck = world.track(
      this.scene.add
        .tileSprite(
          home.x,
          home.y,
          bounds.width,
          bounds.height,
          platform.kind === "ledge" ? "glassLedge" : "platformDeck",
        )
        .setDepth(DEPTH.platform),
    );

    const body = world.platforms.create(
      home.x,
      bounds.y + PLATFORM_THICKNESS / 2,
      "roof",
    ) as Phaser.Physics.Arcade.Sprite;
    body.setVisible(false);
    body.displayWidth = bounds.width;
    body.displayHeight = PLATFORM_THICKNESS;
    body.refreshBody();

    if (platform.motion) {
      this.driveMotion(platform, platform.motion, deck, body, world);
    }
    if (platform.cycle) {
      this.driveCycle(platform.cycle, deck, body, world);
    }
  }

  /**
   * The rail a mover runs on. Drawn end to end and capped at both stops, so the
   * whole route — and where the deck will come to rest — is legible before the
   * hero commits to the jump.
   */
  private buildRail(
    motion: PlatformMotion,
    home: Vec2,
    world: LevelWorld,
  ): void {
    const rail = world.track(
      this.scene.add.graphics().setDepth(DEPTH.platform - 0.5),
    );
    const end = { x: home.x + motion.dx, y: home.y + motion.dy };

    rail.lineStyle(6, 0x0b1120, 0.75);
    rail.lineBetween(home.x, home.y, end.x, end.y);
    rail.lineStyle(2, 0x8397bd, 0.8);
    rail.lineBetween(home.x, home.y, end.x, end.y);

    rail.fillStyle(0xf7c948, 0.85);
    for (const stop of [home, end]) {
      rail.fillCircle(stop.x, stop.y, 6);
    }
  }

  private driveMotion(
    platform: Platform,
    motion: PlatformMotion,
    deck: Phaser.GameObjects.TileSprite,
    body: Phaser.Physics.Arcade.Sprite,
    world: LevelWorld,
  ): void {
    const home = rectCenter(platform.bounds);
    const period = motionPeriod(motion);
    const driver = { t: 0 };
    const half = platform.bounds.width / 2;
    // The deck's own last frame, so the carry hands riders exactly the travel
    // the deck just made rather than an estimate of it.
    let previous: Vec2 = { x: home.x, y: platform.bounds.y };

    world.tween({
      targets: driver,
      t: 1,
      duration: period,
      repeat: -1,
      ease: "Linear",
      onUpdate: () => {
        const offset = platformOffsetAt(motion, driver.t * period);
        const x = home.x + offset.x;
        const surfaceY = platform.bounds.y + offset.y;

        deck.setPosition(x, home.y + offset.y);
        body.setPosition(x, surfaceY + PLATFORM_THICKNESS / 2);
        body.refreshBody();

        carryRiders(
          arcadeRiders(this.scene),
          { left: x - half, right: x + half, top: surfaceY },
          { x: x - previous.x, y: surfaceY - previous.y },
        );
        previous = { x, y: surfaceY };
      },
    });
  }

  private driveCycle(
    cycle: PlatformCycle,
    deck: Phaser.GameObjects.TileSprite,
    body: Phaser.Physics.Arcade.Sprite,
    world: LevelWorld,
  ): void {
    const period = cyclePeriod(cycle);
    const driver = { t: 0 };

    world.tween({
      targets: driver,
      t: 1,
      duration: period,
      repeat: -1,
      ease: "Linear",
      onUpdate: () => {
        const phase = ledgePhaseAt(cycle, driver.t * period);
        deck.setAlpha(ledgeAlphaAt(phase));
        deck.setTint(phase.state === "warn" ? LEDGE_WARN_TINT : 0xffffff);
        setBodyEnabled(body, isLedgeSolid(phase.state));
      },
    });
  }

  private buildAmbience(level: LevelDefinition, world: LevelWorld): void {
    const flights = Math.max(2, Math.round(level.width / 1800));
    for (let index = 0; index < flights; index += 1) {
      const startX = 400 + (level.width / flights) * index;
      const bat = world.track(
        this.scene.add
          .image(startX, 240 + index * 62, "bat")
          .setAlpha(0.82)
          .setDepth(-2),
      );
      world.tween({
        targets: bat,
        x: startX + 520,
        y: `+=${index % 2 === 0 ? -70 : 54}`,
        flipX: true,
        yoyo: true,
        repeat: -1,
        duration: 5200 + index * 900,
        ease: "Sine.inOut",
      });
    }

    for (const [index, texture] of artKeys.npcs.entries()) {
      const x = 520 + (level.width / artKeys.npcs.length) * index;
      const npc = world.track(
        this.scene.add
          .image(x % level.width, level.streetY - 78, texture)
          .setScale(0.82)
          .setDepth(4),
      );
      npc.setFlipX(index % 3 === 0);
      world.tween({
        targets: npc,
        y: npc.y - (index % 2 === 0 ? 2 : 3),
        duration: 1200 + index * 140,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }
  }

  private buildGoal(level: LevelDefinition, world: LevelWorld): void {
    const goal = world.track(
      this.scene.add
        .image(level.goal.x, level.goal.y, "goalBeacon")
        .setDepth(DEPTH.goal)
        .setDisplaySize(level.goal.radius * 2, level.goal.radius * 2),
    );

    world.tween({
      targets: goal,
      angle: 360,
      duration: 9000,
      repeat: -1,
      ease: "Linear",
    });
    world.tween({
      targets: goal,
      alpha: 0.55,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }
}

/** A district accent — authored as CSS hex — as a Phaser tint. */
const accentColor = (accent: string): number => {
  const parsed = Number.parseInt(accent.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : 0x55e8f0;
};

/** One open polyline through `points`, so a sagging cable draws as one stroke. */
const strokeThrough = (
  graphics: Phaser.GameObjects.Graphics,
  points: readonly Vec2[],
): void => {
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.strokePath();
};

/**
 * Takes a platform body out of collision without destroying it. A disabled
 * static body is skipped by every collider already registered against the
 * group, which is how a glass panel stops being a floor and starts being one
 * again without the scene having to know it happened.
 */
const setBodyEnabled = (
  sprite: Phaser.Physics.Arcade.Sprite,
  enabled: boolean,
): void => {
  const body = sprite.body;
  if (body) {
    body.enable = enabled;
  }
};

/**
 * Every dynamic body in the world, viewed as something a deck could carry.
 *
 * Arcade bodies read their position back from their game object each frame, so
 * a carry has to move the object rather than the body, or the next `preUpdate`
 * would undo it.
 */
const arcadeRiders = function* (scene: Phaser.Scene): Generator<Rider> {
  for (const body of scene.physics.world.bodies.getArray()) {
    const rider = body.gameObject as Phaser.GameObjects.Sprite | undefined;
    if (!body.enable || !rider) {
      continue;
    }
    yield {
      bounds: {
        left: body.position.x,
        right: body.position.x + body.width,
        bottom: body.position.y + body.height,
      },
      moveBy: (delta: Vec2) => {
        rider.x += delta.x;
        rider.y += delta.y;
      },
    };
  }
};
