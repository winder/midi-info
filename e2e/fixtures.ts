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

// Boots a static server for the repo and opens the app in a fresh page.
// Always close() what you open, even on test failure (try/finally).
export async function launchApp(): Promise<App> {
  const server: StaticServer = await serveApp();
  const browser: Browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  page.on('pageerror', err => console.error('[pageerror]', err.message));
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

// Opens the gear/menu settings panel and waits for it to be visible.
export async function openSettings(page: Page): Promise<void> {
  await page.click('#menuButton');
  await page.waitForSelector('#settingsPanel:not([hidden])');
}

// Closes the settings panel. It overlays the top of the page, so anything
// under it (e.g. the Highlighter toggle) is unclickable while it is open.
export async function closeSettings(page: Page): Promise<void> {
  await page.click('#menuButton');
  await page.waitForSelector('#settingsPanel', { state: 'hidden' });
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
