// What the app reports to GA4, checked by serving dist/ under the production
// origin (see launchAppAsProduction) and reading window.dataLayer. Only the
// funnel and settings plumbing is under test here; the tracker's own
// once/cap rules are unit-tested in src/analytics.test.ts.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chordDisplayMain,
  closeSettings,
  dataLayerCalls,
  launchApp,
  launchAppAsProduction,
  openSettings,
  pressKeys,
  releaseKeys,
  setLevel,
} from './fixtures';

type Params = Record<string, string | number>;

function events(calls: unknown[][], name: string): Params[] {
  return calls.filter(c => c[0] === 'event' && c[1] === name).map(c => c[2] as Params);
}

function userProperties(calls: unknown[][]): Params[] {
  return calls.filter(c => c[0] === 'set' && c[1] === 'user_properties').map(c => c[2] as Params);
}

describe('analytics', () => {
  test('stays off on a local host', async () => {
    const app = await launchApp();
    try {
      await pressKeys(app.page, [60, 64, 67]);
      assert.deepEqual(await dataLayerCalls(app.page), []);
    } finally {
      await app.close();
    }
  });

  test('config carries the settings snapshot as user properties', async () => {
    const app = await launchAppAsProduction();
    try {
      const calls = await dataLayerCalls(app.page);
      const config = calls.find(c => c[0] === 'config');
      assert.ok(config, 'dist/ was built without a measurement ID; run via npm run test:e2e');
      assert.equal(config[1], 'G-E2ETEST');
      const props = (config[2] as { user_properties: Params }).user_properties;
      assert.deepEqual(props, {
        level: 'basic',
        theme: props.theme,
        visible_keys: 52,
        display_off: 'none',
        chords_custom: 'no',
      });
      assert.equal(typeof props.theme, 'string');
      assert.notEqual(props.theme, 'custom');
    } finally {
      await app.close();
    }
  });

  test('reports the MIDI access outcome once', async () => {
    const app = await launchAppAsProduction();
    try {
      await app.page.waitForFunction(() =>
        ((window as unknown as { dataLayer: unknown[][] }).dataLayer).some(c => c[1] === 'midi_access')
      );
      const access = events(await dataLayerCalls(app.page), 'midi_access');
      assert.equal(access.length, 1);
      assert.ok(access[0].result === 'granted' || access[0].result === 'denied', String(access[0].result));
    } finally {
      await app.close();
    }
  });

  test('first_mouse_note fires once, and playing sends nothing else', async () => {
    const app = await launchAppAsProduction();
    try {
      await pressKeys(app.page, [60]);
      await pressKeys(app.page, [64, 67]);
      assert.equal(await chordDisplayMain(app.page), 'C');
      await releaseKeys(app.page, [60, 64, 67]);
      await pressKeys(app.page, [62, 65, 69]);

      const calls = await dataLayerCalls(app.page);
      assert.deepEqual(events(calls, 'first_mouse_note'), [{}]);
      assert.deepEqual(events(calls, 'first_midi_note'), []);
      const names = calls.filter(c => c[0] === 'event').map(c => c[1]);
      assert.deepEqual(names.filter(n => n !== 'midi_access'), ['first_mouse_note']);
    } finally {
      await app.close();
    }
  });

  test('changing the level sends an event and refreshes the snapshot', async () => {
    const app = await launchAppAsProduction();
    try {
      await openSettings(app.page);
      await setLevel(app.page, 'nerd');
      await closeSettings(app.page);

      const calls = await dataLayerCalls(app.page);
      assert.deepEqual(events(calls, 'level_changed'), [{ level: 'nerd' }]);
      const props = userProperties(calls);
      assert.equal(props[props.length - 1].level, 'nerd');
    } finally {
      await app.close();
    }
  });
});
