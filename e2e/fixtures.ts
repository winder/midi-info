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
