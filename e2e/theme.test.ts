import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, openSettings, openSettingsTab } from './fixtures';

describe('theme settings', () => {
  test('non-debug mode only offers a named theme picker, no color inputs', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      assert.equal(await app.page.isHidden('#themeEditorSection'), true);
      const themeOptions = await app.page.$$eval('#themeSelect option', opts => opts.map(o => (o as HTMLOptionElement).value));
      assert.deepEqual(themeOptions, ['Light', 'Dark', 'Cotton Candy', 'Neon']);
    } finally {
      await app.close();
    }
  });

  test('selecting a built-in theme updates the page colors', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
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
      await openSettingsTab(app.page, 'display');
      await app.page.check('#debugCheckbox');
      await openSettingsTab(app.page, 'themes');
      await app.page.waitForSelector('#themeEditorSection:not([hidden])');

      await app.page.click('#newThemeBtn');
      await app.page.fill('#themeNameInput', 'E2E Theme');
      await app.page.dispatchEvent('#themeNameInput', 'change');
      await app.page.fill('#themeBackgroundInput', '#123456');
      await app.page.dispatchEvent('#themeBackgroundInput', 'input');

      const options = await app.page.$$eval('#themeSelect option', opts => opts.map(o => (o as HTMLOptionElement).value));
      assert.deepEqual(options, ['Light', 'Dark', 'Cotton Candy', 'Neon', 'E2E Theme']);
      const bg = await app.page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim()
      );
      assert.equal(bg, '#123456');

      await app.page.click('#deleteThemeBtn');
      const optionsAfterDelete = await app.page.$$eval('#themeSelect option', opts => opts.map(o => (o as HTMLOptionElement).value));
      assert.deepEqual(optionsAfterDelete, ['Light', 'Dark', 'Cotton Candy', 'Neon']);
    } finally {
      await app.close();
    }
  });

  test('built-in themes cannot be deleted or renamed', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      await app.page.check('#debugCheckbox');
      await app.page.selectOption('#themeSelect', 'Light');
      await openSettingsTab(app.page, 'themes');
      await app.page.waitForSelector('#themeEditorSection:not([hidden])');
      assert.equal(await app.page.isDisabled('#deleteThemeBtn'), true);
      assert.equal(await app.page.isDisabled('#themeNameInput'), true);
    } finally {
      await app.close();
    }
  });

  test('a themes cookie saved before a new built-in was added picks it up automatically', async () => {
    const app = await launchApp();
    try {
      await app.page.evaluate(() => {
        const stale = [
          { name: 'Light', background: '#ffffff', font: '#222222', whiteKey: '#ffffff', blackKey: '#222222', activeKey: '#4a76c4', highlight: '#ffd54f' },
          { name: 'Dark', background: '#1e1e1e', font: '#e8e8e8', whiteKey: '#2b2b2b', blackKey: '#0d0d0d', activeKey: '#6c9bf0', highlight: '#ffb300' },
        ];
        document.cookie = 'themes=' + encodeURIComponent(JSON.stringify(stale)) + '; path=/';
      });
      await app.page.reload();
      await openSettings(app.page);
      const options = await app.page.$$eval('#themeSelect option', opts => opts.map(o => (o as HTMLOptionElement).value));
      assert.deepEqual(options, ['Light', 'Dark', 'Cotton Candy', 'Neon']);
    } finally {
      await app.close();
    }
  });

  test('editing a built-in theme marks it modified in the picker, and Reset clears it', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      await app.page.check('#debugCheckbox');
      await app.page.selectOption('#themeSelect', 'Light');
      await openSettingsTab(app.page, 'themes');
      await app.page.waitForSelector('#themeEditorSection:not([hidden])');

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
      await openSettingsTab(app.page, 'display');
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
      await openSettingsTab(app.page, 'display');
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

  test('gradient and glow checkboxes toggle the effect classes and per-role gradient color vars', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      await app.page.check('#debugCheckbox');
      await openSettingsTab(app.page, 'themes');
      await app.page.waitForSelector('#themeEditorSection:not([hidden])');

      const classesBefore = await app.page.evaluate(() => document.documentElement.className);
      assert.doesNotMatch(classesBefore, /gradient-enabled/);
      assert.doesNotMatch(classesBefore, /glow-enabled/);

      await app.page.fill('#themeActiveKeyGradientInput', '#00c8ff');
      await app.page.dispatchEvent('#themeActiveKeyGradientInput', 'input');
      await app.page.check('#themeGradientCheckbox');
      await app.page.check('#themeGlowCheckbox');

      const classesAfter = await app.page.evaluate(() => document.documentElement.className);
      assert.match(classesAfter, /gradient-enabled/);
      assert.match(classesAfter, /glow-enabled/);
      const activeKeyGradientColor = await app.page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--active-key-color-2').trim()
      );
      assert.equal(activeKeyGradientColor, '#00c8ff');

      await app.page.uncheck('#themeGradientCheckbox');
      await app.page.uncheck('#themeGlowCheckbox');
      const classesReverted = await app.page.evaluate(() => document.documentElement.className);
      assert.doesNotMatch(classesReverted, /gradient-enabled/);
      assert.doesNotMatch(classesReverted, /glow-enabled/);
    } finally {
      await app.close();
    }
  });

  test('gradient and glow round-trip through export/import', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      await app.page.check('#debugCheckbox');
      await openSettingsTab(app.page, 'themes');
      await app.page.waitForSelector('#themeEditorSection:not([hidden])');
      await app.page.fill('#themeBackgroundGradientInput', '#abcdef');
      await app.page.dispatchEvent('#themeBackgroundGradientInput', 'input');
      await app.page.fill('#themeActiveKeyGradientInput', '#123456');
      await app.page.dispatchEvent('#themeActiveKeyGradientInput', 'input');
      await app.page.check('#themeGradientCheckbox');
      await app.page.check('#themeGlowCheckbox');

      await openSettingsTab(app.page, 'display');
      const downloadPromise = app.page.waitForEvent('download');
      await app.page.click('#exportThemeBtn');
      const download = await downloadPromise;
      const filePath = await download.path();
      assert.ok(filePath);
      const fs = await import('node:fs/promises');
      const contents = JSON.parse(await fs.readFile(filePath, 'utf8'));
      assert.equal(contents.gradient, true);
      assert.equal(contents.glow, true);
      assert.equal(contents.background2, '#abcdef');
      assert.equal(contents.activeKey2, '#123456');

      // Clicking Export closes the settings panel (see e2e-testing skill notes).
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      await app.page.selectOption('#themeSelect', 'Dark');
      await openSettingsTab(app.page, 'themes');
      await app.page.waitForSelector('#themeGradientCheckbox:not(:checked)');

      await openSettingsTab(app.page, 'display');
      await app.page.setInputFiles('#importThemeFileInput', filePath);
      await app.page.waitForFunction(() => (document.getElementById('themeSelect') as HTMLSelectElement).value === 'Light');
      await openSettingsTab(app.page, 'themes');
      assert.equal(await app.page.isChecked('#themeGradientCheckbox'), true);
      assert.equal(await app.page.isChecked('#themeGlowCheckbox'), true);
      assert.equal(await app.page.inputValue('#themeBackgroundGradientInput'), '#abcdef');
      assert.equal(await app.page.inputValue('#themeActiveKeyGradientInput'), '#123456');
    } finally {
      await app.close();
    }
  });

  test('a theme imported without gradient/glow fields (pre-feature export) still parses', async () => {
    const app = await launchApp();
    try {
      await openSettings(app.page);
      await openSettingsTab(app.page, 'display');
      const fs = await import('node:fs/promises');
      const os = await import('node:os');
      const path = await import('node:path');
      const importPath = path.join(os.tmpdir(), `theme-legacy-${Date.now()}.json`);
      await fs.writeFile(importPath, JSON.stringify({
        name: 'Legacy', background: '#111111', font: '#eeeeee',
        whiteKey: '#dddddd', blackKey: '#222222', activeKey: '#00ff00', highlight: '#ff00ff',
      }));

      await app.page.setInputFiles('#importThemeFileInput', importPath);
      await app.page.waitForFunction(() => (document.getElementById('themeSelect') as HTMLSelectElement).value === 'Legacy');
      const classes = await app.page.evaluate(() => document.documentElement.className);
      assert.doesNotMatch(classes, /gradient-enabled/);
      assert.doesNotMatch(classes, /glow-enabled/);

      await fs.unlink(importPath);
    } finally {
      await app.close();
    }
  });
});
