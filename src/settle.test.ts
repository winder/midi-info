import { describe, test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NoteSettler, SMOOTHING_DELAYS, isSmoothingLevel, parseDelayMs, parseHoldMs } from './settle';

// Drives a settler the way app.ts does: `held` is the raw note set, and
// press/release mutate it and report the change.
function harness(level: 'off' | 'light' | 'heavy', holdMs = 0) {
  const emitted: number[][] = [];
  const held = new Set<number>();
  const settler = new NoteSettler(SMOOTHING_DELAYS[level], holdMs, notes => emitted.push(notes));
  return {
    emitted,
    settler,
    press(...midis: number[]) {
      midis.forEach(m => held.add(m));
      settler.update(held, 'on');
    },
    release(...midis: number[]) {
      midis.forEach(m => held.delete(m));
      settler.update(held, 'off');
    },
    held,
  };
}

describe('NoteSettler', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
  afterEach(() => mock.timers.reset());

  test('off passes every change straight through', () => {
    const h = harness('off');
    h.press(60);
    h.press(64);
    h.release(60);
    assert.deepEqual(h.emitted, [[60], [60, 64], [64]]);
  });

  test('a rolled attack shows only the full chord', () => {
    const h = harness('light');
    h.press(60);
    mock.timers.tick(10);
    h.press(64);
    mock.timers.tick(10);
    h.press(67);
    assert.deepEqual(h.emitted, []);
    mock.timers.tick(SMOOTHING_DELAYS.light.attackMs);
    assert.deepEqual(h.emitted, [[60, 64, 67]]);
  });

  test('a staggered release to silence skips the subsets', () => {
    const h = harness('light');
    h.press(60, 64, 67, 71);
    mock.timers.tick(100);
    h.release(71);
    mock.timers.tick(20);
    h.release(67);
    mock.timers.tick(20);
    h.release(60, 64);
    mock.timers.tick(SMOOTHING_DELAYS.light.releaseMs);
    assert.deepEqual(h.emitted, [[60, 64, 67, 71], []]);
  });

  test('a legato chord change skips the overlap and the gap', () => {
    const h = harness('light');
    h.press(60, 64, 67);
    mock.timers.tick(100);
    h.press(65); // F down while C E G still held: a no-match union
    mock.timers.tick(10);
    h.press(69);
    mock.timers.tick(10);
    h.release(64);
    mock.timers.tick(10);
    h.release(67);
    mock.timers.tick(SMOOTHING_DELAYS.light.releaseMs);
    assert.deepEqual(h.emitted, [[60, 64, 67], [60, 65, 69]]);
  });

  test('a deliberate single-note lift shows once the release wait expires', () => {
    const h = harness('light');
    h.press(60, 64, 67, 71);
    mock.timers.tick(100);
    h.release(71);
    mock.timers.tick(SMOOTHING_DELAYS.light.releaseMs - 1);
    assert.equal(h.emitted.length, 1);
    mock.timers.tick(1);
    assert.deepEqual(h.emitted, [[60, 64, 67, 71], [60, 64, 67]]);
  });

  test('hold forever keeps the chord through a full release', () => {
    const h = harness('light', Infinity);
    h.press(60, 64, 67);
    mock.timers.tick(100);
    h.release(60, 64, 67);
    mock.timers.tick(1000);
    assert.deepEqual(h.emitted, [[60, 64, 67]]);
    assert.deepEqual(h.settler.notes, [60, 64, 67]);
  });

  test('a timed hold clears once the release wait plus the hold have passed', () => {
    const h = harness('light', 1000);
    h.press(60, 64, 67);
    mock.timers.tick(100);
    h.release(60, 64, 67);
    mock.timers.tick(SMOOTHING_DELAYS.light.releaseMs + 999);
    assert.deepEqual(h.emitted, [[60, 64, 67]]);
    mock.timers.tick(1);
    assert.deepEqual(h.emitted, [[60, 64, 67], []]);
  });

  test('a note during a timed hold replaces the held chord', () => {
    const h = harness('light', 1000);
    h.press(60, 64, 67);
    mock.timers.tick(100);
    h.release(60, 64, 67);
    mock.timers.tick(500);
    h.press(65, 69, 72);
    mock.timers.tick(SMOOTHING_DELAYS.light.attackMs);
    mock.timers.tick(2000);
    assert.deepEqual(h.emitted, [[60, 64, 67], [65, 69, 72]]);
  });

  test('configure settles on the current notes immediately', () => {
    const h = harness('heavy', Infinity);
    h.press(60, 64, 67);
    mock.timers.tick(100);
    h.release(60, 64, 67);
    h.settler.configure(SMOOTHING_DELAYS.heavy, 0, h.held);
    assert.deepEqual(h.emitted, [[60, 64, 67], []]);
    mock.timers.tick(1000);
    assert.equal(h.emitted.length, 2);
  });
});

describe('settings parsers', () => {
  test('isSmoothingLevel accepts the known levels only', () => {
    assert.equal(isSmoothingLevel('light'), true);
    assert.equal(isSmoothingLevel('custom'), true);
    assert.equal(isSmoothingLevel('medium'), false);
    assert.equal(isSmoothingLevel(null), false);
  });

  test('parseDelayMs takes whole ms within bounds', () => {
    assert.equal(parseDelayMs('0'), 0);
    assert.equal(parseDelayMs(' 120 '), 120);
    assert.equal(parseDelayMs('2000'), 2000);
    assert.equal(parseDelayMs('2001'), null);
    assert.equal(parseDelayMs('-5'), null);
    assert.equal(parseDelayMs('1.5'), null);
    assert.equal(parseDelayMs(''), null);
    assert.equal(parseDelayMs(null), null);
  });

  test('parseHoldMs takes whole ms within bounds, blank or forever as Infinity', () => {
    assert.equal(parseHoldMs(''), Infinity);
    assert.equal(parseHoldMs('forever'), Infinity);
    assert.equal(parseHoldMs('0'), 0);
    assert.equal(parseHoldMs('2500'), 2500);
    assert.equal(parseHoldMs('60001'), null);
    assert.equal(parseHoldMs('1s'), null);
    assert.equal(parseHoldMs(null), null);
  });
});
