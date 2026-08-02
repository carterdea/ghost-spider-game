import type Phaser from "phaser";
import { colors } from "../../game/assets/manifest";

/**
 * Every texture drawn at runtime. The hero, enemies and pedestrians come from
 * the raster art pipeline instead — the scene used to also generate a full set
 * of vector character sprites that nothing ever referenced.
 */
type Draw = (graphics: Phaser.GameObjects.Graphics) => void;

const drawWebGlob: Draw = (graphics) => {
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
};

const drawWebNet: Draw = (graphics) => {
  graphics.lineStyle(3, colors.web, 0.92);
  graphics.strokeEllipse(24, 16, 44, 28);
  graphics.lineBetween(4, 16, 44, 16);
  graphics.lineBetween(24, 2, 24, 30);
  graphics.lineStyle(1, 0xbff7ff, 0.82);
  graphics.strokeEllipse(24, 16, 28, 18);
  graphics.lineBetween(10, 8, 38, 24);
  graphics.lineBetween(38, 8, 10, 24);
  graphics.generateTexture("webNet", 48, 32);
};

const drawBullet: Draw = (graphics) => {
  graphics.fillStyle(colors.danger);
  graphics.fillCircle(5, 5, 5);
  graphics.generateTexture("bullet", 10, 10);
};

const drawRoof: Draw = (graphics) => {
  graphics.fillStyle(0x303b59);
  graphics.fillRoundedRect(0, 0, 64, 18, 4);
  graphics.generateTexture("roof", 64, 18);
};

/** The level-exit marker: a glowing web-spiral the hero swings into. */
const drawGoalBeacon: Draw = (graphics) => {
  graphics.fillStyle(0x2ce5d2, 0.14);
  graphics.fillCircle(60, 60, 58);
  graphics.lineStyle(3, colors.web, 0.9);
  for (const radius of [22, 36, 50]) {
    graphics.strokeCircle(60, 60, radius);
  }
  graphics.lineStyle(2, 0x2ce5d2, 0.85);
  for (let spoke = 0; spoke < 8; spoke += 1) {
    const angle = (Math.PI * 2 * spoke) / 8;
    graphics.lineBetween(
      60,
      60,
      60 + Math.cos(angle) * 56,
      60 + Math.sin(angle) * 56,
    );
  }
  graphics.fillStyle(0xf6f3ff, 0.95);
  graphics.fillCircle(60, 60, 10);
  graphics.generateTexture("goalBeacon", 120, 120);
};

const drawSidewalkTile: Draw = (graphics) => {
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
};

const drawBrickFacade: Draw = (graphics) => {
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
};

const drawStorefront: Draw = (graphics) => {
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
};

const drawApartmentDoor: Draw = (graphics) => {
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
};

const drawStreetLight: Draw = (graphics) => {
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
};

const drawTrashCan: Draw = (graphics) => {
  graphics.fillStyle(0x46516a);
  graphics.fillRoundedRect(8, 14, 34, 46, 6);
  graphics.fillStyle(0x5d6a87);
  graphics.fillRect(5, 8, 40, 10);
  graphics.fillStyle(0x202638);
  graphics.fillRect(16, 24, 18, 4);
  graphics.fillRect(16, 36, 18, 4);
  graphics.generateTexture("trashCan", 52, 68);
};

const drawHydrant: Draw = (graphics) => {
  graphics.fillStyle(0xd94545);
  graphics.fillRoundedRect(16, 18, 22, 38, 8);
  graphics.fillStyle(0xf05a5a);
  graphics.fillCircle(27, 16, 11);
  graphics.fillStyle(0x7c1d1d);
  graphics.fillRect(8, 36, 38, 8);
  graphics.fillStyle(0x242a36);
  graphics.fillRect(18, 56, 18, 8);
  graphics.generateTexture("hydrant", 56, 70);
};

const drawCrosswalkStripe: Draw = (graphics) => {
  graphics.fillStyle(0xe7edf7, 0.72);
  graphics.fillRect(0, 0, 34, 130);
  graphics.generateTexture("crosswalkStripe", 34, 130);
};

const drawLaneDash: Draw = (graphics) => {
  graphics.fillStyle(0xe8c85e, 0.74);
  graphics.fillRoundedRect(0, 0, 92, 8, 4);
  graphics.generateTexture("laneDash", 92, 8);
};

const drawFoodCart: Draw = (graphics) => {
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
};

const drawNewsStand: Draw = (graphics) => {
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
};

const drawStoop: Draw = (graphics) => {
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
};

const drawPlanter: Draw = (graphics) => {
  graphics.fillStyle(0x1e4e45);
  graphics.fillRoundedRect(4, 48, 70, 16, 5);
  graphics.fillStyle(0x2a654f);
  graphics.fillCircle(22, 42, 19);
  graphics.fillCircle(42, 34, 24);
  graphics.fillCircle(59, 44, 18);
  graphics.fillStyle(0x6e4c36);
  graphics.fillRect(38, 44, 8, 15);
  graphics.generateTexture("planter", 80, 70);
};

const drawRoofVent: Draw = (graphics) => {
  graphics.fillStyle(0x222b42);
  graphics.fillRoundedRect(0, 20, 78, 44, 4);
  graphics.fillStyle(0x485572);
  graphics.fillRect(8, 8, 62, 14);
  graphics.lineStyle(2, 0x111827, 0.8);
  for (let x = 14; x < 65; x += 12) {
    graphics.lineBetween(x, 10, x - 4, 20);
  }
  graphics.generateTexture("roofVent", 82, 68);
};

const drawWaterTower: Draw = (graphics) => {
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
};

const drawParkTree: Draw = (graphics) => {
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
};

const drawParkBench: Draw = (graphics) => {
  graphics.fillStyle(0x35263a);
  graphics.fillRoundedRect(6, 26, 90, 12, 5);
  graphics.fillStyle(0x5b3a67);
  graphics.fillRoundedRect(0, 16, 102, 12, 5);
  graphics.lineStyle(4, 0x222b42, 1);
  graphics.lineBetween(18, 28, 10, 54);
  graphics.lineBetween(82, 28, 92, 54);
  graphics.generateTexture("parkBench", 104, 60);
};

const drawBat: Draw = (graphics) => {
  graphics.fillStyle(0x070911, 1);
  graphics.fillEllipse(22, 16, 12, 9);
  graphics.fillTriangle(17, 15, 0, 4, 8, 22);
  graphics.fillTriangle(27, 15, 44, 4, 36, 22);
  graphics.fillStyle(0xb8efff, 0.82);
  graphics.fillCircle(20, 14, 1.5);
  graphics.fillCircle(24, 14, 1.5);
  graphics.generateTexture("bat", 46, 28);
};

const DRAWINGS = {
  webGlob: drawWebGlob,
  webNet: drawWebNet,
  bullet: drawBullet,
  roof: drawRoof,
  goalBeacon: drawGoalBeacon,
  sidewalkTile: drawSidewalkTile,
  brickFacade: drawBrickFacade,
  storefront: drawStorefront,
  apartmentDoor: drawApartmentDoor,
  streetLight: drawStreetLight,
  trashCan: drawTrashCan,
  hydrant: drawHydrant,
  crosswalkStripe: drawCrosswalkStripe,
  laneDash: drawLaneDash,
  foodCart: drawFoodCart,
  newsStand: drawNewsStand,
  stoop: drawStoop,
  planter: drawPlanter,
  roofVent: drawRoofVent,
  waterTower: drawWaterTower,
  parkTree: drawParkTree,
  parkBench: drawParkBench,
  bat: drawBat,
} satisfies Record<string, Draw>;

export const PROP_TEXTURES = Object.keys(DRAWINGS) as readonly PropTextureKey[];

export type PropTextureKey = keyof typeof DRAWINGS;

/**
 * Generates the prop textures this scene is missing. Textures are game-global
 * and shared with every object already drawing from them, so regenerating an
 * existing key would invalidate live sprites on every level load.
 */
export const createPropTextures = (scene: Phaser.Scene): void => {
  const missing = PROP_TEXTURES.filter((key) => !scene.textures.exists(key));
  if (missing.length === 0) {
    return;
  }

  const graphics = scene.add.graphics();
  for (const key of missing) {
    graphics.clear();
    DRAWINGS[key](graphics);
  }
  graphics.destroy();
};
