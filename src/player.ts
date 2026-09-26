// MIDI file playback: turns a .mid file into a Song, and plays a Song by
// calling back note-ons, note-offs and pedal changes on a timer, as if the
// notes were played live. Pure apart from timers; no DOM.

import { Midi } from '@tonejs/midi';

// Times in seconds from the start of the file.
export interface SongNote {
  midi: number;
  start: number;
  end: number;
  velocity: number; // 1-127, like a live key
}

export interface PedalChange {
  time: number;
  down: boolean;
}

export interface KeySignature {
  key: string; // a tonic name, e.g. 'A' or 'Bb'
  minor: boolean;
}

export interface Song {
  duration: number;
  notes: SongNote[];
  pedal: PedalChange[];
  keySignature: KeySignature | null;
}

const SUSTAIN_CC = 64;

// Key signatures by sharps (-7 flats .. +7 sharps). @tonejs/midi names a
// signature by its major key even when the file marks it minor (A minor
// reads as 'C' + 'minor'), so the minor tonic is looked up by position.
// The app has no Cb, so seven flats major reads as B, the same pitch.
const MAJOR_BY_SHARPS = ['B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const MINOR_BY_SHARPS = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];

function keySignature(sig: { key: string; scale: string } | undefined): KeySignature | null {
  const i = sig ? MAJOR_BY_SHARPS.indexOf(sig.key === 'Cb' ? 'B' : sig.key) : -1;
  if (!sig || i === -1) return null;
  const minor = sig.scale === 'minor';
  return { key: minor ? MINOR_BY_SHARPS[i] : MAJOR_BY_SHARPS[i], minor };
}

// A parsed Song, or an error message for the user. The player plays one
// instrument part, so a file whose notes are spread over several tracks is
// rejected. @tonejs/midi already splits a single-track file into one track
// per channel and instrument, so counting tracks with notes covers both.
export function parseSong(bytes: ArrayBuffer | Uint8Array): Song | string {
  let midi: Midi;
  try {
    midi = new Midi(bytes);
  } catch (e) {
    return "That file isn't a readable MIDI file.";
  }
  const parts = midi.tracks.filter(t => t.notes.length > 0);
  if (parts.length === 0) return 'That MIDI file has no notes.';
  if (parts.length > 1) return `That MIDI file has ${parts.length} instrument parts; only single-part files can be played.`;
  const track = parts[0];
  const notes = track.notes
    .map(n => ({
      midi: n.midi,
      start: n.time,
      end: n.time + n.duration,
      velocity: Math.min(127, Math.max(1, Math.round(n.velocity * 127))),
    }))
    .sort((a, b) => a.start - b.start);
  const pedal = (track.controlChanges[SUSTAIN_CC] ?? []).map(c => ({ time: c.time, down: c.value >= 0.5 }));
  return {
    // The last pedal-up can come after the last note-off.
    duration: Math.max(...notes.map(n => n.end), ...pedal.map(p => p.time)),
    notes,
    pedal,
    keySignature: keySignature(midi.header.keySignatures[0]),
  };
}

export interface PlayerCallbacks {
  noteOn(midi: number, velocity: number): void;
  noteOff(midi: number): void;
  pedal(down: boolean): void;
  // Played to the end; the player is stopped and back at 0.
  onEnd(): void;
}

type PlayerEvent =
  | { time: number; kind: 'off'; midi: number }
  | { time: number; kind: 'pedal'; down: boolean }
  | { time: number; kind: 'on'; midi: number; velocity: number };

// At the same instant, lift before striking so a repeated note re-sounds.
const KIND_ORDER = { off: 0, pedal: 1, on: 2 };

export class MidiPlayer {
  private readonly events: PlayerEvent[];
  private next = 0; // index of the first event not yet played
  private offset = 0; // position (s) when last paused or seeked
  private startedAt: number | null = null; // clock (ms) when play() began, null while paused
  private timer: ReturnType<typeof setTimeout> | null = null;
  // Pitches struck and not yet released, as played (after the pitch map).
  private readonly sounding = new Set<number>();
  private pedalDown = false;
  private map: (midi: number) => number = midi => midi;

  constructor(
    readonly song: Song,
    private readonly callbacks: PlayerCallbacks,
    private readonly now: () => number = () => performance.now()
  ) {
    const events: PlayerEvent[] = [];
    song.notes.forEach(n => {
      events.push({ time: n.start, kind: 'on', midi: n.midi, velocity: n.velocity });
      events.push({ time: n.end, kind: 'off', midi: n.midi });
    });
    song.pedal.forEach(p => events.push({ time: p.time, kind: 'pedal', down: p.down }));
    this.events = events.sort((a, b) => a.time - b.time || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  }

  get playing(): boolean {
    return this.startedAt !== null;
  }

  // Seconds from the start, clamped to the song.
  get position(): number {
    const elapsed = this.startedAt === null ? 0 : (this.now() - this.startedAt) / 1000;
    return Math.min(this.offset + elapsed, this.song.duration);
  }

  play(): void {
    if (this.playing) return;
    this.startedAt = this.now();
    if (this.pedalAt(this.offset)) this.setPedal(true);
    this.tick();
  }

  // Stops and releases everything; resuming strikes only notes that start later.
  pause(): void {
    if (!this.playing) return;
    this.offset = this.position;
    this.startedAt = null;
    this.clearTimer();
    this.releaseAll();
  }

  // Where each of the file's notes is played: a transposition, a change of
  // mode, or both. Takes effect at once: what's sounding is released and
  // playback carries on with the new map, as a seek would.
  set pitchMap(map: (midi: number) => number) {
    const wasPlaying = this.playing;
    this.pause();
    this.map = map;
    if (wasPlaying) this.play();
  }

  // Pause and go back to the start.
  stop(): void {
    this.pause();
    this.seek(0);
  }

  seek(seconds: number): void {
    const wasPlaying = this.playing;
    this.pause();
    this.offset = Math.min(Math.max(seconds, 0), this.song.duration);
    this.next = this.events.findIndex(e => e.time >= this.offset);
    if (this.next === -1) this.next = this.events.length;
    if (wasPlaying) this.play();
  }

  // The notes that span `seconds`, through the pitch map, lowest first:
  // what's sounding there.
  notesAt(seconds: number): number[] {
    const midis = this.song.notes.filter(n => n.start <= seconds && n.end > seconds).map(n => this.map(n.midi));
    return Array.from(new Set(midis)).sort((a, b) => a - b);
  }

  private pedalAt(seconds: number): boolean {
    let down = false;
    for (const p of this.song.pedal) {
      if (p.time > seconds) break;
      down = p.down;
    }
    return down;
  }

  private tick(): void {
    this.timer = null;
    const position = this.position;
    // At the end, anything still pending fires now: position stops at the
    // duration, so an event past it would otherwise wait forever.
    const atEnd = position >= this.song.duration;
    while (this.next < this.events.length && (atEnd || this.events[this.next].time <= position)) {
      this.fire(this.events[this.next++]);
    }
    if (this.next >= this.events.length) {
      this.releaseAll();
      this.startedAt = null;
      this.offset = 0;
      this.next = 0;
      this.callbacks.onEnd();
      return;
    }
    const waitMs = (this.events[this.next].time - position) * 1000;
    this.timer = setTimeout(() => this.tick(), waitMs);
  }

  private fire(event: PlayerEvent): void {
    if (event.kind === 'on') {
      const midi = this.map(event.midi);
      if (midi < 0 || midi > 127) return;
      this.sounding.add(midi);
      this.callbacks.noteOn(midi, event.velocity);
    } else if (event.kind === 'off') {
      // A note struck before a pause, seek or new pitch map was already released.
      const midi = this.map(event.midi);
      if (!this.sounding.delete(midi)) return;
      this.callbacks.noteOff(midi);
    } else {
      this.setPedal(event.down);
    }
  }

  private setPedal(down: boolean): void {
    if (down === this.pedalDown) return;
    this.pedalDown = down;
    this.callbacks.pedal(down);
  }

  // Pedal first, so the note-offs actually silence the notes.
  private releaseAll(): void {
    this.setPedal(false);
    this.sounding.forEach(midi => this.callbacks.noteOff(midi));
    this.sounding.clear();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

// Seconds as m:ss for the player's clock.
export function formatTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
