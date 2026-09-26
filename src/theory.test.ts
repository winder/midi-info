import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CHORD_FORMULAS,
  HIGHLIGHT_CHORDS,
  INTERVAL_NAMES,
  KEYS,
  MODES,
  buildChordVoicing,
  buildKeyNoteNames,
  chordLabel,
  detectChords,
  diatonicRomanNumerals,
  isBlackPitch,
  keyPitchClass,
  modeShiftMap,
  nearestShift,
  octaveOf,
  parseChordFormulas,
  romanNumeralLabel,
  standardKeyIndex,
  transpositionLabel,
} from './theory';

describe('isBlackPitch', () => {
  test('identifies the 5 black-key pitch classes', () => {
    assert.deepEqual([...Array(12).keys()].filter(isBlackPitch), [1, 3, 6, 8, 10]);
  });

  test('wraps across octaves via mod 12', () => {
    assert.equal(isBlackPitch(61), true); // C#5
    assert.equal(isBlackPitch(72), false); // C6
  });
});

describe('octaveOf', () => {
  test('middle C (60) is octave 4', () => {
    assert.equal(octaveOf(60), 4);
  });

  test('C2 is midi 36', () => {
    assert.equal(octaveOf(36), 2);
  });
});

describe('buildKeyNoteNames', () => {
  function namesFor(keyName: string): string[] {
    const key = KEYS.find(k => k.name === keyName);
    assert.ok(key, `key ${keyName} should exist`);
    return buildKeyNoteNames(key!);
  }

  test('C major spells every accidental as a sharp', () => {
    assert.deepEqual(namesFor('C'), ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
  });

  test('Db major spells every accidental as a flat', () => {
    assert.deepEqual(namesFor('Db'), ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']);
  });

  test('F# major spells the physical F key as E# (its real 7th degree)', () => {
    assert.equal(namesFor('F#')[5], 'E#');
    assert.equal(namesFor('F#')[6], 'F#'); // tonic stays F#, not Gb
  });

  test('every key produces exactly 12 names with no gaps', () => {
    KEYS.forEach(key => {
      const names = buildKeyNoteNames(key);
      assert.equal(names.length, 12);
      names.forEach(n => assert.ok(n && n.length > 0));
    });
  });

  test('D Dorian shares C major\'s pitch classes but spells from D', () => {
    const key = KEYS.find(k => k.name === 'D')!;
    const mode = MODES.find(m => m.name === 'Dorian')!;
    assert.deepEqual(buildKeyNoteNames(key, mode), buildKeyNoteNames(KEYS.find(k => k.name === 'C')!));
  });

  test('every key x mode combination produces exactly 12 names with no gaps', () => {
    KEYS.forEach(key => {
      MODES.forEach(mode => {
        const names = buildKeyNoteNames(key, mode);
        assert.equal(names.length, 12);
        names.forEach(n => assert.ok(n && n.length > 0));
      });
    });
  });
});

describe('DEFAULT_CHORD_FORMULAS', () => {
  test('no two formulas share the same interval set', () => {
    const seen = new Map<string, string>();
    DEFAULT_CHORD_FORMULAS.forEach(f => {
      const key = f.intervals.slice().sort((a, b) => a - b).join(',');
      const existing = seen.get(key);
      assert.equal(existing, undefined, `"${f.symbol}" collides with "${existing}" (both: ${key})`);
      seen.set(key, f.symbol);
    });
  });

  test('every interval is a valid pitch class (0-11) with no duplicates', () => {
    DEFAULT_CHORD_FORMULAS.forEach(f => {
      const unique = new Set(f.intervals);
      assert.equal(unique.size, f.intervals.length, `"${f.symbol}" has duplicate intervals`);
      f.intervals.forEach(i => assert.ok(i >= 0 && i <= 11, `"${f.symbol}" has out-of-range interval ${i}`));
    });
  });
});

describe('detectChords + chordLabel', () => {
  const sharpNames = buildKeyNoteNames(KEYS.find(k => k.name === 'C')!);

  function labelOf(pitchClasses: number[]): string | undefined {
    const matches = detectChords(pitchClasses, DEFAULT_CHORD_FORMULAS);
    const primary = matches.find(m => m.root === pitchClasses[0]);
    return primary ? chordLabel(primary, sharpNames) : undefined;
  }

  test('returns nothing for fewer than 3 notes', () => {
    assert.deepEqual(detectChords([0, 4], DEFAULT_CHORD_FORMULAS), []);
  });

  test('detects a plain C major triad', () => {
    assert.equal(labelOf([0, 4, 7]), 'C');
  });

  test('detects extended chords added for chords.md (9, 7#11, 13#11, minor 11)', () => {
    assert.equal(labelOf([0, 4, 7, 11, 2]), 'CΔ7(9)');
    assert.equal(labelOf([0, 4, 7, 11, 2, 6]), 'CΔ7#11');
    assert.equal(labelOf([0, 4, 7, 10, 2, 6, 9]), 'C13#11');
    assert.equal(labelOf([0, 2, 3, 5, 7, 10]), 'C-11');
  });

  test('recognizes the plain dominant 7#11 chord, with or without the perfect 5th', () => {
    assert.equal(labelOf([0, 4, 7, 10, 2, 6]), 'C7#11'); // C-E-G-Bb-D-F#
    assert.equal(labelOf([0, 4, 10, 2, 6]), 'C7#11'); // C-E-Bb-D-F# (5th omitted)
  });

  test('a plain dominant 7th with the 5th omitted is still labeled C7', () => {
    assert.equal(labelOf([0, 4, 10]), 'C7'); // C-E-Bb, no G
  });

  test('altered 5ths are not treated as omittable', () => {
    // 'aug' (#5) and '7b5' have no perfect 5th in their formula, so no
    // shorter "5th omitted" variant should exist for them.
    const hasShorterVariant = (symbol: string, fullLength: number) =>
      DEFAULT_CHORD_FORMULAS.some(f => f.symbol === symbol && f.intervals.length < fullLength);
    assert.equal(hasShorterVariant('aug', 3), false);
    assert.equal(hasShorterVariant('7b5', 4), false);
  });

  test('finds a chord rooted anywhere in the pitch-class set (for inversions)', () => {
    // E-G-C is a C major triad in first inversion; root should still be found as C (pc 0).
    const matches = detectChords([4, 7, 0], DEFAULT_CHORD_FORMULAS);
    assert.ok(matches.some(m => m.root === 0 && m.formula.symbol === ''));
  });

  test('symmetric chords report every valid root (diminished 7th has 4)', () => {
    const matches = detectChords([0, 3, 6, 9], DEFAULT_CHORD_FORMULAS);
    const dim7Roots = matches.filter(m => m.formula.symbol === '°7').map(m => m.root).sort();
    assert.deepEqual(dim7Roots, [0, 3, 6, 9]);
  });

  test('detects the sus family, with the 5th optional on 9sus4 and 13sus', () => {
    assert.equal(labelOf([0, 5, 7]), 'Csus4');
    assert.equal(labelOf([0, 2, 7, 11]), 'CΔ7sus2'); // C-D-G-B
    assert.equal(labelOf([0, 5, 7, 10, 2]), 'C9sus4'); // C-F-G-Bb-D
    assert.equal(labelOf([0, 5, 10, 2]), 'C9sus4'); // no G
    assert.equal(labelOf([0, 5, 7, 9, 10, 2]), 'C13sus'); // C-F-G-A-Bb-D
    assert.equal(labelOf([0, 5, 9, 10, 2]), 'C13sus'); // no G
  });

  test('a sus chord only matches with its root in the bass', () => {
    // C-F-G is Csus4, Fsus2 and a 5th-less G7sus4 as bare pitch classes;
    // the bass note decides which one the player meant.
    const symbolsWithBass = (bassPc: number) =>
      detectChords([0, 5, 7], DEFAULT_CHORD_FORMULAS, bassPc).map(m => chordLabel(m, sharpNames)).sort();
    assert.deepEqual(symbolsWithBass(0), ['Csus4']);
    assert.deepEqual(symbolsWithBass(5), ['Fsus2']);
    assert.deepEqual(symbolsWithBass(7), ['G7sus4']);
  });

  test('without a bass note, sus chords still match from any root', () => {
    const symbols = detectChords([0, 5, 7], DEFAULT_CHORD_FORMULAS).map(m => chordLabel(m, sharpNames)).sort();
    assert.deepEqual(symbols, ['Csus4', 'Fsus2', 'G7sus4']);
  });

  test('the bass rule leaves non-sus chords alone (inversions still detected)', () => {
    const matches = detectChords([4, 7, 0], DEFAULT_CHORD_FORMULAS, 4); // C/E
    assert.ok(matches.some(m => m.root === 0 && m.formula.symbol === ''));
  });
});

describe('HIGHLIGHT_CHORDS voicings', () => {
  function voicingOf(symbol: string): number[] {
    const chord = HIGHLIGHT_CHORDS.find(c => c.symbol === symbol)!;
    return buildChordVoicing(0, chord.voicing);
  }

  test('default voicing stacks the interval list from the root', () => {
    assert.deepEqual(voicingOf(''), [60, 64, 67]); // C E G
    assert.deepEqual(voicingOf('sus4'), [60, 65, 67]); // C F G
  });

  test('sus chords use their idiomatic spread, dropping the 5th on 9sus4/13sus', () => {
    assert.deepEqual(voicingOf('Δ7sus2'), [60, 71, 74, 79]); // C B D G
    assert.deepEqual(voicingOf('9sus4'), [60, 65, 70, 74]); // C F Bb D
    assert.deepEqual(voicingOf('13sus'), [60, 70, 74, 77, 81]); // C Bb D F A
  });

  test('every voicing covers a subset of its formula and always includes the root', () => {
    HIGHLIGHT_CHORDS.forEach(c => {
      assert.ok(c.voicing.includes(0), c.symbol);
      c.voicing.forEach(i => assert.ok(c.intervals.includes(i), `${c.symbol}: ${i}`));
    });
  });
});

describe('romanNumeralLabel', () => {
  const cPc = keyPitchClass(KEYS.find(k => k.name === 'C')!);
  const ionian = MODES.find(m => m.name === 'Ionian')!;
  const aeolian = MODES.find(m => m.name === 'Aeolian')!;

  function formula(symbol: string) {
    const f = DEFAULT_CHORD_FORMULAS.find(f => f.symbol === symbol);
    assert.ok(f, `formula "${symbol}" should exist`);
    return f!;
  }

  test('labels the diatonic triads of C major with the classic I-vii° pattern', () => {
    const cases: [number, string, string][] = [
      [0, '', 'I'],
      [2, '-', 'ii'],
      [4, '-', 'iii'],
      [5, '', 'IV'],
      [7, '', 'V'],
      [9, '-', 'vi'],
      [11, '°', 'vii°'],
    ];
    cases.forEach(([root, symbol, expected]) => {
      assert.equal(romanNumeralLabel({ root, formula: formula(symbol) }, cPc, ionian), expected);
    });
  });

  test('a dominant 7th on the 5th degree is V7', () => {
    assert.equal(romanNumeralLabel({ root: 7, formula: formula('7') }, cPc, ionian), 'V7');
  });

  test('half-diminished and fully-diminished 7ths keep their full jazz suffix', () => {
    assert.equal(romanNumeralLabel({ root: 11, formula: formula('ø7') }, cPc, ionian), 'viiø7');
    assert.equal(romanNumeralLabel({ root: 11, formula: formula('°7') }, cPc, ionian), 'vii°7');
  });

  test('a plain minor 7th strips the "-" and lowercases the numeral', () => {
    assert.equal(romanNumeralLabel({ root: 2, formula: formula('-7') }, cPc, ionian), 'ii7');
  });

  test('a chromatic root a semitone above a diatonic degree is spelled flat', () => {
    assert.equal(romanNumeralLabel({ root: 1, formula: formula('') }, cPc, ionian), 'bII');
    assert.equal(romanNumeralLabel({ root: 8, formula: formula('-') }, cPc, ionian), 'bvi');
  });

  test('a chromatic root a semitone above the 4th degree is spelled sharp, not flat-5', () => {
    assert.equal(romanNumeralLabel({ root: 6, formula: formula('') }, cPc, ionian), '#IV');
  });

  test('the plain augmented triad is written with a "+"', () => {
    assert.equal(romanNumeralLabel({ root: 8, formula: formula('aug') }, cPc, ionian), 'bVI+');
  });

  test("follows the selected mode's own diatonic collection, not major's", () => {
    // In A Aeolian, the b3/b6/b7 degrees (C, F, G) are diatonic - no accidental.
    const aPc = keyPitchClass(KEYS.find(k => k.name === 'A')!);
    assert.equal(romanNumeralLabel({ root: 0, formula: formula('') }, aPc, aeolian), 'III'); // C major
    assert.equal(romanNumeralLabel({ root: 5, formula: formula('') }, aPc, aeolian), 'VI'); // F major
  });
});

describe('diatonicRomanNumerals', () => {
  const mode = (name: string) => MODES.find(m => m.name === name)!;

  test('C Ionian labels the white keys I through vii° and leaves black keys empty', () => {
    assert.deepEqual(diatonicRomanNumerals(0, mode('Ionian')), [
      'I', null, 'ii', null, 'iii', 'IV', null, 'V', null, 'vi', null, 'vii°',
    ]);
  });

  test("A Aeolian uses the minor mode's own degrees", () => {
    const hints = diatonicRomanNumerals(9, mode('Aeolian'));
    assert.equal(hints[9], 'i');
    assert.equal(hints[11], 'ii°');
    assert.equal(hints[0], 'III');
    assert.equal(hints[7], 'VII');
    assert.equal(hints.filter(h => h !== null).length, 7);
  });

  test('a key with black-key degrees labels them too', () => {
    const hints = diatonicRomanNumerals(5, mode('Ionian')); // F major
    assert.equal(hints[10], 'IV'); // Bb
    assert.equal(hints[11], null); // B natural
  });
});

describe('INTERVAL_NAMES', () => {
  test('has all 12 interval names, tritone at index 6', () => {
    assert.equal(INTERVAL_NAMES.length, 12);
    assert.equal(INTERVAL_NAMES[6], 'Tritone');
    assert.equal(INTERVAL_NAMES[0], 'Octave');
  });
});

describe('parseChordFormulas', () => {
  test('normalizes a valid chord table (dedup + mod-12 wrap)', () => {
    const result = parseChordFormulas([{ symbol: 'x', intervals: [0, 12, 24, -1, 4, 4] }]);
    assert.ok(result);
    assert.equal(result![0].symbol, 'x');
    assert.deepEqual(result![0].intervals.slice().sort((a, b) => a - b), [0, 4, 11]);
  });

  test('accepts an empty chord table', () => {
    assert.deepEqual(parseChordFormulas([]), []);
  });

  test('rejects a non-array', () => {
    assert.equal(parseChordFormulas({ symbol: '', intervals: [0, 4, 7] }), null);
    assert.equal(parseChordFormulas('not json'), null);
    assert.equal(parseChordFormulas(null), null);
  });

  test('rejects an array with a non-object entry', () => {
    assert.equal(parseChordFormulas(['nope']), null);
  });

  test('rejects an entry missing an intervals array', () => {
    assert.equal(parseChordFormulas([{ symbol: 'x' }]), null);
    assert.equal(parseChordFormulas([{ symbol: 'x', intervals: 'not an array' }]), null);
  });

  test('defaults a missing symbol to an empty string', () => {
    const result = parseChordFormulas([{ intervals: [0, 4, 7] }]);
    assert.ok(result);
    assert.equal(result![0].symbol, '');
  });

  test('round-trips the full default chord library', () => {
    const roundTripped = parseChordFormulas(JSON.parse(JSON.stringify(DEFAULT_CHORD_FORMULAS)));
    assert.deepEqual(roundTripped, DEFAULT_CHORD_FORMULAS);
  });
});

describe('transposition', () => {
  const key = (name: string) => KEYS.find(k => k.name === name)!;
  const IONIAN = MODES.find(m => m.name === 'Ionian')!;
  const AEOLIAN = MODES.find(m => m.name === 'Aeolian')!;

  test('modeShiftMap moves each scale degree to the new mode and leaves other notes alone', () => {
    const DORIAN = MODES.find(m => m.name === 'Dorian')!;
    // Major to minor: the 3rd, 6th and 7th come down.
    assert.deepEqual(modeShiftMap(IONIAN, AEOLIAN), [0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, -1]);
    // Minor to major: they go up; the raised 7th (11, outside Aeolian) stays.
    assert.deepEqual(modeShiftMap(AEOLIAN, IONIAN), [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0]);
    assert.deepEqual(modeShiftMap(IONIAN, DORIAN), [0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, -1]);
    assert.deepEqual(modeShiftMap(IONIAN, IONIAN), new Array(12).fill(0));
  });

  test('nearestShift takes the short way round', () => {
    assert.equal(nearestShift(0, 2), 2);
    assert.equal(nearestShift(0, 5), 5);
    assert.equal(nearestShift(0, 6), -6);
    assert.equal(nearestShift(0, 7), -5);
    assert.equal(nearestShift(2, 0), -2);
  });

  test('standardKeyIndex spells each key with the fewest accidentals', () => {
    const names = (mode: typeof IONIAN) => Array.from({ length: 12 }, (_, pc) => KEYS[standardKeyIndex(pc, mode)].name);
    assert.deepEqual(names(IONIAN), ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
    assert.deepEqual(names(AEOLIAN), ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']);
  });

  test('transpositionLabel names the interval by letter as well as distance', () => {
    assert.equal(transpositionLabel(key('C'), key('D'), 2), 'up a major 2nd');
    assert.equal(transpositionLabel(key('C'), key('Db'), 1), 'up a minor 2nd');
    assert.equal(transpositionLabel(key('C'), key('C#'), 1), 'up an augmented unison');
    assert.equal(transpositionLabel(key('C'), key('G'), 7), 'up a perfect 5th');
    assert.equal(transpositionLabel(key('C'), key('G'), -5), 'down a perfect 4th');
    assert.equal(transpositionLabel(key('C'), key('F#'), 6), 'up an augmented 4th');
    assert.equal(transpositionLabel(key('C'), key('Gb'), -6), 'down an augmented 4th');
    assert.equal(transpositionLabel(key('C'), key('B'), -1), 'down a minor 2nd');
    assert.equal(transpositionLabel(key('C'), key('C'), 12), 'up an octave');
    assert.equal(transpositionLabel(key('D'), key('D'), 0), 'original key');
    assert.equal(transpositionLabel(key('C#'), key('Db'), 0), 'same pitch, respelled');
  });
});
