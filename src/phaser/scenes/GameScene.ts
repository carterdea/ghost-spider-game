import Phaser from "phaser";
import { colors } from "../../game/assets/manifest";
import { createKeyboardBindings, readActions } from "../../game/input/bindings";
import type { ActionState } from "../../game/input/actions";
import { damageEnemy, damagePlayer } from "../../game/simulation/systems/combat";
import { createInitialGameState, type EnemyState, type GameState } from "../../game/simulation/state";
import { Hud } from "../../ui/hud/hud";

interface EnemyView {
  state: EnemyState;
  sprite: Phaser.Physics.Arcade.Sprite;
  direction: number;
  nextShotAt: number;
}

export class GameScene extends Phaser.Scene {
  private state: GameState = createInitialGameState();
  private hud?: Hud;
  private keys?: ReturnType<typeof createKeyboardBindings>;
  private player?: Phaser.Physics.Arcade.Sprite;
  private platforms?: Phaser.Physics.Arcade.StaticGroup;
  private enemies: EnemyView[] = [];
  private bullets?: Phaser.Physics.Arcade.Group;
  private webLine?: Phaser.GameObjects.Line;
  private attackCooldownUntil = 0;
  private hitCooldownUntil = 0;

  public constructor() {
    super("game");
  }

  public create(): void {
    this.state = createInitialGameState();
    this.enemies = [];
    this.createTextures();
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
    const actions = this.keys ? readActions(this.keys) : {
      moveLeft: false,
      moveRight: false,
      jump: false,
      web: false,
      attack: false,
      drop: false,
      reset: false,
    };

    if (actions.reset) {
      this.scene.restart();
      return;
    }

    if (this.state.player.health === 0) {
      player.setVelocityX(0);
      this.hud?.render(this.state);
      return;
    }

    this.updatePlayer(player, actions, delta);
    this.updateEnemies(time);
    this.updateWebLine(player);
    this.hud?.render(this.state);
  }

  private createTextures(): void {
    const graphics = this.add.graphics();

    graphics.fillStyle(colors.ghostWhite);
    graphics.fillRoundedRect(12, 8, 26, 30, 10);
    graphics.fillStyle(colors.suitPurple);
    graphics.fillRoundedRect(16, 34, 18, 34, 8);
    graphics.fillStyle(colors.wingLavender, 0.76);
    graphics.fillTriangle(13, 35, 0, 64, 16, 58);
    graphics.fillTriangle(35, 35, 52, 64, 34, 58);
    graphics.fillStyle(colors.balletTeal);
    graphics.fillEllipse(16, 72, 18, 8);
    graphics.fillEllipse(36, 72, 18, 8);
    graphics.generateTexture("player", 56, 80);
    graphics.clear();

    graphics.fillStyle(colors.robot);
    graphics.fillRoundedRect(4, 10, 40, 42, 4);
    graphics.fillStyle(0xdce3f2);
    graphics.fillRect(12, 20, 8, 8);
    graphics.fillRect(28, 20, 8, 8);
    graphics.fillStyle(colors.danger);
    graphics.fillRect(8, 52, 32, 8);
    graphics.generateTexture("robot", 48, 64);
    graphics.clear();

    graphics.fillStyle(colors.gunner);
    graphics.fillRoundedRect(5, 6, 36, 50, 14);
    graphics.fillStyle(0x2b2f3d);
    graphics.fillRect(30, 30, 24, 6);
    graphics.fillStyle(0xf3f3ff);
    graphics.fillCircle(23, 21, 7);
    graphics.generateTexture("gunner", 56, 64);
    graphics.clear();

    graphics.fillStyle(colors.web);
    graphics.fillCircle(5, 5, 5);
    graphics.generateTexture("bullet", 10, 10);
    graphics.clear();

    graphics.fillStyle(0x20283d);
    graphics.fillRect(0, 0, 64, 64);
    graphics.lineStyle(2, 0x394463);
    graphics.strokeRect(0, 0, 64, 64);
    graphics.generateTexture("building", 64, 64);
    graphics.clear();

    graphics.fillStyle(0x141823);
    graphics.fillRect(0, 0, 64, 64);
    graphics.generateTexture("street", 64, 64);
    graphics.destroy();
  }

  private createWorld(): void {
    this.physics.world.setBounds(0, 0, this.state.world.width, this.state.world.height);
    this.add.rectangle(2800, 800, this.state.world.width, this.state.world.height, 0x111827).setDepth(-10);
    this.add.rectangle(2800, 1465, this.state.world.width, 280, 0x0c0f16).setDepth(-8);

    this.platforms = this.physics.add.staticGroup();
    const buildings = [
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
      const body = this.platforms.create(building.x, building.y, "building") as Phaser.Physics.Arcade.Sprite;
      body.displayWidth = building.w;
      body.displayHeight = building.h;
      body.refreshBody();
      this.paintWindows(building.x, building.y, building.w, building.h);
    }

    const street = this.platforms.create(2800, this.state.world.streetY + 80, "street") as Phaser.Physics.Arcade.Sprite;
    street.displayWidth = this.state.world.width;
    street.displayHeight = 160;
    street.refreshBody();
  }

  private paintWindows(x: number, y: number, width: number, height: number): void {
    const top = y - height / 2 + 48;
    const left = x - width / 2 + 38;
    const rows = Math.max(2, Math.floor((height - 120) / 72));
    const columns = Math.max(2, Math.floor((width - 80) / 64));

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const lit = (row + column) % 3 !== 0;
        this.add.rectangle(left + column * 64, top + row * 72, 20, 28, lit ? 0xf9d37a : 0x26314d, lit ? 0.82 : 0.5);
      }
    }
  }

  private createPlayer(): void {
    const player = this.physics.add.sprite(120, 690, "player");
    player.setCollideWorldBounds(true);
    player.setDragX(880);
    player.setMaxVelocity(760, 980);
    player.body?.setSize(30, 66).setOffset(13, 8);
    this.physics.add.collider(player, this.requirePlatforms());
    this.player = player;
  }

  private createEnemies(): void {
    const placements: Record<string, { x: number; y: number }> = {
      "robot-roof-1": { x: 960, y: 78 },
      "gunner-street-1": { x: 1920, y: 1360 },
      "robot-roof-2": { x: 2920, y: -40 },
      "robot-street-1": { x: 3600, y: 1360 },
      "gunner-roof-1": { x: 4660, y: 180 },
    };

    for (const enemyState of this.state.enemies) {
      const placement = placements[enemyState.id];
      const sprite = this.physics.add.sprite(placement.x, placement.y, enemyState.kind === "gunner" ? "gunner" : "robot");
      sprite.setCollideWorldBounds(true);
      sprite.setDragX(600);
      sprite.setMaxVelocity(180, 900);
      this.physics.add.collider(sprite, this.requirePlatforms());
      this.enemies.push({ state: enemyState, sprite, direction: 1, nextShotAt: 0 });
    }
  }

  private createCombat(): void {
    this.bullets = this.physics.add.group({ allowGravity: false });
    this.physics.add.overlap(this.requirePlayer(), this.bullets, (_, bulletObject) => {
      const bullet = bulletObject as Phaser.Physics.Arcade.Sprite;
      bullet.destroy();
      damagePlayer(this.state, 12, "Hit by a skyline shot.");
    });

    for (const enemy of this.enemies) {
      this.physics.add.overlap(this.requirePlayer(), enemy.sprite, () => {
        if (this.time.now < this.hitCooldownUntil) {
          return;
        }
        this.hitCooldownUntil = this.time.now + 700;
        damagePlayer(this.state, enemy.state.damage, enemy.state.kind === "gunner" ? "Close-range blast." : "Robot tackle.");
      });
    }
  }

  private createCamera(): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.state.world.width, this.state.world.height);
    camera.startFollow(this.requirePlayer(), true, 0.08, 0.08);
    camera.setDeadzone(190, 120);
  }

  private updatePlayer(player: Phaser.Physics.Arcade.Sprite, actions: ActionState, delta: number): void {
    const grounded = player.body?.blocked.down === true;
    const speed = grounded ? 420 : 330;
    const move = Number(actions.moveRight) - Number(actions.moveLeft);

    if (move !== 0) {
      player.setAccelerationX(move * 1400);
      player.setFlipX(move < 0);
    } else {
      player.setAccelerationX(0);
    }

    if (grounded && actions.jump) {
      player.setVelocityY(-560);
    }

    if (actions.drop) {
      this.detachWeb("Dropped to street level.");
    }

    if (actions.web && !this.state.player.webAttached) {
      this.attachWeb(player);
    }

    if (!actions.web && this.state.player.webAttached) {
      this.detachWeb("Released the web.");
    }

    if (this.state.player.webAttached && this.state.player.webAnchor) {
      this.applySwing(player, this.state.player.webAnchor, delta);
    }

    if (actions.attack && this.time.now >= this.attackCooldownUntil) {
      this.attack(player);
    }

    player.setVelocityX(Phaser.Math.Clamp(player.body?.velocity.x ?? 0, -speed * 1.45, speed * 1.45));
  }

  private attachWeb(player: Phaser.Physics.Arcade.Sprite): void {
    const anchor = this.findWebAnchor(player.x, player.y);

    if (!anchor) {
      this.state.player.message = "No ledge in web range.";
      return;
    }

    this.state.player.webAttached = true;
    this.state.player.webAnchor = anchor;
    this.state.player.message = "Web attached.";
    player.setGravityY(-220);
  }

  private detachWeb(message: string): void {
    if (!this.state.player.webAttached) {
      return;
    }

    this.state.player.webAttached = false;
    this.state.player.webAnchor = null;
    this.state.player.message = message;
    this.requirePlayer().setGravityY(0);
    this.webLine?.destroy();
    this.webLine = undefined;
  }

  private applySwing(player: Phaser.Physics.Arcade.Sprite, anchor: { x: number; y: number }, delta: number): void {
    const body = player.body;
    if (!body) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(player.x, player.y, anchor.x, anchor.y);
    const maxLength = 470;
    const pull = Math.min(1, distance / maxLength);
    const angle = Phaser.Math.Angle.Between(player.x, player.y, anchor.x, anchor.y);
    const dt = delta / 1000;

    body.velocity.x += Math.cos(angle) * 520 * pull * dt;
    body.velocity.y += Math.sin(angle) * 520 * pull * dt;

    if (distance > maxLength) {
      const overshoot = distance - maxLength;
      player.x += Math.cos(angle) * overshoot;
      player.y += Math.sin(angle) * overshoot;
    }
  }

  private findWebAnchor(x: number, y: number): { x: number; y: number } | null {
    const candidates = [
      { x: 520, y: 430 },
      { x: 1180, y: 120 },
      { x: 1860, y: 650 },
      { x: 2600, y: 300 },
      { x: 3360, y: 30 },
      { x: 4100, y: 730 },
      { x: 5020, y: 210 },
    ];

    return candidates
      .filter((anchor) => anchor.y < y - 80 && Phaser.Math.Distance.Between(x, y, anchor.x, anchor.y) < 760)
      .sort((a, b) => Phaser.Math.Distance.Between(x, y, a.x, a.y) - Phaser.Math.Distance.Between(x, y, b.x, b.y))[0] ?? null;
  }

  private updateWebLine(player: Phaser.Physics.Arcade.Sprite): void {
    const anchor = this.state.player.webAnchor;
    if (!this.state.player.webAttached || !anchor) {
      return;
    }

    if (!this.webLine) {
      this.webLine = this.add.line(0, 0, 0, 0, 0, 0, colors.web, 0.82).setOrigin(0, 0).setLineWidth(3);
    }

    this.webLine.setTo(anchor.x, anchor.y, player.x, player.y);
  }

  private attack(player: Phaser.Physics.Arcade.Sprite): void {
    this.attackCooldownUntil = this.time.now + 320;
    const range = 96;
    const facing = player.flipX ? -1 : 1;
    const hitX = player.x + facing * 56;
    let connected = false;

    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(hitX, player.y, enemy.sprite.x, enemy.sprite.y);
      if (distance > range) {
        continue;
      }

      connected = true;
      const defeated = damageEnemy(this.state, enemy.state, 20);
      enemy.sprite.setVelocityX(facing * 240);
      enemy.sprite.setTint(0xffffff);
      this.time.delayedCall(90, () => enemy.sprite.clearTint());

      if (defeated) {
        enemy.sprite.destroy();
      }
    }

    if (!connected) {
      this.state.player.message = "Ballet kick missed.";
    }
  }

  private updateEnemies(time: number): void {
    const player = this.requirePlayer();

    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) {
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
    this.time.delayedCall(2600, () => bullet.destroy());
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
}
