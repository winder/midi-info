import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Page } from 'playwright';
import { launchApp, openSettings, openSettingsTab, closeSettings, pressKeys, releaseKeys } from './fixtures';

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

describe('sound', () => {
  test('is off by default: playing makes no sound and the knobs are disabled', async () => {
    const app = await launchApp();
    try {
      await spyOnOscillators(app.page);
      await pressKeys(app.page, [60]);
      await releaseKeys(app.page, [60]);
      assert.deepEqual((await oscLog(app.page)).starts, []);

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
});
