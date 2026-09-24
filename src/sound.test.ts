import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOUND_KNOB_MAX,
  brightnessToCutoff,
  isWaveform,
  midiToFrequency,
  parseSoundKnob,
  velocityGain,
  volumeToGain,
} from './sound';

describe('parseSoundKnob', () => {
  test('accepts whole numbers within the knob range', () => {
    assert.equal(parseSoundKnob('volume', '0'), 0);
    assert.equal(parseSoundKnob('volume', ' 70 '), 70);
    assert.equal(parseSoundKnob('releaseMs', String(SOUND_KNOB_MAX.releaseMs)), SOUND_KNOB_MAX.releaseMs);
  });

  test('rejects out-of-range, fractional, negative and non-string input', () => {
    assert.equal(parseSoundKnob('volume', '101'), null);
    assert.equal(parseSoundKnob('attackMs', '2001'), null);
    assert.equal(parseSoundKnob('volume', '5.5'), null);
    assert.equal(parseSoundKnob('volume', '-1'), null);
    assert.equal(parseSoundKnob('volume', ''), null);
    assert.equal(parseSoundKnob('volume', null), null);
    assert.equal(parseSoundKnob('volume', 50), null);
  });
});

describe('isWaveform', () => {
  test('knows the four oscillator shapes', () => {
    ['sine', 'triangle', 'square', 'sawtooth'].forEach(w => assert.ok(isWaveform(w)));
    assert.equal(isWaveform('custom'), false);
    assert.equal(isWaveform(null), false);
  });
});

describe('midiToFrequency', () => {
  test('A4 is 440 Hz and octaves double', () => {
    assert.equal(midiToFrequency(69), 440);
    assert.equal(midiToFrequency(81), 880);
    assert.ok(Math.abs(midiToFrequency(60) - 261.626) < 0.001);
  });
});

describe('level curves', () => {
  test('volume maps 0..100 to 0..1', () => {
    assert.equal(volumeToGain(0), 0);
    assert.equal(volumeToGain(100), 1);
    assert.equal(volumeToGain(50), 0.25);
  });

  test('brightness spans the cutoff range and rises monotonically', () => {
    assert.equal(Math.round(brightnessToCutoff(0)), 150);
    assert.equal(Math.round(brightnessToCutoff(100)), 18000);
    assert.ok(brightnessToCutoff(40) < brightnessToCutoff(60));
  });

  test('velocity only matters as sensitivity rises', () => {
    assert.equal(velocityGain(1, 0), 1);
    assert.equal(velocityGain(127, 100), 1);
    assert.equal(velocityGain(0, 100), 0);
    assert.ok(velocityGain(40, 50) > velocityGain(40, 100));
  });
});
