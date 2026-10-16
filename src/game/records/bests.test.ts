import { describe, expect, test } from "bun:test";
import type { KeyValueStorage } from "../../storage";
import { LEVELS } from "../content/levels";
import type { RunSummary } from "../simulation/state";
import {
  createRunRecords,
  NO_BESTS,
  type PersonalBests,
  parseBests,
  readBests,
  recordRun,
} from "./bests";

const memoryStorage = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

const run = (overrides: Partial<RunSummary> = {}): RunSummary => ({
  score: 1200,
  districtsCleared: 3,
  districtReached: 4,
  bestChain: 3,
  elapsedMs: 90_000,
  ...overrides,
});

const fullClear = (overrides: Partial<RunSummary> = {}): RunSummary =>
  run({
    districtsCleared: LEVELS.length,
    districtReached: LEVELS.length,
    ...overrides,
  });

const bests = (overrides: Partial<PersonalBests> = {}): PersonalBests => ({
  ...NO_BESTS,
  ...overrides,
});

describe("parseBests", () => {
  test("falls back to no bests for anything unreadable", () => {
    for (const raw of [null, "", "not json", "null", "7", '"text"']) {
      expect(parseBests(raw)).toEqual(NO_BESTS);
    }
  });

  test("keeps the fields that survived and drops the ones that did not", () => {
    const raw = JSON.stringify({
      score: 900,
      bestChain: -2,
      fastestClearMs: "fast",
      furthestDistrict: 99,
    });

    expect(parseBests(raw)).toEqual({
      score: 900,
      bestChain: 0,
      fastestClearMs: null,
      furthestDistrict: LEVELS.length,
    });
  });
});

describe("readBests", () => {
  test("treats storage that throws as empty", () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
    };

    expect(readBests(broken)).toEqual(NO_BESTS);
    expect(readBests(undefined)).toEqual(NO_BESTS);
  });
});

describe("recordRun", () => {
  test("a first run sets every best it reached", () => {
    const recorded = recordRun(NO_BESTS, run());

    expect(recorded.bests).toEqual({
      score: 1200,
      bestChain: 3,
      fastestClearMs: null,
      furthestDistrict: 4,
    });
    expect([...recorded.improved]).toEqual([
      "score",
      "bestChain",
      "furthestDistrict",
    ]);
  });

  test("a worse run keeps the old bests and flags nothing", () => {
    const previous = bests({
      score: 5000,
      bestChain: 6,
      fastestClearMs: 60_000,
      furthestDistrict: LEVELS.length,
    });

    const recorded = recordRun(previous, fullClear({ score: 10 }));

    expect(recorded.bests).toEqual(previous);
    expect(recorded.improved.size).toBe(0);
  });

  test("only a full clear can set the fastest time, and lower wins", () => {
    const previous = bests({ fastestClearMs: 120_000 });

    expect(
      recordRun(previous, run({ elapsedMs: 1_000 })).bests.fastestClearMs,
    ).toBe(120_000);
    const recorded = recordRun(previous, fullClear({ elapsedMs: 100_000 }));
    expect(recorded.bests.fastestClearMs).toBe(100_000);
    expect(recorded.improved.has("fastestClearMs")).toBe(true);
  });

  test("a chain of one is not a best chain", () => {
    expect(recordRun(NO_BESTS, run({ bestChain: 1 })).improved).not.toContain(
      "bestChain",
    );
  });
});

describe("createRunRecords", () => {
  test("bests survive into a fresh set of records", () => {
    const storage = memoryStorage();
    createRunRecords(storage).settle(fullClear({ score: 4200 }));

    expect(createRunRecords(storage).bests).toEqual({
      score: 4200,
      bestChain: 3,
      fastestClearMs: 90_000,
      furthestDistrict: LEVELS.length,
    });
  });
});
