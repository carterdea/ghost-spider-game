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
  hero: framePaths("hero", 6),
  robot: framePaths("robot", 2),
  enforcer: framePaths("enforcer", 2),
  drone: framePaths("drone", 2),
  npcs: framePaths("npcs", 6),
} as const;

export const artKeys = {
  hero: {
    idle: [art.hero[0].key, art.hero[1].key],
    run: [art.hero[2].key, art.hero[3].key],
    glide: art.hero[4].key,
    swing: art.hero[5].key,
  },
  robot: art.robot.map(({ key }) => key),
  enforcer: art.enforcer.map(({ key }) => key),
  drone: art.drone.map(({ key }) => key),
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
