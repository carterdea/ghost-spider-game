export const colors = {
  ghostWhite: 0xf6f3ff,
  suitPurple: 0x6f4cff,
  wingLavender: 0xb9a6ff,
  balletTeal: 0x1fd4c9,
  web: 0xeef8ff,
  robot: 0x8a93a6,
  gunner: 0x171923,
  danger: 0xff4d6d,
} as const;

/** `count` frames named `01.png` upward, keyed `<prefix>-01` and so on. */
const frameSet = (
  count: number,
  prefix: string,
  directory: string,
): readonly { key: string; path: string }[] =>
  Array.from({ length: count }, (_, index) => {
    const frame = String(index + 1).padStart(2, "0");
    return { key: `${prefix}-${frame}`, path: `${directory}/${frame}.png` };
  });

const framePaths = (name: string, count: number) =>
  frameSet(count, name, `/assets/characters/${name}/frames`);

/** Props live one folder per prop, because their frame sizes differ per weapon. */
const weaponFrames = (name: string, count: number) =>
  frameSet(count, `weapon-${name}`, `/assets/weapons/${name}`);

const weapons = {
  webBomb: weaponFrames("web-bomb", 1),
  // Three arming frames, identical drawing with only the emissives rescaled.
  webBombArmed: weaponFrames("web-bomb-armed", 3),
  webMesh: weaponFrames("web-mesh", 1),
  impactWeb: weaponFrames("impact-web", 1),
  webLineDart: weaponFrames("web-line-dart", 1),
  // Three distinct splats so repeated impacts do not read as a stamp.
  webSplat: weaponFrames("web-splat", 3),
} as const;

export const art = {
  weapons,
  environments: [
    {
      key: "environment-midtown",
      path: "/assets/environments/midtown.webp",
    },
    { key: "environment-park", path: "/assets/environments/park.webp" },
    {
      key: "environment-waterfront",
      path: "/assets/environments/waterfront.webp",
    },
    {
      key: "environment-wet-asphalt",
      path: "/assets/environments/wet-asphalt.webp",
    },
  ],
  hero: framePaths("hero", 24),
  robot: framePaths("robot", 6),
  enforcer: framePaths("enforcer", 6),
  drone: framePaths("drone", 10),
  npcs: framePaths("npcs", 6),
} as const;

const keysOf = (
  frames: readonly { key: string; path: string }[],
): readonly string[] => frames.map(({ key }) => key);

/** Frames `first`..`first + count - 1`, one-based to match the file names. */
const cycle = (
  frames: readonly { key: string; path: string }[],
  first: number,
  count: number,
): readonly string[] => keysOf(frames.slice(first - 1, first - 1 + count));

// Hero frames 01-06 are the original two-pose sets, kept so the art stays
// recoverable. Frames 07+ are the hand-directed multi-pose cycles. Frames 13-16
// are a superseded idle whose poses drifted in yaw; 21-24 replace them.
export const artKeys = {
  hero: {
    idle: cycle(art.hero, 21, 4),
    run: cycle(art.hero, 7, 6),
    glide: art.hero[4].key,
    swing: art.hero[5].key,
    swingCycle: cycle(art.hero, 17, 4),
  },
  robot: cycle(art.robot, 3, 4),
  enforcer: cycle(art.enforcer, 3, 4),
  // Drone frames 03-06 were a yaw sweep, not a hover; 07-10 hold station and
  // loop cleanly, so the animation no longer needs to yoyo.
  drone: cycle(art.drone, 7, 4),
  npcs: keysOf(art.npcs),
  street: art.environments[3].key,
  // Painted replacements for the procedural weapon placeholders in
  // src/phaser/world/textures.ts; every prop registers on its frame centre.
  weapons: {
    webBomb: weapons.webBomb[0].key,
    webBombArmed: keysOf(weapons.webBombArmed),
    webMesh: weapons.webMesh[0].key,
    impactWeb: weapons.impactWeb[0].key,
    webLineDart: weapons.webLineDart[0].key,
    webSplats: keysOf(weapons.webSplat),
  },
} as const;

export const preloadArt = [
  ...Object.values(art.weapons).flat(),
  ...art.environments,
  ...art.hero,
  ...art.robot,
  ...art.enforcer,
  ...art.drone,
  ...art.npcs,
] as const;
