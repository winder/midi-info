import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Midi } from '@tonejs/midi';
import { Page } from 'playwright';
import { chordDisplayMain, highlightedMidis, launchApp, openHighlighter } from './fixtures';

// C major for a second, then F major for a second.
function progression(): Buffer {
  const midi = new Midi();
  const track = midi.addTrack();
  [60, 64, 67].forEach(m => track.addNote({ midi: m, time: 0, duration: 1 }));
  [65, 69, 72].forEach(m => track.addNote({ midi: m, time: 1, duration: 1 }));
  return Buffer.from(midi.toArray());
}

// One pedalled note, with the pedal lifted after the note ends.
function pedalOutlastsNote(): Buffer {
  const midi = new Midi();
  const track = midi.addTrack();
  track.addCC({ number: 64, value: 1, time: 0 });
  track.addNote({ midi: 60, time: 0, duration: 0.5 });
  track.addCC({ number: 64, value: 0, time: 0.6 });
  return Buffer.from(midi.toArray());
}

function twoParts(): Buffer {
  const midi = new Midi();
  midi.addTrack().addNote({ midi: 60, time: 0, duration: 1 });
  midi.addTrack().addNote({ midi: 64, time: 0, duration: 1 });
  return Buffer.from(midi.toArray());
}

async function openPlayer(page: Page): Promise<void> {
  await page.click('#playerToggle');
  await page.waitForSelector('#playerBody:not([hidden])');
}

async function upload(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.setInputFiles('#playerFileInput', { name, mimeType: 'audio/midi', buffer });
}

async function activeMidis(page: Page): Promise<number[]> {
  return page.$$eval('#piano rect.active', rects =>
    rects.map(r => Number((r as SVGElement).dataset.midi)).sort((a, b) => a - b)
  );
}

async function seek(page: Page, seconds: number): Promise<void> {
  await page.$eval('#playerSeek', (el, s) => {
    (el as HTMLInputElement).value = String(s);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, seconds);
}

// Section ids in page order.
const sectionOrder = (page: Page) => page.$$eval('#highlighterSection, #playerSection', els => els.map(e => e.id));
const playLabel = (page: Page) => page.getAttribute('#playerPlayBtn', 'aria-label');
const highlighterInert = (page: Page) => page.$eval('#highlighterBody', el => (el as HTMLElement).inert);

describe('MIDI player', () => {
  test('plays an upload like live keys, and keeps the chord lit when paused', async () => {
    const app = await launchApp();
    const { page } = app;
    try {
      // A highlighted C major scale, to see the player set it aside.
      await openHighlighter(page);
      await page.click('#scaleRootButtons .root-btn');
      const scaleKeys = await highlightedMidis(page);
      assert.ok(scaleKeys.length > 0);

      await openPlayer(page);
      await upload(page, 'progression.mid', progression());
      await page.waitForSelector('#playerPlayBtn:not([disabled])');
      assert.deepEqual(await sectionOrder(page), ['highlighterSection', 'playerSection'], 'the scale is in use');
      assert.equal(await page.$eval('#playerFileSelect', el => (el as HTMLSelectElement).selectedOptions[0].textContent), 'progression.mid');
      assert.equal(await page.textContent('#playerDuration'), '0:02');
      assert.equal(await page.$eval('#soundPickerSelect', el => (el as HTMLSelectElement).value !== ''), true, 'loading turns sound on');

      await page.click('#playerPlayBtn');
      await page.waitForFunction(() => document.querySelector('#chordDisplay .chord-main')?.textContent?.trim() === 'C');
      assert.deepEqual(await activeMidis(page), [60, 64, 67]);
      assert.deepEqual(await highlightedMidis(page), [], 'the scale steps aside while playing');
      assert.equal(await highlighterInert(page), true);
      assert.equal(await page.isVisible('#highlighterSuspendedNote'), true);
      assert.deepEqual(await sectionOrder(page), ['playerSection', 'highlighterSection'], 'the player moves to the top');

      await page.click('#playerPlayBtn');
      assert.equal(await playLabel(page), 'Play');
      assert.deepEqual(await activeMidis(page), [], 'pause releases the notes');
      assert.deepEqual(await highlightedMidis(page), [60, 64, 67], 'the paused chord stays lit');
      assert.equal(await chordDisplayMain(page), 'C');
      assert.equal(await highlighterInert(page), true, 'still set aside while paused');
      assert.deepEqual(await sectionOrder(page), ['playerSection', 'highlighterSection'], 'still on top while paused');

      await page.click('#playerPlayBtn');
      await page.waitForFunction(() => document.querySelector('#chordDisplay .chord-main')?.textContent?.trim() === 'F');
      assert.deepEqual(await activeMidis(page), [65, 69, 72]);

      // Played to the end: back at 0:00, highlighter restored.
      await page.waitForFunction(() => document.getElementById('playerPlayBtn')?.getAttribute('aria-label') === 'Play');
      assert.equal(await page.textContent('#playerElapsed'), '0:00');
      assert.deepEqual(await activeMidis(page), []);
      assert.equal(await highlighterInert(page), false);
      assert.deepEqual(await highlightedMidis(page), scaleKeys);
      assert.deepEqual(await sectionOrder(page), ['highlighterSection', 'playerSection'], 'the highlighter is back on top');
    } finally {
      await app.close();
    }
  });

  test('Stop goes back to the start and hands control back to the highlighter', async () => {
    const app = await launchApp();
    const { page } = app;
    try {
      await openPlayer(page);
      await upload(page, 'progression.mid', progression());
      await page.waitForSelector('#playerPlayBtn:not([disabled])');
      assert.equal(await page.isDisabled('#playerStopBtn'), true, 'nothing to stop yet');

      await page.click('#playerPlayBtn');
      await page.waitForFunction(() => document.querySelector('#chordDisplay .chord-main')?.textContent?.trim() === 'C');
      assert.equal(await page.isDisabled('#playerStopBtn'), false);
      await page.click('#playerPlayBtn');
      assert.deepEqual(await highlightedMidis(page), [60, 64, 67]);

      await page.click('#playerStopBtn');
      assert.deepEqual(await activeMidis(page), []);
      assert.deepEqual(await highlightedMidis(page), [], 'the paused chord clears');
      assert.equal(await highlighterInert(page), false);
      assert.deepEqual(await sectionOrder(page), ['highlighterSection', 'playerSection']);
      assert.equal(await page.textContent('#playerElapsed'), '0:00');
      assert.equal(await playLabel(page), 'Play');
      assert.equal(await page.isDisabled('#playerStopBtn'), true);
      assert.equal(await page.isDisabled('#playerPlayBtn'), false, 'the file stays loaded');
    } finally {
      await app.close();
    }
  });

  test('seeking while paused shows the chord at the new spot without playing it', async () => {
    const app = await launchApp();
    const { page } = app;
    try {
      await openPlayer(page);
      await upload(page, 'progression.mid', progression());
      await page.waitForSelector('#playerPlayBtn:not([disabled])');
      await seek(page, 1.5);
      assert.equal(await page.textContent('#playerElapsed'), '0:01');
      assert.deepEqual(await highlightedMidis(page), [65, 69, 72]);
      assert.deepEqual(await activeMidis(page), []);
      assert.equal(await chordDisplayMain(page), 'F');
      assert.equal(await playLabel(page), 'Play');
    } finally {
      await app.close();
    }
  });

  test('Play in transposes the file, live, and the Key setting follows', async () => {
    const app = await launchApp();
    const { page } = app;
    const selectedText = (sel: string) => page.$eval(sel, el => (el as HTMLSelectElement).selectedOptions[0].textContent);
    try {
      await openPlayer(page);
      await upload(page, 'progression.mid', progression());
      await page.waitForSelector('#playerPlayBtn:not([disabled])');
      assert.equal(await selectedText('#playerKeySelect'), 'C (original)', 'a file without a key is taken as C major');
      assert.equal(await page.textContent('#playerTransposeLabel'), 'original key');

      await page.click('#playerSharpBtn');
      assert.equal(await selectedText('#playerKeySelect'), 'Db', 'a half step up lands on the usual spelling');
      assert.equal(await page.textContent('#playerTransposeLabel'), 'up a minor 2nd');
      await page.click('#playerSharpBtn');
      assert.equal(await selectedText('#playerKeySelect'), 'D');
      assert.equal(await page.textContent('#playerTransposeLabel'), 'up a major 2nd');
      assert.equal(await selectedText('#keySelect'), 'D', 'the Key setting follows');

      await page.click('#playerPlayBtn');
      await page.waitForFunction(() => document.querySelector('#chordDisplay .chord-main')?.textContent?.trim() === 'D');
      assert.deepEqual(await activeMidis(page), [62, 66, 69]);

      // Live: the sounding chord is released and the rest plays in the new key.
      await page.selectOption('#playerKeySelect', { label: 'G' });
      assert.equal(await page.textContent('#playerTransposeLabel'), 'down a perfect 4th');
      assert.equal(await playLabel(page), 'Pause');
      await page.waitForFunction(() => document.querySelector('#chordDisplay .chord-main')?.textContent?.trim() === 'C');
      // The file's F major (F4 A4 C5), a 4th down.
      assert.deepEqual(await activeMidis(page), [60, 64, 67]);
      assert.equal(await selectedText('#keySelect'), 'G');
    } finally {
      await app.close();
    }
  });

  test('the end of a file turns every note off', async () => {
    const app = await launchApp();
    const { page } = app;
    try {
      await openPlayer(page);
      await upload(page, 'pedal.mid', pedalOutlastsNote());
      await page.waitForSelector('#playerPlayBtn:not([disabled])');
      await page.click('#playerPlayBtn');
      await page.waitForFunction(() => document.getElementById('playerPlayBtn')?.getAttribute('aria-label') === 'Play', null, { timeout: 3000 });
      assert.deepEqual(await activeMidis(page), []);
    } finally {
      await app.close();
    }
  });

  test('rejects files it cannot play', async () => {
    const app = await launchApp();
    const { page } = app;
    try {
      await openPlayer(page);
      await upload(page, 'band.mid', twoParts());
      await page.waitForSelector('#playerError:not([hidden])');
      assert.match(await page.textContent('#playerError') ?? '', /2 instrument parts/);
      assert.equal(await page.isDisabled('#playerPlayBtn'), true);

      await upload(page, 'notes.txt', Buffer.from('not a midi file'));
      await page.waitForFunction(() => /readable MIDI/.test(document.getElementById('playerError')?.textContent ?? ''));
    } finally {
      await app.close();
    }
  });

  test('?midi=<id> opens the player with that preset and its settings', async () => {
    const app = await launchApp();
    const { page } = app;
    try {
      await page.goto(app.url + '/index.html?midi=ode-to-joy');
      await page.waitForSelector('#playerPlayBtn:not([disabled])');
      assert.equal(await page.isVisible('#playerBody'), true);
      assert.equal(await page.$eval('#playerFileSelect', el => (el as HTMLSelectElement).value), 'ode-to-joy');
      assert.equal(await page.textContent('#playerDuration'), '0:15');
      assert.equal(await page.$eval('#keySelect', el => (el as HTMLSelectElement).selectedOptions[0].textContent), 'D');
      assert.equal(await page.$eval('#soundPickerSelect', el => (el as HTMLSelectElement).value), 'Brass');
    } finally {
      await app.close();
    }
  });

  test('every preset loads', async () => {
    const app = await launchApp();
    const { page } = app;
    try {
      await openPlayer(page);
      const ids = await page.$$eval('#playerFileSelect option', opts => opts.map(o => (o as HTMLOptionElement).value).filter(Boolean));
      assert.ok(ids.length >= 5);
      for (const id of ids) {
        await page.selectOption('#playerFileSelect', id);
        await page.waitForFunction(() => document.getElementById('playerDuration')?.textContent !== '0:00');
        assert.equal(await page.isHidden('#playerError'), true, id);
        await page.selectOption('#playerFileSelect', '');
        await page.waitForSelector('#playerPlayBtn[disabled]');
      }
    } finally {
      await app.close();
    }
  });
});
