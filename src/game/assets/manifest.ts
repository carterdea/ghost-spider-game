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

const framePaths = (
  directory: string,
  count: number,
): readonly { key: string; path: string }[] =>
  Array.from({ length: count }, (_, index) => {
    const frame = String(index + 1).padStart(2, "0");
    return {
      key: `${directory}-${frame}`,
      path: `/assets/characters/${directory}/frames/${frame}.png`,
    };
  });

export const art = {
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

/** Frames `first`..`first + count - 1`, one-based to match the file names. */
const cycle = (
  frames: readonly { key: string; path: string }[],
  first: number,
  count: number,
): readonly string[] =>
  frames.slice(first - 1, first - 1 + count).map(({ key }) => key);

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
  npcs: art.npcs.map(({ key }) => key),
  street: art.environments[3].key,
} as const;

export const preloadArt = [
  ...art.environments,
  ...art.hero,
  ...art.robot,
  ...art.enforcer,
  ...art.drone,
  ...art.npcs,
] as const;
