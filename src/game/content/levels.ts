export interface LevelDefinition {
  id: string;
  name: string;
  subtitle: string;
  startX: number;
  endX: number;
  backdropKey: string;
  accent: string;
}

export const LEVELS = [
  {
    id: "midtown-after-dark",
    name: "Midtown After Dark",
    subtitle: "Warm up across the water-tower rooftops.",
    startX: 0,
    endX: 1867,
    backdropKey: "environment-midtown",
    accent: "#55e8f0",
  },
  {
    id: "park-side-pursuit",
    name: "Park-Side Pursuit",
    subtitle: "Protect the night crowd beneath the trees.",
    startX: 1867,
    endX: 3734,
    backdropKey: "environment-park",
    accent: "#90f0c8",
  },
  {
    id: "bridge-line-finale",
    name: "Bridge-Line Finale",
    subtitle: "Clear the waterfront route before sunrise.",
    startX: 3734,
    endX: 5600,
    backdropKey: "environment-waterfront",
    accent: "#f68bd7",
  },
] as const satisfies readonly LevelDefinition[];

export const getLevelAtX = (x: number): number => {
  const index = LEVELS.findIndex(
    (level) => x >= level.startX && x < level.endX,
  );
  return index === -1 ? LEVELS.length - 1 : index;
};
