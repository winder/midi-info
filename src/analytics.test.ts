import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_EVENTS_PER_SESSION,
  MAX_PARAM_VALUE_LENGTH,
  MAX_USER_PROPERTY_LENGTH,
  clampValues,
  createTracker,
  shouldTrack,
} from './analytics';

function recordingTracker() {
  const calls: unknown[][] = [];
  const tracker = createTracker((...args: unknown[]) => calls.push(args));
  return { tracker, calls };
}

describe('shouldTrack', () => {
  test('only the public host with a measurement ID reports', () => {
    assert.equal(shouldTrack('winder.github.io', 'G-TEST'), true);
    assert.equal(shouldTrack('localhost', 'G-TEST'), false);
    assert.equal(shouldTrack('winder.github.io', ''), false);
  });
});

describe('createTracker', () => {
  test('event sends a gtag event with its params', () => {
    const { tracker, calls } = recordingTracker();
    tracker.event('level_changed', { level: 'nerd' });
    assert.deepEqual(calls, [['event', 'level_changed', { level: 'nerd' }]]);
  });

  test('once fires a given event name a single time per session', () => {
    const { tracker, calls } = recordingTracker();
    tracker.once('midi_device_connected', { device_count: 1 });
    tracker.once('midi_device_connected', { device_count: 2 });
    tracker.once('first_midi_note');
    assert.deepEqual(calls.map(c => c[1]), ['midi_device_connected', 'first_midi_note']);
    assert.deepEqual(calls[0][2], { device_count: 1 });
  });

  test('events stop after the per-session cap', () => {
    const { tracker, calls } = recordingTracker();
    for (let i = 0; i < MAX_EVENTS_PER_SESSION + 10; i++) tracker.event('chord_detected', { chord: 'maj' });
    assert.equal(calls.length, MAX_EVENTS_PER_SESSION);
  });

  test('user properties are set, not sent as events, and never capped', () => {
    const { tracker, calls } = recordingTracker();
    for (let i = 0; i < MAX_EVENTS_PER_SESSION; i++) tracker.event('chord_detected');
    tracker.setUserProperties({ level: 'nerd', visible_keys: 52 });
    assert.deepEqual(calls[calls.length - 1], ['set', 'user_properties', { level: 'nerd', visible_keys: 52 }]);
  });

  test('string values are clamped to the GA4 limits', () => {
    const { tracker, calls } = recordingTracker();
    const long = 'x'.repeat(200);
    tracker.event('theme_selected', { theme: long, n: 5 });
    tracker.setUserProperties({ theme: long });
    assert.equal((calls[0][2] as Record<string, string>).theme.length, MAX_PARAM_VALUE_LENGTH);
    assert.equal((calls[0][2] as Record<string, number>).n, 5);
    assert.equal((calls[1][2] as Record<string, string>).theme.length, MAX_USER_PROPERTY_LENGTH);
  });
});

describe('clampValues', () => {
  test('leaves short strings and numbers alone', () => {
    assert.deepEqual(clampValues({ a: 'ok', b: 3 }, 5), { a: 'ok', b: 3 });
  });
});
