import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_SOUNDS,
  SOUND_KNOB_MAX,
  brightnessToCutoff,
  isWaveform,
  midiToFrequency,
  parseNamedSound,
  parseNamedSounds,
  parseSoundKnob,
  soundEqual,
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

describe('named sounds', () => {
  const organ = BUILT_IN_SOUNDS.find(t => t.name === 'Organ')!;

  test('there are six built-ins with unique names, each of which parses', () => {
    assert.equal(BUILT_IN_SOUNDS.length, 6);
    assert.equal(new Set(BUILT_IN_SOUNDS.map(t => t.name)).size, 6);
    BUILT_IN_SOUNDS.forEach(t => assert.deepEqual(parseNamedSound(JSON.parse(JSON.stringify(t))), t));
  });

  test('parseNamedSound trims the name', () => {
    assert.equal(parseNamedSound({ ...organ, name: '  Mine ' })?.name, 'Mine');
  });

  test('parseNamedSound rejects a bad name, tone or knob', () => {
    assert.equal(parseNamedSound(null), null);
    assert.equal(parseNamedSound({ ...organ, name: ' ' }), null);
    assert.equal(parseNamedSound({ ...organ, waveform: 'noise' }), null);
    assert.equal(parseNamedSound({ ...organ, volume: 101 }), null);
    assert.equal(parseNamedSound({ ...organ, attackMs: 2.5 }), null);
    assert.equal(parseNamedSound({ ...organ, releaseMs: '60' }), null);
    const { velocity, ...missing } = organ;
    assert.equal(parseNamedSound(missing), null);
  });

  test('parseNamedSounds rejects the whole list if any entry is bad', () => {
    assert.deepEqual(parseNamedSounds([organ]), [organ]);
    assert.equal(parseNamedSounds([organ, { ...organ, volume: -1 }]), null);
    assert.equal(parseNamedSounds([]), null);
    assert.equal(parseNamedSounds({}), null);
  });

  test('soundEqual ignores the name', () => {
    assert.ok(soundEqual(organ, { ...organ, name: 'Copy' }));
    assert.equal(soundEqual(organ, { ...organ, brightness: organ.brightness + 1 }), false);
  });
});
