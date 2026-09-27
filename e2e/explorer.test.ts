import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { closeSettings, highlightedMidis, launchApp, openExplorer, openHighlighter, openSettings, setLevel } from './fixtures';

// Clicks the button labelled `label` in one of the explorer's rows.
async function pick(page: import('playwright').Page, row: string, label: string): Promise<void> {
  await page.locator(`#${row} button`, { hasText: new RegExp(`^${label.replace(/[#]/g, '\\$&')}$`) }).click();
}

const summaryName = (page: import('playwright').Page) => page.locator('#explorerSummary .explorer-name').textContent();

describe('chord explorer', () => {
  test('builds a chord from root, quality, extension and inversion, and highlights it', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await setLevel(app.page, 'nerd');
      await closeSettings(app.page);
      await openExplorer(app.page);
      assert.deepEqual(await highlightedMidis(app.page), []);

      assert.equal(await app.page.inputValue('#soundPickerSelect'), ''); // Sound off
      await pick(app.page, 'explorerRootButtons', 'C');
      assert.notEqual(await app.page.inputValue('#soundPickerSelect'), '', 'picking turns sound on');
      assert.equal(await summaryName(app.page), 'CΔ7');
      assert.equal(await app.page.textContent('#explorerSummary .explorer-notes'), 'C E G B');
      assert.deepEqual(await highlightedMidis(app.page), [60, 64, 67, 71]);

      await pick(app.page, 'explorerScaleButtons', 'Mixolydian');
      await pick(app.page, 'explorerExtensionButtons', '9');
      assert.equal(await summaryName(app.page), 'C9');
      assert.deepEqual(await highlightedMidis(app.page), [60, 64, 67, 70, 74]);

      await pick(app.page, 'explorerInversionButtons', '1st');
      assert.equal(await summaryName(app.page), 'C9/E');
      assert.equal(await app.page.textContent('#explorerSummary .explorer-position'), '1st inversion');
      assert.deepEqual(await highlightedMidis(app.page), [64, 67, 70, 72, 74]);

      // Back to a triad: only Root, 1st and 2nd remain, and the 1st sticks.
      await pick(app.page, 'explorerExtensionButtons', '5');
      assert.equal(await app.page.locator('#explorerInversionButtons button').count(), 3);
      assert.equal(await summaryName(app.page), 'C/E');

      await app.page.selectOption('#explorerOctaveSelect', '3');
      assert.deepEqual(await highlightedMidis(app.page), [52, 55, 60]);

      // Clicking the root again turns the explorer off.
      await pick(app.page, 'explorerRootButtons', 'C');
      assert.deepEqual(await highlightedMidis(app.page), []);
    } finally {
      await app.close();
    }
  });

  test('plays the chord on every change, turning sound on', async () => {
    const app = await launchApp();
    try {
      // Headless audio can't be heard, so record the pitches the synth starts.
      await app.page.addInitScript(() => {
        const freqs: number[] = [];
        (window as unknown as { __freqs: number[] }).__freqs = freqs;
        const start = OscillatorNode.prototype.start;
        OscillatorNode.prototype.start = function (this: OscillatorNode, ...args: [number?]) {
          freqs.push(this.frequency.value);
          return start.apply(this, args);
        };
      });
      await app.page.reload();
      await openSettings(app.page);
      await setLevel(app.page, 'nerd');
      await closeSettings(app.page);
      await openExplorer(app.page);
      // MIDI numbers of the distinct pitches started since the last call.
      let seen = 0;
      const played = async () => {
        const freqs = await app.page.evaluate(() => (window as unknown as { __freqs: number[] }).__freqs);
        const midis = freqs.slice(seen).map(f => Math.round(69 + 12 * Math.log2(f / 440)));
        seen = freqs.length;
        return [...new Set(midis)].sort((a, b) => a - b);
      };

      await pick(app.page, 'explorerRootButtons', 'C');
      assert.deepEqual(await played(), [60, 64, 67, 71]);
      await pick(app.page, 'explorerScaleButtons', 'Dorian');
      assert.deepEqual(await played(), [60, 63, 67, 70]);
      await pick(app.page, 'explorerExtensionButtons', '5');
      assert.deepEqual(await played(), [60, 63, 67]);
      await pick(app.page, 'explorerInversionButtons', '2nd');
      assert.deepEqual(await played(), [67, 72, 75]);
      await app.page.selectOption('#explorerOctaveSelect', '3');
      assert.deepEqual(await played(), [55, 60, 63]);
    } finally {
      await app.close();
    }
  });

  test('shares the keyboard highlight with the Chord/Scale Display', async () => {
    const app = await launchApp();
    try {
      await openExplorer(app.page);
      await pick(app.page, 'explorerRootButtons', 'D');
      assert.equal(await summaryName(app.page), 'D');

      await openHighlighter(app.page);
      await app.page.locator('#chordRootButtons button', { hasText: /^G$/ }).click();
      assert.equal(await app.page.locator('#explorerRootButtons button.active').count(), 0);
      assert.equal(await app.page.textContent('#explorerSummary'), 'Pick a root note to build a chord.');

      await pick(app.page, 'explorerRootButtons', 'D');
      assert.equal(await app.page.locator('#chordRootButtons button.active').count(), 0);
      assert.deepEqual(await highlightedMidis(app.page), [62, 66, 69]);
    } finally {
      await app.close();
    }
  });

  test('offers only the extensions the level allows', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await setLevel(app.page, 'basic');
      await closeSettings(app.page);
      await openExplorer(app.page);
      assert.deepEqual(await app.page.locator('#explorerExtensionButtons button').allTextContents(), ['5']);
      await openSettings(app.page);
      await setLevel(app.page, 'nerd');
      await closeSettings(app.page);
      assert.deepEqual(
        await app.page.locator('#explorerExtensionButtons button').allTextContents(), ['5', '6', '7', '9', '11', '13']
      );
    } finally {
      await app.close();
    }
  });
});
