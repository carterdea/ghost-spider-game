import type Phaser from "phaser";
import { artKeys } from "../../game/assets/manifest";
import type { Building, LevelDefinition } from "../../game/content/levels";
import {
  rectBottom,
  rectCenter,
  rectRight,
} from "../../game/simulation/physics/vector";
import { LevelWorld } from "./LevelWorld";

const DEPTH = {
  sky: -12,
  backdrop: -10,
  facade: -8,
  roofDecor: -7,
  street: -6,
  streetProp: -4,
  goal: -1,
} as const;

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
    this.buildAmbience(level, world);
    this.buildGoal(level, world);

    return world;
  }

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

    // The backdrop art is one panorama; repeat it across wider levels.
    const panels = Math.max(1, Math.ceil(level.width / 1867));
    const panelWidth = level.width / panels;
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
          .setFlipX(panel % 2 === 1),
      );
    }
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
    world.track(
      this.scene.add
        .rectangle(center.x, bounds.y + 3, bounds.width - 8, 16, 0x55e8f0, 0.9)
        .setDepth(-7.1),
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
