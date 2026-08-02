/**
 * Serialises the score to a standard Format-1 MIDI file: a tempo track
 * followed by one named track per stem. The point is a round trip through a
 * DAW — open the file, move notes around, and transcribe the result back into
 * `song.ts`. There is no importer; the format's write side is short and
 * well-specified, but reading arbitrary MIDI back is a much larger job than
 * hand-editing the note table it would produce.
 *
 * No dependencies: the whole format used here is a handful of byte sequences.
 */

import { midiOf } from "./notes";
import type { Part, Song } from "./types";

/** Division: ticks per quarter note. 480 divides every duration in the song. */
export const TICKS_PER_BEAT = 480;

/** MIDI channel 10 (index 9) is percussion; the hats belong there. */
const DRUM_CHANNEL = 9;

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const META = 0xff;
const META_TRACK_NAME = 0x03;
const META_END_OF_TRACK = 0x2f;
const META_TEMPO = 0x51;
const META_TIME_SIGNATURE = 0x58;

const MICROSECONDS_PER_MINUTE = 60_000_000;
const MAX_VELOCITY = 127;

/** Variable-length quantity: seven bits a byte, high bit means "more". */
export const varint = (value: number): number[] => {
  if (value < 0 || !Number.isInteger(value)) {
    throw new RangeError(`not a MIDI delta: ${value}`);
  }
  const bytes = [value & 0x7f];
  let rest = Math.floor(value / 0x80);
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  return bytes;
};

const uint16 = (value: number): number[] => [(value >> 8) & 0xff, value & 0xff];

const uint32 = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

const ascii = (text: string): number[] =>
  [...text].map((character) => character.charCodeAt(0) & 0x7f);

const chunk = (id: string, body: readonly number[]): number[] => [
  ...ascii(id),
  ...uint32(body.length),
  ...body,
];

const meta = (type: number, body: readonly number[]): number[] => [
  META,
  type,
  ...varint(body.length),
  ...body,
];

/** One note-on or note-off, held at an absolute tick until deltas are taken. */
interface TrackEvent {
  readonly tick: number;
  /** Offs sort before ons at the same tick, so a repeated pitch retriggers. */
  readonly off: boolean;
  readonly bytes: readonly number[];
}

const channelOf = (part: Part, index: number): number =>
  part.layer === "pulse" ? DRUM_CHANNEL : index;

const velocityOf = (velocity: number): number =>
  Math.min(Math.max(Math.round(velocity * MAX_VELOCITY), 1), MAX_VELOCITY);

const noteEvents = (part: Part, channel: number): TrackEvent[] =>
  part.notes.flatMap((note) => {
    const key = midiOf(note.note);
    const start = Math.round(note.beat * TICKS_PER_BEAT);
    const stop = start + Math.max(Math.round(note.length * TICKS_PER_BEAT), 1);
    return [
      {
        tick: start,
        off: false,
        bytes: [NOTE_ON | channel, key, velocityOf(note.velocity ?? 1)],
      },
      { tick: stop, off: true, bytes: [NOTE_OFF | channel, key, 0] },
    ];
  });

/** Turns absolute ticks into the delta times the format actually stores. */
const withDeltas = (events: readonly TrackEvent[]): number[] => {
  const ordered = [...events].sort(
    (left, right) =>
      left.tick - right.tick || Number(right.off) - Number(left.off),
  );
  const bytes: number[] = [];
  let previous = 0;
  for (const event of ordered) {
    bytes.push(...varint(event.tick - previous), ...event.bytes);
    previous = event.tick;
  }
  return bytes;
};

const partTrack = (part: Part, index: number): number[] =>
  chunk("MTrk", [
    ...varint(0),
    ...meta(META_TRACK_NAME, ascii(part.layer)),
    ...withDeltas(noteEvents(part, channelOf(part, index))),
    ...varint(0),
    ...meta(META_END_OF_TRACK, []),
  ]);

const tempoTrack = (song: Song): number[] => {
  const microseconds = Math.round(MICROSECONDS_PER_MINUTE / song.bpm);
  return chunk("MTrk", [
    ...varint(0),
    ...meta(META_TRACK_NAME, ascii(song.name)),
    ...varint(0),
    ...meta(META_TEMPO, [
      (microseconds >> 16) & 0xff,
      (microseconds >> 8) & 0xff,
      microseconds & 0xff,
    ]),
    ...varint(0),
    // Numerator, denominator as a power of two, clocks per click, 32nds per beat.
    ...meta(META_TIME_SIGNATURE, [song.beatsPerBar, 2, 24, 8]),
    ...varint(0),
    ...meta(META_END_OF_TRACK, []),
  ]);
};

/** The song as the bytes of a `.mid` file. Pure: same song, same bytes. */
export const toMidiFile = (song: Song): Uint8Array => {
  const tracks = song.parts.map(partTrack);
  const header = chunk("MThd", [
    ...uint16(1),
    ...uint16(tracks.length + 1),
    ...uint16(TICKS_PER_BEAT),
  ]);
  return Uint8Array.from([...header, ...tempoTrack(song), ...tracks.flat()]);
};
