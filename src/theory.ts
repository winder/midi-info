// Pure music-theory helpers: note spelling, keys, and chord detection.
// No DOM access here - see ui.ts for rendering and app.ts for wiring.

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];

export interface Key {
  name: string;
  tonicLetter: string;
  tonicAccidental: number;
  fallback: string[];
}

// The 12 major keys. tonicLetter/tonicAccidental define the key signature;
// fallback supplies names for the 5 non-diatonic (chromatic) pitch classes,
// which don't have a single settled spelling the way scale tones do.
export const KEYS: Key[] = [
  { name: 'C', tonicLetter: 'C', tonicAccidental: 0, fallback: SHARP_NAMES },
  { name: 'Db', tonicLetter: 'D', tonicAccidental: -1, fallback: FLAT_NAMES },
  { name: 'D', tonicLetter: 'D', tonicAccidental: 0, fallback: SHARP_NAMES },
  { name: 'Eb', tonicLetter: 'E', tonicAccidental: -1, fallback: FLAT_NAMES },
  { name: 'E', tonicLetter: 'E', tonicAccidental: 0, fallback: SHARP_NAMES },
  { name: 'F', tonicLetter: 'F', tonicAccidental: 0, fallback: FLAT_NAMES },
  { name: 'F#', tonicLetter: 'F', tonicAccidental: 1, fallback: SHARP_NAMES },
  { name: 'G', tonicLetter: 'G', tonicAccidental: 0, fallback: SHARP_NAMES },
  { name: 'Ab', tonicLetter: 'A', tonicAccidental: -1, fallback: FLAT_NAMES },
  { name: 'A', tonicLetter: 'A', tonicAccidental: 0, fallback: SHARP_NAMES },
  { name: 'Bb', tonicLetter: 'B', tonicAccidental: -1, fallback: FLAT_NAMES },
  { name: 'B', tonicLetter: 'B', tonicAccidental: 0, fallback: SHARP_NAMES },
];

// Builds the 12-entry note-name table for a key: the 7 diatonic scale
// tones get their theoretically correct letter (e.g. E# in F# major,
// not F), while the 5 chromatic pitch classes fall back to the key's
// sharp/flat convention.
export function buildKeyNoteNames(key: Key): string[] {
  const names = key.fallback.slice();
  const tonicPc = (NATURAL_PC[key.tonicLetter] + key.tonicAccidental + 12) % 12;
  const letterIndex = LETTERS.indexOf(key.tonicLetter);
  MAJOR_SCALE_STEPS.forEach((step, degree) => {
    const letter = LETTERS[(letterIndex + degree) % 7];
    const expectedPc = (tonicPc + step) % 12;
    const accidental = ((expectedPc - NATURAL_PC[letter]) % 12 + 12) % 12;
    if (accidental === 0) names[expectedPc] = letter;
    else if (accidental === 1) names[expectedPc] = letter + '#';
    else if (accidental === 11) names[expectedPc] = letter + 'b';
    // Any other value would require a double sharp/flat, which none of
    // these 12 keys need.
  });
  return names;
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

  // Suspended
  { symbol: 'sus2', intervals: [0, 2, 7] },
  { symbol: 'sus4', intervals: [0, 5, 7] },
  { symbol: '7sus4', intervals: [0, 5, 7, 10] },
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

export interface ChordMatch {
  root: number;
  formula: ChordFormula;
}

// Finds every (root, formula) pair whose notes exactly match the given
// set of pitch classes (order-independent, octave-independent).
export function detectChords(pitchClasses: number[], chordFormulas: ChordFormula[]): ChordMatch[] {
  if (pitchClasses.length < 3) return [];
  const pcSet = new Set(pitchClasses);
  const matches: ChordMatch[] = [];
  pitchClasses.forEach(root => {
    chordFormulas.forEach(formula => {
      if (formula.intervals.length !== pitchClasses.length) return;
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
