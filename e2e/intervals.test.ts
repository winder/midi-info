import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chordDisplayMain, launchApp, pressKeys, releaseKeys } from './fixtures';

// C3 48, C4 60, C5 72, A5 81, A2 45, A3 57.

describe('interval display', () => {
  test('doubled notes across octaves do not turn an interval into "n.c."', async () => {
    const app = await launchApp();
    try {
      // Two pitch classes with the root doubled two octaves up: still an interval,
      // named from the lowest sounding note (C), not a failed 4-note chord match.
      await pressKeys(app.page, [48, 60, 72, 81]); // C-C-C-A
      assert.equal(await chordDisplayMain(app.page), 'Major 6th');
      await releaseKeys(app.page, [48, 60, 72, 81]);

      // Same two pitch classes, but the bass is A this time: the interval is named
      // from A up to C, not C up to A.
      await pressKeys(app.page, [45, 57, 72]); // A-A-C
      assert.equal(await chordDisplayMain(app.page), 'Minor 3rd');
      await releaseKeys(app.page, [45, 57, 72]);
    } finally {
      await app.close();
    }
  });

  test('a single pitch class doubled across octaves is just the note, not a chord', async () => {
    const app = await launchApp();
    try {
      await pressKeys(app.page, [48, 60, 72]); // C-C-C
      assert.equal(await chordDisplayMain(app.page), 'C');
    } finally {
      await app.close();
    }
  });
});
