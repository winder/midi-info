import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_SOUNDS,
  SOUND_KNOB_RANGE,
  brightnessToCutoff,
  envelopeLevelAt,
  isWaveform,
  midiToFrequency,
  parseNamedSound,
  parseNamedSounds,
  parseSoundKnob,
  parseVolume,
  reverbMix,
  soundEqual,
  unisonDetunes,
  unisonPans,
  velocityGain,
  volumeToGain,
} from './sound';

describe('parseSoundKnob and parseVolume', () => {
  test('accept whole numbers within range', () => {
    assert.equal(parseSoundKnob('sustain', '0'), 0);
    assert.equal(parseSoundKnob('sustain', ' 70 '), 70);
    assert.equal(parseSoundKnob('releaseMs', String(SOUND_KNOB_RANGE.releaseMs[1])), SOUND_KNOB_RANGE.releaseMs[1]);
    assert.equal(parseVolume('0'), 0);
    assert.equal(parseVolume('100'), 100);
  });

  test('reject out-of-range, fractional, negative and non-string input', () => {
    assert.equal(parseSoundKnob('sustain', '101'), null);
    assert.equal(parseSoundKnob('attackMs', '2001'), null);
    assert.equal(parseSoundKnob('sustain', '5.5'), null);
    assert.equal(parseSoundKnob('sustain', '-1'), null);
    assert.equal(parseSoundKnob('sustain', ''), null);
    assert.equal(parseSoundKnob('sustain', null), null);
    assert.equal(parseSoundKnob('sustain', 50), null);
    assert.equal(parseVolume('101'), null);
  });

  test('respect a knob minimum above zero', () => {
    assert.equal(parseSoundKnob('unisonVoices', '1'), null);
    assert.equal(parseSoundKnob('unisonVoices', '2'), 2);
    assert.equal(parseSoundKnob('reverbLengthMs', '400'), null);
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
    assert.equal(parseNamedSound({ ...organ, sustain: 101 }), null);
    assert.equal(parseNamedSound({ ...organ, attackMs: 2.5 }), null);
    assert.equal(parseNamedSound({ ...organ, unison: 'yes' }), null);
    assert.equal(parseNamedSound({ ...organ, releaseMs: '60' }), null);
    const { velocity, ...missing } = organ;
    assert.equal(parseNamedSound(missing), null);
  });

  test('parseNamedSounds rejects the whole list if any entry is bad', () => {
    assert.deepEqual(parseNamedSounds([organ]), [organ]);
    assert.equal(parseNamedSounds([organ, { ...organ, sustain: -1 }]), null);
    assert.equal(parseNamedSounds([]), null);
    assert.equal(parseNamedSounds({}), null);
  });

  test('soundEqual ignores the name', () => {
    assert.ok(soundEqual(organ, { ...organ, name: 'Copy' }));
    assert.equal(soundEqual(organ, { ...organ, brightness: organ.brightness + 1 }), false);
    assert.equal(soundEqual(organ, { ...organ, unison: !organ.unison }), false);
  });

  // Neutral values for everything added since the first saves, so an old
  // sound plays as it did: no decay, full sustain, no unison.
  const added = { decayMs: 0, sustain: 100, reverb: 0, unisonVoices: 3, unisonDetune: 12, reverbLengthMs: 2200, unison: false };

  test('a sound from the first save format still loads, unchanged in sound (volume dropped)', () => {
    const { volume, ...legacy } = { name: 'Mine', waveform: 'sine', volume: 50, brightness: 50, attackMs: 10, releaseMs: 100, velocity: 0 };
    assert.deepEqual(parseNamedSound({ ...legacy, volume }), { ...legacy, ...added, reverbEnabled: false });
    assert.deepEqual(parseNamedSounds([{ ...legacy, volume }]), [{ ...legacy, ...added, reverbEnabled: false }]);
  });

  test('a saved sound with reverb but no reverb toggle keeps its reverb on', () => {
    const v2 = { name: 'Mine', waveform: 'sine', volume: 50, brightness: 50, attackMs: 10, decayMs: 200, sustain: 50, releaseMs: 100, velocity: 0, reverb: 30 };
    const sound = parseNamedSound(v2)!;
    assert.equal(sound.reverbEnabled, true);
    assert.equal(sound.reverb, 30);
    assert.equal(sound.reverbLengthMs, 2200); // the old fixed room length
    assert.equal('volume' in sound, false);
  });

  test('a built-in saved before the latest settings is replaced by its current version', () => {
    const { unison, unisonVoices, unisonDetune, reverbEnabled, reverbLengthMs, ...oldOrgan } = { ...organ, brightness: 10 };
    assert.deepEqual(parseNamedSounds([{ ...oldOrgan, volume: 55 }]), [organ]);
    // A current-format save keeps its edits.
    assert.deepEqual(parseNamedSounds([{ ...organ, brightness: 10 }]), [{ ...organ, brightness: 10 }]);
  });

  test('the new knobs are range-checked like the rest', () => {
    assert.equal(parseNamedSound({ ...organ, sustain: 101 }), null);
    assert.equal(parseNamedSound({ ...organ, decayMs: 5001 }), null);
    assert.equal(parseNamedSound({ ...organ, reverb: 1.5 }), null);
  });
});

describe('unison spread', () => {
  test('detunes spread evenly across -detune..+detune; one voice stays in tune', () => {
    assert.deepEqual(unisonDetunes(1, 20), [0]);
    assert.deepEqual(unisonDetunes(2, 10), [-10, 10]);
    assert.deepEqual(unisonDetunes(3, 12), [-12, 0, 12]);
    assert.deepEqual(unisonDetunes(5, 20), [-20, -10, 0, 10, 20]);
  });

  test('pans spread left to right within the stereo field', () => {
    const pans = unisonPans(3);
    assert.equal(pans[1], 0);
    assert.ok(pans[0] < 0 && pans[2] > 0 && Math.abs(pans[0]) <= 1);
  });
});

describe('reverbMix', () => {
  test('0 or off is fully dry, and more reverb adds wet while only easing the dry', () => {
    assert.deepEqual(reverbMix(0), { dry: 1, wet: 0 });
    assert.deepEqual(reverbMix(80, false), { dry: 1, wet: 0 });
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
