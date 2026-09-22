import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, openSettings, openSettingsTab, pressKeys } from './fixtures';

describe('font size settings', () => {
  test('each area sizes independently and persists across reload', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      await openSettingsTab(app.page, 'themes');
      await app.page.waitForSelector('#themeEditorSection:not([hidden])');

      const defaults = {
        chordFontSizeInput: '40',
        secondaryFontSizeInput: '16',
        tertiaryFontSizeInput: '15',
        noteFontSizeInput: '15',
        octaveFontSizeInput: '10',
      };
      for (const [id, value] of Object.entries(defaults)) {
        assert.equal(await app.page.$eval(`#${id}`, el => (el as HTMLInputElement).value), value, id);
      }

      await pressKeys(app.page, [60, 63, 66, 69]); // dim7: exercises main + roman + alt lines

      const fontSize = (sel: string) => app.page.$eval(sel, el => getComputedStyle(el).fontSize);

      // Changing one area's input leaves the others at their defaults.
      await app.page.fill('#chordFontSizeInput', '60');
      await app.page.dispatchEvent('#chordFontSizeInput', 'change');
      assert.equal(await fontSize('#chordDisplay .chord-main'), '60px');
      assert.equal(await fontSize('#chordDisplay .chord-roman'), '16px');
      assert.equal(await fontSize('#chordDisplay .chord-alt'), '15px');
      assert.equal(await fontSize('.note-label'), '15px');
      assert.equal(await fontSize('.octave-label'), '10px');

      await app.page.fill('#octaveFontSizeInput', '18');
      await app.page.dispatchEvent('#octaveFontSizeInput', 'change');
      assert.equal(await fontSize('.octave-label'), '18px');
      assert.equal(await fontSize('#chordDisplay .chord-main'), '60px'); // unaffected

      await app.page.reload();
      await openSettings(app.page);
      await openSettingsTab(app.page, 'themes');
      await app.page.waitForSelector('#themeEditorSection:not([hidden])');
      assert.equal(await app.page.$eval('#chordFontSizeInput', el => (el as HTMLInputElement).value), '60');
      assert.equal(await app.page.$eval('#octaveFontSizeInput', el => (el as HTMLInputElement).value), '18');
      assert.equal(await app.page.$eval('#secondaryFontSizeInput', el => (el as HTMLInputElement).value), '16');
    } finally {
      await app.close();
    }
  });
});
