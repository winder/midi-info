import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Page } from 'playwright';
import { launchApp, openSettings, openSettingsTab, closeSettings, openHighlighter, pressKeys, releaseKeys, chordDisplayMain, highlightedMidis } from './fixtures';

// Headless audio can't be listened to, so the page records what the synth
// asks Web Audio for instead: every oscillator start (frequency, waveform)
// and stop, in window.__osc.
interface OscLog {
  starts: { freq: number; type: string; detune: number }[];
  stops: number;
}

async function spyOnOscillators(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log = { starts: [] as { freq: number; type: string; detune: number }[], stops: 0 };
    (window as unknown as { __osc: typeof log }).__osc = log;
    const start = OscillatorNode.prototype.start;
    const stop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.start = function (this: OscillatorNode, ...args: [number?]) {
      log.starts.push({ freq: this.frequency.value, type: this.type, detune: this.detune.value });
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

// Pretends the tab went to the background (or came back), the way a tab
// switch or minimized window does.
async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate(h => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: h ? 'hidden' : 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
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
      assert.equal(await app.page.$eval('#soundPickerRow', el => el.classList.contains('locked')), false);
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

  test('sounds work like themes: built-ins, modified flag, new/rename/delete', async () => {
    const app = await launchApp();
    const { page } = app;
    const ALL_SOUNDS = ['Classic', 'Flute', 'Organ', 'Brass', 'Pad', 'Chiptune', 'Hoover', 'Seasick', 'Cathedral', 'Laser Harp', 'Bees', 'Ghost Choir', 'Broken Toy', 'Drunk Organ'];
    const optionTexts = () => page.$$eval('#soundPresetSelect option', os => os.map(o => o.textContent));
    try {
      await openSettings(page);
      await openSettingsTab(page, 'sound');
      await page.check('#soundEnabledCheckbox');
      assert.deepEqual(await optionTexts(), ALL_SOUNDS);

      // A built-in: loads its knobs, can't be renamed or deleted.
      await page.selectOption('#soundPresetSelect', 'Organ');
      assert.equal(await page.inputValue('#soundWaveformSelect'), 'square');
      assert.equal(await page.inputValue('#soundReleaseMsInput'), '60');
      assert.equal(await page.isDisabled('#soundNameInput'), true);
      assert.equal(await page.isDisabled('#soundDeleteBtn'), true);
      assert.equal(await page.isDisabled('#soundResetBtn'), false);

      // Editing it flags it modified; Reset puts it back.
      await page.fill('#soundBrightnessInput', '90');
      assert.equal((await optionTexts())[2], 'Organ (modified)');
      await page.click('#soundResetBtn');
      assert.equal((await optionTexts())[2], 'Organ');
      assert.equal(await page.inputValue('#soundBrightnessInput'), '40');

      // New copies the selected sound; a custom one can be renamed and deleted.
      await page.click('#soundNewBtn');
      assert.equal(await page.inputValue('#soundPresetSelect'), 'New sound');
      assert.equal(await page.inputValue('#soundWaveformSelect'), 'square');
      assert.equal(await page.isDisabled('#soundNameInput'), false);
      assert.equal(await page.isDisabled('#soundDeleteBtn'), false);
      assert.equal(await page.isDisabled('#soundResetBtn'), true);
      await page.fill('#soundNameInput', 'Mine');
      await page.press('#soundNameInput', 'Enter');
      await page.fill('#soundAttackMsInput', '400');

      // Taking a built-in's name is refused.
      await page.fill('#soundNameInput', 'Pad');
      await page.press('#soundNameInput', 'Enter');
      assert.equal(await page.inputValue('#soundNameInput'), 'Mine');

      // The list and selection survive a reload.
      await page.reload();
      await openSettings(page);
      await openSettingsTab(page, 'sound');
      assert.equal(await page.inputValue('#soundPresetSelect'), 'Mine');
      assert.equal(await page.inputValue('#soundAttackMsInput'), '400');

      await page.click('#soundDeleteBtn');
      assert.deepEqual(await optionTexts(), ALL_SOUNDS);
      assert.equal(await page.inputValue('#soundPresetSelect'), 'Drunk Organ');
    } finally {
      await app.close();
    }
  });

  test('only the visible tab plays: hiding it cuts held notes and mutes new ones', async () => {
    const app = await launchApp();
    try {
      await spyOnOscillators(app.page);
      await enableSound(app.page);

      await pressKeys(app.page, [60]);
      assert.equal((await oscLog(app.page)).starts.length, 1);
      await setTabHidden(app.page, true);
      assert.equal((await oscLog(app.page)).stops, 1);

      await pressKeys(app.page, [64]);
      assert.equal((await oscLog(app.page)).starts.length, 1);
      await releaseKeys(app.page, [60, 64]);

      await setTabHidden(app.page, false);
      await pressKeys(app.page, [67]);
      assert.deepEqual(await startedFreqs(app.page, 1), [392]);
    } finally {
      await app.close();
    }
  });

  test('volume is global: switching sounds keeps it and never marks a sound modified', async () => {
    const app = await launchApp();
    const { page } = app;
    try {
      await openSettings(page);
      await openSettingsTab(page, 'sound');
      await page.check('#soundEnabledCheckbox');
      await page.fill('#soundVolumeInput', '35');
      assert.equal(await page.textContent('#soundVolumeValue'), '35%');
      await page.selectOption('#soundPresetSelect', 'Pad');
      assert.equal(await page.inputValue('#soundVolumeInput'), '35');
      const options = await page.$$eval('#soundPresetSelect option', os => os.map(o => o.textContent));
      assert.ok(options.every(o => !o?.includes('modified')), options.join());

      await page.reload();
      await openSettings(page);
      await openSettingsTab(page, 'sound');
      assert.equal(await page.inputValue('#soundVolumeInput'), '35');
    } finally {
      await app.close();
    }
  });

  test('unison and reverb ticks reveal their options, and unison stacks detuned voices', async () => {
    const app = await launchApp();
    const { page } = app;
    try {
      await spyOnOscillators(page);
      await openSettings(page);
      await openSettingsTab(page, 'sound');
      await page.check('#soundEnabledCheckbox');

      // Chiptune ships with both off: options hidden.
      await page.selectOption('#soundPresetSelect', 'Chiptune');
      assert.equal(await page.isVisible('#soundUnisonOptions'), false);
      assert.equal(await page.isVisible('#soundReverbOptions'), false);

      await page.check('#soundReverbCheckbox');
      assert.equal(await page.isVisible('#soundReverbOptions'), true);
      assert.equal(await page.textContent('#soundReverbLengthMsValue'), '2000 ms');

      await page.check('#soundUnisonCheckbox');
      assert.equal(await page.isVisible('#soundUnisonOptions'), true);
      await page.fill('#soundUnisonVoicesInput', '3');
      await page.fill('#soundUnisonDetuneInput', '20');
      assert.equal(await page.textContent('#soundUnisonDetuneValue'), '20 cents');
      assert.equal((await page.$$eval('#soundPresetSelect option', os => os.map(o => o.textContent)))[5], 'Chiptune (modified)');
      await closeSettings(page);

      await pressKeys(page, [69]);
      // Audible oscillators only: Chiptune's vibrato LFO runs at a few hertz.
      const starts = (await oscLog(page)).starts.filter(s => s.freq > 20);
      assert.deepEqual(starts.map(s => [s.freq, s.detune]), [[440, -20], [440, 0], [440, 20]]);
    } finally {
      await app.close();
    }
  });

  test('filter envelope and vibrato ticks reveal their options with readable units', async () => {
    const app = await launchApp();
    const { page } = app;
    try {
      await openSettings(page);
      await openSettingsTab(page, 'sound');
      await page.check('#soundEnabledCheckbox');

      // Flute ships with vibrato on and the filter envelope off.
      await page.selectOption('#soundPresetSelect', 'Flute');
      assert.equal(await page.isVisible('#soundFilterEnvOptions'), false);
      assert.equal(await page.isVisible('#soundVibratoOptions'), true);
      assert.equal(await page.textContent('#soundVibratoRateValue'), '5.0 Hz');
      assert.equal(await page.textContent('#soundVibratoDepthValue'), '12 cents');
      assert.equal(await page.textContent('#soundVibratoDelayMsValue'), '400 ms');

      await page.check('#soundFilterEnvCheckbox');
      assert.equal(await page.isVisible('#soundFilterEnvOptions'), true);
      await page.fill('#soundFilterEnvAmountInput', '75');
      assert.equal(await page.textContent('#soundFilterEnvAmountValue'), '75%');
      await page.fill('#soundVibratoRateInput', '63');
      assert.equal(await page.textContent('#soundVibratoRateValue'), '6.3 Hz');

      await page.uncheck('#soundVibratoCheckbox');
      assert.equal(await page.isVisible('#soundVibratoOptions'), false);
      assert.equal((await page.$$eval('#soundPresetSelect option', os => os.map(o => o.textContent)))[1], 'Flute (modified)');
    } finally {
      await app.close();
    }
  });


  test('the top-bar picker switches sounds and doubles as the on/off switch', async () => {
    const app = await launchApp();
    const { page } = app;
    try {
      await spyOnOscillators(page);
      // Off by default, listed first, with every sound after it.
      assert.equal(await page.inputValue('#soundPickerSelect'), '');
      const labels = await page.$$eval('#soundPickerSelect option', os => os.map(o => o.textContent));
      assert.equal(labels[0], 'Sound off');
      assert.equal(labels.length, 15);

      // Picking a sound turns sound on with it, and the notes use it.
      await page.selectOption('#soundPickerSelect', 'Organ');
      await pressKeys(page, [69]);
      const audible = (await oscLog(page)).starts.filter(s => s.freq > 20);
      assert.ok(audible.length > 0 && audible.every(s => s.type === 'square'));
      await releaseKeys(page, [69]);

      await openSettings(page);
      await openSettingsTab(page, 'sound');
      assert.equal(await page.isChecked('#soundEnabledCheckbox'), true);
      assert.equal(await page.inputValue('#soundPresetSelect'), 'Organ');

      // The Sound tab drives the top bar too, modified label included.
      await page.selectOption('#soundPresetSelect', 'Pad');
      await page.fill('#soundBrightnessInput', '90');
      assert.equal(await page.inputValue('#soundPickerSelect'), 'Pad');
      assert.ok(
        (await page.$$eval('#soundPickerSelect option', os => os.map(o => o.textContent))).includes('Pad (modified)'));
      await page.uncheck('#soundEnabledCheckbox');
      assert.equal(await page.inputValue('#soundPickerSelect'), '');
      await closeSettings(page);

      // And "Sound off" from the top bar turns it off.
      await page.selectOption('#soundPickerSelect', 'Flute');
      await page.selectOption('#soundPickerSelect', '');
      await openSettings(page);
      await openSettingsTab(page, 'sound');
      assert.equal(await page.isChecked('#soundEnabledCheckbox'), false);
      assert.equal(await page.inputValue('#soundPresetSelect'), 'Flute');
    } finally {
      await app.close();
    }
  });

  test('while the browser holds sound back, the top-bar sound picker says so', async () => {
    const app = await launchApp();
    const { page } = app;
    const locked = () => page.$eval('#soundPickerRow', el => el.classList.contains('locked'));
    try {
      await page.selectOption('#soundPickerSelect', 'Classic');
      assert.equal(await locked(), false);
      // Reload with sound saved on: no click yet, so no audio yet.
      await page.reload();
      assert.equal(await locked(), true);
      assert.match(await page.getAttribute('#soundPickerRow', 'title') ?? '', /holding sound back/);
      assert.equal(await page.textContent('#soundPickerIcon'), '\u{1F507}');
      await page.mouse.click(5, 300);
      await page.waitForFunction(() => !document.getElementById('soundPickerRow')!.classList.contains('locked'));
      assert.equal(await page.textContent('#soundPickerIcon'), '\u{1F50A}');
    } finally {
      await app.close();
    }
  });
});
