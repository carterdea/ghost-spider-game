/**
 * The lookahead scheduler.
 *
 * `pump` is called on a coarse timer — every ~25 ms — and each call hands the
 * audio clock every note that starts inside the next ~100 ms. Nothing is ever
 * triggered "now", so the beat is placed by the audio hardware rather than by
 * whenever a frame happened to land. That is the whole trick.
 */

import type { MusicLayer, ScheduledNote, Song } from "./types";

export const DEFAULT_INTERVAL_MS = 25;
const DEFAULT_LOOKAHEAD_SECONDS = 0.1;

/** Stems cross-fade over roughly a bar, so a district change is a swell. */
const LAYER_FADE_SECONDS = 1.6;
/** Below this a stem is inaudible; skip its notes and save the voices. */
const SILENT_LEVEL = 0.02;
/**
 * A backgrounded tab freezes the timer but not the clock. Rather than dumping
 * the backlog into one burst, slide the whole timeline forward and carry on
 * from the same point in the bar.
 */
const RESYNC_SECONDS = 0.25;

/** Called for every note that falls inside the window. `at` is absolute. */
export type NoteHandler = (
  note: ScheduledNote,
  at: number,
  level: number,
) => void;

export interface SequencerOptions {
  readonly lookaheadSeconds?: number;
}

/** Flattens the parts into one list ordered by beat, ready to walk in a ring. */
export const flattenSong = (song: Song): ScheduledNote[] =>
  song.parts
    .flatMap((part) =>
      part.notes.map((note) => ({
        layer: part.layer,
        instrument: part.instrument,
        beat: note.beat,
        note: note.note,
        length: note.length,
        velocity: note.velocity ?? 1,
      })),
    )
    .sort((left, right) => left.beat - right.beat);

export class Sequencer {
  private readonly events: readonly ScheduledNote[];
  private readonly secondsPerBeat: number;
  private readonly loopBeats: number;
  private readonly lookahead: number;
  private readonly emit: NoteHandler;
  private readonly levels = new Map<MusicLayer, number>();

  private active: ReadonlySet<MusicLayer> = new Set();
  /** Context time of beat zero of the current pass through the loop. */
  private origin = 0;
  private cursor = 0;
  private pass = 0;
  private lastPump = 0;
  private running = false;

  public constructor(
    song: Song,
    emit: NoteHandler,
    options: SequencerOptions = {},
  ) {
    if (song.loopBeats <= 0) {
      throw new RangeError("a song needs a positive loop length");
    }
    this.events = flattenSong(song);
    this.secondsPerBeat = 60 / song.bpm;
    this.loopBeats = song.loopBeats;
    this.lookahead = options.lookaheadSeconds ?? DEFAULT_LOOKAHEAD_SECONDS;
    this.emit = emit;
  }

  public get isRunning(): boolean {
    return this.running;
  }

  /** Beat the next note will be scheduled at, counted from the first pass. */
  public get position(): number {
    return this.pass * this.loopBeats + this.beatAt(this.cursor);
  }

  /**
   * `now` becomes the context time of beat zero, so callers hand it a moment
   * slightly in the future. Stems already switched on start at full level —
   * the cross-fade is for changes, not for the first bar.
   */
  public start(now: number): void {
    this.running = true;
    this.origin = now;
    this.cursor = 0;
    this.pass = 0;
    this.lastPump = now;
    this.snapLevels();
  }

  public stop(): void {
    this.running = false;
  }

  /** Stems not named here fade out; new ones fade in. Safe to call every frame. */
  public setLayers(layers: Iterable<MusicLayer>): void {
    this.active = new Set(layers);
    if (!this.running) {
      this.snapLevels();
    }
  }

  public levelOf(layer: MusicLayer): number {
    return this.levels.get(layer) ?? 0;
  }

  public pump(now: number): void {
    if (!this.running || this.events.length === 0) {
      return;
    }
    this.advanceFades(now);
    this.resync(now);

    const horizon = now + this.lookahead;
    while (this.timeAt(this.cursor) < horizon) {
      const event = this.events[this.cursor];
      const level = this.levelOf(event.layer);
      if (level > SILENT_LEVEL) {
        this.emit(event, this.timeAt(this.cursor), level);
      }
      this.advance();
    }
  }

  private beatAt(cursor: number): number {
    return this.events[cursor]?.beat ?? 0;
  }

  private timeAt(cursor: number): number {
    const beat = this.pass * this.loopBeats + this.beatAt(cursor);
    return this.origin + beat * this.secondsPerBeat;
  }

  private advance(): void {
    this.cursor += 1;
    if (this.cursor < this.events.length) {
      return;
    }
    this.cursor = 0;
    this.pass += 1;
  }

  /** Drops the cross-fade and puts every stem straight at its target. */
  private snapLevels(): void {
    for (const layer of this.levels.keys()) {
      this.levels.set(layer, 0);
    }
    for (const layer of this.active) {
      this.levels.set(layer, 1);
    }
  }

  private advanceFades(now: number): void {
    const step = Math.max(now - this.lastPump, 0) / LAYER_FADE_SECONDS;
    this.lastPump = now;
    for (const layer of new Set([...this.levels.keys(), ...this.active])) {
      const target = this.active.has(layer) ? 1 : 0;
      const current = this.levels.get(layer) ?? 0;
      const next =
        target > current
          ? Math.min(current + step, target)
          : Math.max(current - step, target);
      this.levels.set(layer, next);
    }
  }

  private resync(now: number): void {
    const behind = now - this.timeAt(this.cursor);
    if (behind > RESYNC_SECONDS) {
      this.origin += behind;
    }
  }
}
