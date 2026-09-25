// Shared bootstrap for e2e tests: serves the built app and drives it with
// Playwright. See e2e/README.md (or the e2e-testing skill) for how to use
// this from a new test.

import { chromium, Browser, Page } from 'playwright';
import { serveApp, StaticServer } from './server';

export interface App {
  page: Page;
  url: string;
  close(): Promise<void>;
}

export interface LaunchOptions {
  // Chord-readout smoothing (src/settle.ts). Defaults to 'off' here so a
  // test can read the chord display right after pressKeys(); the app's own
  // default is 'light'. Pass null to leave the cookie unset.
  chordSmoothing?: 'off' | 'light' | 'heavy' | 'custom' | null;
}

// Boots a static server for the repo and opens the app in a fresh page.
// Always close() what you open, even on test failure (try/finally).
export async function launchApp(options: LaunchOptions = {}): Promise<App> {
  const { chordSmoothing = 'off' } = options;
  const server: StaticServer = await serveApp();
  const browser: Browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  page.on('pageerror', err => console.error('[pageerror]', err.message));
  if (chordSmoothing !== null) {
    await page.context().addCookies([{ name: 'chordSmoothing', value: chordSmoothing, url: server.url }]);
  }
  await page.goto(server.url + '/index.html');
  return {
    page,
    url: server.url,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

// Analytics only runs on the public GitHub Pages host, so to see what the
// app would report, serve the same dist/ under that origin: every request to
// winder.github.io is answered from the local server, and the gtag.js
// download is stubbed so nothing reaches Google. Events then accumulate in
// window.dataLayer, readable via dataLayerEvents(). Requires the dist/ bundle
// to carry a measurement ID; `npm run test:e2e` builds with a dummy one.
export const PRODUCTION_ORIGIN = 'https://winder.github.io';

export async function launchAppAsProduction(options: LaunchOptions = {}): Promise<App> {
  const { chordSmoothing = 'off' } = options;
  const server: StaticServer = await serveApp();
  const browser: Browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  page.on('pageerror', err => console.error('[pageerror]', err.message));
  if (chordSmoothing !== null) {
    await page.context().addCookies([{ name: 'chordSmoothing', value: chordSmoothing, url: PRODUCTION_ORIGIN }]);
  }
  await page.route(`${PRODUCTION_ORIGIN}/**`, async route => {
    const { pathname, search } = new URL(route.request().url());
    const localPath = pathname.replace(/^\/midi-info/, '');
    const response = await route.fetch({ url: server.url + localPath + search });
    await route.fulfill({ response });
  });
  await page.route('https://www.googletagmanager.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
  );
  await page.goto(`${PRODUCTION_ORIGIN}/midi-info/index.html`);
  return {
    page,
    url: server.url,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

// gtag calls recorded by the page so far, as [command, ...args] tuples,
// e.g. ['event', 'first_mouse_note', {}]. Empty when analytics
// is off (plain launchApp(), or a dist/ built without a measurement ID).
export async function dataLayerCalls(page: Page): Promise<unknown[][]> {
  // Entries are Arguments objects (see initAnalytics), which don't
  // serialize as arrays, so convert before handing them to node.
  return page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map(a => Array.from(a))
  );
}

// Opens the gear/menu settings modal and waits for it to be visible.
export async function openSettings(page: Page): Promise<void> {
  await page.click('#menuButton');
  await page.waitForSelector('#settingsOverlay:not([hidden])');
}

// Closes the settings modal. It overlays the whole page - including the
// gear button that opened it - so it's closed via its own close button,
// not by clicking the (now-covered) gear button again.
//
// The close button sits over the keyboard once the overlay is gone, so the
// mouse is then parked in the top-left corner. Left over a key, a late
// mouseenter can land after pressKeys() has set the app's mouse-is-down
// flag, and the app plays that key as if dragged onto it.
export async function closeSettings(page: Page): Promise<void> {
  await page.click('#settingsCloseBtn');
  await page.waitForSelector('#settingsOverlay', { state: 'hidden' });
  await page.mouse.move(0, 0);
}

// Switches to a settings modal tab. Requires the settings modal to be open.
export async function openSettingsTab(page: Page, tab: 'theory' | 'display' | 'sound' | 'chords' | 'themes'): Promise<void> {
  await page.click(`.settings-tab-btn[data-tab="${tab}"]`);
}

// Picks a settings level. Requires the settings panel to be open.
export async function setLevel(page: Page, level: 'basic' | 'intermediate' | 'nerd'): Promise<void> {
  await page.click(`.level-btn[data-level="${level}"]`);
}

// Holds down on-screen piano keys, the way a mouse press does, without
// releasing them. Notes stay active until releaseKeys(). No MIDI device
// is involved, so this is how tests "play" a chord.
export async function pressKeys(page: Page, midis: number[]): Promise<void> {
  await page.evaluate(ms => {
    ms.forEach(m => {
      document.querySelector(`[data-midi="${m}"]`)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
  }, midis);
}

export async function releaseKeys(page: Page, midis: number[]): Promise<void> {
  await page.evaluate(ms => {
    ms.forEach(m => {
      document.querySelector(`[data-midi="${m}"]`)!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
  }, midis);
}

// Text of the chord display's main line (the primary chord name), e.g.
// "Csus4" or "C/E". Roman numeral and alternates are separate elements.
export async function chordDisplayMain(page: Page): Promise<string> {
  return page.$eval('#chordDisplay .chord-main', el => (el.textContent || '').trim());
}

// Top offset (in CSS px, viewport-relative) of an element's bounding box.
// Used to assert that unrelated layout below #chordDisplay doesn't shift
// when its content changes (e.g. a roman numeral line appearing).
export async function elementTop(page: Page, selector: string): Promise<number> {
  return page.$eval(selector, el => el.getBoundingClientRect().top);
}

// Opens the Highlighter drawer below the keyboard and waits for its body.
export async function openHighlighter(page: Page): Promise<void> {
  await page.click('#highlighterToggle');
  await page.waitForSelector('#highlighterBody:not([hidden])');
}

// MIDI numbers of the keys currently drawn as highlighted, ascending.
export async function highlightedMidis(page: Page): Promise<number[]> {
  return page.$$eval('rect.highlighted', rects =>
    rects.map(r => Number((r as SVGElement).dataset.midi)).sort((a, b) => a - b)
  );
}

const FAKE_MIDI_SCRIPT = `
  const inputs = new Map();
  const access = {
    inputs: { forEach(cb) { inputs.forEach(input => cb(input)); } },
    onstatechange: null,
  };
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) });
  window.__fakeMidi = {
    plug(name) {
      inputs.set(name, { id: 'id-' + name, name, onmidimessage: null });
      if (access.onstatechange) access.onstatechange();
    },
    unplug(name) {
      inputs.delete(name);
      if (access.onstatechange) access.onstatechange();
    },
    send(name, bytes) {
      const input = inputs.get(name);
      if (input && input.onmidimessage) input.onmidimessage({ data: new Uint8Array(bytes) });
    },
  };
`;

// A fake Web MIDI in place of the browser's (headless Chromium has none),
// so tests can plug devices in and out and play notes from a particular
// device. Install before the app loads: this adds an init script and
// reloads. Then drive it with plugMidiDevice / unplugMidiDevice /
// sendMidi. Devices are keyed by name.
export async function installFakeMidi(page: Page): Promise<void> {
  // Plain source, not a function: tsx wraps named functions in a __name()
  // helper that doesn't exist inside the page, which would break the stub.
  await page.addInitScript({ content: FAKE_MIDI_SCRIPT });
  await page.reload();
}

type FakeMidi = { plug(n: string): void; unplug(n: string): void; send(n: string, b: number[]): void };

export async function plugMidiDevice(page: Page, name: string): Promise<void> {
  await page.evaluate(n => (window as unknown as { __fakeMidi: FakeMidi }).__fakeMidi.plug(n), name);
}

export async function unplugMidiDevice(page: Page, name: string): Promise<void> {
  await page.evaluate(n => (window as unknown as { __fakeMidi: FakeMidi }).__fakeMidi.unplug(n), name);
}

// Raw MIDI bytes from one device, e.g. [0x90, 60, 100] is note-on middle C.
export async function sendMidi(page: Page, name: string, bytes: number[]): Promise<void> {
  await page.evaluate(([n, b]) => (window as unknown as { __fakeMidi: FakeMidi }).__fakeMidi.send(n as string, b as number[]), [name, bytes]);
}
