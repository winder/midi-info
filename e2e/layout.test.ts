import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { elementTop, launchApp, openSettings, pressKeys, releaseKeys } from './fixtures';

// C4 = 60. Chord display content grows from one line (a bare note or
// unmatched chord) up to three (chord name + roman numeral + alternate
// matches, e.g. a symmetric diminished chord). #chordDisplay has a
// min-height sized for the tallest case specifically so the piano below it
// never shifts as that content changes.

describe('chord display layout', () => {
  test('the keyboard does not shift as the chord display grows to 3 lines', async () => {
    const app = await launchApp();
    try {
      const pianoTopWith = async (midis: number[]) => {
        await pressKeys(app.page, midis);
        const top = await elementTop(app.page, '#pianoContainer');
        await releaseKeys(app.page, midis);
        return top;
      };

      const empty = await elementTop(app.page, '#pianoContainer');
      const singleNote = await pianoTopWith([60]); // one line: just "C"
      const matchedTriad = await pianoTopWith([60, 64, 67]); // two lines: name + roman
      const symmetricChord = await pianoTopWith([60, 63, 66, 69]); // three lines: + alternates

      assert.equal(singleNote, empty);
      assert.equal(matchedTriad, empty);
      assert.equal(symmetricChord, empty);
    } finally {
      await app.close();
    }
  });

  test('the keyboard does not shift when the chord font size is enlarged', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await app.page.click('#debugCheckbox');
      await app.page.selectOption('#fontFamilySelect', 'real-book');
      await app.page.fill('#chordFontSizeInput', '60');
      await app.page.dispatchEvent('#chordFontSizeInput', 'change');

      const pianoTopWith = async (midis: number[]) => {
        await pressKeys(app.page, midis);
        const top = await elementTop(app.page, '#pianoContainer');
        await releaseKeys(app.page, midis);
        return top;
      };

      const empty = await elementTop(app.page, '#pianoContainer');
      const singleNote = await pianoTopWith([60]);
      // C-E-G-D-F-A: a 6-note cluster that renders a 3-line chord display
      // (name + roman numeral + alternate matches) at a large custom font
      // size - the combination that used to push the piano down.
      const sixNoteCluster = await pianoTopWith([60, 64, 67, 62, 65, 69]);

      assert.equal(singleNote, empty);
      assert.equal(sixNoteCluster, empty);
    } finally {
      await app.close();
    }
  });
});
