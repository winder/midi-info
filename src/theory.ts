// Pure music-theory helpers: note spelling, keys, and chord detection.
// No DOM access here - see ui.ts for rendering and app.ts for wiring.

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Progressive-disclosure tiers shared across the app (Key/Mode selection,
// the Highlighter's scale/chord pickers, etc).
export type Level = 'basic' | 'intermediate' | 'nerd';
const LEVEL_ORDER: Level[] = ['basic', 'intermediate', 'nerd'];

export function levelAtLeast(current: Level, min: Level): boolean {
  return LEVEL_ORDER.indexOf(current) >= LEVEL_ORDER.indexOf(min);
}

export interface Mode {
  name: string;
  steps: number[];
}

// The 7 diatonic modes: rotations of the major (Ionian) scale steps,
// each starting from a different degree. Same 7 pitch classes relative
// to a shared parent scale, but a different tonic and therefore a
// different set of "diatonic" (unaltered) scale tones.
export const MODES: Mode[] = [
  { name: 'Ionian', steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Aeolian', steps: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10] },
];

export interface Key {
  name: string;
  tonicLetter: string;
  tonicAccidental: number;
  fallback: string[];
}

// The 17 selectable keys: each of the 7 natural letters, plus a sharp and
// a flat spelling for each of the 5 black-key pitch classes. tonicLetter/
// tonicAccidental define the key signature; fallback supplies names for
// the non-diatonic (chromatic) pitch classes, which don't have a single
// settled spelling the way scale tones do.
export const KEYS: Key[] = [
  { name: 'C', tonicLetter: 'C', tonicAccidental: 0, fallback: SHARP_NAMES },
  { name: 'C#', tonicLetter: 'C', tonicAccidental: 1, fallback: SHARP_NAMES },
  { name: 'Db', tonicLetter: 'D', tonicAccidental: -1, fallback: FLAT_NAMES },
  { name: 'D', tonicLetter: 'D', tonicAccidental: 0, fallback: SHARP_NAMES },
  { name: 'D#', tonicLetter: 'D', tonicAccidental: 1, fallback: SHARP_NAMES },
  { name: 'Eb', tonicLetter: 'E', tonicAccidental: -1, fallback: FLAT_NAMES },
  { name: 'E', tonicLetter: 'E', tonicAccidental: 0, fallback: SHARP_NAMES },
  { name: 'F', tonicLetter: 'F', tonicAccidental: 0, fallback: FLAT_NAMES },
  { name: 'F#', tonicLetter: 'F', tonicAccidental: 1, fallback: SHARP_NAMES },
  { name: 'Gb', tonicLetter: 'G', tonicAccidental: -1, fallback: FLAT_NAMES },
  { name: 'G', tonicLetter: 'G', tonicAccidental: 0, fallback: SHARP_NAMES },
  { name: 'G#', tonicLetter: 'G', tonicAccidental: 1, fallback: SHARP_NAMES },
  { name: 'Ab', tonicLetter: 'A', tonicAccidental: -1, fallback: FLAT_NAMES },
  { name: 'A', tonicLetter: 'A', tonicAccidental: 0, fallback: SHARP_NAMES },
  { name: 'A#', tonicLetter: 'A', tonicAccidental: 1, fallback: SHARP_NAMES },
  { name: 'Bb', tonicLetter: 'B', tonicAccidental: -1, fallback: FLAT_NAMES },
  { name: 'B', tonicLetter: 'B', tonicAccidental: 0, fallback: SHARP_NAMES },
];

export function keyPitchClass(key: Key): number {
  return (NATURAL_PC[key.tonicLetter] + key.tonicAccidental + 12) % 12;
}

// Builds the 12-entry note-name table for a key + mode: the 7 diatonic
// scale tones get their theoretically correct letter (e.g. E# in F#
// major, not F), while the remaining chromatic pitch classes fall back
// to the key's sharp/flat convention.
export function buildKeyNoteNames(key: Key, mode: Mode = MODES[0]): string[] {
  const names = key.fallback.slice();
  const tonicPc = (NATURAL_PC[key.tonicLetter] + key.tonicAccidental + 12) % 12;
  const letterIndex = LETTERS.indexOf(key.tonicLetter);
  mode.steps.forEach((step, degree) => {
    const letter = LETTERS[(letterIndex + degree) % 7];
    const expectedPc = (tonicPc + step) % 12;
    const accidental = ((expectedPc - NATURAL_PC[letter]) % 12 + 12) % 12;
    if (accidental === 0) names[expectedPc] = letter;
    else if (accidental === 1) names[expectedPc] = letter + '#';
    else if (accidental === 11) names[expectedPc] = letter + 'b';
    // Any other value would require a double sharp/flat; fall back to
    // the key's sharp/flat convention instead of spelling one.
  });
  return names;
}

// Scale types offered by the Highlighter's Scale picker, gated by Level.
// Reuses the 7 diatonic modes above; harmonic and melodic (ascending) minor
// aren't otherwise represented in the app, so their steps are spelled out
// directly here.
export interface HighlightScale {
  name: string;
  steps: number[];
  minLevel: Level;
}

export const HIGHLIGHT_SCALES: HighlightScale[] = [
  { name: 'Major', steps: MODES[0].steps, minLevel: 'basic' }, // Ionian
  { name: 'Natural Minor', steps: MODES[5].steps, minLevel: 'basic' }, // Aeolian
  { name: 'Dorian', steps: MODES[1].steps, minLevel: 'intermediate' },
  { name: 'Mixolydian', steps: MODES[4].steps, minLevel: 'intermediate' },
  { name: 'Lydian', steps: MODES[3].steps, minLevel: 'intermediate' },
  { name: 'Harmonic Minor', steps: [0, 2, 3, 5, 7, 8, 11], minLevel: 'intermediate' },
  { name: 'Melodic Minor', steps: [0, 2, 3, 5, 7, 9, 11], minLevel: 'intermediate' },
  { name: 'Phrygian', steps: MODES[2].steps, minLevel: 'nerd' },
  { name: 'Locrian', steps: MODES[6].steps, minLevel: 'nerd' },
];

export function scalePitchClasses(rootPc: number, scale: HighlightScale): number[] {
  return scale.steps.map(step => (rootPc + step) % 12);
}

export const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

export function isBlackPitch(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(midi % 12);
}

export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

export interface ChordFormula {
  symbol: string;
  intervals: number[];
}

// Each formula lists intervals (semitones) from the chord root.
// Covers every chord family in chords.md: Major, Minor, Diminished,
// Suspended, Augmented, and Dominant. Minor uses "-", diminished uses
// "°"/"°7", half-diminished uses "ø7" (real jazz lead-sheet notation),
// matching the project's earlier switch to "Δ" for major 7th.
const BASE_CHORD_FORMULAS: ChordFormula[] = [
  // Major
  { symbol: '', intervals: [0, 4, 7] },
  { symbol: 'add2', intervals: [0, 2, 4, 7] },
  { symbol: '6', intervals: [0, 4, 7, 9] },
  { symbol: 'Δ7', intervals: [0, 4, 7, 11] },
  { symbol: 'Δ7(9)', intervals: [0, 4, 7, 11, 2] },
  { symbol: 'Δ7(9, 13)', intervals: [0, 4, 7, 11, 2, 9] },
  { symbol: 'Δ7#5', intervals: [0, 4, 8, 11] },
  { symbol: 'Δ9#5', intervals: [0, 4, 8, 11, 2] },
  { symbol: '6/9', intervals: [0, 4, 7, 9, 2] },
  { symbol: '6/9#11', intervals: [0, 4, 7, 9, 2, 6] },
  { symbol: 'Δ7#11', intervals: [0, 4, 7, 11, 2, 6] },
  { symbol: 'Δ7#11#5', intervals: [0, 4, 8, 11, 2, 6] },
  { symbol: 'Δ7(13, #11)', intervals: [0, 4, 7, 11, 2, 6, 9] },

  // Minor
  { symbol: '-', intervals: [0, 3, 7] },
  { symbol: '-add2', intervals: [0, 2, 3, 7] },
  { symbol: '-6', intervals: [0, 3, 7, 9] },
  { symbol: '-7', intervals: [0, 3, 7, 10] },
  { symbol: '-Δ7', intervals: [0, 3, 7, 11] },
  { symbol: '-9', intervals: [0, 3, 7, 10, 2] },
  { symbol: '-Δ9', intervals: [0, 3, 7, 11, 2] },
  { symbol: '-6/9', intervals: [0, 3, 7, 9, 2] },
  { symbol: '-6/9(11)', intervals: [0, 3, 7, 9, 2, 5] },
  { symbol: '-Δ7(13)', intervals: [0, 3, 7, 11, 9] },
  { symbol: '-11', intervals: [0, 2, 3, 5, 7, 10] },

  // Diminished
  { symbol: '°', intervals: [0, 3, 6] },
  { symbol: 'ø7', intervals: [0, 3, 6, 10] },
  { symbol: '°7', intervals: [0, 3, 6, 9] },

  // Suspended (only recognized with the root in the bass - see detectChords)
  { symbol: 'sus2', intervals: [0, 2, 7] },
  { symbol: 'sus4', intervals: [0, 5, 7] },
  { symbol: 'Δ7sus2', intervals: [0, 2, 7, 11] },
  { symbol: '7sus4', intervals: [0, 5, 7, 10] },
  { symbol: '9sus4', intervals: [0, 5, 7, 10, 2] },
  { symbol: '13sus', intervals: [0, 5, 7, 10, 2, 9] },

  // Augmented
  { symbol: 'aug', intervals: [0, 4, 8] },

  // Dominant
  { symbol: '7', intervals: [0, 4, 7, 10] },
  { symbol: '9', intervals: [0, 4, 7, 10, 2] },
  { symbol: '9(add11)', intervals: [0, 4, 7, 10, 2, 5] },
  { symbol: '13', intervals: [0, 4, 7, 10, 2, 9] },
  { symbol: '7+5', intervals: [0, 4, 8, 10] },
  { symbol: '7b5', intervals: [0, 4, 6, 10] },
  { symbol: '7b9', intervals: [0, 4, 7, 10, 1] },
  { symbol: '7#9', intervals: [0, 4, 7, 10, 3] },
  { symbol: '7#9#5', intervals: [0, 4, 8, 10, 3] },
  { symbol: '7b9#5', intervals: [0, 4, 8, 10, 1] },
  { symbol: '7#11', intervals: [0, 4, 7, 10, 2, 6] },
  { symbol: '7#11b9', intervals: [0, 4, 7, 10, 1, 6] },
  { symbol: '13b9', intervals: [0, 4, 7, 10, 1, 9] },
  { symbol: '13#11', intervals: [0, 4, 7, 10, 2, 6, 9] },
];

const PERFECT_FIFTH = 7;

// Dropping the plain perfect 5th never changes a chord's quality or name -
// it's the least color-defining tone (unlike an altered b5/#5, which IS
// the point of the chord) and is routinely left out of real voicings, e.g.
// C7#11 as C-E-Bb-D-F# instead of C-E-G-Bb-D-F#. For every base formula
// that includes it, also recognize the same chord with the 5th omitted.
function withoutPerfectFifth(formulas: ChordFormula[]): ChordFormula[] {
  const variants: ChordFormula[] = [];
  formulas.forEach(f => {
    if (!f.intervals.includes(PERFECT_FIFTH)) return;
    const intervals = f.intervals.filter(i => i !== PERFECT_FIFTH);
    if (intervals.length < 3) return; // fewer than 3 notes isn't a chord anymore
    variants.push({ symbol: f.symbol, intervals });
  });
  return variants;
}

export const DEFAULT_CHORD_FORMULAS: ChordFormula[] = [
  ...BASE_CHORD_FORMULAS,
  ...withoutPerfectFifth(BASE_CHORD_FORMULAS),
];

// Chord types offered by the Highlighter's Chord picker, gated by Level.
// Built from the base formulas only (no "drop the 5th" duplicates, which
// exist for lenient detection, not as a distinct type someone would
// deliberately pick). Anything not listed here defaults to 'nerd'.
const CHORD_MIN_LEVEL: Record<string, Level> = {
  '': 'basic', '-': 'basic', '°': 'basic', 'aug': 'basic', 'sus2': 'basic', 'sus4': 'basic',
  '6': 'intermediate', '-6': 'intermediate', 'Δ7': 'intermediate', '-7': 'intermediate',
  '-Δ7': 'intermediate', '7': 'intermediate', '°7': 'intermediate', 'ø7': 'intermediate',
  '7sus4': 'intermediate', '9sus4': 'intermediate',
};

// Highlighter voicings that differ from a formula's interval list: the
// tones to show, in stacking order from the root. Sus chords in
// particular are voiced the way players actually spread them (Δ7sus2 with
// the 7th right above the root, the 9/13 sus chords with the 5th left out
// entirely). Anything not listed here is voiced in interval-list order.
const CHORD_VOICINGS: Record<string, number[]> = {
  'Δ7sus2': [0, 11, 2, 7],
  '9sus4': [0, 5, 10, 2],
  '13sus': [0, 10, 2, 5, 9],
};

export interface HighlightChord {
  symbol: string;
  intervals: number[];
  // Tones to highlight, in stacking order (feed to buildChordVoicing).
  voicing: number[];
  minLevel: Level;
}

export const HIGHLIGHT_CHORDS: HighlightChord[] = BASE_CHORD_FORMULAS.map(f => ({
  symbol: f.symbol,
  intervals: f.intervals,
  voicing: CHORD_VOICINGS[f.symbol] ?? f.intervals,
  minLevel: CHORD_MIN_LEVEL[f.symbol] ?? 'nerd',
}));

// Builds one close-position MIDI voicing for a chord: the root placed as
// close to centerMidi as possible, then each further tone - in the order
// given, already the conventional stacking order (e.g. a 9th chord lists
// root/3rd/5th/7th/9th) - placed at the next instance of its pitch class
// above the previous tone.
export function buildChordVoicing(rootPc: number, intervals: number[], centerMidi = 60): number[] {
  const remainder = ((centerMidi - rootPc) % 12 + 12) % 12;
  const lower = centerMidi - remainder;
  const upper = lower + 12;
  const rootMidi = centerMidi - lower <= upper - centerMidi ? lower : upper;

  const voicing: number[] = [];
  let prev = rootMidi - 12;
  Array.from(new Set(intervals.map(i => ((i % 12) + 12) % 12))).forEach(interval => {
    let midi = rootMidi + interval;
    while (midi <= prev) midi += 12;
    voicing.push(midi);
    prev = midi;
  });
  return voicing;
}

export interface ChordMatch {
  root: number;
  formula: ChordFormula;
}

// Finds every (root, formula) pair whose notes exactly match the given
// set of pitch classes (order-independent, octave-independent).
//
// Suspended chords are the exception to root-anywhere matching: their
// pitch-class sets are ambiguous (C-F-G is Csus4, Fsus2 and a 5th-less
// G7sus4 at once), and what a player means by "Csus4" is C in the bass.
// When bassPc is given, a sus formula only matches with its root there.
export function detectChords(pitchClasses: number[], chordFormulas: ChordFormula[], bassPc?: number): ChordMatch[] {
  if (pitchClasses.length < 3) return [];
  const pcSet = new Set(pitchClasses);
  const matches: ChordMatch[] = [];
  pitchClasses.forEach(root => {
    chordFormulas.forEach(formula => {
      if (formula.intervals.length !== pitchClasses.length) return;
      if (bassPc !== undefined && root !== bassPc && chordQuality(formula.symbol) === 'suspended') return;
      const expected = formula.intervals.map(i => (root + i) % 12);
      if (expected.every(pc => pcSet.has(pc))) {
        matches.push({ root, formula });
      }
    });
  });
  return matches;
}

export function chordLabel(match: ChordMatch, noteNames: string[]): string {
  return noteNames[match.root] + match.formula.symbol;
}

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// Which case/suffix convention a chord symbol maps to for Roman numeral
// analysis. Determined from the symbol text (grouped the same way as the
// "Major/Minor/Diminished/..." comments on BASE_CHORD_FORMULAS above),
// not by re-deriving quality from intervals - simpler, and every formula's
// symbol already unambiguously belongs to one of these families.
type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented' | 'suspended' | 'dominant';

function chordQuality(symbol: string): ChordQuality {
  if (symbol.startsWith('-')) return 'minor';
  if (symbol === '°' || symbol === '°7' || symbol === 'ø7') return 'diminished';
  if (symbol.includes('sus')) return 'suspended';
  if (symbol === 'aug' || (symbol.startsWith('Δ') && symbol.includes('#5'))) return 'augmented';
  if (symbol === '' || symbol === 'add2' || symbol.startsWith('Δ') || symbol.startsWith('6')) return 'major';
  return 'dominant';
}

// The figure appended after the numeral: the base symbol, minus whatever
// the numeral's own case/glyph already conveys (minor's "-", the plain
// augmented triad's "aug" -> "+"). Extended qualities (e.g. "Δ7#5") keep
// their full symbol since the numeral case alone can't express them.
function chordSuffix(symbol: string, quality: ChordQuality): string {
  if (quality === 'minor') return symbol.slice(1);
  if (symbol === 'aug') return '+';
  return symbol;
}

// Locates a chromatic root within the selected mode's own 7-note diatonic
// collection: an exact match gives a plain numeral, otherwise the root
// falls in a 2-semitone gap between two diatonic degrees and is spelled
// as an accidental relative to whichever neighbor is idiomatic - the
// raised 4th (#IV, as in Lydian) rather than a flatted 5th, and a flatted
// upper neighbor (bII, bIII, bVI, bVII, ...) everywhere else.
function romanDegree(rootPc: number, tonicPc: number, mode: Mode): string {
  const offset = ((rootPc - tonicPc) % 12 + 12) % 12;
  const exactIndex = mode.steps.indexOf(offset);
  if (exactIndex !== -1) return ROMAN_NUMERALS[exactIndex];

  let idxLow = 0;
  mode.steps.forEach((step, i) => {
    if (step < offset) idxLow = i;
  });
  const idxHigh = (idxLow + 1) % mode.steps.length;
  if (idxLow === 3) return '#' + ROMAN_NUMERALS[idxLow];
  return 'b' + ROMAN_NUMERALS[idxHigh];
}

// Labels a detected chord with a Roman numeral relative to a key/mode,
// e.g. "ii7", "V7", "vii°", "bVIΔ7#5" - scale degree (accidental where the
// root isn't diatonic to the mode) plus a case and suffix that follow the
// chord's quality, the way real harmonic analysis (not just letter names)
// is written.
export function romanNumeralLabel(match: ChordMatch, tonicPc: number, mode: Mode): string {
  const quality = chordQuality(match.formula.symbol);
  const numeral = romanDegree(match.root, tonicPc, mode);
  const cased = quality === 'minor' || quality === 'diminished' ? numeral.toLowerCase() : numeral;
  return cased + chordSuffix(match.formula.symbol, quality);
}

// The Roman numeral of the triad stacked in thirds on each degree of the
// mode, indexed by pitch class (null for the 5 non-diatonic ones), e.g. C
// Ionian gives I at 0, ii at 2, ... vii° at 11. Feeds the keyboard's
// Roman numeral hints.
const TRIAD_SYMBOLS: Record<string, string> = { '4,7': '', '3,7': '-', '3,6': '°', '4,8': 'aug' };

export function diatonicRomanNumerals(tonicPc: number, mode: Mode): (string | null)[] {
  const result: (string | null)[] = new Array(12).fill(null);
  const steps = mode.steps;
  steps.forEach((step, i) => {
    const third = (steps[(i + 2) % 7] - step + 12) % 12;
    const fifth = (steps[(i + 4) % 7] - step + 12) % 12;
    const symbol = TRIAD_SYMBOLS[`${third},${fifth}`] ?? '';
    const root = (tonicPc + step) % 12;
    result[root] = romanNumeralLabel({ root, formula: { symbol, intervals: [0, third, fifth] } }, tonicPc, mode);
  });
  return result;
}

// Validates and normalizes arbitrary parsed JSON (from a cookie or an
// imported file) into a chord formula list. Intervals are deduped and
// wrapped into 0-11. Returns null if the shape isn't a chord table at all,
// so callers can decide how to react (silently fall back, or show an error).
export function parseChordFormulas(raw: unknown): ChordFormula[] | null {
  if (!Array.isArray(raw)) return null;
  const result: ChordFormula[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const f = item as { symbol?: unknown; intervals?: unknown };
    if (!Array.isArray(f.intervals)) return null;
    result.push({
      symbol: String(f.symbol ?? ''),
      intervals: Array.from(new Set(
        (f.intervals as unknown[])
          .map(n => ((Number(n) % 12) + 12) % 12)
          .filter(n => !Number.isNaN(n))
      )),
    });
  }
  return result;
}

// Name of the interval between two notes, indexed by semitone distance mod 12.
export const INTERVAL_NAMES = [
  'Octave', // 0
  'Minor 2nd', // 1
  'Major 2nd', // 2
  'Minor 3rd', // 3
  'Major 3rd', // 4
  'Perfect 4th', // 5
  'Tritone', // 6
  'Perfect 5th', // 7
  'Minor 6th', // 8
  'Major 6th', // 9
  'Minor 7th', // 10
  'Major 7th', // 11
];
