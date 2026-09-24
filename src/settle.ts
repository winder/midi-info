// Chord-readout smoothing: a pure, DOM-free debouncer between the raw set of
// held notes and the set the chord display is computed from. The keyboard
// always shows the raw notes; only the chord name waits for them to settle.
//
// Real playing never presses or releases a chord all at once: a rolled
// attack passes through single notes and intervals, an uneven release steps
// back down through subsets, and a legato change briefly holds the union of
// two chords. Each of those in-between sets is a real (strict) match or
// no-match, so rather than guess at intent the settler just waits until the
// notes stop changing. The wait is asymmetric - that is the hysteresis: a
// short one after a note-on, so the label barely lags a new chord, and a
// longer one after a note-off, so a staggered release or a chord change is
// skipped over instead of flashing each subset. A deliberate lift (dropping
// the 7th, keeping the triad) still shows once the release wait expires.

// The presets, plus 'custom' for delays the user enters directly (the
// "Advanced" choice in settings).
export type SmoothingPreset = 'off' | 'light' | 'heavy';
export type SmoothingLevel = SmoothingPreset | 'custom';

export interface SmoothingDelays {
  attackMs: number;
  releaseMs: number;
}

export const SMOOTHING_LEVELS: SmoothingLevel[] = ['off', 'light', 'heavy', 'custom'];
export const DEFAULT_SMOOTHING: SmoothingLevel = 'light';

export const SMOOTHING_DELAYS: Record<SmoothingPreset, SmoothingDelays> = {
  off: { attackMs: 0, releaseMs: 0 },
  light: { attackMs: 30, releaseMs: 150 },
  heavy: { attackMs: 60, releaseMs: 300 },
};

// Bounds for a directly entered delay. Past a couple of seconds the readout
// stops feeling connected to the keys at all.
export const MAX_SMOOTHING_DELAY_MS = 2000;

export function isSmoothingLevel(value: unknown): value is SmoothingLevel {
  return typeof value === 'string' && (SMOOTHING_LEVELS as string[]).includes(value);
}

// A single delay in ms: an integer within 0..MAX_SMOOTHING_DELAY_MS, else null.
export function parseDelayMs(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return n <= MAX_SMOOTHING_DELAY_MS ? n : null;
}

// How long "Hold last chord" keeps the chord after every key is released,
// in ms. Infinity (a blank entry, stored as 'forever') holds it until the
// next note.
export const MAX_HOLD_MS = 60000;
export const DEFAULT_HOLD_MS = Infinity;

export function holdDurationValue(ms: number): string {
  return ms === Infinity ? 'forever' : String(ms);
}

// A hold duration as typed or stored: blank or 'forever' is Infinity, else
// whole ms within 0..MAX_HOLD_MS. Anything else is null.
export function parseHoldMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '' || text === 'forever') return Infinity;
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n <= MAX_HOLD_MS ? n : null;
}

export type NoteChange = 'on' | 'off';

export class NoteSettler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private settled: number[] = [];

  // holdMs: once every note is released, how much longer to keep showing
  // the last chord. 0 settles on silence normally; Infinity never does.
  constructor(
    private delays: SmoothingDelays,
    private holdMs: number,
    private onSettled: (notes: number[]) => void
  ) {}

  // The notes the chord display should currently show, sorted ascending.
  get notes(): number[] {
    return this.settled;
  }

  // Report the raw held notes after a change. The display follows once they
  // have been unchanged for the delay matching the latest change.
  update(raw: Iterable<number>, change: NoteChange): void {
    const next = Array.from(raw).sort((a, b) => a - b);
    let delay = change === 'on' ? this.delays.attackMs : this.delays.releaseMs;
    if (next.length === 0) delay += this.holdMs;
    this.schedule(next, delay);
  }

  // Apply new options and settle on `raw` straight away, so a settings
  // change takes effect without waiting for the next note. Silence still
  // honours the hold, counted from now.
  configure(delays: SmoothingDelays, holdMs: number, raw: Iterable<number>): void {
    this.delays = delays;
    this.holdMs = holdMs;
    const next = Array.from(raw).sort((a, b) => a - b);
    this.schedule(next, next.length === 0 ? holdMs : 0);
  }

  private schedule(next: number[], delay: number): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (delay === Infinity) return;
    if (delay <= 0) {
      this.settle(next);
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.settle(next);
    }, delay);
  }

  private settle(next: number[]): void {
    if (next.length === this.settled.length && next.every((m, i) => m === this.settled[i])) return;
    this.settled = next;
    this.onSettled(next);
  }
}
