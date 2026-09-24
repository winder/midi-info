import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from './fixtures';

// Every setting carries mouse-over help: each control in the settings panel
// (except the chord table's generated rows and the hidden file inputs) sits
// inside an element with a non-empty title.
describe('settings help', () => {
  test('every settings control has hover help', async () => {
    const app = await launchApp();
    try {
      const missing = await app.page.$$eval(
        '#settingsContent input:not([type="file"]), #settingsContent select, #settingsContent button, #settingsContent th:not(:empty)',
        els => els
          .filter(el => !el.closest('#chordTableBody'))
          .filter(el => !(el.closest('[title]')?.getAttribute('title') || '').trim())
          .map(el => el.id || el.textContent?.trim() || el.outerHTML.slice(0, 60))
      );
      assert.deepEqual(missing, []);
    } finally {
      await app.close();
    }
  });
});
