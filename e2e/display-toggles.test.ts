import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, openSettings, openSettingsTab, pressKeys } from './fixtures';

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
});
