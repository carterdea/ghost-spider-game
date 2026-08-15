import { describe, expect, test } from "bun:test";
import { TICKS_PER_BEAT, toMidiFile, varint } from "./midi";
import { midiOf } from "./notes";
import { LOOP_BEATS, SONG } from "./song";

const text = (bytes: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...bytes.slice(at, at + length));

const uint32At = (bytes: Uint8Array, at: number): number =>
  (bytes[at] << 24) |
  (bytes[at + 1] << 16) |
  (bytes[at + 2] << 8) |
  bytes[at + 3];

const uint16At = (bytes: Uint8Array, at: number): number =>
  (bytes[at] << 8) | bytes[at + 1];

const readVarint = (bytes: Uint8Array, at: number): [number, number] => {
  let value = 0;
  let index = at;
  for (;;) {
    const byte = bytes[index];
    index += 1;
    value = value * 0x80 + (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return [value, index];
    }
  }
};

/**
 * Walks a track the way a sequencer would — delta, status, payload — turning
 * relative deltas back into absolute ticks. Any wrong length overruns the
 * buffer, so simply reaching the end proves the event stream is well formed.
 */
const readTrack = (
  body: Uint8Array,
): Array<{ tick: number; status: number }> => {
  const events: Array<{ tick: number; status: number }> = [];
  let at = 0;
  let tick = 0;
  while (at < body.length) {
    const [delta, afterDelta] = readVarint(body, at);
    tick += delta;
    const status = body[afterDelta];
    at = afterDelta + 1;
    if (status === 0xff) {
      const [length, afterLength] = readVarint(body, at + 1);
      at = afterLength + length;
    } else {
      at += 2;
    }
    events.push({ tick, status });
  }
  expect(at).toBe(body.length);
  return events;
};

/**
 * Walks the file the way a reader would: header, then every track by its own
 * declared length. If a single chunk length is wrong this lands off the end.
 */
const chunks = (bytes: Uint8Array): Array<{ id: string; body: Uint8Array }> => {
  const found: Array<{ id: string; body: Uint8Array }> = [];
  let at = 0;
  while (at < bytes.length) {
    const id = text(bytes, at, 4);
    const length = uint32At(bytes, at + 4);
    found.push({ id, body: bytes.slice(at + 8, at + 8 + length) });
    at += 8 + length;
  }
  expect(at).toBe(bytes.length);
  return found;
};

describe("variable-length quantities", () => {
  test("encodes the boundaries the spec calls out", () => {
    expect(varint(0)).toEqual([0x00]);
    expect(varint(0x40)).toEqual([0x40]);
    expect(varint(0x7f)).toEqual([0x7f]);
    expect(varint(0x80)).toEqual([0x81, 0x00]);
    expect(varint(0x2000)).toEqual([0xc0, 0x00]);
    expect(varint(0x3fff)).toEqual([0xff, 0x7f]);
    expect(varint(0x4000)).toEqual([0x81, 0x80, 0x00]);
    expect(varint(0x0fffffff)).toEqual([0xff, 0xff, 0xff, 0x7f]);
  });

  test("sets the continuation bit on every byte but the last", () => {
    for (const value of [0x80, 0x4000, 0x100000]) {
      const bytes = varint(value);
      expect(bytes.slice(0, -1).every((byte) => (byte & 0x80) !== 0)).toBe(
        true,
      );
      expect((bytes.at(-1) ?? 0x80) & 0x80).toBe(0);
    }
  });

  test("refuses deltas that are not whole and positive", () => {
    expect(() => varint(-1)).toThrow(RangeError);
    expect(() => varint(1.5)).toThrow(RangeError);
  });
});

describe("the MIDI file", () => {
  const bytes = toMidiFile(SONG);
  const parsed = chunks(bytes);

  test("opens with a Format-1 header", () => {
    expect(text(bytes, 0, 4)).toBe("MThd");
    expect(uint32At(bytes, 4)).toBe(6);
    expect(uint16At(bytes, 8)).toBe(1);
    // One tempo track plus one per stem.
    expect(uint16At(bytes, 10)).toBe(SONG.parts.length + 1);
    expect(uint16At(bytes, 12)).toBe(TICKS_PER_BEAT);
  });

  test("is structurally whole from first byte to last", () => {
    expect(parsed[0].id).toBe("MThd");
    expect(parsed.slice(1).every(({ id }) => id === "MTrk")).toBe(true);
    expect(parsed).toHaveLength(SONG.parts.length + 2);
  });

  test("ends every track with end-of-track", () => {
    for (const { body } of parsed.slice(1)) {
      expect([...body.slice(-3)]).toEqual([0xff, 0x2f, 0x00]);
    }
  });

  test("carries the tempo and time signature", () => {
    const tempo = parsed[1].body;
    const at = tempo.indexOf(0x51);
    expect([...tempo.slice(at - 1, at + 2)]).toEqual([0xff, 0x51, 0x03]);
    const microseconds =
      (tempo[at + 2] << 16) | (tempo[at + 3] << 8) | tempo[at + 4];
    expect(Math.round(60_000_000 / microseconds)).toBe(SONG.bpm);

    const signature = tempo.indexOf(0x58);
    expect(tempo[signature + 2]).toBe(SONG.beatsPerBar);
  });

  test("closes every note it opens", () => {
    for (const [index, { body }] of parsed.slice(2).entries()) {
      const events = readTrack(body);
      const count = (high: number): number =>
        events.filter((event) => (event.status & 0xf0) === high).length;

      expect(count(0x90)).toBe(SONG.parts[index].notes.length);
      expect(count(0x80)).toBe(SONG.parts[index].notes.length);
    }
  });

  test("never lets a note off arrive before its note on", () => {
    for (const { body } of parsed.slice(2)) {
      const ticks = readTrack(body).map((event) => event.tick);
      // Deltas cannot be negative, so a sorted result is the only valid one.
      expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    }
  });

  test("puts the hats on the percussion channel and nothing else", () => {
    const trackOf = (layer: string): Uint8Array => {
      const index = SONG.parts.findIndex((part) => part.layer === layer);
      return parsed[index + 2].body;
    };
    expect(trackOf("pulse").includes(0x99)).toBe(true);
    expect(trackOf("bass").includes(0x99)).toBe(false);
  });

  test("names each track after its stem", () => {
    for (const [index, part] of SONG.parts.entries()) {
      const body = parsed[index + 2].body;
      // Delta, 0xFF, name type, length, then the name itself.
      expect(text(body, 4, part.layer.length)).toBe(part.layer);
    }
  });

  test("fits every track inside one pass of the loop", () => {
    const loopTicks = LOOP_BEATS * TICKS_PER_BEAT;
    for (const { body } of parsed.slice(2)) {
      const last = readTrack(body).at(-1)?.tick ?? -1;
      expect(last).toBeGreaterThan(0);
      // Nothing may spill past the loop point, or the seam doubles up.
      expect(last).toBeLessThanOrEqual(loopTicks);
    }
    // And the piece really does fill the loop rather than stopping short.
    const padTicks = readTrack(parsed[2].body).at(-1)?.tick ?? 0;
    expect(padTicks).toBe(loopTicks);
  });

  test("keeps every pitch inside the MIDI range", () => {
    for (const part of SONG.parts) {
      for (const note of part.notes) {
        expect(midiOf(note.note)).toBeGreaterThanOrEqual(0);
        expect(midiOf(note.note)).toBeLessThanOrEqual(127);
      }
    }
  });

  test("is deterministic", () => {
    expect(toMidiFile(SONG)).toEqual(bytes);
  });
});
