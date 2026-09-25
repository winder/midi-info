import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Page } from 'playwright';
import { launchApp, openSettings, openSettingsTab, closeSettings, openHighlighter, pressKeys, releaseKeys, chordDisplayMain, highlightedMidis } from './fixtures';

// Headless audio can't be listened to, so the page records what the synth
// asks Web Audio for instead: every oscillator start (frequency, waveform)
// and stop, in window.__osc.
interface OscLog {
  starts: { freq: number; type: string }[];
  stops: number;
}

async function spyOnOscillators(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log = { starts: [] as { freq: number; type: string }[], stops: 0 };
    (window as unknown as { __osc: typeof log }).__osc = log;
    const start = OscillatorNode.prototype.start;
    const stop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.start = function (this: OscillatorNode, ...args: [number?]) {
      log.starts.push({ freq: this.frequency.value, type: this.type });
      return start.apply(this, args);
    };
    OscillatorNode.prototype.stop = function (this: OscillatorNode, ...args: [number?]) {
      log.stops++;
      return stop.apply(this, args);
    };
  });
  await page.reload();
}

function oscLog(page: Page): Promise<OscLog> {
  return page.evaluate(() => (window as unknown as { __osc: OscLog }).__osc);
}

// Started oscillator frequencies, rounded to 0.01 Hz, from index `from` on.
async function startedFreqs(page: Page, from = 0): Promise<number[]> {
  return (await oscLog(page)).starts.slice(from).map(s => Math.round(s.freq * 100) / 100);
}

// MIDI numbers of the key rects carrying `cls` (e.g. 'active', 'auto').
async function midisWithClass(page: Page, cls: string): Promise<number[]> {
  return page.$$eval(`rect.${cls}:not(.key-glow)`, rs =>
    rs.map(r => Number((r as SVGElement).dataset.midi)).sort((a, b) => a - b));
}

// The fill a key rect with these classes would get, via a throwaway rect.
function fillForClasses(page: Page, classes: string): Promise<string> {
  return page.evaluate(cls => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', cls);
    document.getElementById('piano')!.appendChild(rect);
    const fill = getComputedStyle(rect).fill;
    rect.remove();
    return fill;
  }, classes);
}

async function enableSound(page: Page): Promise<void> {
  await openSettings(page);
  await openSettingsTab(page, 'sound');
  await page.check('#soundEnabledCheckbox');
  await closeSettings(page);
}

describe('sound', () => {
  test('is off by default: playing makes no sound and the knobs are disabled', async () => {
    const app = await launchApp();
    try {
      await spyOnOscillators(app.page);
      await pressKeys(app.page, [60]);
      await releaseKeys(app.page, [60]);
      assert.deepEqual((await oscLog(app.page)).starts, []);

      // With sound off, a highlighted chord doesn't auto-play or light keys,
      // and its highlight stays up as a guide while you play.
      await openHighlighter(app.page);
      await app.page.click('#chordRootButtons .root-btn:text-is("C")');
      await pressKeys(app.page, [62]);
      assert.deepEqual(await midisWithClass(app.page, 'auto'), []);
      assert.deepEqual(await highlightedMidis(app.page), [60, 64, 67]);
      await releaseKeys(app.page, [62]);

      await openSettings(app.page);
      await openSettingsTab(app.page, 'sound');
      assert.equal(await app.page.isChecked('#soundEnabledCheckbox'), false);
      assert.equal(await app.page.isDisabled('#soundVolumeInput'), true);
      assert.equal(await app.page.isVisible('#soundUnlockBtn'), false);
    } finally {
      await app.close();
    }
  });

  test('when on, each note voices at its pitch in the chosen tone and stops on release', async () => {
    const app = await launchApp();
    try {
      await spyOnOscillators(app.page);
      await openSettings(app.page);
      await openSettingsTab(app.page, 'sound');
      await app.page.check('#soundEnabledCheckbox');
      await app.page.selectOption('#soundWaveformSelect', 'sawtooth');
      await closeSettings(app.page);

      await pressKeys(app.page, [60, 69]);
      let log = await oscLog(app.page);
      assert.deepEqual(log.starts.map(s => [Math.round(s.freq * 100) / 100, s.type]), [
        [261.63, 'sawtooth'],
        [440, 'sawtooth'],
      ]);
      assert.equal(log.stops, 0);

      await releaseKeys(app.page, [60, 69]);
      log = await oscLog(app.page);
      assert.equal(log.stops, 2);
    } finally {
      await app.close();
    }
  });

  test('settings persist across a reload and a slider updates its readout', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'sound');
      await app.page.check('#soundEnabledCheckbox');
      await app.page.fill('#soundReleaseMsInput', '1200');
      assert.equal(await app.page.textContent('#soundReleaseMsValue'), '1200 ms');

      await app.page.reload();
      await openSettings(app.page);
      await openSettingsTab(app.page, 'sound');
      assert.equal(await app.page.isChecked('#soundEnabledCheckbox'), true);
      assert.equal(await app.page.inputValue('#soundReleaseMsInput'), '1200');

      await app.page.click('#soundResetBtn');
      assert.equal(await app.page.inputValue('#soundReleaseMsInput'), '300');
      assert.equal(await app.page.isChecked('#soundEnabledCheckbox'), true);
    } finally {
      await app.close();
    }
  });

  test('picking a chord in the highlighter plays it', async () => {
    const app = await launchApp();
    try {
      await spyOnOscillators(app.page);
      await enableSound(app.page);
      await openHighlighter(app.page);
      await app.page.click('#chordRootButtons .root-btn:text-is("C")');
      assert.deepEqual(await startedFreqs(app.page), [261.63, 329.63, 392]);

      const before = (await oscLog(app.page)).starts.length;
      await app.page.selectOption('#chordTypeSelect', '-');
      assert.deepEqual(await startedFreqs(app.page, before), [261.63, 311.13, 392]);
    } finally {
      await app.close();
    }
  });

  test('with a chord highlighted, a played key sounds that chord rooted on it', async () => {
    const app = await launchApp();
    try {
      await spyOnOscillators(app.page);
      await enableSound(app.page);
      await openHighlighter(app.page);
      await app.page.click('#chordRootButtons .root-btn:text-is("C")');
      // Let the selection preview finish so its stops aren't counted below.
      await app.page.waitForTimeout(800);
      const before = await oscLog(app.page);

      // D4: D major (the default chord type), stacked up from the key.
      await pressKeys(app.page, [62]);
      assert.deepEqual(await startedFreqs(app.page, before.starts.length), [293.66, 369.99, 440]);
      // The pressed key is active; the rest of the chord shows as auto keys,
      // and the readout names the whole chord.
      assert.deepEqual(await midisWithClass(app.page, 'active'), [62]);
      assert.deepEqual(await midisWithClass(app.page, 'auto'), [66, 69]);
      assert.equal(await chordDisplayMain(app.page), 'D');
      // Auto keys use the active+highlighted blend, black and white alike.
      for (const [midi, base] of [[66, 'black-key'], [69, 'white-key']] as const) {
        const autoFill = await app.page.$eval(`rect.auto[data-midi="${midi}"]`, el => getComputedStyle(el).fill);
        assert.equal(autoFill, await fillForClasses(app.page, `${base} active highlighted`));
      }

      await releaseKeys(app.page, [62]);
      assert.equal((await oscLog(app.page)).stops - before.stops, 3);
      assert.deepEqual(await midisWithClass(app.page, 'auto'), []);
    } finally {
      await app.close();
    }
  });

  test('playing after picking a chord hides its highlight until the next pick', async () => {
    const app = await launchApp();
    try {
      await enableSound(app.page);
      await openHighlighter(app.page);
      await app.page.click('#chordRootButtons .root-btn:text-is("C")');
      assert.deepEqual(await highlightedMidis(app.page), [60, 64, 67]);

      await pressKeys(app.page, [62]);
      assert.deepEqual(await highlightedMidis(app.page), []);
      await releaseKeys(app.page, [62]);
      assert.deepEqual(await highlightedMidis(app.page), []);
      // Still selected: the next key auto-plays the chord.
      await pressKeys(app.page, [65]);
      assert.deepEqual(await midisWithClass(app.page, 'auto'), [69, 72]);
      await releaseKeys(app.page, [65]);

      await app.page.selectOption('#chordTypeSelect', '-');
      assert.deepEqual(await highlightedMidis(app.page), [60, 63, 67]);
    } finally {
      await app.close();
    }
  });
});
