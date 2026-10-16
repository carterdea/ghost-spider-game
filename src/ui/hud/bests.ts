import { LEVELS } from "../../game/content/levels";
import {
  BEST_KEYS,
  type BestKey,
  type PersonalBests,
  type RecordedRun,
} from "../../game/records/bests";
import type { Add } from "./elements";
import { chainLabel, formatDuration } from "./format";

const BEST_LABELS: Record<BestKey, string> = {
  score: "Best score",
  bestChain: "Best chain",
  fastestClearMs: "Fastest clear",
  furthestDistrict: "Furthest",
};

const bestValue = (bests: PersonalBests, key: BestKey): string => {
  switch (key) {
    case "score":
      return `${bests.score}`;
    case "bestChain":
      return chainLabel(bests.bestChain);
    case "fastestClearMs":
      return bests.fastestClearMs === null
        ? "—"
        : formatDuration(bests.fastestClearMs);
    case "furthestDistrict":
      return `${bests.furthestDistrict} / ${LEVELS.length}`;
  }
};

export interface BestsNodes {
  readonly root: HTMLElement;
  readonly cells: ReadonlyMap<
    BestKey,
    { readonly root: HTMLElement; readonly value: HTMLElement }
  >;
}

export const buildBests = (add: Add, parent: HTMLElement): BestsNodes => {
  const root = add(parent, "div", "run-bests");
  root.setAttribute("aria-label", "Personal bests");
  root.hidden = true;
  const cells = new Map(
    BEST_KEYS.map((key) => {
      const cell = add(root, "div", "run-stat");
      add(cell, "span", "run-stat-label", BEST_LABELS[key]);
      const value = add(cell, "strong", "run-stat-value");
      add(cell, "span", "run-best-flag", "New best");
      return [key, { root: cell, value }] as const;
    }),
  );
  return { root, cells };
};

export const writeBests = (
  nodes: BestsNodes,
  recorded: RecordedRun | null,
): void => {
  nodes.root.hidden = !recorded || recorded.bests.furthestDistrict === 0;
  if (!recorded) {
    return;
  }
  for (const [key, cell] of nodes.cells) {
    cell.value.textContent = bestValue(recorded.bests, key);
    cell.root.classList.toggle("is-new", recorded.improved.has(key));
  }
};
