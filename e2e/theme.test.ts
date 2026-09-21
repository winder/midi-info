import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, openSettings } from './fixtures';

describe('theme settings', () => {
  test('non-debug mode only offers a named theme picker, no color inputs', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      assert.equal(await app.page.isHidden('#themeEditorSection'), true);
      const themeOptions = await app.page.$$eval('#themeSelect option', opts => opts.map(o => (o as HTMLOptionElement).value));
      assert.deepEqual(themeOptions, ['Light', 'Dark', 'Cotton Candy']);
    } finally {
      await app.close();
    }
  });

  test('selecting a built-in theme updates the page colors', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await app.page.selectOption('#themeSelect', 'Dark');
      const bg = await app.page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim()
      );
      assert.equal(bg, '#1e1e1e');
    } finally {
      await app.close();
    }
  });

  test('debug mode exposes the editor: new theme, rename, edit, delete', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await app.page.check('#debugCheckbox');
      await app.page.waitForSelector('#themeEditorSection:not([hidden])');

      await app.page.click('#newThemeBtn');
      await app.page.fill('#themeNameInput', 'E2E Theme');
      await app.page.dispatchEvent('#themeNameInput', 'change');
      await app.page.fill('#themeBackgroundInput', '#123456');
      await app.page.dispatchEvent('#themeBackgroundInput', 'input');

      const options = await app.page.$$eval('#themeSelect option', opts => opts.map(o => (o as HTMLOptionElement).value));
      assert.deepEqual(options, ['Light', 'Dark', 'Cotton Candy', 'E2E Theme']);
      const bg = await app.page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim()
      );
      assert.equal(bg, '#123456');

      await app.page.click('#deleteThemeBtn');
      const optionsAfterDelete = await app.page.$$eval('#themeSelect option', opts => opts.map(o => (o as HTMLOptionElement).value));
      assert.deepEqual(optionsAfterDelete, ['Light', 'Dark', 'Cotton Candy']);
    } finally {
      await app.close();
    }
  });

  test('editing a built-in theme marks it modified in the picker, and Reset clears it', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await app.page.check('#debugCheckbox');
      await app.page.waitForSelector('#themeEditorSection:not([hidden])');
      await app.page.selectOption('#themeSelect', 'Light');

      const labelBefore = await app.page.$eval(
        '#themeSelect option[value="Light"]', o => o.textContent
      );
      assert.equal(labelBefore, 'Light');

      await app.page.fill('#themeBackgroundInput', '#123456');
      await app.page.dispatchEvent('#themeBackgroundInput', 'input');
      const labelAfterEdit = await app.page.$eval(
        '#themeSelect option[value="Light"]', o => o.textContent
      );
      assert.equal(labelAfterEdit, 'Light (modified)');

      await app.page.click('#themeResetBtn');
      const labelAfterReset = await app.page.$eval(
        '#themeSelect option[value="Light"]', o => o.textContent
      );
      assert.equal(labelAfterReset, 'Light');
    } finally {
      await app.close();
    }
  });

  test('export produces the current named theme as JSON', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await app.page.selectOption('#themeSelect', 'Dark');
      const downloadPromise = app.page.waitForEvent('download');
      await app.page.click('#exportThemeBtn');
      const download = await downloadPromise;
      const filePath = await download.path();
      assert.ok(filePath);
      const fs = await import('node:fs/promises');
      const contents = JSON.parse(await fs.readFile(filePath, 'utf8'));
      assert.equal(contents.name, 'Dark');
      assert.equal(contents.background, '#1e1e1e');
    } finally {
      await app.close();
    }
  });

  test('importing a theme file adds and selects it, with a friendly error on bad input', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      const fs = await import('node:fs/promises');
      const os = await import('node:os');
      const path = await import('node:path');
      const importPath = path.join(os.tmpdir(), `theme-${Date.now()}.json`);
      await fs.writeFile(importPath, JSON.stringify({
        name: 'Sunset', background: '#ff8800', font: '#000000',
        whiteKey: '#ffffff', blackKey: '#222222', activeKey: '#ff0000', highlight: '#ffff00',
      }));

      await app.page.setInputFiles('#importThemeFileInput', importPath);
      await app.page.waitForFunction(() => (document.getElementById('themeSelect') as HTMLSelectElement).value === 'Sunset');
      const bg = await app.page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim()
      );
      assert.equal(bg, '#ff8800');

      await fs.writeFile(importPath, JSON.stringify({ not: 'a theme' }));
      await app.page.setInputFiles('#importThemeFileInput', importPath);
      await app.page.waitForSelector('#themeImportError:not([hidden])');
      assert.match(await app.page.textContent('#themeImportError') ?? '', /doesn't look like a theme/);

      await fs.unlink(importPath);
    } finally {
      await app.close();
    }
  });
});
