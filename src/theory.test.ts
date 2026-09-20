import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CHORD_FORMULAS,
  INTERVAL_NAMES,
  KEYS,
  MODES,
  buildKeyNoteNames,
  chordLabel,
  detectChords,
  isBlackPitch,
  octaveOf,
  parseChordFormulas,
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
