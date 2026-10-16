import type { KeyValueStorage } from "../../storage";
import { LEVELS } from "../content/levels";
import type { RunSummary } from "../simulation/state";

export interface PersonalBests {
  readonly score: number;
  readonly bestChain: number;
  readonly fastestClearMs: number | null;
  readonly furthestDistrict: number;
}

export type BestKey = keyof PersonalBests;

export interface RecordedRun {
  readonly bests: PersonalBests;
  readonly improved: ReadonlySet<BestKey>;
}

export interface RunRecords {
  readonly bests: PersonalBests;
  settle: (run: RunSummary) => RecordedRun;
}

export const NO_BESTS: PersonalBests = {
  score: 0,
  bestChain: 0,
  fastestClearMs: null,
  furthestDistrict: 0,
};

export const BEST_KEYS = [
  "score",
  "bestChain",
  "fastestClearMs",
  "furthestDistrict",
] as const satisfies readonly BestKey[];

const STORAGE_KEY = "ghost-spider:bests";

const MIN_CHAIN = 2;

const count = (value: unknown, max = Number.MAX_SAFE_INTEGER): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? Math.min(value, max)
    : 0;

const duration = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;

export const parseBests = (raw: string | null): PersonalBests => {
  if (raw === null) {
    return NO_BESTS;
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) {
      return NO_BESTS;
    }
    const fields: Partial<Record<BestKey, unknown>> = data;
    return {
      score: count(fields.score),
      bestChain: count(fields.bestChain),
      fastestClearMs: duration(fields.fastestClearMs),
      furthestDistrict: count(fields.furthestDistrict, LEVELS.length),
    };
  } catch {
    return NO_BESTS;
  }
};

export const readBests = (
  storage: KeyValueStorage | undefined,
): PersonalBests => {
  try {
    return parseBests(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return NO_BESTS;
  }
};

export const writeBests = (
  storage: KeyValueStorage | undefined,
  bests: PersonalBests,
): void => {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(bests));
  } catch {
    return;
  }
};

const faster = (time: number | null, record: number | null): number | null =>
  time === null || (record !== null && record <= time) ? record : time;

export const recordRun = (
  previous: PersonalBests,
  run: RunSummary,
): RecordedRun => {
  const cleared = run.districtsCleared >= LEVELS.length;
  const bests: PersonalBests = {
    score: Math.max(previous.score, run.score),
    bestChain: Math.max(
      previous.bestChain,
      run.bestChain >= MIN_CHAIN ? run.bestChain : 0,
    ),
    fastestClearMs: faster(
      cleared ? run.elapsedMs : null,
      previous.fastestClearMs,
    ),
    furthestDistrict: Math.max(previous.furthestDistrict, run.districtReached),
  };
  return {
    bests,
    improved: new Set(BEST_KEYS.filter((key) => bests[key] !== previous[key])),
  };
};

export const createRunRecords = (
  storage: KeyValueStorage | undefined,
): RunRecords => {
  let bests = readBests(storage);
  return {
    get bests() {
      return bests;
    },
    settle: (run) => {
      const recorded = recordRun(bests, run);
      bests = recorded.bests;
      if (recorded.improved.size > 0) {
        writeBests(storage, bests);
      }
      return recorded;
    },
  };
};
