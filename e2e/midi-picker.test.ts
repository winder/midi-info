import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Page } from 'playwright';
import { launchApp, installFakeMidi, plugMidiDevice, unplugMidiDevice, sendMidi } from './fixtures';

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;

async function picker(page: Page) {
  return page.evaluate(() => {
    const select = document.getElementById('midiPickerSelect') as HTMLSelectElement;
    return {
      labels: Array.from(select.options).map(o => o.textContent),
      value: select.value,
      disabled: select.disabled,
      title: document.getElementById('midiPickerRow')!.title,
    };
  });
}

async function activeMidis(page: Page): Promise<number[]> {
  return page.$$eval('rect.active:not(.key-glow)', rs => rs.map(r => Number((r as SVGElement).dataset.midi)).sort((a, b) => a - b));
}

describe('top-bar MIDI picker', () => {
  test('shows the status itself when MIDI is unavailable', async () => {
    // Plain headless Chromium refuses MIDI access.
    const app = await launchApp();
    try {
      await app.page.waitForFunction(() => (document.getElementById('midiPickerSelect') as HTMLSelectElement).options[0].textContent !== 'Checking MIDI…');
      const p = await picker(app.page);
      assert.deepEqual(p.labels, ['MIDI blocked']);
      assert.equal(p.disabled, true);
      assert.match(p.title, /site settings/);
    } finally {
      await app.close();
    }
  });

  test('lists devices as they come and go, and listens to one when picked', async () => {
    const app = await launchApp();
    const { page } = app;
    try {
      await installFakeMidi(page);
      assert.deepEqual((await picker(page)).labels, ['No MIDI device']);

      await plugMidiDevice(page, 'Keys');
      await plugMidiDevice(page, 'Pads');
      let p = await picker(page);
      assert.deepEqual(p.labels, ['All devices (2)', 'Keys', 'Pads']);
      assert.equal(p.disabled, false);

      // All devices: both play.
      await sendMidi(page, 'Keys', [NOTE_ON, 60, 100]);
      await sendMidi(page, 'Pads', [NOTE_ON, 64, 100]);
      assert.deepEqual(await activeMidis(page), [60, 64]);

      // Picking one device releases what was held and ignores the other.
      await page.selectOption('#midiPickerSelect', 'Keys');
      assert.deepEqual(await activeMidis(page), []);
      await sendMidi(page, 'Pads', [NOTE_ON, 67, 100]);
      await sendMidi(page, 'Keys', [NOTE_ON, 72, 100]);
      assert.deepEqual(await activeMidis(page), [72]);
      await sendMidi(page, 'Keys', [NOTE_OFF, 72, 0]);

      // Unplugging the chosen device falls back to everything, and the
      // choice comes back when it's plugged in again, even after a reload.
      await unplugMidiDevice(page, 'Keys');
      p = await picker(page);
      assert.deepEqual(p.labels, ['All devices (1)', 'Pads']);
      assert.equal(p.value, '');
      await sendMidi(page, 'Pads', [NOTE_ON, 67, 100]);
      assert.deepEqual(await activeMidis(page), [67]);
      await sendMidi(page, 'Pads', [NOTE_OFF, 67, 0]);

      await page.reload();
      await plugMidiDevice(page, 'Pads');
      await plugMidiDevice(page, 'Keys');
      p = await picker(page);
      assert.equal(p.value, 'Keys');
      assert.match(p.title, /Listening to: Keys\./);
    } finally {
      await app.close();
    }
  });
});
