import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_SOUNDS,
  SOUND_KNOB_MAX,
  brightnessToCutoff,
  envelopeLevelAt,
  isWaveform,
  midiToFrequency,
  parseNamedSound,
  parseNamedSounds,
  parseSoundKnob,
  reverbMix,
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

  test('a sound saved before decay/sustain/reverb existed still loads, unchanged in sound', () => {
    const legacy = { name: 'Mine', waveform: 'sine', volume: 50, brightness: 50, attackMs: 10, releaseMs: 100, velocity: 0 };
    assert.deepEqual(parseNamedSound(legacy), { ...legacy, decayMs: 0, sustain: 100, reverb: 0 });
    assert.deepEqual(parseNamedSounds([legacy]), [{ ...legacy, decayMs: 0, sustain: 100, reverb: 0 }]);
  });

  test('a built-in saved before the new knobs is replaced by its current version', () => {
    const { decayMs, sustain, reverb, ...oldOrgan } = { ...organ, brightness: 10 };
    assert.deepEqual(parseNamedSounds([oldOrgan]), [organ]);
    // A current-format save keeps its edits.
    assert.deepEqual(parseNamedSounds([{ ...organ, brightness: 10 }]), [{ ...organ, brightness: 10 }]);
  });

  test('the new knobs are range-checked like the rest', () => {
    assert.equal(parseNamedSound({ ...organ, sustain: 101 }), null);
    assert.equal(parseNamedSound({ ...organ, decayMs: 5001 }), null);
    assert.equal(parseNamedSound({ ...organ, reverb: 1.5 }), null);
  });
});

describe('reverbMix', () => {
  test('0 is fully dry, and more reverb adds wet while only easing the dry', () => {
    assert.deepEqual(reverbMix(0), { dry: 1, wet: 0 });
    const full = reverbMix(100);
    assert.ok(full.wet > 0.5 && full.dry >= 0.5);
    assert.ok(reverbMix(60).wet > reverbMix(30).wet);
  });
});

describe('envelopeLevelAt', () => {
  const shape = { start: 1, attackEnd: 1.5, peak: 0.8, sustainLevel: 0.2, decayTau: 0.5 };

  test('ramps up through the attack', () => {
    assert.equal(envelopeLevelAt(shape, 0.5), 0);
    assert.ok(Math.abs(envelopeLevelAt(shape, 1.25) - 0.4) < 1e-9);
    assert.ok(Math.abs(envelopeLevelAt(shape, 1.5) - 0.8) < 1e-9);
  });

  test('decays exponentially toward sustain', () => {
    // One time constant in, 1/e of the gap remains.
    assert.ok(Math.abs(envelopeLevelAt(shape, 2) - (0.2 + 0.6 / Math.E)) < 1e-9);
    assert.ok(Math.abs(envelopeLevelAt(shape, 20) - 0.2) < 1e-9);
  });

  test('with no decay it sits at sustain once the attack ends', () => {
    assert.equal(envelopeLevelAt({ ...shape, decayTau: 0 }, 1.6), 0.2);
  });
});
