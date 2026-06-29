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
  airborne: boolean;
}

interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FadingWeb {
  graphic: Phaser.GameObjects.Graphics;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  velocityX: number;
  velocityY: number;
  createdAt: number;
  duration: number;
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
  "player-swing",
  "player-downed",
  "robot-walk-0",
  "robot-walk-1",
  "gunner-walk-0",
  "gunner-walk-1",
  "drone-fly-0",
  "drone-fly-1",
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
  "foodCart",
  "newsStand",
  "stoop",
  "planter",
  "roofVent",
  "waterTower",
  "parkTree",
  "parkBench",
  "bat",
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
  private webLines: Phaser.GameObjects.Graphics[] = [];
  private fadingWebs: FadingWeb[] = [];
  private shieldView?: Phaser.GameObjects.Arc;
  private playerOnStreet = false;
  private attackCooldownUntil = 0;
  private gadgetCooldownUntil = 0;
  private hitCooldownUntil = 0;
  private nextWebSwapAt = 0;
  private knockoutStarted = false;

  public constructor() {
    super("game");
  }

  public create(): void {
    this.state = createInitialGameState();
    this.enemies = [];
    this.webLines = [];
    this.fadingWebs = [];
    this.knockoutStarted = false;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.physics.world.timeScale = 1;
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
      this.startKnockout(player);
      this.updateFadingWebs();
      this.updateWebLine(player);
      this.hud?.render(this.state);
      this.previousActions = actions;
      return;
    }

    this.updateStreetMode(player, actions);
    this.updatePlayer(player, actions, delta);
    this.updateEnemies(time);
    this.updateWebLine(player);
    this.updateFadingWebs();
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
    this.createDroneSprites(graphics);

    graphics.lineStyle(3, colors.web, 0.92);
    graphics.strokeCircle(16, 12, 8);
    graphics.lineStyle(2, colors.web, 0.78);
    graphics.lineBetween(3, 12, 29, 12);
    graphics.lineBetween(16, 1, 16, 23);
    graphics.lineBetween(7, 4, 25, 20);
    graphics.lineBetween(7, 20, 25, 4);
    graphics.lineStyle(1, 0xbff7ff, 0.78);
    graphics.strokeEllipse(16, 12, 24, 14);
    graphics.generateTexture("webGlob", 32, 24);
    graphics.clear();

    graphics.lineStyle(3, colors.web, 0.92);
    graphics.strokeEllipse(24, 16, 44, 28);
    graphics.lineBetween(4, 16, 44, 16);
    graphics.lineBetween(24, 2, 24, 30);
    graphics.lineStyle(1, 0xbff7ff, 0.82);
    graphics.strokeEllipse(24, 16, 28, 18);
    graphics.lineBetween(10, 8, 38, 24);
    graphics.lineBetween(38, 8, 10, 24);
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
      { key: "player-idle-0", arm: -1, leg: 0, hood: 0, reach: 0, swing: false, downed: false },
      { key: "player-idle-1", arm: 1, leg: -1, hood: 1, reach: 0, swing: false, downed: false },
      { key: "player-run-0", arm: -7, leg: -7, hood: 0, reach: -2, swing: false, downed: false },
      { key: "player-run-1", arm: 7, leg: 7, hood: 1, reach: 2, swing: false, downed: false },
      { key: "player-glide", arm: 0, leg: 0, hood: -1, reach: 10, swing: false, downed: false },
      { key: "player-swing", arm: 22, leg: -9, hood: -1, reach: 18, swing: true, downed: false },
      { key: "player-downed", arm: -4, leg: 12, hood: 2, reach: 0, swing: false, downed: true },
    ];

    for (const frame of frames) {
      graphics.clear();
      if (frame.downed) {
        this.drawDownedPlayer(graphics, frame.key);
        continue;
      }
      const hoodY = 8 + frame.hood;
      const leftArmX = frame.swing ? 30 : 25 - frame.arm - frame.reach;
      const rightArmX = frame.swing ? 66 : 71 + frame.arm + frame.reach;
      const leftHandY = frame.swing ? 15 : 98 + frame.arm;
      const rightHandY = frame.swing ? 17 : 98 - frame.arm;

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
      graphics.lineBetween(35, 61, leftArmX, frame.swing ? 28 : 77 + frame.arm);
      graphics.lineBetween(62, 61, rightArmX, frame.swing ? 28 : 77 - frame.arm);
      graphics.lineStyle(5, 0xd2268d, 1);
      graphics.lineBetween(leftArmX, frame.swing ? 28 : 77 + frame.arm, leftArmX - 7, frame.swing ? leftHandY : 94 + frame.arm);
      graphics.lineBetween(rightArmX, frame.swing ? 28 : 77 - frame.arm, rightArmX + 7, frame.swing ? rightHandY : 94 - frame.arm);
      graphics.lineStyle(2, colors.balletTeal, 0.95);
      graphics.lineBetween(leftArmX - 1, frame.swing ? 32 : 80 + frame.arm, leftArmX - 7, frame.swing ? leftHandY : 93 + frame.arm);
      graphics.lineBetween(leftArmX + 3, frame.swing ? 34 : 82 + frame.arm, leftArmX - 2, frame.swing ? leftHandY + 4 : 96 + frame.arm);
      graphics.lineBetween(rightArmX + 1, frame.swing ? 32 : 80 - frame.arm, rightArmX + 7, frame.swing ? rightHandY : 93 - frame.arm);
      graphics.lineBetween(rightArmX - 3, frame.swing ? 34 : 82 - frame.arm, rightArmX + 2, frame.swing ? rightHandY + 4 : 96 - frame.arm);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillEllipse(leftArmX - 9, leftHandY, 16, 9);
      graphics.fillEllipse(rightArmX + 9, rightHandY, 16, 9);

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

  private drawDownedPlayer(graphics: Phaser.GameObjects.Graphics, key: string): void {
    graphics.fillStyle(0x0a0c12, 1);
    graphics.fillRoundedRect(20, 78, 58, 24, 12);
    graphics.lineStyle(8, 0xffffff, 1);
    graphics.lineBetween(24, 84, 7, 97);
    graphics.lineBetween(70, 84, 88, 96);
    graphics.lineStyle(5, 0xd2268d, 1);
    graphics.lineBetween(10, 97, 24, 104);
    graphics.lineBetween(85, 96, 73, 104);
    graphics.lineStyle(9, 0x0c0f17, 1);
    graphics.lineBetween(33, 100, 22, 125);
    graphics.lineBetween(57, 100, 76, 123);
    graphics.fillStyle(colors.balletTeal, 1);
    graphics.fillEllipse(20, 128, 28, 9);
    graphics.fillEllipse(78, 126, 28, 9);
    graphics.fillStyle(0xd2268d, 1);
    graphics.fillTriangle(22, 56, 38, 80, 9, 80);
    graphics.fillTriangle(73, 56, 56, 80, 88, 80);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRoundedRect(24, 45, 50, 38, 17);
    graphics.fillEllipse(49, 72, 36, 26);
    graphics.fillStyle(0xd2268d, 1);
    graphics.fillTriangle(36, 70, 46, 64, 43, 76);
    graphics.fillTriangle(62, 70, 52, 64, 55, 76);
    graphics.generateTexture(key, 96, 136);
  }

  private createRobotSprites(graphics: Phaser.GameObjects.Graphics): void {
    for (const [index, lean] of [0, 2].entries()) {
      graphics.clear();
      graphics.fillStyle(0x171c2b);
      graphics.fillEllipse(31 + lean, 77, 46, 9);
      graphics.fillStyle(0x4c566f);
      graphics.fillRoundedRect(12 + lean, 22, 40, 38, 6);
      graphics.fillStyle(0x2f384f);
      graphics.fillRoundedRect(17 + lean, 27, 30, 26, 4);
      graphics.lineStyle(2, 0x8a97b3, 0.85);
      graphics.strokeRoundedRect(17 + lean, 27, 30, 26, 4);
      graphics.fillStyle(colors.robot);
      graphics.fillRoundedRect(15 + lean, 8, 32, 24, 5);
      graphics.fillStyle(0x141a2a);
      graphics.fillRect(19 + lean, 14, 24, 12);
      graphics.fillStyle(0xdce3f2);
      graphics.fillRect(21 + lean, 17, 7, 6);
      graphics.fillRect(34 + lean, 17, 7, 6);
      graphics.fillStyle(colors.danger);
      graphics.fillRect(18 + lean, 38, 26, 5);
      graphics.fillStyle(0x9ca8c4);
      graphics.fillCircle(23 + lean, 46, 3);
      graphics.fillCircle(39 + lean, 46, 3);
      graphics.lineStyle(7, 0x707b92, 1);
      graphics.lineBetween(15 + lean, 44, 4, 60 - lean);
      graphics.lineBetween(49 + lean, 44, 61, 60 + lean);
      graphics.lineStyle(4, 0x2ce5d2, 0.85);
      graphics.lineBetween(5 + lean, 61 - lean, 16 + lean, 65 - lean);
      graphics.lineBetween(60 + lean, 61 + lean, 49 + lean, 65 + lean);
      graphics.lineStyle(7, 0x5f6a83, 1);
      graphics.lineBetween(22 + lean, 60, 17, 75 + lean);
      graphics.lineBetween(41 + lean, 60, 47, 75 - lean);
      graphics.fillStyle(0x222b40);
      graphics.fillRoundedRect(10, 73 + lean, 18, 7, 3);
      graphics.fillRoundedRect(39, 73 - lean, 18, 7, 3);
      graphics.generateTexture(`robot-walk-${index}`, 72, 88);
    }

    graphics.clear();
  }

  private createGunnerSprites(graphics: Phaser.GameObjects.Graphics): void {
    for (const [index, coat] of [0, 3].entries()) {
      graphics.clear();
      graphics.fillStyle(0x0b0e16);
      graphics.fillEllipse(36, 82, 50, 8);
      graphics.fillStyle(0x0d1018);
      graphics.fillRoundedRect(14, 8, 42, 59, 17);
      graphics.fillStyle(colors.gunner);
      graphics.fillTriangle(14, 30, 4, 80 + coat, 34, 61);
      graphics.fillTriangle(56, 30, 68, 80 - coat, 34, 61);
      graphics.fillStyle(0x242a3b);
      graphics.fillRoundedRect(22, 35, 27, 31, 6);
      graphics.lineStyle(2, 0x5b657f, 0.8);
      graphics.lineBetween(28, 41, 28, 62);
      graphics.lineBetween(41, 40, 41, 62);
      graphics.fillStyle(0xf3f3ff);
      graphics.fillCircle(35, 22, 9);
      graphics.fillStyle(0x111520);
      graphics.fillTriangle(22, 20, 35, 6, 49, 20);
      graphics.fillStyle(0xf0d07a);
      graphics.fillRect(31, 22, 9, 3);
      graphics.fillStyle(0x242a3b);
      graphics.fillRoundedRect(36, 40, 31, 7, 2);
      graphics.fillStyle(0x12151f);
      graphics.fillRoundedRect(62, 39, 13, 5, 2);
      graphics.fillStyle(colors.danger);
      graphics.fillCircle(75, 41, 3);
      graphics.lineStyle(5, 0x2a3143, 1);
      graphics.lineBetween(25, 63, 19, 81 - coat);
      graphics.lineBetween(45, 63, 51, 81 + coat);
      graphics.fillStyle(0x141824);
      graphics.fillRoundedRect(11, 78 - coat, 18, 7, 3);
      graphics.fillRoundedRect(43, 78 + coat, 18, 7, 3);
      graphics.generateTexture(`gunner-walk-${index}`, 82, 92);
    }

    graphics.clear();
  }

  private createDroneSprites(graphics: Phaser.GameObjects.Graphics): void {
    for (const [index, rotor] of [0, 5].entries()) {
      graphics.clear();
      graphics.fillStyle(0x101626, 0.75);
      graphics.fillEllipse(38, 58, 62, 9);
      graphics.fillStyle(0x2f3954);
      graphics.fillRoundedRect(19, 24, 38, 24, 7);
      graphics.fillStyle(0x56627f);
      graphics.fillRoundedRect(25, 17, 26, 14, 5);
      graphics.fillStyle(0x151c2f);
      graphics.fillRect(28, 29, 20, 9);
      graphics.fillStyle(colors.danger);
      graphics.fillCircle(38, 34, 4);
      graphics.lineStyle(3, 0x66728e, 1);
      graphics.lineBetween(19, 27, 5, 16);
      graphics.lineBetween(57, 27, 71, 16);
      graphics.lineBetween(19, 43, 6, 55);
      graphics.lineBetween(57, 43, 70, 55);
      graphics.lineStyle(3, 0x9aa6bf, 0.9);
      graphics.lineBetween(1, 16 - rotor, 17, 16 + rotor);
      graphics.lineBetween(59, 16 + rotor, 75, 16 - rotor);
      graphics.lineBetween(2, 55 + rotor, 18, 55 - rotor);
      graphics.lineBetween(58, 55 - rotor, 74, 55 + rotor);
      graphics.fillStyle(0x2ce5d2, 0.86);
      graphics.fillRect(29, 47, 18, 4);
      graphics.generateTexture(`drone-fly-${index}`, 78, 66);
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

    graphics.fillStyle(0x20283c);
    graphics.fillRoundedRect(0, 20, 124, 72, 8);
    graphics.fillStyle(0xd94494);
    graphics.fillRect(0, 20, 124, 14);
    graphics.fillStyle(0xf4d46c);
    graphics.fillRect(12, 42, 30, 22);
    graphics.fillRect(50, 42, 26, 22);
    graphics.fillRect(84, 42, 28, 22);
    graphics.fillStyle(0x76e5ef, 0.65);
    graphics.fillRect(10, 68, 104, 10);
    graphics.fillStyle(0x111722);
    graphics.fillCircle(22, 94, 8);
    graphics.fillCircle(102, 94, 8);
    graphics.generateTexture("foodCart", 124, 104);
    graphics.clear();

    graphics.fillStyle(0x172033);
    graphics.fillRoundedRect(0, 12, 136, 102, 6);
    graphics.fillStyle(0x5d6ea0);
    graphics.fillRect(8, 24, 120, 12);
    graphics.fillStyle(0xf5f2d0);
    for (let x = 12; x < 112; x += 24) {
      graphics.fillRect(x, 46, 16, 22);
      graphics.fillRect(x + 4, 74, 16, 24);
    }
    graphics.fillStyle(0xe85f9a);
    graphics.fillRect(0, 0, 136, 16);
    graphics.generateTexture("newsStand", 136, 120);
    graphics.clear();

    graphics.fillStyle(0x182137);
    graphics.fillRoundedRect(0, 0, 132, 92, 4);
    graphics.fillStyle(0x293657);
    graphics.fillRoundedRect(24, 18, 84, 74, 9);
    graphics.fillStyle(0x0d121e);
    graphics.fillRoundedRect(45, 36, 42, 56, 8);
    graphics.fillStyle(0xb68650);
    graphics.fillCircle(78, 65, 3);
    graphics.fillStyle(0x44516f);
    graphics.fillRect(10, 84, 112, 8);
    graphics.generateTexture("stoop", 132, 100);
    graphics.clear();

    graphics.fillStyle(0x1e4e45);
    graphics.fillRoundedRect(4, 48, 70, 16, 5);
    graphics.fillStyle(0x2a654f);
    graphics.fillCircle(22, 42, 19);
    graphics.fillCircle(42, 34, 24);
    graphics.fillCircle(59, 44, 18);
    graphics.fillStyle(0x6e4c36);
    graphics.fillRect(38, 44, 8, 15);
    graphics.generateTexture("planter", 80, 70);
    graphics.clear();

    graphics.fillStyle(0x222b42);
    graphics.fillRoundedRect(0, 20, 78, 44, 4);
    graphics.fillStyle(0x485572);
    graphics.fillRect(8, 8, 62, 14);
    graphics.lineStyle(2, 0x111827, 0.8);
    for (let x = 14; x < 65; x += 12) {
      graphics.lineBetween(x, 10, x - 4, 20);
    }
    graphics.generateTexture("roofVent", 82, 68);
    graphics.clear();

    graphics.lineStyle(5, 0x222b42, 1);
    graphics.lineBetween(22, 42, 8, 118);
    graphics.lineBetween(74, 42, 88, 118);
    graphics.lineBetween(16, 84, 80, 84);
    graphics.fillStyle(0x4b5877);
    graphics.fillEllipse(48, 30, 74, 32);
    graphics.fillRoundedRect(12, 30, 72, 46, 8);
    graphics.fillEllipse(48, 76, 72, 22);
    graphics.fillStyle(0x7a88a8, 0.8);
    graphics.fillRect(20, 43, 56, 6);
    graphics.generateTexture("waterTower", 96, 124);
    graphics.clear();

    graphics.fillStyle(0x3a241b);
    graphics.fillRect(28, 52, 10, 36);
    graphics.fillStyle(0x132f33);
    graphics.fillCircle(24, 42, 24);
    graphics.fillCircle(44, 32, 29);
    graphics.fillCircle(61, 48, 23);
    graphics.fillStyle(0x1f5b4d);
    graphics.fillCircle(38, 44, 18);
    graphics.lineStyle(2, 0x6ee7d8, 0.22);
    graphics.lineBetween(24, 37, 42, 28);
    graphics.lineBetween(44, 52, 64, 45);
    graphics.generateTexture("parkTree", 86, 92);
    graphics.clear();

    graphics.fillStyle(0x35263a);
    graphics.fillRoundedRect(6, 26, 90, 12, 5);
    graphics.fillStyle(0x5b3a67);
    graphics.fillRoundedRect(0, 16, 102, 12, 5);
    graphics.lineStyle(4, 0x222b42, 1);
    graphics.lineBetween(18, 28, 10, 54);
    graphics.lineBetween(82, 28, 92, 54);
    graphics.generateTexture("parkBench", 104, 60);
    graphics.clear();

    graphics.fillStyle(0x070911, 1);
    graphics.fillEllipse(22, 16, 12, 9);
    graphics.fillTriangle(17, 15, 0, 4, 8, 22);
    graphics.fillTriangle(27, 15, 44, 4, 36, 22);
    graphics.fillStyle(0xb8efff, 0.82);
    graphics.fillCircle(20, 14, 1.5);
    graphics.fillCircle(24, 14, 1.5);
    graphics.generateTexture("bat", 46, 28);
    graphics.clear();
  }

  private createAnimations(): void {
    this.anims.remove("player-idle");
    this.anims.remove("player-run");
    this.anims.remove("robot-walk");
    this.anims.remove("gunner-walk");
    this.anims.remove("drone-fly");

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
    this.anims.create({
      key: "drone-fly",
      frames: [{ key: "drone-fly-0" }, { key: "drone-fly-1" }],
      frameRate: 10,
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
    this.createCentralPark();
    this.createNightLife();

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
    this.add.text(5180, 335, "BIG\nSTINKY\nPANTS", {
      align: "center",
      color: "#172033",
      fontFamily: "Arial Black, Impact, sans-serif",
      fontSize: "38px",
      lineSpacing: -5,
    }).setOrigin(0.5).setDepth(-8.93);

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
      if (x > 3300 && x < 4040) {
        continue;
      }
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
      { x: 220, texture: "storefront", height: 124, name: "JOE'S PIZZA", accent: "#f25f8f" },
      { x: 600, texture: "apartmentDoor", height: 132 },
      { x: 1120, texture: "storefront", height: 124, name: "MOON BOOKS", accent: "#87f0ff" },
      { x: 1500, texture: "apartmentDoor", height: 132 },
      { x: 2050, texture: "storefront", height: 124, name: "NIGHT OWL COFFEE", accent: "#f5d46c" },
      { x: 2530, texture: "apartmentDoor", height: 132 },
      { x: 3230, texture: "storefront", height: 124, name: "SLICE SLICE BABY", accent: "#39e7d0" },
      { x: 3720, texture: "apartmentDoor", height: 132, hiddenByPark: true },
      { x: 4380, texture: "storefront", height: 124, name: "GHOST BEAN", accent: "#d9b6ff" },
      { x: 4930, texture: "apartmentDoor", height: 132 },
    ] as const;

    for (const detail of storefronts) {
      if ("hiddenByPark" in detail) {
        continue;
      }
      this.add.image(detail.x, SIDEWALK_Y - detail.height / 2, detail.texture).setDepth(-3.5);
      if ("name" in detail) {
        this.add.rectangle(detail.x, SIDEWALK_Y - detail.height + 6, 154, 18, 0x0a0d16, 0.78).setDepth(-3.25);
        this.add.text(detail.x, SIDEWALK_Y - detail.height + 6, detail.name, {
          color: detail.accent,
          fontFamily: "Arial Black, Impact, sans-serif",
          fontSize: detail.name.length > 13 ? "11px" : "13px",
        }).setOrigin(0.5).setDepth(-3.2);
      }
    }

    for (let x = 420; x < this.state.world.width; x += 1040) {
      this.add.image(x, SIDEWALK_Y - 50, "stoop").setDepth(-3.4);
      this.add.image(x + 260, SIDEWALK_Y - 60, "newsStand").setDepth(-3.3);
      this.add.image(x + 560, SIDEWALK_Y - 52, "foodCart").setDepth(-3.2);
    }

    for (let x = 360; x < this.state.world.width; x += 620) {
      this.add.image(x, 1160, "streetLight").setDepth(1180);
    }

    for (let x = 520; x < this.state.world.width; x += 930) {
      this.add.image(x, 1188, "trashCan").setDepth(1200);
      this.add.image(x + 190, 1192, "hydrant").setDepth(1200);
      this.add.image(x + 330, 1188, "planter").setDepth(1200);
    }
  }

  private createCentralPark(): void {
    const parkX = 3650;
    this.add.rectangle(parkX, 1132, 720, 126, 0x103a36, 0.96).setDepth(-3.45);
    this.add.rectangle(parkX, 1190, 740, 20, 0x263149, 1).setDepth(-3.35);
    this.add.text(parkX - 285, 1092, "CENTRAL PARK", {
      color: "#a7ffe9",
      fontFamily: "Arial Black, Impact, sans-serif",
      fontSize: "18px",
    }).setDepth(-3.05);

    for (let x = parkX - 300; x <= parkX + 300; x += 88) {
      const y = 1132 + ((x / 88) % 2) * 16;
      this.add.image(x, y, "parkTree").setDepth(-3.15);
    }

    this.add.image(parkX - 155, 1182, "parkBench").setDepth(1195);
    this.add.image(parkX + 185, 1182, "parkBench").setDepth(1195);
    this.add.rectangle(parkX, 1172, 260, 18, 0x1b554d, 0.85).setDepth(-3.12);
    this.add.rectangle(parkX, 1176, 250, 4, 0x6ee7d8, 0.24).setDepth(-3.1);
  }

  private createNightLife(): void {
    for (const [index, startX] of [540, 2440, 4380].entries()) {
      const bat = this.add.image(startX, 265 + index * 62, "bat").setDepth(-2);
      bat.setAlpha(0.82);
      this.tweens.add({
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
  }

  private createRoofPlatform(building: Building): void {
    const roofY = building.y - building.h / 2 + 10;
    this.add.rectangle(building.x, roofY + 23, building.w - 22, 42, 0x151c2f, 0.92).setDepth(-7.2);
    this.add.rectangle(building.x, roofY + 3, building.w - 8, 16, 0x3c4868, 1).setDepth(-7.1);
    this.add.rectangle(building.x - building.w / 2 + 34, roofY - 12, 44, 34, 0x202944, 1).setDepth(-7);
    this.add.rectangle(building.x + building.w / 2 - 34, roofY - 12, 44, 34, 0x202944, 1).setDepth(-7);
    if (building.w > 500) {
      this.add.image(building.x - building.w * 0.18, roofY - 42, "roofVent").setDepth(-6.8);
      this.add.image(building.x + building.w * 0.22, roofY - 88, "waterTower").setDepth(-6.9);
    } else {
      this.add.image(building.x + building.w * 0.18, roofY - 42, "roofVent").setDepth(-6.8);
    }
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
    const placements: Record<string, { x: number; y: number; streetLane: boolean; airborne?: boolean }> = {
      "robot-roof-1": { x: 960, y: 80, streetLane: false },
      "drone-roof-1": { x: 1360, y: 170, streetLane: false, airborne: true },
      "gunner-street-1": { x: 1920, y: 1330, streetLane: true },
      "robot-roof-2": { x: 2920, y: -5, streetLane: false },
      "drone-roof-2": { x: 3480, y: 80, streetLane: false, airborne: true },
      "robot-street-1": { x: 3600, y: 1348, streetLane: true },
      "gunner-roof-1": { x: 4660, y: 235, streetLane: false },
      "robot-roof-3": { x: 5200, y: 565, streetLane: false },
    };

    for (const enemyState of this.state.enemies) {
      const placement = placements[enemyState.id];
      const texture = this.getEnemyTexture(enemyState.kind);
      const sprite = this.physics.add.sprite(placement.x, placement.y, texture);
      sprite.setCollideWorldBounds(true);
      sprite.setDragX(600);
      sprite.setMaxVelocity(enemyState.kind === "drone" ? 220 : 180, enemyState.kind === "drone" ? 140 : 900);
      this.setEnemyBody(sprite, enemyState.kind);
      sprite.body?.setAllowGravity(!placement.streetLane && placement.airborne !== true);
      sprite.play(this.getEnemyAnimation(enemyState.kind));

      if (placement.streetLane) {
        sprite.y = Phaser.Math.Clamp(sprite.y, STREET_MIN_Y, ENEMY_STREET_MAX_Y);
        sprite.setDepth(sprite.y);
      } else if (placement.airborne !== true) {
        this.physics.add.collider(sprite, this.requirePlatforms());
      } else {
        sprite.setDepth(placement.y + 30);
      }

      this.enemies.push({ state: enemyState, sprite, direction: 1, nextShotAt: 0, snaredUntil: 0, streetLane: placement.streetLane, airborne: placement.airborne === true });
    }
  }

  private getEnemyTexture(kind: EnemyState["kind"]): string {
    if (kind === "gunner") {
      return "gunner-walk-0";
    }

    if (kind === "drone") {
      return "drone-fly-0";
    }

    return "robot-walk-0";
  }

  private getEnemyAnimation(kind: EnemyState["kind"]): string {
    if (kind === "gunner") {
      return "gunner-walk";
    }

    if (kind === "drone") {
      return "drone-fly";
    }

    return "robot-walk";
  }

  private setEnemyBody(sprite: Phaser.Physics.Arcade.Sprite, kind: EnemyState["kind"]): void {
    if (kind === "gunner") {
      sprite.body?.setSize(40, 76).setOffset(20, 10);
      return;
    }

    if (kind === "drone") {
      sprite.body?.setSize(52, 34).setOffset(13, 18);
      return;
    }

    sprite.body?.setSize(42, 72).setOffset(15, 10);
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
        damagePlayer(this.state, enemy.state.damage, enemy.state.kind === "gunner" ? "Close-range blast." : enemy.state.kind === "drone" ? "Drone zap." : "Robot tackle.");
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
      player.setTexture("player-swing");
    }

    if (!this.state.player.webAttached && actions.glide && !this.playerOnStreet && !grounded && player.body && player.body.velocity.y > 80) {
      player.setVelocityY(Math.min(player.body.velocity.y, 170));
      player.setTexture("player-glide");
      this.state.player.message = "Web-wings slowed the fall.";
    } else if (!this.state.player.webAttached && Math.abs(player.body?.velocity.x ?? 0) > 80) {
      player.play("player-run", true);
    } else if (!this.state.player.webAttached && !actions.glide) {
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
    const player = this.requirePlayer();
    for (const anchor of this.state.player.webAnchors) {
      this.fadeWeb(anchor, this.getClosestHandPosition(player, anchor));
    }

    this.state.player.webAnchors = [];
    this.state.player.message = message;
    this.nextWebSwapAt = 0;
    player.setGravityY(0);
    this.clearWebLines(false);
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

    const droppedAnchor = trailingAnchor ?? overextendedAnchor;
    if (droppedAnchor) {
      this.fadeWeb(droppedAnchor, this.getClosestHandPosition(player, droppedAnchor));
    }

    const newAnchor = this.findForwardWebAnchor(player.x, player.y, travelDirection, anchors);
    this.state.player.webAnchors = [...anchors.filter((anchor) => anchor !== droppedAnchor), newAnchor].slice(-2);
    this.nextWebSwapAt = this.time.now + 300;
    this.state.player.message = "New web-line caught.";
  }

  private applySwing(player: Phaser.Physics.Arcade.Sprite, anchors: WebAnchor[], actions: ActionState, delta: number): void {
    const body = player.body;
    if (!body) {
      return;
    }

    const dt = delta / 1000;
    const maxLength = 585;
    const spring = 690 / anchors.length;

    for (const anchor of anchors) {
      const distance = Phaser.Math.Distance.Between(player.x, player.y, anchor.x, anchor.y);
      const angle = Phaser.Math.Angle.Between(player.x, player.y, anchor.x, anchor.y);
      const stretch = Math.max(0, distance - 105) / maxLength;
      const tangent = angle + Math.PI / 2;
      const travelSign = this.getSwingDirection(player, actions);
      const bottomArc = Phaser.Math.Clamp((player.y - anchor.y) / maxLength, 0, 1);
      const exitArc = Phaser.Math.Clamp(((player.x - anchor.x) * travelSign) / maxLength, 0, 1);

      body.velocity.x += Math.cos(angle) * spring * stretch * dt;
      body.velocity.y += Math.sin(angle) * spring * stretch * dt;
      body.velocity.x += Math.cos(tangent) * travelSign * (92 + bottomArc * 72) * dt;
      body.velocity.y += Math.sin(tangent) * travelSign * (38 + bottomArc * 30) * dt;
      body.velocity.y += bottomArc * 80 * dt;
      body.velocity.y -= exitArc * 210 * dt;

      if (distance > maxLength) {
        const correction = (distance - maxLength) * 0.09;
        player.x += Math.cos(angle) * correction;
        player.y += Math.sin(angle) * correction;
      }
    }

    const moveAssist = Number(actions.moveRight) - Number(actions.moveLeft);
    const automaticDirection = moveAssist === 0 ? this.getSwingDirection(player, actions) : moveAssist;
    body.velocity.x += automaticDirection * 145 * dt;
    body.velocity.x += moveAssist * 170 * dt;
    body.velocity.x *= 0.995;
    body.velocity.y *= 0.996;
    player.setMaxVelocity(650, 930);
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
      this.clearWebLines(false);
      return;
    }

    while (this.webLines.length < anchors.length) {
      this.webLines.push(this.add.graphics());
    }

    const hands = this.getWebHandPositions(player, anchors);
    for (const [index, anchor] of anchors.entries()) {
      const hand = hands[index] ?? hands[0];
      const graphic = this.webLines[index];
      graphic.clear();
      this.drawWebStrand(graphic, anchor, hand, 0.88, 3 + index);
      graphic.setDepth(player.depth + 2 + index);
    }

    for (const staleLine of this.webLines.slice(anchors.length)) {
      staleLine.destroy();
    }
    this.webLines = this.webLines.slice(0, anchors.length);
  }

  private getWebHandPositions(player: Phaser.Physics.Arcade.Sprite, anchors: WebAnchor[]): WebAnchor[] {
    const facing = player.flipX ? -1 : 1;
    const left = { x: player.x - 18 * facing, y: player.y - 48 };
    const right = { x: player.x + 18 * facing, y: player.y - 47 };

    if (anchors.length <= 1) {
      return [anchors[0] && anchors[0].x < player.x ? left : right];
    }

    return anchors.map((anchor) => (anchor.x < player.x ? left : right));
  }

  private getClosestHandPosition(player: Phaser.Physics.Arcade.Sprite, anchor: WebAnchor): WebAnchor {
    const [hand] = this.getWebHandPositions(player, [anchor]);
    return hand;
  }

  private drawWebStrand(graphic: Phaser.GameObjects.Graphics, anchor: WebAnchor, hand: WebAnchor, alpha: number, seed: number): void {
    const dx = hand.x - anchor.x;
    const dy = hand.y - anchor.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const normalX = -dy / length;
    const normalY = dx / length;
    const middleX = (anchor.x + hand.x) / 2;
    const middleY = (anchor.y + hand.y) / 2;
    const wobble = Math.sin(this.time.now * 0.006 + seed) * 8;

    graphic.lineStyle(3, colors.web, alpha);
    graphic.beginPath();
    graphic.moveTo(anchor.x, anchor.y);
    graphic.lineTo(middleX + normalX * wobble, middleY + normalY * wobble);
    graphic.lineTo(hand.x, hand.y);
    graphic.strokePath();

    graphic.lineStyle(1, 0xbff7ff, alpha * 0.82);
    for (let step = 1; step <= 4; step += 1) {
      const t = step / 5;
      const x = Phaser.Math.Linear(anchor.x, hand.x, t) + normalX * wobble * (1 - Math.abs(0.5 - t));
      const y = Phaser.Math.Linear(anchor.y, hand.y, t) + normalY * wobble * (1 - Math.abs(0.5 - t));
      const branch = 10 + ((step + seed) % 3) * 5;
      const side = step % 2 === 0 ? 1 : -1;
      graphic.lineBetween(x, y, x + normalX * branch * side, y + normalY * branch * side);
      graphic.lineBetween(x, y, x - dx * 0.035, y - dy * 0.035);
    }

    graphic.strokeCircle(hand.x, hand.y, 6);
  }

  private fadeWeb(anchor: WebAnchor, hand: WebAnchor): void {
    const graphic = this.add.graphics();
    this.drawWebStrand(graphic, anchor, hand, 0.72, 0);
    graphic.setDepth(hand.y + 4);
    this.fadingWebs.push({
      graphic,
      fromX: anchor.x,
      fromY: anchor.y,
      toX: hand.x,
      toY: hand.y,
      velocityX: Phaser.Math.Between(-14, 14),
      velocityY: Phaser.Math.Between(54, 82),
      createdAt: this.time.now,
      duration: 760,
    });
  }

  private updateFadingWebs(): void {
    const liveWebs: FadingWeb[] = [];

    for (const web of this.fadingWebs) {
      const age = this.time.now - web.createdAt;
      const progress = Phaser.Math.Clamp(age / web.duration, 0, 1);
      if (progress >= 1) {
        web.graphic.destroy();
        continue;
      }

      const fall = progress * progress * 96;
      const sway = Math.sin(progress * Math.PI) * web.velocityX;
      web.graphic.clear();
      this.drawWebStrand(
        web.graphic,
        { x: web.fromX + sway * 0.4, y: web.fromY + fall * 0.4 },
        { x: web.toX + sway, y: web.toY + fall + web.velocityY * progress },
        (1 - progress) * 0.72,
        0,
      );
      liveWebs.push(web);
    }

    this.fadingWebs = liveWebs;
  }

  private clearWebLines(destroyFadingWebs: boolean): void {
    for (const line of this.webLines) {
      line.destroy();
    }
    this.webLines = [];

    if (!destroyFadingWebs) {
      return;
    }

    for (const web of this.fadingWebs) {
      web.graphic.destroy();
    }
    this.fadingWebs = [];
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
      this.createWebBurst(player.x, player.y, 58, 760);
      this.state.player.message = "Web shield spun.";
      return;
    }

    this.playerOnStreet = false;
    this.setPlayerGravity(player, true);
    player.setVelocityY(-420);
    player.setVelocityX((player.body?.velocity.x ?? 0) + facing * 220);
    this.createWebBurst(player.x - facing * 22, player.y + 8, 42, 520);
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

  private createWebBurst(x: number, y: number, radius: number, duration: number): void {
    const burst = this.add.graphics();
    burst.setDepth(y + 5);
    burst.lineStyle(2, colors.web, 0.82);
    burst.strokeCircle(x, y, radius);
    burst.strokeCircle(x, y, radius * 0.55);
    for (let spoke = 0; spoke < 10; spoke += 1) {
      const angle = (Math.PI * 2 * spoke) / 10;
      burst.lineBetween(x, y, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    }
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scale: 1.18,
      duration,
      ease: "Sine.out",
      onComplete: () => burst.destroy(),
    });
  }

  private updateEnemies(time: number): void {
    const player = this.requirePlayer();

    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) {
        continue;
      }

      if (time < enemy.snaredUntil) {
        enemy.sprite.setVelocityX(0);
        if (enemy.airborne) {
          enemy.sprite.setVelocityY(Math.sin(time / 180) * 18);
        }
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

      enemy.sprite.setVelocityX(enemy.direction * (enemy.state.kind === "gunner" ? 70 : enemy.state.kind === "drone" ? 120 : 105));
      enemy.sprite.setFlipX(enemy.direction < 0);

      if (enemy.streetLane) {
        const laneDelta = Phaser.Math.Clamp(player.y - enemy.sprite.y, -1, 1);
        enemy.sprite.setVelocityY(laneDelta * 42);
        enemy.sprite.y = Phaser.Math.Clamp(enemy.sprite.y, STREET_MIN_Y, ENEMY_STREET_MAX_Y);
        enemy.sprite.setDepth(enemy.sprite.y);
      }

      if (enemy.airborne) {
        enemy.sprite.setVelocityY(Math.sin(time / 260 + enemy.sprite.x * 0.01) * 52);
        enemy.sprite.setDepth(enemy.sprite.y + 30);
      }

      if ((enemy.state.kind === "gunner" || enemy.state.kind === "drone") && time >= enemy.nextShotAt) {
        const closeEnough = Phaser.Math.Distance.Between(player.x, player.y, enemy.sprite.x, enemy.sprite.y) < (enemy.state.kind === "drone" ? 560 : 680);
        if (closeEnough) {
          this.fireBullet(enemy, player);
          enemy.nextShotAt = time + (enemy.state.kind === "drone" ? 1900 : 1550);
        }
      }
    }
  }

  private fireBullet(enemy: EnemyView, player: Phaser.Physics.Arcade.Sprite): void {
    const bullets = this.requireBullets();
    const bullet = bullets.create(enemy.sprite.x, enemy.sprite.y + (enemy.state.kind === "drone" ? 18 : 4), "bullet") as Phaser.Physics.Arcade.Sprite;
    const angle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, player.x, player.y);
    const speed = enemy.state.kind === "drone" ? 300 : 360;
    bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    bullet.setTint(enemy.state.kind === "drone" ? colors.balletTeal : colors.danger);
    bullet.setDepth(enemy.sprite.depth + 1);
    this.time.delayedCall(2600, () => bullet.destroy());
  }

  private startKnockout(player: Phaser.Physics.Arcade.Sprite): void {
    if (this.knockoutStarted) {
      player.setTexture("player-downed");
      return;
    }

    this.knockoutStarted = true;
    this.state.player.webAttached = false;
    for (const anchor of this.state.player.webAnchors) {
      this.fadeWeb(anchor, this.getClosestHandPosition(player, anchor));
    }
    this.state.player.webAnchors = [];
    this.clearWebLines(false);
    this.playerOnStreet = false;
    this.setPlayerGravity(player, true);
    player.setGravityY(0);
    player.setAcceleration(0, 0);
    player.setVelocity(player.flipX ? 120 : -120, -210);
    player.setAngularVelocity(player.flipX ? 90 : -90);
    player.setTexture("player-downed");
    player.setTint(0xffd1f0);
    this.state.player.message = "Knocked out in slow motion. Press R to restart.";
    this.time.timeScale = 0.28;
    this.tweens.timeScale = 0.28;
    this.physics.world.timeScale = 0.28;
    this.cameras.main.shake(360, 0.006);

    this.time.delayedCall(900, () => {
      player.setAngularVelocity(0);
      player.setVelocity(0, 0);
      player.setAngle(0);
      player.clearTint();
      player.setTexture("player-downed");
    });
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
