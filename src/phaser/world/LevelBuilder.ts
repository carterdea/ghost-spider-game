import type Phaser from "phaser";
import { artKeys } from "../../game/assets/manifest";
import type { Building, LevelDefinition } from "../../game/content/levels";
import {
  rectBottom,
  rectCenter,
  rectRight,
} from "../../game/simulation/physics/vector";

export interface LevelWorld {
  platforms: Phaser.Physics.Arcade.StaticGroup;
  goal: Phaser.GameObjects.Image;
  /** Everything built for this level, torn down on transition. */
  scenery: Phaser.GameObjects.GameObject[];
}

const DEPTH = {
  sky: -12,
  backdrop: -10,
  facade: -8,
  roofDecor: -7,
  street: -6,
  streetProp: -4,
  goal: -1,
} as const;

/** The street is a solid floor: fall off the roofs and you land on pavement. */
const STREET_FLOOR_THICKNESS = 64;

export class LevelBuilder {
  private readonly scene: Phaser.Scene;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public build(level: LevelDefinition): LevelWorld {
    const scenery: Phaser.GameObjects.GameObject[] = [];
    const track = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      scenery.push(object);
      return object;
    };

    this.scene.physics.world.setBounds(0, 0, level.width, level.height);
    this.buildSky(level, track);
    this.buildStreet(level, track);
    this.buildStreetProps(level, track);

    const platforms = this.scene.physics.add.staticGroup();
    this.buildStreetFloor(level, platforms);
    for (const building of level.buildings) {
      this.buildBuilding(building, level, platforms, track);
    }

    this.buildAmbience(level, track);
    const goal = this.buildGoal(level, track);

    return { platforms, goal, scenery };
  }

  private buildSky(
    level: LevelDefinition,
    track: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  ): void {
    track(
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
      track(
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

  private buildStreet(
    level: LevelDefinition,
    track: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  ): void {
    const below = level.height - level.streetY;
    track(
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
      track(
        this.scene.add
          .image(x, level.streetY + 120, "laneDash")
          .setDepth(DEPTH.streetProp),
      );
    }

    for (let x = 690; x < level.width; x += 1480) {
      for (let stripe = 0; stripe < 6; stripe += 1) {
        track(
          this.scene.add
            .image(x + stripe * 48, level.streetY + 118, "crosswalkStripe")
            .setDepth(DEPTH.streetProp),
        );
      }
    }
  }

  private buildStreetProps(
    level: LevelDefinition,
    track: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  ): void {
    const park = level.backdropKey === "environment-park";
    const curb = level.streetY;

    for (let x = 48; x < level.width; x += 96) {
      track(
        this.scene.add
          .image(x, curb, "sidewalkTile")
          .setOrigin(0.5, 0)
          .setDepth(DEPTH.streetProp),
      );
    }

    for (let x = 420; x < level.width; x += 1040) {
      track(this.scene.add.image(x, curb - 50, "stoop").setDepth(-3.4));
      track(
        this.scene.add.image(x + 260, curb - 60, "newsStand").setDepth(-3.3),
      );
      track(
        this.scene.add.image(x + 560, curb - 52, "foodCart").setDepth(-3.2),
      );
      track(
        this.scene.add.image(x + 830, curb - 62, "storefront").setDepth(-3.3),
      );
    }

    for (let x = 360; x < level.width; x += 620) {
      track(this.scene.add.image(x, curb - 32, "streetLight").setDepth(6));
    }

    for (let x = 520; x < level.width; x += 930) {
      track(this.scene.add.image(x, curb - 4, "trashCan").setDepth(5));
      track(this.scene.add.image(x + 190, curb, "hydrant").setDepth(5));
      track(
        this.scene.add
          .image(x + 330, curb - 4, park ? "parkTree" : "planter")
          .setDepth(5),
      );
      if (park) {
        track(this.scene.add.image(x + 470, curb - 8, "parkBench").setDepth(5));
      }
    }
  }

  private buildStreetFloor(
    level: LevelDefinition,
    platforms: Phaser.Physics.Arcade.StaticGroup,
  ): void {
    const floor = platforms.create(
      level.width / 2,
      level.streetY + STREET_FLOOR_THICKNESS / 2,
      "roof",
    ) as Phaser.Physics.Arcade.Sprite;
    floor.setVisible(false);
    floor.displayWidth = level.width;
    floor.displayHeight = STREET_FLOOR_THICKNESS;
    floor.refreshBody();
  }

  private buildBuilding(
    building: Building,
    level: LevelDefinition,
    platforms: Phaser.Physics.Arcade.StaticGroup,
    track: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  ): void {
    const { bounds } = building;
    const center = rectCenter(bounds);

    // A translucent silhouette: solid enough to read as geometry, sheer enough
    // that the painted skyline behind it still carries the scene.
    track(
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
    track(
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
    track(
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
    track(
      this.scene.add
        .rectangle(center.x, bounds.y + 3, bounds.width - 8, 16, 0x55e8f0, 0.9)
        .setDepth(-7.1),
    );
    // Roof props stand on the roof line, not hovering above it.
    track(
      this.scene.add
        .image(bounds.x + 70, bounds.y, "roofVent")
        .setOrigin(0.5, 1)
        .setDepth(-6.8),
    );
    if (bounds.width > 400) {
      track(
        this.scene.add
          .image(rectRight(bounds) - 90, bounds.y, "waterTower")
          .setOrigin(0.5, 1)
          .setDepth(-6.9),
      );
    }
    if (rectBottom(bounds) >= level.streetY - 4) {
      track(
        this.scene.add
          .image(center.x, level.streetY - 66, "apartmentDoor")
          .setDepth(-3.1),
      );
    }

    const roof = platforms.create(
      center.x,
      bounds.y,
      "roof",
    ) as Phaser.Physics.Arcade.Sprite;
    roof.setVisible(false);
    roof.displayWidth = bounds.width;
    roof.displayHeight = 20;
    roof.refreshBody();
  }

  private buildAmbience(
    level: LevelDefinition,
    track: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  ): void {
    const flights = Math.max(2, Math.round(level.width / 1800));
    for (let index = 0; index < flights; index += 1) {
      const startX = 400 + (level.width / flights) * index;
      const bat = track(
        this.scene.add
          .image(startX, 240 + index * 62, "bat")
          .setAlpha(0.82)
          .setDepth(-2),
      );
      this.scene.tweens.add({
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
      const npc = track(
        this.scene.add
          .image(x % level.width, level.streetY - 78, texture)
          .setScale(0.82)
          .setDepth(4),
      );
      npc.setFlipX(index % 3 === 0);
      this.scene.tweens.add({
        targets: npc,
        y: npc.y - (index % 2 === 0 ? 2 : 3),
        duration: 1200 + index * 140,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }
  }

  private buildGoal(
    level: LevelDefinition,
    track: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  ): Phaser.GameObjects.Image {
    const goal = track(
      this.scene.add
        .image(level.goal.x, level.goal.y, "goalBeacon")
        .setDepth(DEPTH.goal)
        .setDisplaySize(level.goal.radius * 2, level.goal.radius * 2),
    );

    this.scene.tweens.add({
      targets: goal,
      angle: 360,
      duration: 9000,
      repeat: -1,
      ease: "Linear",
    });
    this.scene.tweens.add({
      targets: goal,
      alpha: 0.55,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    return goal;
  }
}
