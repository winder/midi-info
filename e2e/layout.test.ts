import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { elementTop, launchApp, openSettings, openSettingsTab, pressKeys, releaseKeys } from './fixtures';

// C4 = 60. Chord display content ranges from one populated line (a bare
// note or unmatched chord) up to three (chord name + roman numeral +
// alternate matches, e.g. a symmetric diminished chord). All three line
// slots are always rendered at fixed heights, so neither the chord name
// itself nor the piano below it may move as that content changes.

type Layout = { chordTop: number; pianoTop: number };

async function layoutWith(page: Parameters<typeof elementTop>[0], midis: number[]): Promise<Layout> {
  if (midis.length) await pressKeys(page, midis);
  const layout = {
    chordTop: await elementTop(page, '#chordDisplay .chord-main'),
    pianoTop: await elementTop(page, '#pianoContainer'),
  };
  if (midis.length) await releaseKeys(page, midis);
  return layout;
}

describe('chord display layout', () => {
  test('neither the chord name nor the keyboard moves as the display grows to 3 lines', async () => {
    const app = await launchApp();
    try {
      const empty = await layoutWith(app.page, []);
      const singleNote = await layoutWith(app.page, [60]); // just "C"
      const matchedTriad = await layoutWith(app.page, [60, 64, 67]); // name + roman
      const symmetricChord = await layoutWith(app.page, [60, 63, 66, 69]); // + alternates

      assert.deepEqual(singleNote, empty);
      assert.deepEqual(matchedTriad, empty);
      assert.deepEqual(symmetricChord, empty);
    } finally {
      await app.close();
    }
  });

  test('neither the chord name nor the keyboard moves at a large custom font size', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      await openSettingsTab(app.page, 'themes');
      await app.page.waitForSelector('#themeEditorSection:not([hidden])');
      await app.page.selectOption('#fontFamilySelect', 'real-book');
      await app.page.fill('#chordFontSizeInput', '60');
      await app.page.dispatchEvent('#chordFontSizeInput', 'change');

      const empty = await layoutWith(app.page, []);
      // C-E-G-D-F-A one note at a time: the display goes 1 line -> 2 -> 3
      // (name, + roman numeral, + alternate matches). Every step must leave
      // the chord name and the piano exactly where they were.
      const held: number[] = [];
      for (const midi of [60, 64, 67, 62, 65, 69]) {
        held.push(midi);
        await pressKeys(app.page, [midi]);
        assert.deepEqual(await layoutWith(app.page, []), empty, `after ${held.length} notes`);
      }
      await releaseKeys(app.page, held);
    } finally {
      await app.close();
    }
  });
});
