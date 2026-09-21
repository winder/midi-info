import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chordDisplayMain,
  closeSettings,
  highlightedMidis,
  launchApp,
  openHighlighter,
  openSettings,
  pressKeys,
  releaseKeys,
  setLevel,
} from './fixtures';

// C4 = 60. Middle-C-region MIDI numbers used below:
// G3 55, C4 60, D4 62, E4 64, F4 65, G4 67, A4 69, Bb4 70, B4 71, D5 74.

describe('chord display', () => {
  test('the placeholder only shows before the first note, not after releasing back to silence', async () => {
    const app = await launchApp();
    try {
      assert.equal(await chordDisplayMain(app.page), 'Play some notes…');
      await pressKeys(app.page, [60]);
      assert.equal(await chordDisplayMain(app.page), 'C');
      await releaseKeys(app.page, [60]);
      assert.equal(await chordDisplayMain(app.page), '');
    } finally {
      await app.close();
    }
  });

  test('a sus chord is named from the bass note, not any root that fits', async () => {
    const app = await launchApp();
    try {
      // The same pitch classes, three different bass notes.
      const cases: [number[], string][] = [
        [[60, 65, 67], 'Csus4'], // C-F-G
        [[53, 67, 72], 'Fsus2'], // F-G-C
        [[55, 60, 65], 'G7sus4'], // G-C-F (5th omitted)
      ];
      for (const [midis, expected] of cases) {
        await pressKeys(app.page, midis);
        assert.equal(await chordDisplayMain(app.page), expected);
        await releaseKeys(app.page, midis);
      }
    } finally {
      await app.close();
    }
  });

  test('non-sus inversions still name the chord and show the bass as a slash', async () => {
    const app = await launchApp();
    try {
      await pressKeys(app.page, [64, 67, 72]); // E-G-C
      assert.equal(await chordDisplayMain(app.page), 'C/E');
    } finally {
      await app.close();
    }
  });

  test('extended sus chords are recognized with or without the 5th', async () => {
    const app = await launchApp();
    try {
      const cases: [number[], string][] = [
        [[60, 62, 67, 71], 'CΔ7sus2'], // C-D-G-B
        [[60, 65, 67, 70, 74], 'C9sus4'], // C-F-G-Bb-D
        [[60, 65, 70, 74], 'C9sus4'], // no G
        [[60, 65, 67, 69, 70, 74], 'C13sus'], // C-F-G-A-Bb-D
        [[60, 70, 74, 77, 81], 'C13sus'], // no G
      ];
      for (const [midis, expected] of cases) {
        await pressKeys(app.page, midis);
        assert.equal(await chordDisplayMain(app.page), expected);
        await releaseKeys(app.page, midis);
      }
    } finally {
      await app.close();
    }
  });
});

describe('highlighter chord voicings', () => {
  test('sus chords light their idiomatic voicing, dropping the 5th on 9sus4 and 13sus', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await setLevel(app.page, 'nerd'); // 13sus and Δ7sus2 are nerd-level
      await closeSettings(app.page);
      await openHighlighter(app.page);
      await app.page.click('#chordRootButtons button:first-child'); // C

      const cases: [string, number[]][] = [
        ['sus4', [60, 65, 67]], // C F G
        ['Δ7sus2', [60, 71, 74, 79]], // C B D G
        ['9sus4', [60, 65, 70, 74]], // C F Bb D
        ['13sus', [60, 70, 74, 77, 81]], // C Bb D F A
      ];
      for (const [symbol, expected] of cases) {
        await app.page.selectOption('#chordTypeSelect', symbol);
        assert.deepEqual(await highlightedMidis(app.page), expected, symbol);
      }
    } finally {
      await app.close();
    }
  });
});
