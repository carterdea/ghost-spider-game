import { describe, expect, test } from "bun:test";
import {
  type ActionKeys,
  createEmptyActions,
  type GameAction,
  readActions,
} from "./actions";

/** One key per action, plus whichever extras a test names. */
const keyboard = (
  extras: Partial<Record<GameAction, readonly boolean[]>> = {},
): ActionKeys => {
  const keys = {} as Record<GameAction, readonly { isDown: boolean }[]>;
  for (const action of Object.keys(createEmptyActions()) as GameAction[]) {
    keys[action] = (extras[action] ?? [false]).map((isDown) => ({ isDown }));
  }
  return keys;
};

describe("readActions", () => {
  test("reports nothing held on an untouched keyboard", () => {
    expect(readActions(keyboard())).toEqual(createEmptyActions());
  });

  test("an action bound to several keys answers to any of them", () => {
    // Pause carries Escape and P; either alone is the action being held.
    expect(readActions(keyboard({ pause: [true, false] })).pause).toBe(true);
    expect(readActions(keyboard({ pause: [false, true] })).pause).toBe(true);
    expect(readActions(keyboard({ pause: [true, true] })).pause).toBe(true);
    expect(readActions(keyboard({ pause: [false, false] })).pause).toBe(false);
  });

  test("leaves every other action alone", () => {
    const actions = readActions(keyboard({ start: [false, true] }));

    expect(actions.start).toBe(true);
    expect(actions).toEqual({ ...createEmptyActions(), start: true });
  });
});
