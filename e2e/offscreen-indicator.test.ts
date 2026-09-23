import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  closeSettings,
  launchApp,
  openSettings,
  openSettingsTab,
  pressKeys,
  releaseKeys,
} from './fixtures';

// A0 21 and C8 108 are the extreme ends of the 88-key range; C4 60 is
// middle C, where the piano is centered on load.

async function indicatorState(page: import('playwright').Page): Promise<{ left: boolean; right: boolean }> {
  return page.evaluate(() => ({
    left: !(document.getElementById('offscreenLeft') as HTMLElement).hidden,
    right: !(document.getElementById('offscreenRight') as HTMLElement).hidden,
  }));
}

describe('offscreen indicator arrows', () => {
  test('an arrow appears on the side a played key is scrolled off, and clears when the key is released', async () => {
    const app = await launchApp();
    try {
      const { page } = app;
      await openSettings(page);
      await openSettingsTab(page, 'display');
      await page.fill('#rangeInput', '10');
      await page.dispatchEvent('#rangeInput', 'change');
      await closeSettings(page);

      assert.deepEqual(await indicatorState(page), { left: false, right: false });

      await pressKeys(page, [60]);
      assert.deepEqual(await indicatorState(page), { left: false, right: false }, 'middle C stays visible at the default zoom-in center');
      await releaseKeys(page, [60]);

      await pressKeys(page, [21]);
      assert.deepEqual(await indicatorState(page), { left: true, right: false }, 'A0 is far off-screen to the left');
      await releaseKeys(page, [21]);
      assert.deepEqual(await indicatorState(page), { left: false, right: false });

      await pressKeys(page, [108]);
      assert.deepEqual(await indicatorState(page), { left: false, right: true }, 'C8 is far off-screen to the right');
      await releaseKeys(page, [108]);
    } finally {
      await app.close();
    }
  });

  test('scrolling the off-screen key into view clears the indicator without releasing the key', async () => {
    const app = await launchApp();
    try {
      const { page } = app;
      await openSettings(page);
      await openSettingsTab(page, 'display');
      await page.fill('#rangeInput', '10');
      await page.dispatchEvent('#rangeInput', 'change');
      await closeSettings(page);

      await pressKeys(page, [108]);
      assert.deepEqual(await indicatorState(page), { left: false, right: true });

      await page.evaluate(() => {
        const container = document.getElementById('pianoContainer') as HTMLElement;
        container.scrollLeft = container.scrollWidth;
        container.dispatchEvent(new Event('scroll'));
      });
      assert.deepEqual(await indicatorState(page), { left: false, right: false });

      await releaseKeys(page, [108]);
    } finally {
      await app.close();
    }
  });

  test('the Display tab can turn the arrows off, and the choice survives a reload', async () => {
    const app = await launchApp();
    try {
      const { page } = app;
      await openSettings(page);
      await openSettingsTab(page, 'display');
      await page.fill('#rangeInput', '10');
      await page.dispatchEvent('#rangeInput', 'change');

      await pressKeys(page, [108]);
      assert.deepEqual(await indicatorState(page), { left: false, right: true });

      await page.locator('#offscreenArrowsCheckbox').uncheck();
      assert.deepEqual(await indicatorState(page), { left: false, right: false }, 'unchecking hides an arrow that is currently showing');
      await releaseKeys(page, [108]);

      await pressKeys(page, [21]);
      assert.deepEqual(await indicatorState(page), { left: false, right: false }, 'no arrow appears for a new off-screen note while disabled');
      await releaseKeys(page, [21]);

      await page.reload();
      await pressKeys(page, [108]);
      assert.deepEqual(await indicatorState(page), { left: false, right: false }, 'setting persists across reload');
      await openSettings(page);
      await openSettingsTab(page, 'display');
      assert.equal(await page.locator('#offscreenArrowsCheckbox').isChecked(), false);

      await page.locator('#offscreenArrowsCheckbox').check();
      assert.deepEqual(await indicatorState(page), { left: false, right: true }, 're-enabling shows the arrow for the note still held');
      await releaseKeys(page, [108]);
    } finally {
      await app.close();
    }
  });
});
