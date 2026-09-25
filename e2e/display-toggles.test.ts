import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chordDisplayMain, launchApp, openSettings, openSettingsTab, pressKeys, releaseKeys } from './fixtures';

// C4 60, E4 64, G4 67 - a plain C major triad, which is both "I" in C major
// (the app's default key/mode) and has an unambiguous chord-roman line.

describe('display tab toggles', () => {
  test('secondary and tertiary lines can be hidden independently', async () => {
    const app = await launchApp();
    try {
      await pressKeys(app.page, [60, 64, 67]);
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');

      assert.equal(await app.page.locator('#chordDisplay .chord-roman').count(), 1);
      assert.equal(await app.page.locator('#chordDisplay .chord-alt').count(), 1);

      await app.page.locator('#secondaryLineCheckbox').uncheck();
      assert.equal(await app.page.locator('#chordDisplay .chord-roman').count(), 0);
      assert.equal(await app.page.locator('#chordDisplay .chord-alt').count(), 1);

      await app.page.locator('#tertiaryLineCheckbox').uncheck();
      assert.equal(await app.page.locator('#chordDisplay .chord-alt').count(), 0);
    } finally {
      await app.close();
    }
  });

  test('turning off roman numeral detection leaves the secondary line present but empty', async () => {
    const app = await launchApp();
    try {
      await pressKeys(app.page, [60, 64, 67]);
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');

      assert.equal(await app.page.$eval('#chordDisplay .chord-roman', el => el.textContent), 'I');

      await app.page.locator('#romanNumeralsCheckbox').uncheck();
      assert.equal(await app.page.locator('#chordDisplay .chord-roman').count(), 1);
      assert.equal(await app.page.$eval('#chordDisplay .chord-roman', el => el.textContent), '');
    } finally {
      await app.close();
    }
  });

  test('octave labels can be hidden on the keyboard and the choice survives a reload', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');

      const initialCount = await app.page.locator('.octave-label').count();
      assert.ok(initialCount > 0);

      await app.page.locator('#octaveLabelsCheckbox').uncheck();
      assert.equal(await app.page.locator('.octave-label').count(), 0);

      await app.page.reload();
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      assert.equal(await app.page.locator('#octaveLabelsCheckbox').isChecked(), false);
      assert.equal(await app.page.locator('.octave-label').count(), 0);
    } finally {
      await app.close();
    }
  });

  test('the floating note label above active keys can be hidden and the choice survives a reload', async () => {
    const app = await launchApp();
    try {
      await pressKeys(app.page, [60, 64, 67]);
      assert.equal(await app.page.locator('.note-label').count(), 3);

      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      await app.page.locator('#noteLabelsCheckbox').uncheck();
      assert.equal(await app.page.locator('.note-label').count(), 0);

      await app.page.reload();
      await pressKeys(app.page, [60, 64, 67]);
      assert.equal(await app.page.locator('.note-label').count(), 0);
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      assert.equal(await app.page.locator('#noteLabelsCheckbox').isChecked(), false);
    } finally {
      await app.close();
    }
  });

  test('the n.c. label can be hidden, leaving the chord line blank, and the choice survives a reload', async () => {
    const app = await launchApp();
    try {
      // C C# D: three pitch classes that match no chord.
      await pressKeys(app.page, [60, 61, 62]);
      assert.equal(await chordDisplayMain(app.page), 'C n.c.');

      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      await app.page.locator('#noChordCheckbox').uncheck();
      assert.equal(await chordDisplayMain(app.page), '');

      // A real chord still shows.
      await releaseKeys(app.page, [61, 62]);
      await pressKeys(app.page, [64, 67]);
      assert.equal(await chordDisplayMain(app.page), 'C');

      await app.page.reload();
      await pressKeys(app.page, [60, 61, 62]);
      assert.equal(await chordDisplayMain(app.page), '');
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      assert.equal(await app.page.locator('#noChordCheckbox').isChecked(), false);
    } finally {
      await app.close();
    }
  });
  test('roman numeral hints are off by default, label diatonic keys below the keyboard, and survive a reload', async () => {
    const app = await launchApp();
    try {
      assert.equal(await app.page.locator('.roman-hint').count(), 0);

      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      await app.page.locator('#romanHintsCheckbox').check();

      // Default key is C major: white keys only, and C4 reads "I", centered
      // on its key, below the key bottoms.
      assert.equal(await app.page.locator('.roman-hint.black').count(), 0);
      const c4 = await app.page.evaluate(() => {
        const rect = document.querySelector('rect[data-midi="60"]')!;
        const keyX = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2;
        const keyBottom = Number(rect.getAttribute('y')) + Number(rect.getAttribute('height'));
        const hint = Array.from(document.querySelectorAll('.roman-hint'))
          .find(t => Math.abs(Number(t.getAttribute('x')) - keyX) < 0.01)!;
        return { text: hint.textContent, below: Number(hint.getAttribute('y')) > keyBottom };
      });
      assert.deepEqual(c4, { text: 'I', below: true });

      await app.page.reload();
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      assert.equal(await app.page.locator('#romanHintsCheckbox').isChecked(), true);
      assert.ok(await app.page.locator('.roman-hint').count() > 0);
    } finally {
      await app.close();
    }
  });
});
