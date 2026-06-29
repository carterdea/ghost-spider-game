import Phaser from "phaser";
import { colors } from "../../game/assets/manifest";
import { createEmptyActions, type ActionState } from "../../game/input/actions";
import { createKeyboardBindings, readActions } from "../../game/input/bindings";
import { damageEnemy, damagePlayer } from "../../game/simulation/systems/combat";
import { createInitialGameState, type EnemyState, type GadgetKind, type GameState, type WebAnchor } from "../../game/simulation/state";
import { Hud } from "../../ui/hud/hud";

interface EnemyView {
  state: EnemyState;
  sprite: Phaser.Physics.Arcade.Sprite;
  direction: number;
  nextShotAt: number;
  snaredUntil: number;
  streetLane: boolean;
}

interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
}

const STREET_MIN_Y = 1210;
const STREET_MAX_Y = 1400;
const STREET_ENTRY_Y = 1190;
const ENEMY_STREET_MAX_Y = STREET_MAX_Y - 34;
const FACADE_TOP_Y = 1016;
const SIDEWALK_Y = 1192;
const GADGETS: GadgetKind[] = ["web-net", "web-shield", "web-wings"];
const GENERATED_TEXTURES = [
  "player-idle-0",
  "player-idle-1",
  "player-run-0",
  "player-run-1",
  "player-glide",
  "robot-walk-0",
  "robot-walk-1",
  "gunner-walk-0",
  "gunner-walk-1",
  "webGlob",
  "webNet",
  "bullet",
  "building",
  "roof",
  "street",
  "sidewalkTile",
  "storefront",
  "apartmentDoor",
  "streetLight",
  "trashCan",
  "hydrant",
  "crosswalkStripe",
  "laneDash",
  "brickFacade",
] as const;

export class GameScene extends Phaser.Scene {
  private state: GameState = createInitialGameState();
  private hud?: Hud;
  private keys?: ReturnType<typeof createKeyboardBindings>;
  private previousActions: ActionState = createEmptyActions();
  private player?: Phaser.Physics.Arcade.Sprite;
  private platforms?: Phaser.Physics.Arcade.StaticGroup;
  private enemies: EnemyView[] = [];
  private bullets?: Phaser.Physics.Arcade.Group;
  private webGlobs?: Phaser.Physics.Arcade.Group;
  private webLines: Phaser.GameObjects.Line[] = [];
  private shieldView?: Phaser.GameObjects.Arc;
  private playerOnStreet = false;
  private attackCooldownUntil = 0;
  private gadgetCooldownUntil = 0;
  private hitCooldownUntil = 0;
  private nextWebSwapAt = 0;

  public constructor() {
    super("game");
  }

  public create(): void {
    this.state = createInitialGameState();
    this.enemies = [];
    this.previousActions = createEmptyActions();
    this.playerOnStreet = false;
    this.createTextures();
    this.createAnimations();
    this.createWorld();
    this.createPlayer();
    this.createEnemies();
    this.createCombat();
    this.createCamera();

    const hudRoot = document.getElementById("hud");
    if (!hudRoot) {
      throw new Error("Missing HUD root.");
    }

    this.hud = new Hud(hudRoot);
    this.keys = createKeyboardBindings(this);
    this.hud.render(this.state);
  }

  public update(time: number, delta: number): void {
    const player = this.requirePlayer();
    const actions = this.keys ? readActions(this.keys) : createEmptyActions();

    if (this.wasPressed(actions, "reset")) {
      this.scene.restart();
      return;
    }

    if (this.state.player.health === 0) {
      player.setVelocity(0, 0);
      this.hud?.render(this.state);
      this.previousActions = actions;
      return;
    }

    this.updateStreetMode(player, actions);
    this.updatePlayer(player, actions, delta);
    this.updateEnemies(time);
    this.updateWebLine(player);
    this.updateShield(player, time);
    this.hud?.render(this.state);
    this.previousActions = actions;
  }

  private createTextures(): void {
    this.clearGeneratedTextures();
    const graphics = this.add.graphics();

    this.createPlayerSprites(graphics);
    this.createRobotSprites(graphics);
    this.createGunnerSprites(graphics);

    graphics.fillStyle(colors.web);
    graphics.fillCircle(6, 6, 6);
    graphics.generateTexture("webGlob", 12, 12);
    graphics.clear();

    graphics.lineStyle(3, colors.web, 0.92);
    graphics.strokeEllipse(24, 16, 44, 28);
    graphics.lineBetween(4, 16, 44, 16);
    graphics.lineBetween(24, 2, 24, 30);
    graphics.generateTexture("webNet", 48, 32);
    graphics.clear();

    graphics.fillStyle(colors.danger);
    graphics.fillCircle(5, 5, 5);
    graphics.generateTexture("bullet", 10, 10);
    graphics.clear();

    graphics.fillStyle(0x20283d);
    graphics.fillRect(0, 0, 64, 64);
    graphics.lineStyle(2, 0x394463);
    graphics.strokeRect(0, 0, 64, 64);
    graphics.generateTexture("building", 64, 64);
    graphics.clear();

    graphics.fillStyle(0x303b59);
    graphics.fillRoundedRect(0, 0, 64, 18, 4);
    graphics.generateTexture("roof", 64, 18);
    graphics.clear();

    graphics.fillStyle(0x141823);
    graphics.fillRect(0, 0, 64, 64);
    graphics.generateTexture("street", 64, 64);
    graphics.clear();

    this.createStreetSprites(graphics);
    graphics.destroy();
  }

  private clearGeneratedTextures(): void {
    for (const key of GENERATED_TEXTURES) {
      if (this.textures.exists(key)) {
        this.textures.remove(key);
      }
    }
  }

  private createPlayerSprites(graphics: Phaser.GameObjects.Graphics): void {
    const frames = [
      { key: "player-idle-0", arm: -1, leg: 0, hood: 0, reach: 0 },
      { key: "player-idle-1", arm: 1, leg: -1, hood: 1, reach: 0 },
      { key: "player-run-0", arm: -7, leg: -7, hood: 0, reach: -2 },
      { key: "player-run-1", arm: 7, leg: 7, hood: 1, reach: 2 },
      { key: "player-glide", arm: 0, leg: 0, hood: -1, reach: 10 },
    ];

    for (const frame of frames) {
      graphics.clear();
      const hoodY = 8 + frame.hood;
      const leftArmX = 25 - frame.arm - frame.reach;
      const rightArmX = 71 + frame.arm + frame.reach;

      graphics.fillStyle(0x0a0c12, 1);
      graphics.fillRoundedRect(35, 61, 28, 44, 13);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillTriangle(30, 57, 48, 82, 66, 57);
      graphics.fillStyle(0xe8edf7, 1);
      graphics.fillTriangle(32, 60, 47, 78, 39, 66);
      graphics.fillStyle(0x11131d, 1);
      graphics.fillTriangle(48, 82, 66, 58, 63, 105);
      graphics.fillStyle(0xd2268d, 1);
      graphics.fillTriangle(44, 66, 49, 84, 47, 102);
      graphics.lineStyle(2, colors.balletTeal, 0.85);
      graphics.lineBetween(46, 69, 48, 96);

      graphics.lineStyle(9, 0xffffff, 1);
      graphics.lineBetween(35, 61, leftArmX, 77 + frame.arm);
      graphics.lineBetween(62, 61, rightArmX, 77 - frame.arm);
      graphics.lineStyle(5, 0xd2268d, 1);
      graphics.lineBetween(leftArmX, 77 + frame.arm, leftArmX - 7, 94 + frame.arm);
      graphics.lineBetween(rightArmX, 77 - frame.arm, rightArmX + 7, 94 - frame.arm);
      graphics.lineStyle(2, colors.balletTeal, 0.95);
      graphics.lineBetween(leftArmX - 1, 80 + frame.arm, leftArmX - 7, 93 + frame.arm);
      graphics.lineBetween(leftArmX + 3, 82 + frame.arm, leftArmX - 2, 96 + frame.arm);
      graphics.lineBetween(rightArmX + 1, 80 - frame.arm, rightArmX + 7, 93 - frame.arm);
      graphics.lineBetween(rightArmX - 3, 82 - frame.arm, rightArmX + 2, 96 - frame.arm);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillEllipse(leftArmX - 9, 98 + frame.arm, 16, 9);
      graphics.fillEllipse(rightArmX + 9, 98 - frame.arm, 16, 9);

      graphics.lineStyle(10, 0x0c0f17, 1);
      graphics.lineBetween(43, 103, 31, 126 + frame.leg);
      graphics.lineBetween(55, 103, 69, 126 - frame.leg);
      graphics.lineStyle(4, 0x262c3d, 0.9);
      graphics.lineBetween(44, 105, 34, 122 + frame.leg);
      graphics.lineBetween(56, 105, 66, 122 - frame.leg);
      graphics.fillStyle(colors.balletTeal, 1);
      graphics.fillEllipse(28, 131 + frame.leg, 27, 10);
      graphics.fillEllipse(72, 131 - frame.leg, 27, 10);
      graphics.fillStyle(0xf2ffff, 1);
      graphics.fillEllipse(30, 127 + frame.leg, 17, 5);
      graphics.fillEllipse(70, 127 - frame.leg, 17, 5);

      graphics.fillStyle(0xd2268d, 1);
      graphics.fillTriangle(18, hoodY + 39, 35, hoodY + 54, 8, hoodY + 58);
      graphics.fillTriangle(78, hoodY + 39, 61, hoodY + 54, 90, hoodY + 58);
      graphics.lineStyle(2, colors.balletTeal, 0.95);
      graphics.lineBetween(18, hoodY + 43, 34, hoodY + 53);
      graphics.lineBetween(25, hoodY + 42, 29, hoodY + 58);
      graphics.lineBetween(78, hoodY + 43, 62, hoodY + 53);
      graphics.lineBetween(71, hoodY + 42, 67, hoodY + 58);

      graphics.fillStyle(0xffffff, 1);
      graphics.fillTriangle(21, hoodY + 10, 48, hoodY - 2, 76, hoodY + 10);
      graphics.fillRoundedRect(20, hoodY + 9, 56, 43, 18);
      graphics.fillTriangle(21, hoodY + 22, 8, hoodY + 56, 38, hoodY + 49);
      graphics.fillTriangle(75, hoodY + 22, 88, hoodY + 56, 58, hoodY + 49);
      graphics.fillStyle(0xe6ebf5, 1);
      graphics.fillTriangle(23, hoodY + 17, 39, hoodY + 10, 27, hoodY + 47);
      graphics.fillTriangle(73, hoodY + 17, 57, hoodY + 10, 69, hoodY + 47);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillEllipse(48, hoodY + 36, 36, 31);
      graphics.fillStyle(0xd2268d, 1);
      graphics.fillTriangle(33, hoodY + 35, 46, hoodY + 28, 43, hoodY + 45);
      graphics.fillTriangle(63, hoodY + 35, 50, hoodY + 28, 53, hoodY + 45);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillTriangle(36, hoodY + 35, 43, hoodY + 31, 41, hoodY + 41);
      graphics.fillTriangle(60, hoodY + 35, 53, hoodY + 31, 55, hoodY + 41);
      graphics.lineStyle(2, 0xc7ccd8, 0.9);
      graphics.lineBetween(30, hoodY + 22, 22, hoodY + 50);
      graphics.lineBetween(66, hoodY + 22, 74, hoodY + 50);

      graphics.generateTexture(frame.key, 96, 136);
    }

    graphics.clear();
  }

  private createRobotSprites(graphics: Phaser.GameObjects.Graphics): void {
    for (const [index, lean] of [0, 2].entries()) {
      graphics.clear();
      graphics.fillStyle(0x4c566f);
      graphics.fillRoundedRect(12 + lean, 18, 38, 40, 5);
      graphics.fillStyle(colors.robot);
      graphics.fillRoundedRect(15 + lean, 8, 32, 24, 4);
      graphics.fillStyle(0xdce3f2);
      graphics.fillRect(21 + lean, 17, 7, 6);
      graphics.fillRect(34 + lean, 17, 7, 6);
      graphics.fillStyle(colors.danger);
      graphics.fillRect(18 + lean, 36, 26, 5);
      graphics.lineStyle(6, 0x707b92, 1);
      graphics.lineBetween(15 + lean, 43, 5, 59 - lean);
      graphics.lineBetween(48 + lean, 43, 59, 59 + lean);
      graphics.lineBetween(22 + lean, 58, 18, 73 + lean);
      graphics.lineBetween(40 + lean, 58, 45, 73 - lean);
      graphics.generateTexture(`robot-walk-${index}`, 64, 82);
    }

    graphics.clear();
  }

  private createGunnerSprites(graphics: Phaser.GameObjects.Graphics): void {
    for (const [index, coat] of [0, 3].entries()) {
      graphics.clear();
      graphics.fillStyle(0x0d1018);
      graphics.fillRoundedRect(13, 7, 36, 56, 16);
      graphics.fillStyle(colors.gunner);
      graphics.fillTriangle(13, 30, 5, 75 + coat, 31, 60);
      graphics.fillTriangle(49, 30, 58, 75 - coat, 31, 60);
      graphics.fillStyle(0xf3f3ff);
      graphics.fillCircle(31, 22, 8);
      graphics.fillStyle(0x242a3b);
      graphics.fillRect(31, 39, 30, 7);
      graphics.fillStyle(0x12151f);
      graphics.fillRect(55, 38, 12, 5);
      graphics.fillStyle(colors.danger);
      graphics.fillCircle(66, 40, 3);
      graphics.lineStyle(5, 0x2a3143, 1);
      graphics.lineBetween(23, 61, 18, 78 - coat);
      graphics.lineBetween(39, 61, 45, 78 + coat);
      graphics.generateTexture(`gunner-walk-${index}`, 72, 86);
    }

    graphics.clear();
  }

  private createStreetSprites(graphics: Phaser.GameObjects.Graphics): void {
    graphics.clear();
    graphics.fillStyle(0x283149);
    graphics.fillRect(0, 0, 96, 40);
    graphics.lineStyle(2, 0x3f4a67, 0.9);
    graphics.lineBetween(0, 2, 96, 2);
    graphics.lineBetween(0, 38, 96, 38);
    graphics.lineStyle(1, 0x52607d, 0.6);
    for (let x = 0; x <= 96; x += 24) {
      graphics.lineBetween(x, 0, x, 40);
    }
    graphics.generateTexture("sidewalkTile", 96, 40);
    graphics.clear();

    graphics.fillStyle(0x1a2236);
    graphics.fillRect(0, 0, 192, 176);
    graphics.fillStyle(0x26314c);
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        graphics.fillRect(column * 24 + (row % 2) * 12, row * 24, 20, 18);
      }
    }
    graphics.fillStyle(0x101522);
    graphics.fillRect(0, 158, 192, 18);
    graphics.generateTexture("brickFacade", 192, 176);
    graphics.clear();

    graphics.fillStyle(0x192033);
    graphics.fillRoundedRect(0, 0, 176, 124, 4);
    graphics.fillStyle(0x2b3858);
    graphics.fillRect(8, 12, 160, 92);
    graphics.fillStyle(0xf2ce6b, 0.88);
    graphics.fillRect(18, 22, 60, 34);
    graphics.fillRect(98, 22, 52, 34);
    graphics.fillStyle(0x68d7ff, 0.72);
    graphics.fillRect(18, 64, 132, 24);
    graphics.lineStyle(4, 0x0d111c, 1);
    graphics.strokeRect(18, 22, 60, 34);
    graphics.strokeRect(98, 22, 52, 34);
    graphics.strokeRect(18, 64, 132, 24);
    graphics.fillStyle(0xe85f9a);
    graphics.fillRect(0, 0, 176, 12);
    graphics.fillStyle(0x111827);
    graphics.fillRect(0, 104, 176, 20);
    graphics.generateTexture("storefront", 176, 124);
    graphics.clear();

    graphics.fillStyle(0x151b2b);
    graphics.fillRoundedRect(0, 0, 96, 132, 4);
    graphics.fillStyle(0x2d3651);
    graphics.fillRect(12, 12, 72, 112);
    graphics.fillStyle(0x101522);
    graphics.fillRoundedRect(28, 42, 40, 82, 8);
    graphics.fillStyle(0xd9b66f);
    graphics.fillCircle(60, 84, 3);
    graphics.lineStyle(3, 0x65708c, 1);
    graphics.strokeRoundedRect(28, 42, 40, 82, 8);
    graphics.fillStyle(0xf6d982, 0.8);
    graphics.fillRect(24, 16, 48, 14);
    graphics.generateTexture("apartmentDoor", 96, 132);
    graphics.clear();

    graphics.fillStyle(0x2c344a);
    graphics.fillRect(18, 24, 8, 112);
    graphics.fillStyle(0x4b5877);
    graphics.fillRect(10, 132, 24, 8);
    graphics.fillStyle(0xf7d875);
    graphics.fillCircle(22, 18, 18);
    graphics.fillStyle(0xfff3a3, 0.36);
    graphics.fillCircle(22, 18, 30);
    graphics.lineStyle(3, 0x1b2132, 1);
    graphics.strokeCircle(22, 18, 18);
    graphics.generateTexture("streetLight", 64, 148);
    graphics.clear();

    graphics.fillStyle(0x46516a);
    graphics.fillRoundedRect(8, 14, 34, 46, 6);
    graphics.fillStyle(0x5d6a87);
    graphics.fillRect(5, 8, 40, 10);
    graphics.fillStyle(0x202638);
    graphics.fillRect(16, 24, 18, 4);
    graphics.fillRect(16, 36, 18, 4);
    graphics.generateTexture("trashCan", 52, 68);
    graphics.clear();

    graphics.fillStyle(0xd94545);
    graphics.fillRoundedRect(16, 18, 22, 38, 8);
    graphics.fillStyle(0xf05a5a);
    graphics.fillCircle(27, 16, 11);
    graphics.fillStyle(0x7c1d1d);
    graphics.fillRect(8, 36, 38, 8);
    graphics.fillStyle(0x242a36);
    graphics.fillRect(18, 56, 18, 8);
    graphics.generateTexture("hydrant", 56, 70);
    graphics.clear();

    graphics.fillStyle(0xe7edf7, 0.72);
    graphics.fillRect(0, 0, 34, 130);
    graphics.generateTexture("crosswalkStripe", 34, 130);
    graphics.clear();

    graphics.fillStyle(0xe8c85e, 0.74);
    graphics.fillRoundedRect(0, 0, 92, 8, 4);
    graphics.generateTexture("laneDash", 92, 8);
    graphics.clear();
  }

  private createAnimations(): void {
    this.anims.remove("player-idle");
    this.anims.remove("player-run");
    this.anims.remove("robot-walk");
    this.anims.remove("gunner-walk");

    this.anims.create({
      key: "player-idle",
      frames: [{ key: "player-idle-0" }, { key: "player-idle-1" }],
      frameRate: 4,
      repeat: -1,
    });
    this.anims.create({
      key: "player-run",
      frames: [{ key: "player-run-0" }, { key: "player-run-1" }],
      frameRate: 9,
      repeat: -1,
    });
    this.anims.create({
      key: "robot-walk",
      frames: [{ key: "robot-walk-0" }, { key: "robot-walk-1" }],
      frameRate: 5,
      repeat: -1,
    });
    this.anims.create({
      key: "gunner-walk",
      frames: [{ key: "gunner-walk-0" }, { key: "gunner-walk-1" }],
      frameRate: 4,
      repeat: -1,
    });
  }

  private createWorld(): void {
    this.physics.world.setBounds(0, 0, this.state.world.width, this.state.world.height);
    this.add.rectangle(2800, 800, this.state.world.width, this.state.world.height, 0x10172b).setDepth(-10);
    this.createReferenceStyleSkyline();
    this.add.rectangle(2800, 1320, this.state.world.width, 330, 0x0c0f16).setDepth(-8);
    this.add.rectangle(2800, STREET_MIN_Y, this.state.world.width, 4, 0x44516f, 0.35).setDepth(-7);
    this.add.rectangle(2800, STREET_MAX_Y, this.state.world.width, 4, 0x44516f, 0.25).setDepth(-7);
    this.createStreetDetails();

    this.platforms = this.physics.add.staticGroup();
    const buildings: Building[] = [
      { x: 270, y: 920, w: 540, h: 980 },
      { x: 960, y: 760, w: 520, h: 1300 },
      { x: 1640, y: 1030, w: 440, h: 760 },
      { x: 2360, y: 850, w: 560, h: 1120 },
      { x: 3100, y: 700, w: 540, h: 1420 },
      { x: 3860, y: 1080, w: 620, h: 700 },
      { x: 4660, y: 820, w: 620, h: 1220 },
      { x: 5360, y: 990, w: 420, h: 860 },
    ];

    for (const building of buildings) {
      this.add.image(building.x, building.y, "building").setDisplaySize(building.w, building.h).setDepth(-9);
      this.paintWindows(building);
      this.createRoofPlatform(building);
    }
  }

  private createReferenceStyleSkyline(): void {
    const backBlocks = [
      { x: 180, y: 610, w: 420, h: 980, color: 0x17244a },
      { x: 690, y: 560, w: 620, h: 1060, color: 0x1b315c },
      { x: 1380, y: 610, w: 560, h: 980, color: 0x182a53 },
      { x: 2060, y: 545, w: 690, h: 1110, color: 0x1c3561 },
      { x: 2860, y: 600, w: 620, h: 1000, color: 0x17284f },
      { x: 3620, y: 555, w: 720, h: 1090, color: 0x1d3763 },
      { x: 4460, y: 605, w: 660, h: 990, color: 0x182d56 },
      { x: 5220, y: 570, w: 600, h: 1060, color: 0x1a315d },
    ];

    for (const block of backBlocks) {
      this.add.rectangle(block.x, block.y, block.w, block.h, block.color).setDepth(-9.7);
      this.add.rectangle(block.x, block.y - block.h / 2 + 260, block.w - 52, 16, 0x1592aa, 0.68).setDepth(-9.55);
      this.add.rectangle(block.x, block.y + block.h / 2 - 250, block.w - 72, 12, 0x24c6d5, 0.55).setDepth(-9.55);
      this.paintBackdropWindows(block.x, block.y, block.w, block.h, -9.5);
    }

    const midBlocks = [
      { x: 420, y: 760, w: 390, h: 680, color: 0x203d66 },
      { x: 1080, y: 745, w: 470, h: 710, color: 0x1c365f },
      { x: 1780, y: 790, w: 430, h: 620, color: 0x24456b },
      { x: 2480, y: 745, w: 510, h: 710, color: 0x1d3b65 },
      { x: 3180, y: 780, w: 470, h: 640, color: 0x24466e },
      { x: 3920, y: 742, w: 540, h: 716, color: 0x1c3864 },
      { x: 4680, y: 780, w: 470, h: 640, color: 0x25486f },
    ];

    for (const block of midBlocks) {
      this.add.rectangle(block.x, block.y, block.w, block.h, block.color).setDepth(-9.25);
      this.add.rectangle(block.x, block.y + block.h / 2 - 98, block.w - 44, 14, 0x18a9c6, 0.74).setDepth(-9.05);
      this.paintBackdropWindows(block.x, block.y, block.w, block.h, -9.02);
    }

    this.add.rectangle(5180, 350, 360, 210, 0xf3fbff, 0.94).setDepth(-8.95);
    this.add.rectangle(5180, 350, 392, 242, 0x72f1ff, 0.18).setDepth(-8.96);
    this.add.rectangle(5180, 350, 400, 250).setStrokeStyle(8, 0xc7f7ff, 0.82).setDepth(-8.94);

    this.add.polygon(3120, 1085, [
      -1700, 160,
      1850, -40,
      1970, 60,
      -1600, 260,
    ], 0x4d2b6d, 0.92).setDepth(-7.6);
    this.add.polygon(3120, 1120, [
      -1680, 132,
      1810, -62,
      1840, -30,
      -1660, 166,
    ], 0xb744a2, 0.62).setDepth(-7.55);
  }

  private paintBackdropWindows(x: number, y: number, width: number, height: number, depth: number): void {
    const left = x - width / 2 + 46;
    const top = y - height / 2 + 54;
    const columns = Math.max(3, Math.floor((width - 76) / 72));
    const rows = Math.max(4, Math.floor((height - 100) / 86));
    const windowColors = [0xf6d971, 0xb8efff, 0x65d4e5, 0x51345d, 0x0f1835];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const seed = (row * 7 + column * 11 + Math.floor(x / 100)) % windowColors.length;
        const lit = (row + column + Math.floor(x / 80)) % 4 !== 0;
        const color = lit ? windowColors[seed] : 0x101934;
        const windowWidth = 18 + ((row + column) % 3) * 8;
        const windowHeight = 34 + (column % 2) * 18;
        this.add.rectangle(left + column * 72, top + row * 86, windowWidth, windowHeight, color, lit ? 0.88 : 0.76).setDepth(depth);

        if (lit && (row + column) % 5 === 0) {
          this.add.rectangle(left + column * 72 + 7, top + row * 86, 4, windowHeight, 0x1a2242, 0.9).setDepth(depth + 0.01);
        }
      }
    }
  }

  private createStreetDetails(): void {
    for (let x = 96; x < this.state.world.width; x += 192) {
      this.add.image(x, FACADE_TOP_Y, "brickFacade").setOrigin(0.5, 0).setDepth(-6.5);
    }

    for (let x = 48; x < this.state.world.width; x += 96) {
      this.add.image(x, SIDEWALK_Y, "sidewalkTile").setOrigin(0.5, 0).setDepth(-4);
    }

    for (let x = 120; x < this.state.world.width; x += 420) {
      this.add.image(x, 1335, "laneDash").setDepth(-5);
    }

    for (let x = 690; x < this.state.world.width; x += 1480) {
      for (let stripe = 0; stripe < 6; stripe += 1) {
        this.add.image(x + stripe * 48, 1334, "crosswalkStripe").setDepth(-4);
      }
    }

    const storefronts = [
      { x: 220, texture: "storefront", height: 124 },
      { x: 600, texture: "apartmentDoor", height: 132 },
      { x: 1120, texture: "storefront", height: 124 },
      { x: 1500, texture: "apartmentDoor", height: 132 },
      { x: 2050, texture: "storefront", height: 124 },
      { x: 2530, texture: "apartmentDoor", height: 132 },
      { x: 3230, texture: "storefront", height: 124 },
      { x: 3720, texture: "apartmentDoor", height: 132 },
      { x: 4380, texture: "storefront", height: 124 },
      { x: 4930, texture: "apartmentDoor", height: 132 },
    ] as const;

    for (const detail of storefronts) {
      this.add.image(detail.x, SIDEWALK_Y - detail.height / 2, detail.texture).setDepth(-3.5);
    }

    for (let x = 360; x < this.state.world.width; x += 620) {
      this.add.image(x, 1160, "streetLight").setDepth(1180);
    }

    for (let x = 520; x < this.state.world.width; x += 930) {
      this.add.image(x, 1188, "trashCan").setDepth(1200);
      this.add.image(x + 190, 1192, "hydrant").setDepth(1200);
    }
  }

  private createRoofPlatform(building: Building): void {
    const roofY = building.y - building.h / 2 + 10;
    const roof = this.requirePlatforms().create(building.x, roofY, "roof") as Phaser.Physics.Arcade.Sprite;
    roof.displayWidth = building.w - 30;
    roof.displayHeight = 18;
    roof.refreshBody();
  }

  private paintWindows({ x, y, w, h }: Building): void {
    const top = y - h / 2 + 58;
    const left = x - w / 2 + 38;
    const rows = Math.max(2, Math.floor((h - 120) / 72));
    const columns = Math.max(2, Math.floor((w - 80) / 64));

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const lit = (row + column) % 3 !== 0;
        this.add.rectangle(left + column * 64, top + row * 72, 20, 28, lit ? 0xf9d37a : 0x26314d, lit ? 0.82 : 0.5).setDepth(-8.8);
      }
    }
  }

  private createPlayer(): void {
    const player = this.physics.add.sprite(120, 600, "player-idle-0");
    player.setCollideWorldBounds(true);
    player.setDragX(880);
    player.setMaxVelocity(760, 980);
    player.body?.setSize(38, 96).setOffset(29, 30);
    player.play("player-idle");
    this.physics.add.collider(player, this.requirePlatforms());
    this.player = player;
  }

  private createEnemies(): void {
    const placements: Record<string, { x: number; y: number; streetLane: boolean }> = {
      "robot-roof-1": { x: 960, y: 80, streetLane: false },
      "gunner-street-1": { x: 1920, y: 1330, streetLane: true },
      "robot-roof-2": { x: 2920, y: -5, streetLane: false },
      "robot-street-1": { x: 3600, y: 1348, streetLane: true },
      "gunner-roof-1": { x: 4660, y: 235, streetLane: false },
    };

    for (const enemyState of this.state.enemies) {
      const placement = placements[enemyState.id];
      const texture = enemyState.kind === "gunner" ? "gunner-walk-0" : "robot-walk-0";
      const sprite = this.physics.add.sprite(placement.x, placement.y, texture);
      sprite.setCollideWorldBounds(true);
      sprite.setDragX(600);
      sprite.setMaxVelocity(180, 900);
      sprite.body?.setSize(enemyState.kind === "gunner" ? 34 : 38, enemyState.kind === "gunner" ? 72 : 70).setOffset(enemyState.kind === "gunner" ? 18 : 13, 10);
      sprite.body?.setAllowGravity(!placement.streetLane);
      sprite.play(enemyState.kind === "gunner" ? "gunner-walk" : "robot-walk");

      if (placement.streetLane) {
        sprite.y = Phaser.Math.Clamp(sprite.y, STREET_MIN_Y, ENEMY_STREET_MAX_Y);
        sprite.setDepth(sprite.y);
      } else {
        this.physics.add.collider(sprite, this.requirePlatforms());
      }

      this.enemies.push({ state: enemyState, sprite, direction: 1, nextShotAt: 0, snaredUntil: 0, streetLane: placement.streetLane });
    }
  }

  private createCombat(): void {
    this.bullets = this.physics.add.group({ allowGravity: false });
    this.webGlobs = this.physics.add.group({ allowGravity: false });

    this.physics.add.overlap(this.requirePlayer(), this.bullets, (_, bulletObject) => {
      const bullet = bulletObject as Phaser.Physics.Arcade.Sprite;
      bullet.destroy();

      if (this.time.now < this.state.player.shieldUntil) {
        this.state.player.message = "Web shield caught the shot.";
        return;
      }

      damagePlayer(this.state, 12, "Hit by a skyline shot.");
    });

    for (const enemy of this.enemies) {
      this.physics.add.overlap(this.requirePlayer(), enemy.sprite, () => {
        if (this.time.now < this.hitCooldownUntil || this.time.now < enemy.snaredUntil) {
          return;
        }
        this.hitCooldownUntil = this.time.now + 700;
        damagePlayer(this.state, enemy.state.damage, enemy.state.kind === "gunner" ? "Close-range blast." : "Robot tackle.");
      });

      this.physics.add.overlap(this.requireWebGlobs(), enemy.sprite, (globObject) => {
        const glob = globObject as Phaser.Physics.Arcade.Sprite;
        const power = glob.getData("power") as "glob" | "net";
        glob.destroy();

        if (power === "net") {
          enemy.snaredUntil = this.time.now + 1800;
          enemy.sprite.setTint(colors.web);
          this.time.delayedCall(1800, () => enemy.sprite.active && enemy.sprite.clearTint());
        }

        const defeated = damageEnemy(this.state, enemy.state, power === "net" ? 12 : 16);
        if (defeated) {
          enemy.sprite.destroy();
        }
      });
    }
  }

  private createCamera(): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.state.world.width, this.state.world.height);
    camera.startFollow(this.requirePlayer(), true, 0.08, 0.08);
    camera.setDeadzone(210, 150);
  }

  private updateStreetMode(player: Phaser.Physics.Arcade.Sprite, actions: ActionState): void {
    const body = player.body;
    if (!body || this.state.player.webAttached) {
      return;
    }

    if (!this.playerOnStreet && player.y >= STREET_ENTRY_Y && body.velocity.y >= 0) {
      this.playerOnStreet = true;
      this.setPlayerGravity(player, false);
      player.y = Phaser.Math.Clamp(player.y, STREET_MIN_Y, STREET_MAX_Y);
      player.setVelocityY(0);
      this.state.player.message = "Street level: move up and down to dodge.";
    }

    if (!this.playerOnStreet) {
      return;
    }

    if (this.wasPressed(actions, "jump")) {
      this.playerOnStreet = false;
      this.setPlayerGravity(player, true);
      player.setVelocityY(-560);
      return;
    }

    const laneMove = Number(actions.moveDown) - Number(actions.moveUp);
    player.setVelocityY(laneMove * 260);
    player.y = Phaser.Math.Clamp(player.y, STREET_MIN_Y, STREET_MAX_Y);
    player.setDepth(player.y);
  }

  private updatePlayer(player: Phaser.Physics.Arcade.Sprite, actions: ActionState, delta: number): void {
    const grounded = this.playerOnStreet || player.body?.blocked.down === true;
    const speed = grounded ? 430 : 340;
    const move = Number(actions.moveRight) - Number(actions.moveLeft);

    if (move !== 0) {
      player.setAccelerationX(move * 1400);
      player.setFlipX(move < 0);
    } else {
      player.setAccelerationX(0);
    }

    if (!this.playerOnStreet && grounded && this.wasPressed(actions, "jump")) {
      player.setVelocityY(-560);
    }

    if (this.wasPressed(actions, "cycleGadget")) {
      this.cycleGadget();
    }

    if (actions.web && !this.state.player.webAttached) {
      this.playerOnStreet = false;
      this.setPlayerGravity(player, true);
      this.attachWeb(player);
    }

    if (!actions.web && this.state.player.webAttached) {
      this.detachWeb("Released the web.");
    }

    if (this.state.player.webAttached && this.state.player.webAnchors.length > 0) {
      this.updateSwingAnchors(player, actions);
      this.applySwing(player, this.state.player.webAnchors, actions, delta);
    }

    if (actions.glide && !this.playerOnStreet && !grounded && player.body && player.body.velocity.y > 80) {
      player.setVelocityY(Math.min(player.body.velocity.y, 170));
      player.setTexture("player-glide");
      this.state.player.message = "Web-wings slowed the fall.";
    } else if (Math.abs(player.body?.velocity.x ?? 0) > 80) {
      player.play("player-run", true);
    } else if (!actions.glide) {
      player.play("player-idle", true);
    }

    if (this.wasPressed(actions, "attack") && this.time.now >= this.attackCooldownUntil) {
      this.attack(player);
    }

    if (this.wasPressed(actions, "gadget") && this.time.now >= this.gadgetCooldownUntil) {
      this.useGadget(player);
    }

    player.setVelocityX(Phaser.Math.Clamp(player.body?.velocity.x ?? 0, -speed * 1.45, speed * 1.45));
  }

  private attachWeb(player: Phaser.Physics.Arcade.Sprite): void {
    const anchors = this.findWebAnchors(player.x, player.y);

    this.state.player.webAttached = true;
    this.state.player.webAnchors = anchors;
    this.state.player.message = anchors.length > 1 ? "Two web-lines attached." : "Web-line attached.";
    this.nextWebSwapAt = this.time.now + 360;
    player.setGravityY(-220);
  }

  private detachWeb(message: string): void {
    if (!this.state.player.webAttached) {
      return;
    }

    this.state.player.webAttached = false;
    this.state.player.webAnchors = [];
    this.state.player.message = message;
    this.nextWebSwapAt = 0;
    this.requirePlayer().setGravityY(0);
    this.clearWebLines();
  }

  private updateSwingAnchors(player: Phaser.Physics.Arcade.Sprite, actions: ActionState): void {
    if (this.time.now < this.nextWebSwapAt) {
      return;
    }

    const anchors = this.state.player.webAnchors;
    const travelDirection = this.getSwingDirection(player, actions);
    const trailingAnchor = anchors.find((anchor) => (anchor.x - player.x) * travelDirection < -110);
    const overextendedAnchor = anchors.find((anchor) => Phaser.Math.Distance.Between(player.x, player.y, anchor.x, anchor.y) > 600);

    if (!trailingAnchor && !overextendedAnchor && anchors.length >= 2) {
      return;
    }

    const newAnchor = this.findForwardWebAnchor(player.x, player.y, travelDirection, anchors);
    this.state.player.webAnchors = [...anchors.filter((anchor) => anchor !== (trailingAnchor ?? overextendedAnchor)), newAnchor].slice(-2);
    this.nextWebSwapAt = this.time.now + 420;
    this.state.player.message = "New web-line caught.";
  }

  private applySwing(player: Phaser.Physics.Arcade.Sprite, anchors: WebAnchor[], actions: ActionState, delta: number): void {
    const body = player.body;
    if (!body) {
      return;
    }

    const dt = delta / 1000;
    const maxLength = 520;
    const spring = 640 / anchors.length;

    for (const anchor of anchors) {
      const distance = Phaser.Math.Distance.Between(player.x, player.y, anchor.x, anchor.y);
      const angle = Phaser.Math.Angle.Between(player.x, player.y, anchor.x, anchor.y);
      const stretch = Math.max(0, distance - 140) / maxLength;

      body.velocity.x += Math.cos(angle) * spring * stretch * dt;
      body.velocity.y += Math.sin(angle) * spring * stretch * dt;

      if (distance > maxLength) {
        const correction = (distance - maxLength) * 0.18;
        player.x += Math.cos(angle) * correction;
        player.y += Math.sin(angle) * correction;
      }
    }

    const moveAssist = Number(actions.moveRight) - Number(actions.moveLeft);
    body.velocity.x += moveAssist * 260 * dt;
    body.velocity.x *= 0.995;
  }

  private findWebAnchors(x: number, y: number): WebAnchor[] {
    const candidates = [
      { x: 520, y: 430 },
      { x: 1180, y: 120 },
      { x: 1860, y: 650 },
      { x: 2600, y: 300 },
      { x: 3360, y: 30 },
      { x: 4100, y: 730 },
      { x: 5020, y: 210 },
    ];

    const nearbyAnchors = candidates
      .filter((anchor) => anchor.y < y - 80 && Phaser.Math.Distance.Between(x, y, anchor.x, anchor.y) < 760)
      .sort((a, b) => Phaser.Math.Distance.Between(x, y, a.x, a.y) - Phaser.Math.Distance.Between(x, y, b.x, b.y))
      .slice(0, 2);

    if (nearbyAnchors.length >= 2) {
      return nearbyAnchors;
    }

    const facing = this.requirePlayer().flipX ? -1 : 1;
    const primary = nearbyAnchors[0] ?? {
      x: Phaser.Math.Clamp(x + facing * 430, 120, this.state.world.width - 120),
      y: Math.max(60, y - 470),
    };
    const secondaryDirection = primary.x < x ? 1 : -1;
    const secondary = {
      x: Phaser.Math.Clamp(primary.x + secondaryDirection * 320, 120, this.state.world.width - 120),
      y: Math.max(60, primary.y + 40),
    };

    return [primary, secondary];
  }

  private findForwardWebAnchor(x: number, y: number, direction: number, currentAnchors: WebAnchor[]): WebAnchor {
    const candidates = [
      { x: 520, y: 430 },
      { x: 1180, y: 120 },
      { x: 1860, y: 650 },
      { x: 2600, y: 300 },
      { x: 3360, y: 30 },
      { x: 4100, y: 730 },
      { x: 5020, y: 210 },
    ];
    const existing = new Set(currentAnchors.map((anchor) => `${Math.round(anchor.x)}:${Math.round(anchor.y)}`));
    const authoredAnchor = candidates
      .filter((anchor) => !existing.has(`${anchor.x}:${anchor.y}`))
      .filter((anchor) => (anchor.x - x) * direction > 140 && anchor.y < y - 80)
      .sort((a, b) => Phaser.Math.Distance.Between(x, y, a.x, a.y) - Phaser.Math.Distance.Between(x, y, b.x, b.y))[0];

    if (authoredAnchor) {
      return authoredAnchor;
    }

    return {
      x: Phaser.Math.Clamp(x + direction * 470, 120, this.state.world.width - 120),
      y: Math.max(60, y - 480),
    };
  }

  private getSwingDirection(player: Phaser.Physics.Arcade.Sprite, actions: ActionState): number {
    if (actions.moveRight) {
      return 1;
    }

    if (actions.moveLeft) {
      return -1;
    }

    const velocityX = player.body?.velocity.x ?? 0;
    if (Math.abs(velocityX) > 35) {
      return Math.sign(velocityX);
    }

    return player.flipX ? -1 : 1;
  }

  private updateWebLine(player: Phaser.Physics.Arcade.Sprite): void {
    const anchors = this.state.player.webAnchors;
    if (!this.state.player.webAttached || anchors.length === 0) {
      this.clearWebLines();
      return;
    }

    while (this.webLines.length < anchors.length) {
      this.webLines.push(this.add.line(0, 0, 0, 0, 0, 0, colors.web, 0.82).setOrigin(0, 0).setLineWidth(3));
    }

    for (const [index, anchor] of anchors.entries()) {
      this.webLines[index].setTo(anchor.x, anchor.y, player.x, player.y);
    }

    for (const staleLine of this.webLines.slice(anchors.length)) {
      staleLine.destroy();
    }
    this.webLines = this.webLines.slice(0, anchors.length);
  }

  private clearWebLines(): void {
    for (const line of this.webLines) {
      line.destroy();
    }
    this.webLines = [];
  }

  private attack(player: Phaser.Physics.Arcade.Sprite): void {
    this.attackCooldownUntil = this.time.now + 280;
    const facing = player.flipX ? -1 : 1;

    if (this.tryCloseStrike(player, facing)) {
      return;
    }

    this.fireWebGlob(player.x + facing * 30, player.y - 8, facing, "glob");
    this.state.player.message = "Web glob fired.";
  }

  private tryCloseStrike(player: Phaser.Physics.Arcade.Sprite, facing: number): boolean {
    const hitX = player.x + facing * 56;

    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(hitX, player.y, enemy.sprite.x, enemy.sprite.y);
      if (distance > 96) {
        continue;
      }

      const defeated = damageEnemy(this.state, enemy.state, 20);
      enemy.sprite.setVelocityX(facing * 240);
      enemy.sprite.setTint(0xffffff);
      this.time.delayedCall(90, () => enemy.sprite.active && enemy.sprite.clearTint());

      if (defeated) {
        enemy.sprite.destroy();
      }

      return true;
    }

    return false;
  }

  private fireWebGlob(x: number, y: number, facing: number, power: "glob" | "net"): void {
    const globs = this.requireWebGlobs();
    const glob = globs.create(x, y, power === "net" ? "webNet" : "webGlob") as Phaser.Physics.Arcade.Sprite;
    glob.setData("power", power);
    glob.setVelocity(facing * (power === "net" ? 430 : 560), power === "net" ? -20 : 0);
    glob.setDepth(y);
    this.time.delayedCall(1100, () => glob.destroy());
  }

  private cycleGadget(): void {
    const currentIndex = GADGETS.indexOf(this.state.player.gadget);
    const nextIndex = (currentIndex + 1) % GADGETS.length;
    this.state.player.gadget = GADGETS[nextIndex];
    this.state.player.message = `Gadget ready: ${this.state.player.gadget}.`;
  }

  private useGadget(player: Phaser.Physics.Arcade.Sprite): void {
    this.gadgetCooldownUntil = this.time.now + 650;
    const facing = player.flipX ? -1 : 1;

    if (this.state.player.gadget === "web-net") {
      this.fireWebGlob(player.x + facing * 32, player.y - 8, facing, "net");
      this.state.player.message = "Web net launched.";
      return;
    }

    if (this.state.player.gadget === "web-shield") {
      this.state.player.shieldUntil = this.time.now + 1100;
      this.state.player.message = "Web shield spun.";
      return;
    }

    this.playerOnStreet = false;
    this.setPlayerGravity(player, true);
    player.setVelocityY(-420);
    player.setVelocityX((player.body?.velocity.x ?? 0) + facing * 220);
    this.state.player.message = "Web-wings vault.";
  }

  private updateShield(player: Phaser.Physics.Arcade.Sprite, time: number): void {
    if (time >= this.state.player.shieldUntil) {
      this.shieldView?.destroy();
      this.shieldView = undefined;
      return;
    }

    if (!this.shieldView) {
      this.shieldView = this.add.circle(player.x, player.y, 54).setStrokeStyle(4, colors.web, 0.82).setFillStyle(colors.web, 0.08);
    }

    this.shieldView.setPosition(player.x, player.y);
    this.shieldView.setDepth(player.depth + 1);
  }

  private updateEnemies(time: number): void {
    const player = this.requirePlayer();

    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) {
        continue;
      }

      if (time < enemy.snaredUntil) {
        enemy.sprite.setVelocityX(0);
        if (enemy.streetLane) {
          enemy.sprite.y = Phaser.Math.Clamp(enemy.sprite.y, STREET_MIN_Y, ENEMY_STREET_MAX_Y);
          enemy.sprite.setDepth(enemy.sprite.y);
        }
        continue;
      }

      if (enemy.sprite.x <= enemy.state.patrolMinX) {
        enemy.direction = 1;
      }

      if (enemy.sprite.x >= enemy.state.patrolMaxX) {
        enemy.direction = -1;
      }

      enemy.sprite.setVelocityX(enemy.direction * (enemy.state.kind === "gunner" ? 70 : 105));
      enemy.sprite.setFlipX(enemy.direction < 0);

      if (enemy.streetLane) {
        const laneDelta = Phaser.Math.Clamp(player.y - enemy.sprite.y, -1, 1);
        enemy.sprite.setVelocityY(laneDelta * 42);
        enemy.sprite.y = Phaser.Math.Clamp(enemy.sprite.y, STREET_MIN_Y, ENEMY_STREET_MAX_Y);
        enemy.sprite.setDepth(enemy.sprite.y);
      }

      if (enemy.state.kind === "gunner" && time >= enemy.nextShotAt) {
        const closeEnough = Phaser.Math.Distance.Between(player.x, player.y, enemy.sprite.x, enemy.sprite.y) < 680;
        if (closeEnough) {
          this.fireBullet(enemy, player);
          enemy.nextShotAt = time + 1550;
        }
      }
    }
  }

  private fireBullet(enemy: EnemyView, player: Phaser.Physics.Arcade.Sprite): void {
    const bullets = this.requireBullets();
    const bullet = bullets.create(enemy.sprite.x, enemy.sprite.y + 4, "bullet") as Phaser.Physics.Arcade.Sprite;
    const angle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, player.x, player.y);
    bullet.setVelocity(Math.cos(angle) * 360, Math.sin(angle) * 360);
    bullet.setTint(colors.danger);
    bullet.setDepth(enemy.sprite.depth + 1);
    this.time.delayedCall(2600, () => bullet.destroy());
  }

  private wasPressed(actions: ActionState, action: keyof ActionState): boolean {
    return actions[action] && !this.previousActions[action];
  }

  private setPlayerGravity(player: Phaser.Physics.Arcade.Sprite, enabled: boolean): void {
    const body = player.body;
    if (body instanceof Phaser.Physics.Arcade.Body) {
      body.setAllowGravity(enabled);
    }
  }

  private requirePlayer(): Phaser.Physics.Arcade.Sprite {
    if (!this.player) {
      throw new Error("Player has not been created.");
    }

    return this.player;
  }

  private requirePlatforms(): Phaser.Physics.Arcade.StaticGroup {
    if (!this.platforms) {
      throw new Error("Platforms have not been created.");
    }

    return this.platforms;
  }

  private requireBullets(): Phaser.Physics.Arcade.Group {
    if (!this.bullets) {
      throw new Error("Bullets have not been created.");
    }

    return this.bullets;
  }

  private requireWebGlobs(): Phaser.Physics.Arcade.Group {
    if (!this.webGlobs) {
      throw new Error("Web globs have not been created.");
    }

    return this.webGlobs;
  }
}
