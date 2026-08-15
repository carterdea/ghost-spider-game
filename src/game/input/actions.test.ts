import { describe, expect, test } from "bun:test";
import {
  type ActionKeys,
  createEmptyActions,
  type GameAction,
  type KeyLike,
  pressedSlot,
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

  /**
   * Mute is an action rather than a raw `keydown-M` listener because Phaser
   * only swallows the OS auto-repeat for keys it has been asked to hold, and
   * the scene reads actions on the edge of a press. Every repeat used to write
   * `localStorage` and restart the sequencer.
   */
  test("mute is an action, so a held key is one press", () => {
    expect(readActions(keyboard({ mute: [true] })).mute).toBe(true);
    expect(readActions(keyboard()).mute).toBe(false);
  });

  test("leaves every other action alone", () => {
    const actions = readActions(keyboard({ start: [false, true] }));

    expect(actions.start).toBe(true);
    expect(actions).toEqual({ ...createEmptyActions(), start: true });
  });
});

describe("weapon slots", () => {
  const slots = (held: number | null): KeyLike[] =>
    Array.from({ length: 6 }, (_, index) => ({ isDown: index === held }));

  test("reports the slot being held", () => {
    expect(pressedSlot(slots(0))).toBe(0);
    expect(pressedSlot(slots(5))).toBe(5);
  });

  test("reports nothing when no number key is down", () => {
    expect(pressedSlot(slots(null))).toBeUndefined();
  });

  test("takes the first of two held at once", () => {
    // A rolled press should equip something rather than nothing.
    const both = slots(null);
    both[2] = { isDown: true };
    both[4] = { isDown: true };
    expect(pressedSlot(both)).toBe(2);
  });
});
