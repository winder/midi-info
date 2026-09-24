import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Page } from 'playwright';
import { chordDisplayMain, launchApp, openSettings, openSettingsTab, pressKeys, releaseKeys } from './fixtures';

// Every text the chord readout's main line takes, recorded in the page by a
// MutationObserver so transient states that a later read would miss are kept.
async function recordChordMain(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { chordMainHistory: string[] };
    w.chordMainHistory = [];
    const el = document.getElementById('chordDisplay')!;
    new MutationObserver(() => {
      const text = (el.querySelector('.chord-main')?.textContent || '').trim();
      if (w.chordMainHistory[w.chordMainHistory.length - 1] !== text) w.chordMainHistory.push(text);
    }).observe(el, { childList: true, subtree: true, characterData: true });
  });
}

async function chordMainHistory(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { chordMainHistory: string[] }).chordMainHistory);
}

// C4 E4 G4 B4 = CΔ7; the staggered release would pass through C, an interval
// and a single note without smoothing.
describe('chord smoothing', () => {
  test('the app defaults to light smoothing and shows it on the Display tab', async () => {
    const app = await launchApp({ chordSmoothing: null });
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      assert.equal(await app.page.inputValue('#chordSmoothingSelect'), 'light');
      assert.equal(await app.page.isChecked('#holdLastChordCheckbox'), false);
    } finally {
      await app.close();
    }
  });

  test('a staggered release skips the in-between chords', async () => {
    const app = await launchApp({ chordSmoothing: 'light' });
    try {
      await pressKeys(app.page, [60, 64, 67, 71]);
      await app.page.waitForFunction(() => document.querySelector('#chordDisplay .chord-main')?.textContent === 'CΔ7');
      await recordChordMain(app.page);
      for (const m of [71, 67, 64, 60]) {
        await releaseKeys(app.page, [m]);
        await app.page.waitForTimeout(20);
      }
      await app.page.waitForTimeout(300);
      assert.deepEqual(await chordMainHistory(app.page), ['']);
    } finally {
      await app.close();
    }
  });

  test('off names the chord on the press itself', async () => {
    const app = await launchApp({ chordSmoothing: 'light' });
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      await app.page.selectOption('#chordSmoothingSelect', 'off');
      await pressKeys(app.page, [60, 64, 67]);
      assert.equal(await chordDisplayMain(app.page), 'C');
    } finally {
      await app.close();
    }
  });

  test('hold last chord keeps it after release, and both settings persist', async () => {
    const app = await launchApp({ chordSmoothing: 'heavy' });
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      await app.page.locator('#holdLastChordCheckbox').check();

      await pressKeys(app.page, [60, 64, 67]);
      await app.page.waitForFunction(() => document.querySelector('#chordDisplay .chord-main')?.textContent === 'C');
      await releaseKeys(app.page, [60, 64, 67]);
      await app.page.waitForTimeout(500);
      assert.equal(await chordDisplayMain(app.page), 'C');

      await app.page.reload();
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      assert.equal(await app.page.inputValue('#chordSmoothingSelect'), 'heavy');
      assert.equal(await app.page.isChecked('#holdLastChordCheckbox'), true);
    } finally {
      await app.close();
    }
  });

  test('Advanced reveals direct delay entry, which applies and persists', async () => {
    const app = await launchApp({ chordSmoothing: 'off' });
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      assert.equal(await app.page.isVisible('#smoothingAdvanced'), false);
      await app.page.selectOption('#chordSmoothingSelect', 'custom');
      assert.equal(await app.page.isVisible('#smoothingAdvanced'), true);

      await app.page.fill('#smoothingAttackInput', '400');
      await app.page.press('#smoothingAttackInput', 'Enter');
      await app.page.fill('#smoothingReleaseInput', '9999');
      await app.page.press('#smoothingReleaseInput', 'Enter');
      // Out of range snaps back to the previous (Light-derived) value.
      assert.equal(await app.page.inputValue('#smoothingReleaseInput'), '150');

      await pressKeys(app.page, [60, 64, 67]);
      await app.page.waitForTimeout(150);
      assert.notEqual(await chordDisplayMain(app.page), 'C');
      await app.page.waitForFunction(() => document.querySelector('#chordDisplay .chord-main')?.textContent === 'C');

      await app.page.reload();
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      assert.equal(await app.page.inputValue('#chordSmoothingSelect'), 'custom');
      assert.equal(await app.page.inputValue('#smoothingAttackInput'), '400');
      assert.equal(await app.page.inputValue('#smoothingReleaseInput'), '150');
    } finally {
      await app.close();
    }
  });

  test('a timed hold clears the chord after the chosen duration', async () => {
    // Light, not off: the fixture releases keys one at a time, and off would
    // settle on the last single note rather than the chord.
    const app = await launchApp({ chordSmoothing: 'light' });
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      assert.equal(await app.page.isVisible('#holdDurationInput'), false);
      await app.page.locator('#holdLastChordCheckbox').check();
      assert.equal(await app.page.isVisible('#holdDurationInput'), true);
      assert.equal(await app.page.inputValue('#holdDurationInput'), '');
      await app.page.fill('#holdDurationInput', '1000');
      await app.page.press('#holdDurationInput', 'Enter');

      await pressKeys(app.page, [60, 64, 67]);
      await app.page.waitForFunction(() => document.querySelector('#chordDisplay .chord-main')?.textContent === 'C');
      await releaseKeys(app.page, [60, 64, 67]);
      await app.page.waitForTimeout(500);
      assert.equal(await chordDisplayMain(app.page), 'C');
      await app.page.waitForTimeout(1000);
      assert.equal(await chordDisplayMain(app.page), '');
    } finally {
      await app.close();
    }
  });

  test('the toggles share one card, chord display and keyboard side by side on a wide window', async () => {
    const app = await launchApp();
    try {
      await app.page.setViewportSize({ width: 1200, height: 900 });
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      const chord = (await app.page.locator('#chordDisplayGroup').boundingBox())!;
      const keys = (await app.page.locator('#keyboardDisplayGroup').boundingBox())!;
      assert.equal(chord.y, keys.y);
      assert.ok(keys.x >= chord.x + chord.width);
      // Only the toggles are grouped; the other controls sit outside the card.
      for (const id of ['themeSelect', 'rangeInput', 'chordSmoothingSelect', 'holdLastChordCheckbox', 'holdDurationInput']) {
        assert.equal(await app.page.locator(`#displayToggles #${id}`).count(), 0, id);
      }
    } finally {
      await app.close();
    }
  });
});
